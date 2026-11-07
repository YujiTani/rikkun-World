import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay } from '../../contracts';
import { YokaiManager } from '../../yokai/ai/YokaiManager';
import { createYokaiConfig } from '../../yokai/ai/config';
import type { HookYokaiEvent, YokaiManagerOptions } from '../../yokai/ai/managerTypes';
import { EMISSION } from '../light/opacity';
import { SkyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { CAVE_RULES, SEEDS_3, areaAround, hookCave, lotteryCaves, needCaveHook, type Cave } from './mineCaveKit';
import { GenCols, standable } from './mineShaftKit';
import { heightAt, spawnOf } from './terrain';

/**
 * MINE-1D（docs/design/MINE-1.md §4.3・§4.7.2・§4.9・受け入れ基準 D6・D12 の ユニットの 行）: ほたるの ほらあなの 床・仕事の 数。
 *
 *   D6【3 版】: プレイヤーを 部屋の すみに 置いて 妖怪の ためしを 1,000 回 → 部屋の 床〔`caveAt` が 'hotaru'〕に 出る 数 0。
 *       同じ ためしで 部屋の 外の 暗い ほらあなには 1 回 以上 出る〔出ない きまりは 部屋の 中だけ〕。
 *       ごまかさない ために「きまりを 切った 同じ ためし」では 部屋の 床に 1 回 以上 出る こと も 見る〔光 7 では 床を 明るく しきれない〕。
 *   D12〔ユニットの 行〕: 列 1 つで 見る ほらあなの 区画は 1 つ まで〔坑道の 区画は 4 つ まで〕・光る ブロックは 1 列 80 こ まで・
 *       ほたるの ほらあな 1 つに 見える ほたるいしは 32 こ まで〔シード 3 つの ほたるの ほらあな ぜんぶ〕。
 *       perf の 行〔生成 8 ms・描画回数 ＋4・三角形・メモリ〕は perf-analyst〔ここでは ms で 合否を 決めない〕。
 *
 * 【自分で 決めた 名前】 `YokaiManagerOptions.noSpawnAt?: (x, y, z) => boolean`〔妖怪が 立つ 床の マスの 足の y を わたし、true なら そこには 出ない〕。
 *   つなぎ込みは `(x, y, z) => mine.caveAt(floor x, floor y, floor z) === 'hotaru'` を わたす。`mineCaveKit.ts` の 先頭に 一覧。
 * 赤の 確かめ: 1D の 前は 窓口〔findCave〕が なく「窓口が まだ ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 120_000 });

/** 妖怪の ためしの 回数〔仕様 D6〕 */
const TRIALS = 1000;
/** 数の 上限・間かくを ゆるめた 設定〔どこに 出るかだけ 見る。mineSpawn.test.ts と 同じ 考え〕 */
const RELAXED = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMax: 100_000, yokaiMaxUnder: 100_000, yokaiForgetSteps: 1e9 };
const LIMIT = { caveRegions: 1, shaftRegions: 4, emitters: 80, hotaru: 32 } as const;

// ------------------------------------------------------------------ D6

function makeTime(phase: DayPhase): TimeOfDay {
  const t = {
    phase: () => phase,
    dayTick: () => 0,
    day: () => 0,
    skyColor: () => '#000000',
    brightness: () => 1,
    dollBrightness: () => 1,
    set: () => {},
    update: () => {},
    onPhaseChange: () => () => {},
  };
  return t as unknown as TimeOfDay;
}
const combat = (): PlayerCombat =>
  ({ hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] }) as unknown as PlayerCombat;
const inventory = (): Inventory => ({ add: (_item: ItemId, _count: number) => 0 }) as unknown as Inventory;

interface Hotaru {
  seed: number;
  cave: Cave;
  world: ArrayVoxelWorld;
  light: WorldLight;
  player: { x: number; y: number; z: number };
  inside: (x: number, y: number, z: number) => boolean;
}
const rooms: Hotaru[] = [];

beforeAll(() => {
  for (const seed of SEEDS_3) {
    const h = hookCave(seed);
    needCaveHook(h, ['findCave', 'caveAt', 'caves']);
    const cave = h.findCave('hotaru');
    if (!cave) throw new Error(`seed ${seed}: ほたるの ほらあなが 見つからない〔findCave〕`);
    const g = new GenCols(seed);
    // 部屋の まわり 横 40 マス〔妖怪が 出る はんい 28 ＋ ゆとり〕の 列を 読みこむ
    const world = new ArrayVoxelWorld({ x: 0, z: 0 });
    const b = cave.box;
    for (let cz = (b.z0 - 44) >> 4; cz <= (b.z1 + 44) >> 4; cz++) for (let cx = (b.x0 - 44) >> 4; cx <= (b.x1 + 44) >> 4; cx++) world.loadColumn(g.chunk(cx, cz));
    const light = new WorldLight(world, new SkyDarkness());
    light.update();
    light.flush();
    const inside = (x: number, y: number, z: number): boolean => h.caveAt(Math.floor(x), Math.floor(y), Math.floor(z)) === 'hotaru';
    // 部屋の すみ〔北西〕に いちばん 近い 立てる マスに プレイヤーを 置く
    let best: { x: number; y: number; z: number } | null = null;
    let bestD = Infinity;
    for (let x = b.x0; x <= b.x1; x++) {
      for (let z = b.z0; z <= b.z1; z++) {
        for (let y = b.y0; y <= b.y1; y++) {
          if (!standable(g, x, y, z) || h.caveAt(x, y, z) !== 'hotaru') continue;
          const d = x - b.x0 + (z - b.z0);
          if (d < bestD) {
            bestD = d;
            best = { x, y, z };
          }
        }
      }
    }
    if (!best) throw new Error(`seed ${seed}: ほたるの ほらあなに 立てる マスが ない`);
    rooms.push({ seed, cave, world, light, player: { x: best.x + 0.5, y: best.y, z: best.z + 0.5 }, inside });
  }
}, 240_000);

function trials(r: Hotaru, noSpawnAt: boolean): { inRoom: number; outside: number } {
  const config = { ...createYokaiConfig(), ...RELAXED };
  const opts: Partial<YokaiManagerOptions> & { noSpawnAt?: (x: number, y: number, z: number) => boolean } = {
    world: r.world,
    time: makeTime('day'), // 地下は 屋根の 下なので 昼でも 出る
    getPlayer: () => ({ position: r.player }),
    combat: combat(),
    inventory: inventory(),
    seed: 1,
    config,
    groundY: (x, z) => heightAt(r.seed, x, z),
    light: r.light,
  };
  if (noSpawnAt) opts.noSpawnAt = (x, y, z) => r.inside(x, y, z);
  const m = new YokaiManager(opts as YokaiManagerOptions);
  let inRoom = 0;
  let outside = 0;
  for (let i = 0; i < TRIALS; i++) {
    m.update(1 / 60);
    for (const e of m.takeHookEvents() as HookYokaiEvent[]) {
      if (e.type !== 'spawn') continue;
      if (r.inside(e.position.x, e.position.y, e.position.z)) inRoom++;
      else outside++;
    }
    m.clear(); // 出た ステップの うちに 消す〔数の 上限・近づく 動きに 左右されない〕
  }
  return { inRoom, outside };
}

describe('D6: ほたるの ほらあなの 床には 妖怪が 出ない', () => {
  it.each(SEEDS_3.map((s, i) => [s, i] as const))('seed %i: すみに 立って ためしを 1,000 回 → 部屋の 床に 0・外の 暗い ほらあなには 1 回 以上', (_seed, i) => {
    const r = rooms[i]!;
    const got = trials(r, true);
    expect(got.inRoom, `seed ${r.seed}: 部屋の 床に 出た 数`).toBe(0);
    expect(got.outside, `seed ${r.seed}: 部屋の 外に 出た 数〔出ない きまりは 部屋の 中だけ〕`).toBeGreaterThanOrEqual(1);
  });

  it.each(SEEDS_3.map((s, i) => [s, i] as const))('seed %i: きまりを 切った 同じ ためしでは 部屋の 床にも 出る〔ごまかさない。光 7 では 床を 明るく しきれない〕', (_seed, i) => {
    const r = rooms[i]!;
    const got = trials(r, false);
    expect(got.inRoom, `seed ${r.seed}: きまりなしで 部屋の 床に 出た 数`).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------ D12 ユニット

describe('D12: 仕事の 数〔ユニット〕', () => {
  it('列 1 つで 見る ほらあなの 区画は 1 つ まで・坑道の 区画は 4 つ まで・光る ブロックは 80 こ まで〔部屋が かかる 列・ふつうの 列〕', () => {
    const bad: string[] = [];
    let seenRoom = 0;
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      needCaveHook(h, ['work', 'caves']);
      const grid = new GenCols(seed);
      const a = areaAround(seed, 8);
      const cols = new Set<string>();
      const add = (cx: number, cz: number): void => void cols.add(`${cx},${cz}`);
      for (const c of lotteryCaves(h, a)) {
        const b = c.box;
        for (let cz = (b.z0 - 2) >> 4; cz <= (b.z1 + 2) >> 4; cz++) for (let cx = (b.x0 - 2) >> 4; cx <= (b.x1 + 2) >> 4; cx++) add(cx, cz);
      }
      seenRoom += cols.size;
      const sp = spawnOf(seed);
      for (let dx = -200; dx <= 200; dx += 20) for (let dz = -200; dz <= 200; dz += 20) add((sp.x + dx) >> 4, (sp.z + dz) >> 4);
      for (const k of cols) {
        const [cx, cz] = k.split(',').map(Number) as [number, number];
        const w = h.work(cx, cz);
        // 光る ブロック〔光の 強さ 1 以上〕の 実際の 数。窓口の 数は それ 以上
        let lit = 0;
        for (const b of grid.col(cx, cz)) if ((EMISSION[b] ?? 0) > 0) lit++;
        if (w.emitters < lit) bad.push(`seed ${seed} (${cx}, ${cz}) 光る ブロック ${w.emitters} < 実際の ${lit}`);
        if (!(Number.isInteger(w.caveRegions) && w.caveRegions >= 0 && w.caveRegions <= LIMIT.caveRegions)) bad.push(`seed ${seed} (${cx}, ${cz}) ほらあなの 区画 ${w.caveRegions}`);
        if (!(Number.isInteger(w.shaftRegions) && w.shaftRegions >= 0 && w.shaftRegions <= LIMIT.shaftRegions)) bad.push(`seed ${seed} (${cx}, ${cz}) 坑道の 区画 ${w.shaftRegions}`);
        if (!(Number.isInteger(w.emitters) && w.emitters >= 0 && w.emitters <= LIMIT.emitters)) bad.push(`seed ${seed} (${cx}, ${cz}) 光る ブロック ${w.emitters}`);
      }
    }
    expect(seenRoom, '部屋が かかる 列').toBeGreaterThan(SEEDS_3.length * 4);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('部屋が かかる 列は ほらあなの 区画が 1 つ 以上〔数を ごまかさない〕', () => {
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      const c = h.findCave('hotaru');
      expect(c, `seed ${seed}`).not.toBeNull();
      expect(h.work(c!.center.x >> 4, c!.center.z >> 4).caveRegions, `seed ${seed}: 部屋の まん中の 列`).toBeGreaterThanOrEqual(1);
    }
  });

  it('ほたるの ほらあな 1 つに 見える ほたるいしは 32 こ まで〔シード 3 つの ほたるの ほらあな ぜんぶ〕・光る ブロックの 窓口は 実際の 数 以上', () => {
    let n = 0;
    for (const seed of SEEDS_3) {
      const h = hookCave(seed);
      needCaveHook(h, ['caves', 'caveStats', 'caveSpec']);
      const a = areaAround(seed, 10);
      for (const c of lotteryCaves(h, a).filter((q) => q.kind === 'hotaru')) {
        n++;
        const v = h.caveStats(c.id).visible['hotaruishi'] ?? 0;
        expect(v, `seed ${seed} ${c.id} の ほたるいし`).toBeLessThanOrEqual(LIMIT.hotaru);
        expect(v, `seed ${seed} ${c.id} の ほたるいし`).toBeGreaterThanOrEqual(CAVE_RULES.hotaru.visible[0]);
      }
    }
    expect(n, 'ほたるの ほらあな').toBeGreaterThanOrEqual(1);
  });
});
