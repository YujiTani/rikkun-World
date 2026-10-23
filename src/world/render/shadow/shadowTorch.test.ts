import { describe, expect, it } from 'vitest';
import { mixTorchOcclusion, pickNearestTorches, shouldRedrawTorch, torchCenter, torchKey, torchWeight } from './shadowTorch';

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
