import { describe, expect, it } from 'vitest';
import type { Vec3, YokaiWorld } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { centerOf, yokaiAt } from '../combat/attackTestKit';
import { aimThunder, thunderBlock, thunderTargets, thunderTop } from './aim';

/** WEAPON-7 AC9・AC10: 落ちる 点・空が 見えるか・当たる 妖怪（ブロックの 列だけで 決める） */
const FLOOR = 8;
function world() {
  const w = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
  for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) w.setBlock(x, FLOOR, z, 'stone');
  return w;
}
const NO_YOKAI: Pick<YokaiWorld, 'raycast' | 'list'> = { raycast: () => null, list: () => [] };
/** 目 (20.5, 10.4, 20.5) から 前（北）8 の 地面の まん中を ねらう */
const EYE: Vec3 = { x: 20.5, y: FLOOR + 1 + 1.4, z: 20.5 };
function dirTo(to: Vec3, from: Vec3 = EYE): Vec3 {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}
const GROUND8: Vec3 = { x: 20.5, y: FLOOR + 1, z: 12.5 };

describe('雷が 当たる ブロック', () => {
  it('固い・はっぱ・水は 当たる。空気・十字の 草花・たいまつは とおりぬける', () => {
    const w = world();
    w.setBlock(1, 20, 1, 'leaves');
    w.setBlock(2, 20, 1, 'water');
    w.setBlock(3, 20, 1, 'torch');
    w.setBlock(4, 20, 1, 'crop_onion');
    w.setBlock(5, 20, 1, 'flower_y');
    expect([1, 2].map((x) => thunderBlock(w, x, 20, 1))).toEqual([true, true]);
    expect([3, 4, 5].map((x) => thunderBlock(w, x, 20, 1))).toEqual([false, false, false]);
    expect(thunderBlock(w, 6, 20, 1)).toBe(false); // 空気
    expect(thunderBlock(w, 1, 999, 1)).toBe(false); // 高さの 外
  });
});

describe('AC9 落ちる 点 S と 空が 見えるか', () => {
  it('(1) 平地で 前 8 の 地面 → S = その 上の面・skyVisible true', () => {
    const w = world();
    const a = aimThunder(w, NO_YOKAI, EYE, dirTo(GROUND8), 20);
    expect(a.S!.y).toBe(FLOOR + 1);
    expect(Math.floor(a.S!.x)).toBe(20);
    expect(Math.floor(a.S!.z)).toBe(12);
    expect(Math.floor(a.T.z)).toBe(12);
    expect(a.skyVisible).toBe(true);
  });
  it('(2) T の 上 3 マスに 屋根 → S = 屋根の 上・false', () => {
    const w = world();
    w.fill(10, FLOOR + 4, 5, 30, FLOOR + 4, 25, 'stone');
    const a = aimThunder(w, NO_YOKAI, EYE, dirTo(GROUND8), 20);
    expect(a.S!.y).toBe(FLOOR + 5);
    expect(a.skyVisible).toBe(false);
    expect(Math.floor(a.S!.z)).toBe(Math.floor(a.T.z));
  });
  it('(3) 十字の 草花・たいまつは とおりぬける。はっぱ・水は そこに 落ちる', () => {
    const w = world();
    w.setBlock(20, FLOOR + 4, 12, 'torch');
    w.setBlock(20, FLOOR + 6, 12, 'crop_onion');
    const t = aimThunder(w, NO_YOKAI, EYE, dirTo(GROUND8), 20);
    expect(t.S!.y).toBe(FLOOR + 1);
    expect(t.skyVisible).toBe(true);
    for (const id of ['leaves', 'water'] as const) {
      const w2 = world();
      w2.setBlock(20, FLOOR + 4, 12, id);
      const a = aimThunder(w2, NO_YOKAI, EYE, dirTo(GROUND8), 20);
      expect(a.S!.y, id).toBe(FLOOR + 5);
      expect(a.skyVisible, id).toBe(false);
    }
  });
  it('(4) 20 より 遠い → T = 線の 20 先（空の 点）。その 列の 地面に 落ちる・空が 見える', () => {
    const w = world();
    const d = dirTo({ x: 20.5, y: EYE.y + 1, z: 0 }); // 少し 上向き
    const a = aimThunder(w, NO_YOKAI, EYE, d, 20);
    expect(Math.hypot(a.T.x - EYE.x, a.T.y - EYE.y, a.T.z - EYE.z)).toBeCloseTo(20, 3);
    expect(a.S!.y).toBe(FLOOR + 1);
    expect(a.skyVisible).toBe(true);
  });
  it('T の 上に 屋根（空中の T でも）→ 見えない', () => {
    const w = world();
    w.fill(0, FLOOR + 14, 0, 47, FLOOR + 14, 47, 'stone');
    const a = aimThunder(w, NO_YOKAI, EYE, dirTo({ x: 20.5, y: EYE.y + 1, z: 0 }), 20);
    expect(a.S!.y).toBe(FLOOR + 15);
    expect(a.skyVisible).toBe(false);
  });
  it('列に ブロックが 1 つも ない・読みこんで いない → S なし（lightningMiss）', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
    const a = aimThunder(w, NO_YOKAI, EYE, dirTo(GROUND8), 20);
    expect(a.S).toBeNull();
    expect(a.skyVisible).toBe(false);
    expect(thunderTop(w, 5, 5)).toBeNull();
  });
  it('T が 妖怪: S = 足もとの 地面 → 見える。屋根の 下の 妖怪 → 見えない', () => {
    const w = world();
    const y = yokaiAt('karakasa', { x: 20.5, y: FLOOR + 1, z: 16.5 });
    const yw = { raycast: () => ({ id: y.id, kind: y.kind, distance: 4.4 }), list: () => [y] } as unknown as Pick<YokaiWorld, 'raycast' | 'list'>;
    const a = aimThunder(w, yw, EYE, dirTo({ x: 20.5, y: FLOOR + 1.5, z: 16.5 }), 20);
    expect(a.skyVisible).toBe(true);
    expect(a.S!.y).toBe(FLOOR + 1);
    w.fill(10, FLOOR + 4, 5, 30, FLOOR + 4, 25, 'stone');
    const b = aimThunder(w, yw, EYE, dirTo({ x: 20.5, y: FLOOR + 1.5, z: 16.5 }), 20);
    expect(b.skyVisible).toBe(false);
    expect(b.S!.y).toBe(FLOOR + 5);
  });
});

describe('AC10 当たる 妖怪（F8）', () => {
  const S: Vec3 = { x: 20.5, y: FLOOR + 1, z: 12.5 };
  it('中心が 4.7 以内 → 当たる。5.3 より 外 → 当たらない', () => {
    const w = world();
    const near = yokaiAt('karakasa', { x: S.x + 4.6, y: S.y, z: S.z });
    const far = yokaiAt('karakasa', { x: S.x + 6.6, y: S.y, z: S.z });
    expect(Math.hypot(centerOf(near).x - S.x, centerOf(near).y - S.y)).toBeLessThanOrEqual(5);
    expect(thunderTargets(w, [near, far], S, 5)).toEqual([near.id]);
  });
  it('S と 妖怪の 間に 固い ブロック → 当たらない。ぬりかべも 当たる（押されない のは ダメージ側）', () => {
    const w = world();
    w.fill(Math.floor(S.x) - 2, S.y, 6, Math.floor(S.x) - 2, S.y + 3, 18, 'stone');
    const walled = yokaiAt('karakasa', { x: S.x - 3.6, y: S.y, z: S.z });
    const wall = yokaiAt('nurikabe', { x: S.x, y: S.y, z: S.z + 3.5 });
    expect(thunderTargets(w, [walled, wall], S, 5)).toEqual([wall.id]);
  });
  it('たおれて いる 妖怪は 当たらない', () => {
    const w = world();
    const dying = yokaiAt('karakasa', { x: S.x + 1, y: S.y, z: S.z }, { state: 'dying' });
    expect(thunderTargets(w, [dying], S, 5)).toEqual([]);
  });
});
