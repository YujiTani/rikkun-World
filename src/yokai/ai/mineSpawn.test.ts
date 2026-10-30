import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, ItemId, ItemStack, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { createWorkHook } from '../../debug/workHook';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { AI_CONST, createYokaiConfig, type YokaiConfig } from './config';
import type { HookYokaiEvent, YokaiManagerOptions } from './managerTypes';

/**
 * MINE-1A（docs/design/MINE-1.md §4.3）受け入れ基準 A6・A7・A8・A9・A14・A15: 地下の 妖怪。
 *
 * 合成の 世界（地面 150 まで 石。暗い 大部屋は 空気の はこ）で、YokaiManager を 動かして 出た 場所・数・間かく・消えるのを 見る。
 * 数は 設定（YokaiConfig）から 渡す・読む（#311）。窓口の 名前は 仕様〔§4.3・§6.1〕の 案（実装は これに 合わせる。ちがう 名前に するなら テストを 直して 台帳に 書く）:
 *   YokaiConfig に 足す  yokaiSpawnIntervalUnder（地下の ためす 間かく）・yokaiMaxUnder（地下の 上限）
 *                         yokaiSpawnHeight（出る 高さの はば。足 ±これ）・yokaiForgetSteps（見つけられない 妖怪が 消えるまで）
 *   YokaiManagerOptions に 足す  groundY?: (x, z) => number … その x・z の「生成の 地形の 高さ」（地面。掘ったり 置いたり しても 変わらない）。
 *                         地下に いる ＝ プレイヤーの 足の 高さが これより 6 マス 以上 下。つなぎ込みは terrainFor(seed).height を わたす
 *   去った ときの leave イベントに why: 'dawn' | 'forget'
 */

const GROUND = 150;
/** 部屋の よこの はば。まん中(47.5)から 横 28 まで ぜんぶ 部屋の 中 */
const X0 = 18;
const X1 = 77;
const CENTER = 47.5;
const SIZE = { x: 96, y: 200, z: 96 };

function makeTime(phase: DayPhase): TimeOfDay & { p: DayPhase } {
  const t = {
    p: phase,
    dayTick: () => 0,
    day: () => 0,
    phase: () => t.p,
    skyColor: () => '#000000',
    brightness: () => 1,
    dollBrightness: () => 1,
    set: () => {},
    update: () => {},
    onPhaseChange: () => () => {},
  };
  return t;
}

function makeCombat() {
  const hits: Array<{ amount: number; by: YokaiKind; from: Vec3 }> = [];
  const c: PlayerCombat & { hits: typeof hits; isDead: boolean } = {
    hits,
    isDead: false,
    hp: () => 20,
    maxHp: () => 20,
    dead: () => c.isDead,
    invincibleTicks: () => 0,
    damage: (amount, by, from) => {
      hits.push({ amount, by, from });
      return true;
    },
    heal: () => 0,
    drainEvents: () => [],
  };
  return c;
}

/** 地面 150 まで 石。rooms の [y0, y1] は 空気（床は y0 − 1 の 石 ＝ 足の 高さが y0） */
function mineWorld(rooms: ReadonlyArray<readonly [number, number]>): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 0, 0, SIZE.x - 1, GROUND, SIZE.z - 1, 'stone');
  for (const [y0, y1] of rooms) w.fill(X0, y0, X0, X1, y1, X1, 'air');
  return w;
}

/** 大部屋 2 つ（A7 の 世界）: y 60〜63 と y 100〜103。足の 高さは 60 と 100 */
const TWO_ROOMS: ReadonlyArray<readonly [number, number]> = [[60, 63], [100, 103]];

/** 設定の 上書き（新しい 名前の 設定も 入る ので ゆるい 型） */
type Extra = Record<string, unknown>;

/** 数の 上限・間かくを ゆるめた 設定（A7・A8 は「どこに 出るか」だけ 見る）。消える きまりも 切る */
const RELAXED: Extra = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMax: 100_000, yokaiMaxUnder: 100_000, yokaiForgetSteps: 1e9 };

/**
 * 設定の 数を 読む（高さの はば yokaiSpawnHeight・横の 近い〜遠い yokaiSpawnMinDist〜yokaiSpawnMaxDist）。
 * 数が 無い ときは 名前を 言って 落とす（NaN との くらべは どれも 偽なので、読めない まま だと「外に 出た 妖怪が 0 体」で 通ってしまう）
 */
function setting(config: object, name: 'yokaiSpawnHeight' | 'yokaiSpawnMinDist' | 'yokaiSpawnMaxDist'): number {
  const v = (config as Record<string, unknown>)[name];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`設定 ${name} が ない（仕様 §4.3）`);
  return v;
}

interface RigOptions {
  world: ArrayVoxelWorld;
  feet: number;
  phase: DayPhase;
  config?: Extra;
  extra?: Partial<YokaiManagerOptions>;
}

function rig(o: RigOptions) {
  const time = makeTime(o.phase);
  const combat = makeCombat();
  const added: Array<{ item: ItemId; count: number }> = [];
  const inv = { added, add: (item: ItemId, count: number) => (added.push({ item, count }), 0) } as unknown as Inventory & { added: typeof added };
  const scattered: ItemStack[][] = [];
  const player = { position: { x: CENTER, y: o.feet, z: CENTER } };
  const config = { ...createYokaiConfig(), ...o.config } as YokaiConfig;
  const m = new YokaiManager({
    world: o.world,
    time,
    getPlayer: () => player,
    combat,
    inventory: inv,
    seed: 1,
    config,
    groundY: () => GROUND,
    drops: { scatter: (_pos, stacks) => (scattered.push(stacks), stacks.length) },
    ...o.extra,
  });
  const events: HookYokaiEvent[] = [];
  let steps = 0;
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      m.update(1 / 60);
      steps++;
      events.push(...m.takeHookEvents());
    }
  };
  /** update を 呼んだ 回数（出来事の tick と 同じ） */
  const now = (): number => steps;
  return { world: o.world, time, combat, inv, added, scattered, player, m, config, events, step, now };
}
type Rig = ReturnType<typeof rig>;

interface Spawn {
  tick: number;
  id: number;
  x: number;
  y: number;
  z: number;
}
const spawnsOf = (events: readonly HookYokaiEvent[]): Spawn[] =>
  events.flatMap((e) => (e.type === 'spawn' ? [{ tick: e.tick, id: e.id, x: e.position.x, y: e.position.y, z: e.position.z }] : []));
const leavesOf = (events: readonly HookYokaiEvent[]) => events.flatMap((e) => (e.type === 'leave' ? [e as typeof e & { why?: string }] : []));

/** 出た 妖怪を 1 ステップごとに 消して、n 回 出るまで 回す（数の 上限・ぬりかべ 1 体・近づく 動きに 左右されない） */
function collect(r: Rig, n: number, maxSteps = 6000): Spawn[] {
  const out: Spawn[] = [];
  for (let i = 0; i < maxSteps && out.length < n; i++) {
    r.m.update(1 / 60);
    out.push(...spawnsOf(r.m.takeHookEvents()));
    r.m.clear();
  }
  return out;
}

const lateral = (r: Rig, s: Spawn): number => Math.hypot(s.x - r.player.position.x, s.z - r.player.position.z);

/** 横が 設定の 近い〜遠い（yokaiSpawnMinDist〜yokaiSpawnMaxDist）の 中 */
function expectLateral(r: Rig, spawns: readonly Spawn[]): void {
  const lo = setting(r.config, 'yokaiSpawnMinDist');
  const hi = setting(r.config, 'yokaiSpawnMaxDist');
  for (const s of spawns) {
    expect(lateral(r, s)).toBeGreaterThanOrEqual(lo - 1e-9);
    expect(lateral(r, s)).toBeLessThanOrEqual(hi + 1e-9);
  }
}

const gapsOf = (events: readonly HookYokaiEvent[]): number[] => {
  const t = spawnsOf(events).map((s) => s.tick);
  return t.slice(1).map((v, i) => v - t[i]!);
};

// ------------------------------------------------------------------ A7: 出る 高さ

describe('A7: 出る 高さは プレイヤーの 足 ±8（地上も 地下も）。横は 12〜28', () => {
  // 題名の 数字（8・12・28）は 既定の 値の 説明。テストの 中の 数は 設定〔yokaiSpawnHeight・yokaiSpawnMinDist・yokaiSpawnMaxDist〕から 読む
  it('y 60 の 部屋に いる とき、自動で 出た 妖怪 100 体の 足が ぜんぶ y 52〜68。y 100 の 部屋には 出ない', () => {
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: RELAXED });
    const height = setting(r.config, 'yokaiSpawnHeight');
    const spawns = collect(r, 100);
    expect(spawns).toHaveLength(100);
    const bad = spawns.filter((s) => s.y < 60 - height || s.y > 60 + height).map((s) => s.y);
    expect(bad, `足が ${60 - height}〜${60 + height} の 外: ${[...new Set(bad)].join(',')}`).toEqual([]);
    expectLateral(r, spawns);
  });

  it('地上（足 151・夜）に いる ときも 100 体の 足が ぜんぶ y 143〜159（地面の 上だけ。2 つの 部屋には 出ない）', () => {
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: GROUND + 1, phase: 'night', config: RELAXED });
    const height = setting(r.config, 'yokaiSpawnHeight');
    const spawns = collect(r, 100);
    expect(spawns).toHaveLength(100);
    const bad = spawns.filter((s) => s.y < GROUND + 1 - height || s.y > GROUND + 1 + height).map((s) => s.y);
    expect(bad, `足が ${GROUND + 1 - height}〜${GROUND + 1 + height} の 外: ${[...new Set(bad)].join(',')}`).toEqual([]);
    expectLateral(r, spawns);
  });

  // 足 ±8 の 中の ほかの 高さの 床にも 出る（はばが 狭すぎない）／外には 出ない。高さの はばは 設定 yokaiSpawnHeight
  const STACK: ReadonlyArray<readonly [number, number]> = [[48, 51], [54, 57], [60, 63], [66, 69], [72, 75]]; // 足 48・54・60・66・72
  it('足 ±8 の 中の 別の 高さの 床（54・66）にも 出る。外（48・72）には 出ない', () => {
    const r = rig({ world: mineWorld(STACK), feet: 60, phase: 'day', config: RELAXED });
    const height = setting(r.config, 'yokaiSpawnHeight');
    // この 並べ方〔足 ±6 は 中・±12 は 外〕が 意味を もつ はば（はばが かわったら 並べ方も 直す）
    expect(height, '既定の はば').toBeGreaterThanOrEqual(6);
    expect(height, '既定の はば').toBeLessThan(12);
    const feet = new Set(collect(r, 300).map((s) => s.y));
    expect([...feet].sort((a, b) => a - b)).toEqual([54, 60, 66]);
  });

  it('きわ: 足から ちょうど 8 マス 上・下（52・68）の 床には 出る。1 マス 外（51・69）の 床しか ない 世界では 1 体も 出ない', () => {
    const FEET = 60;
    const height = setting(createYokaiConfig(), 'yokaiSpawnHeight');
    /** 床は 足 lo と 足 hi の 2 つの 部屋だけ。プレイヤーは 小さな 空気の たて穴に 立つ（横 0 マスなので 出る 場所には ならない） */
    const worldWith = (lo: number, hi: number): ArrayVoxelWorld => {
      const w = mineWorld([[lo, lo + 3], [hi, hi + 3]]);
      const p = Math.floor(CENTER);
      w.fill(p, FEET, p, p, FEET + 2, p, 'air');
      return w;
    };
    const atEdge = rig({ world: worldWith(FEET - height, FEET + height), feet: FEET, phase: 'day', config: RELAXED });
    const feet = new Set(collect(atEdge, 100).map((s) => s.y));
    expect([...feet].sort((a, b) => a - b), `床が 足 ±${height} ちょうどに しか ない 世界`).toEqual([FEET - height, FEET + height]);
    const justOutside = rig({ world: worldWith(FEET - height - 1, FEET + height + 1), feet: FEET, phase: 'day', config: RELAXED });
    const outside = collect(justOutside, 1, 600);
    expect(outside.map((s) => s.y), `床が 足 ±${height + 1}〔1 マス 外〕に しか ない 世界`).toEqual([]);
  });

  it('高さの はばは 設定（yokaiSpawnHeight）で きまる: 3 に すると 足と 同じ 高さの 床だけ', () => {
    const r = rig({ world: mineWorld(STACK), feet: 60, phase: 'day', config: { ...RELAXED, yokaiSpawnHeight: 3 } });
    const feet = new Set(collect(r, 200).map((s) => s.y));
    expect([...feet]).toEqual([60]);
  });
});

// ------------------------------------------------------------------ A8: 水

describe('A8: 水は 足 ±8 の 中だけ 見る', () => {
  it('部屋の 上・下（足 ±8 の 外）に 池を 置いても 部屋に 出る', () => {
    const w = mineWorld(TWO_ROOMS);
    w.fill(0, 75, 0, SIZE.x - 1, 77, SIZE.z - 1, 'water'); // 足 60 の 上 15〜17 マス
    w.fill(0, 40, 0, SIZE.x - 1, 44, SIZE.z - 1, 'water'); // 足 60 の 下 16〜20 マス
    const r = rig({ world: w, feet: 60, phase: 'day', config: RELAXED });
    const spawns = collect(r, 100);
    expect(spawns).toHaveLength(100);
    const height = setting(r.config, 'yokaiSpawnHeight');
    expect(spawns.every((s) => s.y >= 60 - height && s.y <= 60 + height)).toBe(true);
  });

  it('足 ±8 の 中に 水が ある 列には 出ない（水たまり・足の 上 6 マスの 水）。足 ±8 の 外（上 12 マス）の 水なら 出る', () => {
    const w = mineWorld(TWO_ROOMS);
    const puddle = { x0: 30, x1: 40, z0: 30, z1: 40 }; // 部屋の ゆか（足 60）の 水たまり
    const high = { x0: 56, x1: 66, z0: 30, z1: 40 }; // 足の 上 6 マス（y 66）に 水 1 マス ＝ 足 ±8 の 中
    const far = { x0: 56, x1: 66, z0: 56, z1: 66 }; // 足の 上 12 マス（y 72）に 水 1 マス ＝ 足 ±8 の 外
    w.fill(puddle.x0, 60, puddle.z0, puddle.x1, 60, puddle.z1, 'water');
    w.fill(high.x0, 66, high.z0, high.x1, 66, high.z1, 'water');
    w.fill(far.x0, 72, far.z0, far.x1, 72, far.z1, 'water');
    const r = rig({ world: w, feet: 60, phase: 'day', config: RELAXED });
    const spawns = collect(r, 600);
    expect(spawns).toHaveLength(600);
    const inRect = (s: Spawn, q: typeof puddle): boolean => Math.floor(s.x) >= q.x0 && Math.floor(s.x) <= q.x1 && Math.floor(s.z) >= q.z0 && Math.floor(s.z) <= q.z1;
    expect(spawns.filter((s) => inRect(s, puddle)), '水たまりの 列').toHaveLength(0);
    expect(spawns.filter((s) => inRect(s, high)), '足の 上 6 マスに 水の ある 列').toHaveLength(0);
    expect(spawns.filter((s) => inRect(s, far)).length, '足の 上 12 マスに 水の ある 列（出る）').toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ A9: 床さがしの 仕事

describe('A9: 妖怪の ためしで 列から 読む ブロックの 数（床さがし。列の 上から 全部は 読まない）', () => {
  /** 光を 「明るい」と 答える ので ためしは 毎回 しっぱいする（妖怪が 出て 動く 仕事が まざらない） */
  const light = { level: () => 15, isDarkForSpawn: () => false, brightness: () => 1 } as unknown as YokaiManagerOptions['light'];

  function readsPerUpdate(feet: number, phase: DayPhase): { reads: number; tries: number } {
    const world = mineWorld(TWO_ROOMS);
    let tries = 0;
    const r = rig({ world, feet, phase, config: RELAXED, extra: { light, canSpawnAt: () => (tries++, true) } });
    const work = createWorkHook(r.now, world);
    let reads = 0;
    for (let i = 0; i < 5; i++) {
      work.start();
      r.step(1);
      reads = Math.max(reads, work.read().getBlock);
      work.stop();
    }
    expect(r.m.list(), '妖怪は 出ない（光で しっぱい）').toHaveLength(0);
    return { reads, tries };
  }

  // 1 コマの ためしは 20 回まで（AI_CONST.spawnTries）。1 回の ためしで 32 まで（床さがし 21 ＋ 足場の しらべ ＋ 屋根）〔レビュー係 案〕
  const LIMIT = 32 * AI_CONST.spawnTries;

  it('地上: 1 コマの ためし ぜんたいで getBlock が 32 × ためしの 回数 以下', () => {
    const { reads, tries } = readsPerUpdate(GROUND + 1, 'night');
    expect(tries, 'ためしを 実際に した').toBeGreaterThan(0);
    expect(reads, 'getBlock').toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(LIMIT);
  });

  it('地下: 同じ', () => {
    const { reads, tries } = readsPerUpdate(60, 'day');
    expect(tries, 'ためしを 実際に した').toBeGreaterThan(0);
    expect(reads, 'getBlock').toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(LIMIT);
  });
});

// ------------------------------------------------------------------ A6・A14: 地下の 判定・数と 間かく

describe('A6: 地下に いる ＝ 足が 生成の 地形の 高さより 6 マス 以上 下（地面 150 で 足 144 は 地下・145 は 地上）', () => {
  const GAP_GROUND = 25;
  const GAP_UNDER = 40;
  const cfg: Extra = { yokaiSpawnInterval: GAP_GROUND, yokaiSpawnIntervalUnder: GAP_UNDER, yokaiMax: 1000, yokaiMaxUnder: 1000, yokaiForgetSteps: 1e9 };

  it('足 144（地面より 6 下）→ 地下の 間かく。足 145（5 下）→ 地上の 間かく', () => {
    const under = rig({ world: mineWorld([[144, 147]]), feet: 144, phase: 'day', config: cfg });
    const above = rig({ world: mineWorld([[145, 148]]), feet: 145, phase: 'day', config: cfg });
    under.step(400);
    above.step(400);
    expect(gapsOf(under.events).length).toBeGreaterThan(4);
    expect(gapsOf(above.events).length).toBeGreaterThan(4);
    expect(new Set(gapsOf(under.events)), '足 144').toEqual(new Set([GAP_UNDER]));
    expect(new Set(gapsOf(above.events)), '足 145').toEqual(new Set([GAP_GROUND]));
  });

  it('そこを 掘って 地形を かえても 判定は かわらない（生成の 高さで きめる）', () => {
    const w = mineWorld([[60, 63]]);
    const r = rig({ world: w, feet: 60, phase: 'night', config: cfg });
    // 部屋の 上を 地面まで 掘りぬく（今の 地面の いちばん上は 部屋の ゆかに なる）
    w.fill(X0, 64, X0, X1, GROUND, X1, 'air');
    r.step(400);
    expect(gapsOf(r.events).length).toBeGreaterThan(4);
    expect(new Set(gapsOf(r.events))).toEqual(new Set([GAP_UNDER]));
  });
});

describe('A14: 数と 間かく（設定から 読む）', () => {
  it('地下は 地下の 間かくで ためす・地上は 地上の 間かく（ステップの ひらきが ぴったり 設定の 数）', () => {
    const cfg: Extra = { yokaiSpawnInterval: 25, yokaiSpawnIntervalUnder: 40, yokaiMax: 1000, yokaiMaxUnder: 1000, yokaiForgetSteps: 1e9 };
    const under = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: cfg });
    const ground = rig({ world: mineWorld(TWO_ROOMS), feet: GROUND + 1, phase: 'night', config: cfg });
    under.step(400);
    ground.step(400);
    expect(gapsOf(under.events).length).toBeGreaterThan(4);
    expect(gapsOf(ground.events).length).toBeGreaterThan(4);
    expect(new Set(gapsOf(under.events)), '地下').toEqual(new Set([40]));
    expect(new Set(gapsOf(ground.events)), '地上').toEqual(new Set([25]));
  });

  it('同時の 数: 地下は 地下の 上限・地上は 地上の 上限（どちらも ちょうど そこまで）', () => {
    const cfg: Extra = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMax: 3, yokaiMaxUnder: 6, yokaiForgetSteps: 1e9 };
    const under = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: cfg });
    const ground = rig({ world: mineWorld(TWO_ROOMS), feet: GROUND + 1, phase: 'night', config: cfg });
    under.step(600);
    ground.step(600);
    expect(under.m.list().length, '地下').toBe(6);
    expect(ground.m.list().length, '地上').toBe(3);
  });

  it('ぬりかべは どこでも 1 体まで', () => {
    const only = { karakasa: 0, chochin: 0, rokurokubi: 0, nurikabe: 1 };
    const cfg: Extra = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMax: 50, yokaiMaxUnder: 50, yokaiForgetSteps: 1e9, yokaiWeights: only };
    const under = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: cfg });
    const ground = rig({ world: mineWorld(TWO_ROOMS), feet: GROUND + 1, phase: 'night', config: cfg });
    under.step(600);
    ground.step(600);
    expect(under.m.list().filter((y) => y.kind === 'nurikabe')).toHaveLength(1);
    expect(ground.m.list().filter((y) => y.kind === 'nurikabe')).toHaveLength(1);
  });

  it('地下で 上限まで いる まま 地上へ 出ると、地上の 上限 未満に なるまで 出ない', () => {
    const cfg: Extra = { yokaiSpawnInterval: 1, yokaiSpawnIntervalUnder: 1, yokaiMax: 3, yokaiMaxUnder: 6, yokaiForgetSteps: 1e9 };
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: cfg });
    const ids: number[] = [];
    for (let k = 0; k < 6; k++) ids.push(r.m.spawn('karakasa', 30.5 + k * 3, 60, 60.5, { ai: false })); // 地下の 上限の 数
    r.m.takeHookEvents(); // 手で 出した 分の spawn は 自動の 出現に 数えない
    expect(r.m.list()).toHaveLength(6);
    // 地上（夜）へ 出る。地上の 上限 3 を こえて いる ので 出ない
    r.player.position = { x: CENTER, y: GROUND + 1, z: CENTER };
    r.time.p = 'night';
    r.step(200);
    expect(spawnsOf(r.events), '地上の 上限を こえて いる あいだ').toHaveLength(0);
    expect(r.m.list()).toHaveLength(6);
    // 4 体 たおして 2 体（地上の 上限 3 未満）に なると、また 出て、ちょうど 3 体で とまる
    for (const id of ids.slice(0, 4)) r.m.setHp(id, 0);
    r.step(200);
    expect(spawnsOf(r.events), '上限 未満に なってから').toHaveLength(1);
    expect(r.m.list()).toHaveLength(3);
  });
});

// ------------------------------------------------------------------ A15: 見つけられない 妖怪は 消える

describe('A15: 見つけられない 妖怪は そっと 消える', () => {
  /** 出るのは 最初の 1 回だけ（間かくを 長く）。プレイヤーが たおされた ことに して 気づかれない ように する */
  const ONE: Extra = { yokaiSpawnInterval: 1e9, yokaiSpawnIntervalUnder: 1e9, yokaiMax: 1, yokaiMaxUnder: 1 };
  const FOUND = new Set(['chase', 'attack', 'retreat', 'search']);

  it('設定 yokaiForgetSteps（既定 3,600 ＝ 60 秒）: 出てから 見つけて いない まま それだけ たつと 去る（why は forget）。それより 2 ステップ 前までは まだ いる', () => {
    const forget = createYokaiConfig().yokaiForgetSteps as number;
    expect(forget, '既定の 設定').toBeGreaterThan(0);
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: ONE });
    r.combat.isDead = true; // 気づかれない
    r.step(1);
    const t0 = spawnsOf(r.events)[0]?.tick as number;
    expect(t0, '最初の ためしで 1 体 出る').toBeGreaterThan(0);
    // 数え方の 1 ステップの ずれは ゆるす（去るのは 出てから forget −1〜+1 ステップ目）。その 2 ステップ前までは 去らない
    r.step(t0 + forget - 2 - r.now());
    expect(leavesOf(r.events), `出てから ${forget - 2} ステップ目まで`).toHaveLength(0);
    expect(r.m.list()).toHaveLength(1);
    expect(r.m.list()[0]!.state).not.toBe('leaving');
    r.step(4);
    const lv = leavesOf(r.events);
    expect(lv, '去る').toHaveLength(1);
    expect(lv[0]!.why).toBe('forget');
    expect(lv[0]!.tick - t0, '出てから 去るまで').toBeGreaterThanOrEqual(forget - 1);
    expect(lv[0]!.tick - t0).toBeLessThanOrEqual(forget + 1);
    // そっと 消える: おとし物 0（持ち物も 落とし物も ふえない・defeat も ない）
    r.step(300);
    expect(r.m.list(), '消えた').toHaveLength(0);
    expect(r.events.filter((e) => e.type === 'drop' || e.type === 'defeat')).toHaveLength(0);
    expect(r.added).toHaveLength(0);
    expect(r.scattered).toHaveLength(0);
  });

  it('途中で 見つけると 数えなおし（見うしなって から また 設定の ステップ）', () => {
    const forget = 600;
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: { ...ONE, yokaiForgetSteps: forget } });
    r.combat.isDead = true;
    r.step(1);
    const t0 = spawnsOf(r.events)[0]!.tick;
    r.step(forget / 2); // 半分 すぎた ところで…
    expect(leavesOf(r.events)).toHaveLength(0);
    // …プレイヤーが すぐ そばに 来て、見つけさせる
    const at = r.m.list()[0]!.position;
    r.combat.isDead = false;
    r.player.position = { x: at.x, y: at.y, z: at.z + (at.z < 60 ? 4 : -4) };
    let lastFound = -1;
    for (let i = 0; i < 30; i++) {
      r.step(1);
      if (FOUND.has(r.m.list()[0]?.state ?? '')) lastFound = r.now();
    }
    expect(lastFound, '見つけた').toBeGreaterThan(0);
    // いちばん 遠い すみへ はなれて、また 見つけられなく する
    r.combat.isDead = true;
    const now = r.m.list()[0]!.position;
    const corners = [20.5, 75.5].flatMap((x) => [20.5, 75.5].map((z) => ({ x, y: at.y, z })));
    corners.sort((a, b) => Math.hypot(b.x - now.x, b.z - now.z) - Math.hypot(a.x - now.x, a.z - now.z));
    r.player.position = corners[0]!;
    for (let i = 0; i < forget * 3 && leavesOf(r.events).length === 0; i++) {
      r.step(1);
      if (FOUND.has(r.m.list()[0]?.state ?? '')) lastFound = r.now();
    }
    const lv = leavesOf(r.events);
    expect(lv, '去る').toHaveLength(1);
    expect(lv[0]!.why).toBe('forget');
    expect(lv[0]!.tick, '見うしなって から 設定の ステップ たつ まで 去らない').toBeGreaterThanOrEqual(lastFound + forget - 1);
    expect(lv[0]!.tick).toBeLessThanOrEqual(lastFound + forget + 1);
    expect(lv[0]!.tick, '出た ときから 数えるより あとに 去る').toBeGreaterThan(t0 + forget + 1);
  });

  it('ヌシは 消えない・手で 出した 妖怪（spawnByHand）も 消えない。ふつうの 妖怪は 消える', () => {
    const forget = 200;
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: 60, phase: 'day', config: { ...ONE, yokaiMax: 5, yokaiMaxUnder: 5, yokaiSpawnInterval: 10, yokaiSpawnIntervalUnder: 10, yokaiForgetSteps: forget } });
    r.combat.isDead = true;
    const hand = r.m.spawn('karakasa', 30.5, 60, 60.5, { ai: false });
    const handAi = r.m.spawn('chochin', 66.5, 60, 60.5, { ai: true });
    // 自動で 3 体 出るまで（手で 出した 2 体 ＋ 3 体 ＝ 上限 5）。forget の 半分より 前に そろう
    const autoIds = (): number[] => r.m.list().filter((y) => y.id !== hand && y.id !== handAi).map((y) => y.id);
    for (let i = 0; i < forget / 2 && autoIds().length < 3; i++) r.step(1);
    const auto = autoIds();
    expect(auto.length, '自動で 出た').toBeGreaterThanOrEqual(3);
    for (const id of auto) r.m.setTitle(id, 'none');
    const nushi = auto[0]!;
    r.m.setTitle(nushi, 'nushi');
    expect(r.m.list().find((y) => y.id === nushi)!.title, 'ヌシに した').toBe('nushi');
    const plain = auto.slice(1);
    r.events.length = 0;
    r.step(forget * 3);
    const alive = new Set(r.m.list().map((y) => y.id));
    expect(alive.has(hand), '手で 出した（ai なし）').toBe(true);
    expect(alive.has(handAi), '手で 出した（ai あり）').toBe(true);
    expect(alive.has(nushi), 'ヌシ').toBe(true);
    for (const id of plain) expect(alive.has(id), `ふつうの 妖怪 ${id}`).toBe(false);
    const whys = leavesOf(r.events).map((e) => e.why);
    expect(whys.length).toBeGreaterThanOrEqual(plain.length);
    expect(new Set(whys)).toEqual(new Set(['forget']));
  });

  it('夜明けに 去る ときの leave は why: dawn（今までの きまりは そのまま）', () => {
    const r = rig({ world: mineWorld(TWO_ROOMS), feet: GROUND + 1, phase: 'dawn', config: { ...ONE, yokaiAutoSpawn: false } });
    r.m.spawn('karakasa', 60.5, GROUND + 1, 60.5, { ai: false });
    r.step(createYokaiConfig().yokaiLeaveTicks + 100);
    const lv = leavesOf(r.events);
    expect(lv).toHaveLength(1);
    expect(lv[0]!.why).toBe('dawn');
  });
});
