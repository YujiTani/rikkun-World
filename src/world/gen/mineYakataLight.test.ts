import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DayPhase, PlayerCombat, TimeOfDay, Vec3 } from '../../contracts';
import { YokaiManager } from '../../yokai/ai/YokaiManager';
import { LIGHT_GLSL_FUNCS, LIGHT_GLSL_LIT } from '../render/lightShader';
import { SkyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { GenCols, ptKey, standable, type Pt } from './mineShaftKit';
import { LOOKS, lightBoxesOf, rectCells, tableOf, upperRect, yakataSample, type LightBox, type YakataSampleRow } from './mineYakataKit';
import { yakataBox } from './mineYakataReport';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.2「やかたの 中の 見え方」・受け入れ基準 F21）: やかたの 中の 明るさ・光の 色・妖怪の 体の 明るさ。
 *
 *   【自分で 決めた 窓口】`WorldLight.setYakataBoxes(boxes)`〔やかたの 箱の 一覧。世界の 座標・両はし ふくむ。`LightBox` ＝ `{ x0, y0, z0, x1, y1, z1, look }`。`mineYakataKit.lightBoxesOf`〕・
 *     `WorldLight.yakataBoxes()`〔いま 入って いる 一覧〕・`WorldLight.yakataTint(x, y, z)`〔その マスの 光の 色〔表の `lookTint[look]`〕。やかたの 外は null〕。
 *     `WorldLight.brightness(x, y, z)` は やかたの 中の 見え方〔光 `dim.from`〜`dim.to` の 所を `dim.shade` より 暗く しない〕を 通った 数。妖怪の 体は `YokaiManager.paletteInfo(id).brightness`〔`dim.foe` 以上〕。
 *     `world.lightAt()`〔WorldHook〕は `WorldLight` に つなぐ だけ〔`yakataTint` を 足す。`src/world/hook.ts`〕。
 *   F21: 大広間の 床・祭壇の 立てる マスの うち 光 `dim.from`〜`dim.to` の 所は 足 ＋0.5 の `brightness` が `dim.shade` 以上・`yakataTint` が その 組の `lookTint`・
 *        やかたの 外〔本道・ほかの ほらあな・家に 置いた あやしい たいまつの まわり〕は 今の 式の まま〔箱を 入れない 光と 同じ 数・`yakataTint` null〕・
 *        妖怪の 体が `dim.foe` 以上・シェーダーの 数は 表から〔`lightShader` の 文に 表の 数が 入る〕・箱の 一覧は カメラ・画面に よらない〔`beforePane` で かえない〕。
 *   数は 表〔`yakataTable()`〕から 読む〔#311〕。画面分割の 見た目は F18 の 試作の スクショ。赤の 確かめ: 1F の 前は「やかたが ない」で 落ちる。
 */

vi.setConfig({ testTimeout: 900_000 });

type YLight = WorldLight & {
  setYakataBoxes(boxes: readonly LightBox[]): void;
  yakataBoxes(): readonly LightBox[];
  yakataTint(x: number, y: number, z: number): readonly number[] | null;
};

interface Rig {
  row: YakataSampleRow;
  world: ArrayVoxelWorld;
  light: YLight;
  /** 箱を 入れない 光〔今の 式。同じ 世界を 読む〕 */
  plain: WorldLight;
  boxes: LightBox[];
}
const rigs: Rig[] = [];
let rows: YakataSampleRow[] = [];

function build(row: YakataSampleRow): Rig {
  const T = tableOf();
  const g = new GenCols(row.seed);
  const b = yakataBox(row.yakata, T);
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  for (let cz = (b.z0 - 16) >> 4; cz <= (b.z1 + 16) >> 4; cz++) for (let cx = (b.x0 - 16) >> 4; cx <= (b.x1 + 16) >> 4; cx++) world.loadColumn(g.chunk(cx, cz));
  const light = new WorldLight(world, new SkyDarkness()) as YLight;
  light.update();
  light.flush();
  const plain = new WorldLight(world, new SkyDarkness());
  plain.update();
  plain.flush();
  return { row, world, light, plain, boxes: lightBoxesOf(row.yakata, T) };
}

beforeAll(() => {
  rows = yakataSample((all) => LOOKS.every((l) => all.filter((r) => r.yakata.look === l).length >= 1), { perSeed: 2 });
  for (const l of LOOKS) {
    const r = rows.find((x) => x.yakata.look === l);
    if (r) rigs.push(build(r));
  }
}, 1200_000);

const need = (r: Rig): void => {
  const l = r.light as unknown as Record<string, unknown>;
  for (const n of ['setYakataBoxes', 'yakataBoxes', 'yakataTint']) if (typeof l[n] !== 'function') throw new Error(`WorldLight.${n} が まだ ない〔仕様 §4.2・§6.1〕`);
};
const tag = (r: Rig): string => `seed ${r.row.seed} ${r.row.shaft.id}〔${r.row.yakata.look}〕`;

/** 立てる マスで 光 dim.from〜dim.to の マス〔大広間の 床・祭壇の 下の 段・上の 段〕 */
function dimCells(r: Rig): Pt[] {
  const T = tableOf();
  const y = r.row.yakata;
  const g = new GenCols(r.row.seed);
  const out: Pt[] = [];
  const up = upperRect(y, T);
  const chest = new Set(y.chest.cells.map(ptKey));
  for (const c of [...rectCells(y.hall), ...rectCells(y.altar), ...rectCells(up)]) {
    if (chest.has(ptKey(c)) || !standable(g, c.x, c.y, c.z)) continue;
    const l = r.plain.blockLight(c.x, c.y, c.z);
    if (l >= T.dim.from && l <= T.dim.to) out.push(c);
  }
  return out;
}

describe('F21: やかたの 中の 見え方', () => {
  it('標本: A・B の やかたが 1 つずつ あり、光 dim.from〜dim.to の 立てる マスが 10 こ 以上', () => {
    expect(rigs.length, 'やかたが ない').toBe(2);
    for (const r of rigs) {
      need(r);
      expect(dimCells(r).length, `${tag(r)} の くらい 立てる マス`).toBeGreaterThanOrEqual(10);
    }
  });

  it('光 dim.from〜dim.to の 立てる マス〔大広間の 床・祭壇〕: 足 ＋0.5 の brightness が dim.shade 以上・yakataTint が その 組の lookTint。箱を 入れない 今の 式では dim.shade より 暗い 所が ある', () => {
    expect(rigs.length, 'やかたが ない').toBe(2);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rigs) {
      need(r);
      r.light.setYakataBoxes(r.boxes);
      let darkBefore = 0;
      for (const c of dimCells(r)) {
        const b = r.light.brightness(c.x, c.y + 0.5, c.z);
        if (b < T.dim.shade - 1e-9) bad.push(`${tag(r)}: (${c.x}, ${c.y}, ${c.z}) の brightness ${b.toFixed(3)}〔${T.dim.shade} 以上〕`);
        if (r.plain.brightness(c.x, c.y + 0.5, c.z) < T.dim.shade - 1e-9) darkBefore++;
        const tint = r.light.yakataTint(c.x, c.y, c.z);
        if (JSON.stringify(tint) !== JSON.stringify(T.lookTint[r.row.yakata.look])) bad.push(`${tag(r)}: (${c.x}, ${c.y}, ${c.z}) の yakataTint ${JSON.stringify(tint)}〔${JSON.stringify(T.lookTint[r.row.yakata.look])}〕`);
      }
      expect(darkBefore, `${tag(r)}: 今の 式では くらすぎる マス〔この テストが 何かを 見て いる しるし〕`).toBeGreaterThan(0);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('やかたの 外〔本道・本道の さか道・やかたの 外の 地上〕: yakataTint が null・brightness が 箱を 入れない 今の 式と 同じ', () => {
    expect(rigs.length, 'やかたが ない').toBe(2);
    const bad: string[] = [];
    for (const r of rigs) {
      need(r);
      r.light.setYakataBoxes(r.boxes);
      const path = r.row.hook.shaftPath(r.row.shaft.id).filter((c) => (c.part as string) === 'main' || (c.part as string) === 'ramp' || (c.part as string) === 'landing');
      const T = tableOf();
      const b = yakataBox(r.row.yakata, T);
      const far = path.filter((c) => c.x < b.x0 - 3 || c.x > b.x1 + 3 || c.z < b.z0 - 3 || c.z > b.z1 + 3);
      let checked = 0;
      for (const c of far) {
        if (!r.world.isLoaded(c.x, c.z)) continue;
        checked++;
        if (r.light.yakataTint(c.x, c.y, c.z) !== null) bad.push(`${tag(r)}: 外 (${c.x}, ${c.y}, ${c.z}) の yakataTint が null でない`);
        const a = r.light.brightness(c.x, c.y + 0.5, c.z);
        const p = r.plain.brightness(c.x, c.y + 0.5, c.z);
        if (a !== p) bad.push(`${tag(r)}: 外 (${c.x}, ${c.y}, ${c.z}) の brightness ${a}〔今の 式 ${p}〕`);
      }
      expect(checked, `${tag(r)} の 外の 本道の マス`).toBeGreaterThan(5);
      // 空の 上〔地上〕
      const gy = r.row.hook.shaftPath(r.row.shaft.id)[0]!;
      expect(r.light.yakataTint(gy.x, gy.y + 40, gy.z), '空').toBeNull();
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('家に 置いた あやしい たいまつの まわり〔やかたの 外〕: 光 dim.from〜dim.to の マスも 今の 式の まま・yakataTint が null', () => {
    const T = tableOf();
    const bad: string[] = [];
    let cells = 0;
    for (const r of rigs) {
      need(r);
      r.light.setYakataBoxes(r.boxes);
      // やかたから はなれた 本道の 空気の マスに あやしい たいまつを 置く
      const b = yakataBox(r.row.yakata, T);
      const spot = r.row.hook
        .shaftPath(r.row.shaft.id)
        .filter((c) => (c.part as string) === 'main' && r.world.isLoaded(c.x, c.z) && (c.x < b.x0 - 12 || c.x > b.x1 + 12 || c.z < b.z0 - 12 || c.z > b.z1 + 12))
        .find((c) => r.world.getBlock(c.x, c.y + 1, c.z) === 'air');
      expect(spot, `${tag(r)}: たいまつを 置く 本道の マス`).toBeDefined();
      const id = T.lookBlocks[r.row.yakata.look].taimatsu;
      expect(r.world.setBlock(spot!.x, spot!.y + 1, spot!.z, id as never), `${id} を 置けた`).toBe(true);
      r.light.update();
      r.light.flush();
      r.plain.update();
      r.plain.flush();
      for (let x = spot!.x - 10; x <= spot!.x + 10; x++) {
        for (let z = spot!.z - 10; z <= spot!.z + 10; z++) {
          for (let y = spot!.y - 1; y <= spot!.y + 3; y++) {
            if (!r.world.isLoaded(x, z)) continue;
            const l = r.plain.blockLight(x, y, z);
            if (l < T.dim.from || l > T.dim.to) continue;
            cells++;
            if (r.light.yakataTint(x, y, z) !== null) bad.push(`${tag(r)}: (${x}, ${y}, ${z}) の yakataTint が null でない`);
            if (r.light.brightness(x, y, z) !== r.plain.brightness(x, y, z)) bad.push(`${tag(r)}: (${x}, ${y}, ${z}) の brightness が 今の 式と ちがう`);
          }
        }
      }
    }
    expect(cells, '光 dim.from〜dim.to の マス').toBeGreaterThan(0);
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });

  it('箱の 一覧: 入れた とおりに 返る・複数の やかたの 箱を 入れても それぞれの 組の 色〔見える やかた ぜんぶ〕・カメラに よらない', () => {
    expect(rigs.length).toBe(2);
    const T = tableOf();
    const [a, b] = rigs as [Rig, Rig];
    need(a);
    const all = [...a.boxes, ...b.boxes];
    a.light.setYakataBoxes(all);
    expect(a.light.yakataBoxes()).toEqual(all);
    const c = dimCells(a)[0]!;
    expect(a.light.yakataTint(c.x, c.y, c.z)).toEqual(T.lookTint[a.row.yakata.look]);
    // 入れなおしても〔べつの 画面の 前でも〕 同じ
    a.light.setYakataBoxes(all);
    expect(a.light.yakataBoxes()).toEqual(all);
    expect(a.light.yakataTint(c.x, c.y, c.z)).toEqual(T.lookTint[a.row.yakata.look]);
    a.light.setYakataBoxes(a.boxes);
  });

  it('シェーダーの 数は 表から〔dim.shade・2 つの 組の lookTint の 数が 光の シェーダーの 文に 入る〕', () => {
    const T = tableOf();
    const glsl = `${LIGHT_GLSL_FUNCS}\n${LIGHT_GLSL_LIT}`;
    expect(glsl, 'うすい 明るさの 段').toContain(T.dim.shade.toFixed(4));
    for (const look of LOOKS) for (const v of T.lookTint[look]) expect(glsl, `${look} の 色 ${v}`).toContain(v.toFixed(4));
  });

  it('2 人 あそび: 画面ごとの 前の 処理〔beforePane〕で やかたの 箱を かえない〔箱の 一覧は 世界の 座標で 1 つ〕', () => {
    const src = readFileSync(new URL('../../game/wire/duo.ts', import.meta.url), 'utf8');
    const i = src.indexOf('beforePane:');
    const j = src.indexOf('afterPane:', i);
    expect(i, 'beforePane').toBeGreaterThan(0);
    expect(j, 'afterPane').toBeGreaterThan(i);
    expect(src.slice(i, j), 'beforePane の 中で やかたの 箱を さわって いる').not.toMatch(/yakata/i);
  });
});

// ------------------------------------------------------------------ 妖怪の 体

const PLAYER_FAR: Vec3 = { x: 0, y: 200, z: 0 };
function makeTime(phase: DayPhase): TimeOfDay {
  const t = { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
  return t as unknown as TimeOfDay;
}
const combat = (): PlayerCombat =>
  ({ hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] }) as unknown as PlayerCombat;

describe('F21: 妖怪の 体の 明るさ', () => {
  it('大広間に 置いた 妖怪の 明るさが dim.foe 以上〔くらい 所でも〕・やかたの 外では 今の 式〔箱を 入れない 光と 同じ〕', () => {
    expect(rigs.length, 'やかたが ない').toBe(2);
    const T = tableOf();
    const bad: string[] = [];
    for (const r of rigs) {
      need(r);
      r.light.setYakataBoxes(r.boxes);
      const mgr = (light: WorldLight): YokaiManager =>
        new YokaiManager({
          world: r.world,
          time: makeTime('night'),
          getPlayer: () => ({ position: PLAYER_FAR }),
          combat: combat(),
          inventory: { add: () => 0 } as never,
          seed: 1,
          light,
          lightMin: 0,
        });
      // くらい 床の マス〔光 dim.from〜dim.to〕に 1 体
      const c = dimCells(r)[0]!;
      const m = mgr(r.light);
      const id = m.spawn('karakasa', c.x + 0.5, c.y, c.z + 0.5, { ai: false });
      m.update(1 / 60);
      const inside = m.paletteInfo(id)!.brightness;
      if (inside < T.dim.foe - 1e-9) bad.push(`${tag(r)}: 大広間の 妖怪の 明るさ ${inside.toFixed(3)}〔${T.dim.foe} 以上〕`);
      // 箱を 入れない 光では それより 暗い〔このテストが 何かを 見て いる しるし〕
      const m0 = mgr(r.plain);
      const id0 = m0.spawn('karakasa', c.x + 0.5, c.y, c.z + 0.5, { ai: false });
      m0.update(1 / 60);
      expect(m0.paletteInfo(id0)!.brightness, `${tag(r)}: 今の 式の 明るさ`).toBeLessThan(T.dim.foe);
      // 外: 本道の マス
      const b = yakataBox(r.row.yakata, T);
      const out = r.row.hook
        .shaftPath(r.row.shaft.id)
        .filter((q) => (q.part as string) === 'main' && r.world.isLoaded(q.x, q.z) && (q.x < b.x0 - 3 || q.x > b.x1 + 3 || q.z < b.z0 - 3 || q.z > b.z1 + 3))[0]!;
      const idO = m.spawn('karakasa', out.x + 0.5, out.y, out.z + 0.5, { ai: false });
      const idP = m0.spawn('karakasa', out.x + 0.5, out.y, out.z + 0.5, { ai: false });
      m.update(1 / 60);
      m0.update(1 / 60);
      if (m.paletteInfo(idO)!.brightness !== m0.paletteInfo(idP)!.brightness) bad.push(`${tag(r)}: 外の 妖怪の 明るさが 今の 式と ちがう`);
    }
    expect(bad.slice(0, 8), `${bad.length} つ`).toEqual([]);
  });
});
