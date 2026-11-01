import { describe, expect, it } from 'vitest';
import { ROPE_TUNING, facingStep, isClimbBlock, isRopeBlock, planRope, planRopeHere, ropeColumn, ropeStakeOf, ropesFor, stakeRope } from './rope';

/** ROPE-1 AC2〜AC5（docs/design/ROPE-1.md）: たらす 長さ・ロープだまり・つかう 本数・つながった ロープの 見つけ方 */

/** floor より 上が あいて いる たての 列（floor の 高さは ふさがって いる） */
const openAbove = (floor: number) => (y: number) => y > floor;

describe('planRope（たらす 計画）', () => {
  it('1 本で 10 マスまで。とちゅうで 床に とどかなければ ぜんぶ ロープ（ロープだまり なし）', () => {
    const p = planRope(openAbove(-100), 50, 1)!;
    expect(p.cells).toHaveLength(ROPE_TUNING.perRope);
    expect(p.cells.every((c) => c.block === 'rope')).toBe(true);
    expect(p.cells[0].y).toBe(50);
    expect(p.used).toBe(1);
  });
  it('10 マス 以内で 床に とどくと いちばん 下が ロープだまり。つかうのは 1 本', () => {
    const p = planRope(openAbove(44), 50, 3)!; // 50〜45 の 6 マス
    expect(p.cells.map((c) => c.y)).toEqual([50, 49, 48, 47, 46, 45]);
    expect(p.cells.at(-1)!.block).toBe('rope_coil');
    expect(p.cells.slice(0, -1).every((c) => c.block === 'rope')).toBe(true);
    expect(p.used).toBe(1);
  });
  it('2 本 持つと 20 マス、3 本で 30 マスまで。つかう 本数は ⌈長さ ÷ 10⌉', () => {
    expect(planRope(openAbove(-100), 50, 2)!.cells).toHaveLength(20);
    expect(planRope(openAbove(-100), 50, 3)!.cells).toHaveLength(30);
    const p = planRope(openAbove(35), 50, 3)!; // 50〜36 の 15 マス
    expect(p.cells).toHaveLength(15);
    expect(p.cells.at(-1)!.block).toBe('rope_coil');
    expect(p.used).toBe(2);
  });
  it('ちょうど 10 × N マスで 床に とどくと、ロープだまりに なって N 本', () => {
    const p = planRope(openAbove(40), 50, 1)!; // 50〜41 = 10 マス、40 が 床
    expect(p.cells).toHaveLength(10);
    expect(p.cells.at(-1)!.block).toBe('rope_coil');
    expect(p.used).toBe(1);
  });
  it('はじめの マスが ふさがって いる・0 本なら たらせない', () => {
    expect(planRope(openAbove(50), 50, 1)).toBeNull();
    expect(planRope(openAbove(0), 50, 0)).toBeNull();
  });
  it('真下が すぐ 床なら 1 マスの ロープだまり', () => {
    const p = planRope(openAbove(49), 50, 1)!;
    expect(p.cells).toEqual([{ y: 50, block: 'rope_coil' }]);
  });
});

describe('ropeColumn・ropesFor（こわすと ぜんぶ もどる）', () => {
  const col = (top: number, bottom: number, coil: boolean) => (y: number) =>
    y > top || y < bottom ? 'stone' : y === bottom && coil ? 'rope_coil' : 'rope';
  it('どの マスから しらべても 同じ 上はし・下はし（ロープだまりを ふくむ）', () => {
    const id = col(30, 16, true);
    for (const y of [30, 23, 17, 16]) expect(ropeColumn(id, y)).toEqual({ top: 30, bottom: 16 });
  });
  it('ロープだまりの ない ぶらさがりも 同じ', () => {
    const id = col(30, 21, false);
    expect(ropeColumn(id, 25)).toEqual({ top: 30, bottom: 21 });
  });
  it('もどる 本数 = ⌈長さ ÷ 10⌉（たらした ときと 同じ）', () => {
    expect([1, 10, 11, 20, 21, 30].map(ropesFor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it('ロープの マスか', () => {
    expect(isRopeBlock('rope')).toBe(true);
    expect(isRopeBlock('rope_coil')).toBe(true);
    expect(isRopeBlock('air')).toBe(false);
  });
});

describe('版 3: facingStep・planRopeHere・stakeRope', () => {
  it('yaw 0 = -z、90 = +x、180 = +z、270 = -x。ななめは 近い ほう', () => {
    expect(facingStep(0)).toEqual([0, -1]);
    expect(facingStep(90)).toEqual([1, 0]);
    expect(facingStep(180).map((v) => v + 0)).toEqual([0, 1]);
    expect(facingStep(270)).toEqual([-1, 0]);
    expect(facingStep(60)).toEqual([1, 0]);
  });
  it('くいは 足もと、なわは まえの 列の 足もとの 高さから 下へ', () => {
    const open = (x: number, y: number) => x === 6 && y > 2; // まえ（x=6）は y=3 より 上が あき
    const p = planRopeHere({ x: 5, y: 8, z: 5 }, 90, 1, () => true, open)!;
    expect(p.stake).toEqual({ x: 5, y: 8, z: 5 });
    expect([p.x, p.z]).toEqual([6, 5]);
    expect(p.cells.map((c) => c.y)).toEqual([8, 7, 6, 5, 4, 3]);
    expect(p.cells.at(-1)!.block).toBe('rope_coil');
  });
  it('まえの 1 つ下が ふさがって いる（がけで ない）・くいが おけない なら null', () => {
    expect(planRopeHere({ x: 5, y: 8, z: 5 }, 90, 1, () => true, (_x, y) => y >= 8)).toBeNull();
    expect(planRopeHere({ x: 5, y: 8, z: 5 }, 90, 1, () => false, () => true)).toBeNull();
  });
  it('くいの となりの ロープの 列・ロープの 上はしの となりの くい', () => {
    const w = new Map<string, string>([['5,8,5', 'rope_stake'], ['6,8,5', 'rope'], ['6,7,5', 'rope_coil']]);
    const id = (x: number, y: number, z: number) => w.get(`${x},${y},${z}`) ?? 'air';
    expect(stakeRope(id, 5, 8, 5)).toEqual({ x: 6, z: 5 });
    expect(ropeStakeOf(id, 6, 8, 5)).toEqual({ x: 5, z: 5 });
    expect(isClimbBlock('rope_stake')).toBe(false);
    expect(isRopeBlock('rope_stake')).toBe(true);
  });
});
