import { describe, expect, it } from 'vitest';
import { assignTorchSlots, hashStep, pickNearestIndices, pickRedrawTorch, mixTorchOcclusion, pickNearestTorches, shouldRedrawTorch, torchCenter, torchKey, torchWeight } from './shadowTorch';

const P = { x: 0.5, y: 0.82, z: 0.5 };

describe('pickNearestTorches', () => {
  it('近い順に 2 本まで', () => {
    const r = pickNearestTorches([{ x: 9, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], P, 16);
    expect(r.map((t) => t.x)).toEqual([1, 2]);
  });
  it('とどく距離の外は 選ばない', () => {
    expect(pickNearestTorches([{ x: 20, y: 0, z: 0 }], P, 16)).toEqual([]);
    expect(pickNearestTorches([{ x: 15, y: 0, z: 0 }], P, 16)).toHaveLength(1);
  });
  it('上下の高さも 距離に入る', () => {
    const r = pickNearestTorches([{ x: 3, y: 0, z: 0 }, { x: 0, y: 6, z: 0 }], P, 16);
    expect(r[0]!.x).toBe(3);
  });
  it('空なら 空', () => {
    expect(pickNearestTorches([], P, 16)).toEqual([]);
  });
});

describe('torchCenter / torchKey', () => {
  it('光の中心は 棒の上 0.82', () => {
    expect(torchCenter({ x: 4, y: 2, z: 7 })).toEqual({ x: 4.5, y: 2.82, z: 7.5 });
  });
  it('同じ場所は 同じ印、ちがう場所は ちがう印', () => {
    expect(torchKey({ x: 1, y: 2, z: 3 })).toBe(torchKey({ x: 1, y: 2, z: 3 }));
    expect(torchKey({ x: 1, y: 2, z: 3 })).not.toBe(torchKey({ x: 3, y: 2, z: 1 }));
  });
});

describe('shouldRedrawTorch', () => {
  const base = { near: 11, hadMovers: false, needsDraw: false };
  it('動く物が 11 より遠いなら 描き直さない', () => {
    expect(shouldRedrawTorch({ ...base, moverDistances: [11, 20] })).toEqual({ redraw: false, hasMovers: false });
  });
  it('11 以内に いれば 描き直す', () => {
    expect(shouldRedrawTorch({ ...base, moverDistances: [3] })).toEqual({ redraw: true, hasMovers: true });
  });
  it('いなくなった次の 1 回と、たいまつが変わったときは 描き直す', () => {
    expect(shouldRedrawTorch({ ...base, moverDistances: [], hadMovers: true }).redraw).toBe(true);
    expect(shouldRedrawTorch({ ...base, moverDistances: [], needsDraw: true }).redraw).toBe(true);
  });
});

describe('torchWeight / mixTorchOcclusion', () => {
  it('近さの重み: 0 で 1、半径で 0、外は 0', () => {
    expect(torchWeight(0, 10)).toBe(1);
    expect(torchWeight(5, 10)).toBeCloseTo(0.5);
    expect(torchWeight(10, 10)).toBe(0);
    expect(torchWeight(15, 10)).toBe(0);
  });
  it('1 本だけ近く 影なら ほぼまるごと影、遠いと うすい', () => {
    expect(mixTorchOcclusion([{ weight: 0.9, occ: 1 }])).toBeCloseTo(1);
    expect(mixTorchOcclusion([{ weight: 0.1, occ: 1 }])).toBeCloseTo(0.1 / 0.35);
  });
  it('片方が とどいていると 影は うすくなる', () => {
    expect(mixTorchOcclusion([{ weight: 0.5, occ: 1 }, { weight: 0.5, occ: 0 }])).toBeCloseTo(0.5);
  });
  it('重み 0 は 数えない・何もなければ 0', () => {
    expect(mixTorchOcclusion([{ weight: 0, occ: 1 }])).toBe(0);
    expect(mixTorchOcclusion([])).toBe(0);
  });
});

describe('assignTorchSlots', () => {
  const mk = (key: number, active: boolean) => ({ key, active });
  it('はじめて見つけたものは あいた入れ物へ（新しい印つき）', () => {
    const r = assignTorchSlots([mk(-1, false), mk(-1, false)], [7, 8]);
    expect(r.map((s) => [s.key, s.active, s.fresh])).toEqual([[7, true, true], [8, true, true]]);
  });
  it('続けて見つかるものは 同じ入れ物のまま（新しくない）', () => {
    const r = assignTorchSlots([mk(7, true), mk(8, true)], [8, 7]);
    expect(r.map((s) => [s.key, s.active, s.fresh])).toEqual([[7, true, false], [8, true, false]]);
  });
  it('はなれて 見つからなくなった入れ物は 印を捨てる（もどると 新しく割り当てる）', () => {
    const away = assignTorchSlots([mk(7, true), mk(-1, false)], []);
    expect(away[0]).toMatchObject({ key: -1, active: false });
    const back = assignTorchSlots(away, [7]);
    expect(back[0]).toMatchObject({ key: 7, active: true, fresh: true });
  });
  it('1 本が 入れかわると あいた方へ', () => {
    const r = assignTorchSlots([mk(7, true), mk(8, true)], [8, 9]);
    expect(r[1]).toMatchObject({ key: 8, fresh: false });
    expect(r[0]).toMatchObject({ key: 9, active: true, fresh: true });
  });
  it('もとの入れ物が 非 active で印だけ のこっていても 見つかったら 新しく割り当てる', () => {
    const r = assignTorchSlots([mk(7, false), mk(-1, false)], [7]);
    expect(r.some((s) => s.key === 7 && s.active && s.fresh)).toBe(true);
  });
});

describe('hashStep', () => {
  it('同じ並びなら 同じ、ちがうと ちがう（0.001 より小さい ゆれは 同じ）', () => {
    const h = (...v: number[]) => v.reduce((a, x) => hashStep(a, x), 0);
    expect(h(1, 2.5, -3)).toBe(h(1, 2.5, -3));
    expect(h(1, 2.5, -3)).not.toBe(h(1, 2.5, -3.01));
    expect(h(1, 2)).not.toBe(h(2, 1));
    expect(h(1.00001)).toBe(h(1));
  });
});

describe('pickNearestIndices', () => {
  it('近い順に 3 つまで（limit 以内）', () => {
    const out: number[] = [];
    pickNearestIndices([9, 1, 5, 3, 7, 2], 0, 3, 8, out);
    expect(out).toEqual([1, 5, 3]);
  });
  it('offset から 数える（先頭は 動く物の ほかの物）。index は もとの配列の場所', () => {
    const out: number[] = [];
    pickNearestIndices([0.5, 4, 2], 1, 3, 11, out);
    expect(out).toEqual([2, 1]);
  });
  it('limit の外は 入れない・使い回しの out は 前の中身を 消す', () => {
    const out = [99];
    pickNearestIndices([20, 30], 0, 3, 11, out);
    expect(out).toEqual([]);
  });
  it('妖怪 10 体でも 3 体だけ', () => {
    const out: number[] = [];
    pickNearestIndices(Array.from({ length: 10 }, (_, i) => 10 - i), 0, 3, 11, out);
    expect(out).toHaveLength(3);
    expect(out).toEqual([9, 8, 7]);
  });
});

describe('pickRedrawTorch（1 コマ 1 本）', () => {
  it('どちらも いらなければ -1', () => {
    expect(pickRedrawTorch([false, false], 0)).toBe(-1);
  });
  it('1 本だけ いるなら その 1 本', () => {
    expect(pickRedrawTorch([false, true], 1)).toBe(1);
    expect(pickRedrawTorch([true, false], 0)).toBe(0);
  });
  it('2 本とも いるときは 前に描いた方の 次（交互）', () => {
    expect(pickRedrawTorch([true, true], 0)).toBe(1);
    expect(pickRedrawTorch([true, true], 1)).toBe(0);
    expect(pickRedrawTorch([true, true], -1)).toBe(0);
  });
});
