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
});
