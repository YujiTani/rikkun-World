import { describe, expect, it } from 'vitest';
import { isScaffoldId } from '../../world/blocks/buildBlocks';
import type { Placed } from '../editor/model';
import { houseShape } from '../shape';
import { makePlan, stageCounts } from './plan';

/** ユニット 7（§4.5・決め 9）: 建築の 段。足場だけ → かべが 少しずつ → 屋根・家具・ちょうちん。仮の ブロックは 作らない */
const FUTON: Placed = { kind: 'futon', x: 0, z: 0, rot: 1 };
const BP = { w: 5 as const, d: 5 as const, windows: 2, furniture: [FUTON, { kind: 'chair', x: 4, z: 0, rot: 0 } as Placed] };
const plan = makePlan(BP);
const shape = houseShape(BP);

describe('建築の 手順の 表', () => {
  it('外の 箱は 家の 形と 同じ（5×5 → 7×7）', () => {
    expect([plan.outerW, plan.outerD]).toEqual([7, 7]);
  });
  it('かべ・仕上げは 完成の ブロックを そのまま（家の 形の 空気でない マス ぜんぶ）。足場は 家の 形に 無い id で、足場だけ アイテムに ならない', () => {
    const want = shape.cells.filter((c) => c.id !== 'air').length;
    expect(plan.walls.length + plan.finish.length).toBe(want);
    for (const c of [...plan.walls, ...plan.finish]) expect(shape.cells.find((s) => s.x === c.x && s.y === c.y && s.z === c.z)?.id, `${c.x},${c.y},${c.z}`).toBe(c.id);
    expect(plan.scaffold.length).toBeGreaterThan(0);
    for (const c of plan.scaffold) expect(isScaffoldId(c.id)).toBe(true);
  });
  it('足場は かべと 重ならず 箱の 中。のぼりは 1 本。戸の 前の 中がわは あいて いる', () => {
    const wallKeys = new Set(plan.walls.map((c) => `${c.x},${c.y},${c.z}`));
    for (const c of plan.scaffold) {
      expect(wallKeys.has(`${c.x},${c.y},${c.z}`)).toBe(false);
      expect(c.x >= 1 && c.x <= plan.outerW - 2 && c.z >= 1 && c.z <= plan.outerD - 2 && c.y >= 1 && c.y <= 3).toBe(true);
    }
    expect(plan.scaffold.filter((c) => c.id === 'ashiba_flag')).toHaveLength(1);
    expect(plan.scaffold.some((c) => c.x === shape.door.x && c.z === plan.outerD - 2)).toBe(false);
  });
  it('足場の 三角形は 2,000 まで（9×9 の 最大でも）。1 マス 18 まい と して', () => {
    const big = makePlan({ w: 9, d: 9, windows: 0, furniture: [] });
    expect(big.scaffold.length * 18).toBeLessThanOrEqual(2000);
  });
});

describe('進みごとの 数', () => {
  const L = 9000;
  it('0〜15% は 足場だけ（かべ 0・仕上げ 0）', () => {
    expect(stageCounts(plan, 0, L)).toEqual({ walls: 0, finish: 0 });
    expect(stageCounts(plan, 1349, L)).toEqual({ walls: 0, finish: 0 });
  });
  it('15〜85% は かべだけ 少しずつ ふえる（ふえるだけ・へらない）。屋根は まだ', () => {
    let last = 0;
    for (let e = 1350; e < 7650; e += 50) {
      const c = stageCounts(plan, e, L);
      expect(c.finish).toBe(0);
      expect(c.walls).toBeGreaterThanOrEqual(last);
      expect(c.walls).toBeLessThanOrEqual(plan.walls.length);
      last = c.walls;
    }
    expect(stageCounts(plan, 3600, L).walls).toBeGreaterThan(0);
  });
  it('85% から かべは そろい、仕上げが ふえる。完成の 1 ステップ 前は まだ ぜんぶでは ない', () => {
    expect(stageCounts(plan, 7650, L)).toEqual({ walls: plan.walls.length, finish: 0 });
    const late = stageCounts(plan, 8999, L);
    expect(late.walls).toBe(plan.walls.length);
    expect(late.finish).toBeGreaterThan(0);
    expect(late.finish).toBeLessThanOrEqual(plan.finish.length);
  });
  it('長さが 0 以下でも こわれない', () => {
    expect(stageCounts(plan, 0, 0).walls).toBe(plan.walls.length);
  });
});
