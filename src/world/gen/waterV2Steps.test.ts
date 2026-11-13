import { describe, expect, it } from 'vitest';
import { planWaterAhead } from './countryAhead';
import { cellReady, sitesOfCell, stepCellAhead } from './countryFeatures';
import { type Ctx } from './countryKit';
import { ShaftWorld } from './mineShafts';
import { terrainFor } from './terrain';
import { waterSites, waterSitesSteps } from './waterV2';
import { WATER_TUNE } from './waterV2Table';

// 水の 計画を 小分けに 進めても、先に 計算しても、その場で 計算しても、同じ 結果（#187）
const seed = 20261012;
const T = terrainFor(seed);
// 世界ごとに 別の ShaftWorld を 作る（シードごとの 共有の ものを 使うと 覚えが 混ざって くらべに ならない）
const POINTS: readonly (readonly [number, number])[] = [[-937, -940], [1288, 401]]; // もみじ・ゆき（滝と 川が ある 山）

function cellOf(x: number, z: number, shafts: ShaftWorld): { c: Ctx; i: number; j: number } {
  const a = T.map.countryAt(x, z);
  const cell = T.map.cell(a.cx, a.cz);
  return { c: { T, i: cell.i, j: cell.j, px: cell.px, pz: cell.pz, kind: cell.kind, shafts }, i: cell.i, j: cell.j };
}

describe('水の 計画の 小分け（#187）', () => {
  it('1 歩ずつ（2 つの 山を 交互に）進めた 結果 = 一気に 計算した 結果', () => {
    const shaftsA = new ShaftWorld(seed, undefined);
    const shaftsB = new ShaftWorld(seed, undefined);
    const [a, b] = POINTS.map(([x, z]) => cellOf(x, z, shaftsA));
    const gens = [waterSitesSteps(a!.c, []), waterSitesSteps(b!.c, [])];
    const got: unknown[] = [undefined, undefined];
    let steps = 0;
    for (let k = 0; got[0] === undefined || got[1] === undefined; k++) {
      const g = k % 2;
      if (got[g] !== undefined) continue;
      const r = gens[g]!.next();
      steps++;
      if (r.done === true) got[g] = r.value;
    }
    expect(steps, '何度も 止まれる').toBeGreaterThan(100);
    const [a2, b2] = POINTS.map(([x, z]) => cellOf(x, z, shaftsB));
    expect(got[0]).toEqual(waterSites(a2!.c, []));
    expect(got[1]).toEqual(waterSites(b2!.c, []));
    expect((got[0] as unknown[]).length).toBeGreaterThan(0);
  }, 60_000);

  it('先に 途中まで 計算して あっても、sitesOfCell の 結果は 同じ', () => {
    const ahead = new ShaftWorld(seed, undefined);
    const direct = new ShaftWorld(seed, undefined);
    const { i, j } = cellOf(POINTS[0]![0], POINTS[0]![1], ahead);
    for (let n = 0; n < 40; n++) expect(stepCellAhead(T, i, j, ahead, 3)).toBe(false);
    expect(cellReady(T, i, j, ahead)).toBe(false);
    const a = sitesOfCell(T, i, j, ahead); // 先読みの とちゅう → のこりを その場で
    expect(cellReady(T, i, j, ahead)).toBe(true);
    expect(a).toEqual(sitesOfCell(T, i, j, direct));
  }, 60_000);

  it('planWaterAhead: 1 回の 歩数に 上限が あり、くりかえすと 近くの 山が 計算ずみに なる（結果は 同じ）', () => {
    const shafts = new ShaftWorld(seed, undefined);
    const direct = new ShaftWorld(seed, undefined);
    const { i, j, c } = cellOf(POINTS[1]![0], POINTS[1]![1], shafts);
    const centers = [{ x: c.px + 300, z: c.pz }];
    // 1 回で 全部は 終わらない（歩数の 上限）
    planWaterAhead(seed, shafts, centers, true);
    expect(cellReady(T, i, j, shafts)).toBe(false);
    for (let n = 0; n < 60000 && !cellReady(T, i, j, shafts); n++) planWaterAhead(seed, shafts, centers, true);
    expect(cellReady(T, i, j, shafts)).toBe(true);
    expect(sitesOfCell(T, i, j, shafts)).toEqual(sitesOfCell(T, i, j, direct));
    expect(WATER_TUNE.ahead.reach).toBeGreaterThan(300);
  }, 120_000);

  it('planWaterAhead: 同じ シードで ShaftWorld だけ かわっても 先読みが 続く', () => {
    const a = new ShaftWorld(seed, undefined);
    const b = new ShaftWorld(seed, undefined);
    const { i, j, c } = cellOf(POINTS[1]![0], POINTS[1]![1], a);
    const centers = [{ x: c.px + 1, z: c.pz }];
    for (let n = 0; n < 60000 && !cellReady(T, i, j, a); n++) planWaterAhead(seed, a, centers, true);
    expect(cellReady(T, i, j, a)).toBe(true);
    expect(cellReady(T, i, j, b)).toBe(false);
    for (let n = 0; n < 60000 && !cellReady(T, i, j, b); n++) planWaterAhead(seed, b, centers, true);
    expect(cellReady(T, i, j, b)).toBe(true);
    expect(sitesOfCell(T, i, j, b)).toEqual(sitesOfCell(T, i, j, a));
  }, 120_000);

  it('途中で 別の 山を sitesOfCell で わりこませても 結果は 同じ', () => {
    const w = new ShaftWorld(seed, undefined);
    const direct = new ShaftWorld(seed, undefined);
    const a = cellOf(POINTS[0]![0], POINTS[0]![1], w);
    const b = cellOf(POINTS[1]![0], POINTS[1]![1], w);
    for (let n = 0; n < 700; n++) expect(stepCellAhead(T, a.i, a.j, w, 3)).toBe(false);
    const sb = sitesOfCell(T, b.i, b.j, w);
    while (!stepCellAhead(T, a.i, a.j, w, 3));
    expect(sitesOfCell(T, a.i, a.j, w)).toEqual(sitesOfCell(T, a.i, a.j, direct));
    expect(sb).toEqual(sitesOfCell(T, b.i, b.j, direct));
  }, 120_000);

  it('途中の 物が 上限（run 3）を こえて すてられても、やりなおして 結果は 同じ', () => {
    const w = new ShaftWorld(seed, undefined);
    const direct = new ShaftWorld(seed, undefined);
    const pts: readonly (readonly [number, number])[] = [...POINTS, [-501, -830], [508, 1301]];
    const cells = pts.map(([x, z]) => cellOf(x, z, w)).filter((q, k, all) => all.findIndex((r) => r.i === q.i && r.j === q.j) === k);
    expect(cells.length).toBeGreaterThanOrEqual(4);
    for (const q of cells.slice(0, 4)) for (let n = 0; n < 5; n++) stepCellAhead(T, q.i, q.j, w, 3); // 4 つ目で 1 つ目が すてられる
    const first = cells[0]!;
    while (!stepCellAhead(T, first.i, first.j, w, 3)); // はじめから やりなおして 終える
    expect(sitesOfCell(T, first.i, first.j, w)).toEqual(sitesOfCell(T, first.i, first.j, direct));
  }, 120_000);
});
