import { describe, expect, it } from 'vitest';
import { slashAngleDeg, slashViewFor } from './slashView';

/** WEAPON-9 AC48（虹の 斬撃）: 斬撃の 絵の きりかえ */
describe('AC48 slashViewFor', () => {
  it('0・20・35 → flat、55・90・125 → side、145・180 → flat', () => {
    for (const a of [0, 20, 35, 145, 180]) expect(slashViewFor(a, 'side'), `${a}`).toBe('flat');
    for (const a of [55, 90, 125]) expect(slashViewFor(a, 'flat'), `${a}`).toBe('side');
  });
  it('間（45）は 前と 同じ。前が ない ときは side', () => {
    expect(slashViewFor(45, 'side')).toBe('side');
    expect(slashViewFor(45, 'flat')).toBe('flat');
    expect(slashViewFor(45, null)).toBe('side');
    expect(slashViewFor(135, 'flat')).toBe('flat');
    expect(slashViewFor(135, null)).toBe('side');
  });
});

describe('slashAngleDeg', () => {
  it('北向き(0°)の わざ: うしろ(南)から 見ると 0°、横から 90°、正面から 180°', () => {
    // カメラは 南(+z)・斬撃は 北: カメラ → 斬撃 = (0, -1)
    expect(slashAngleDeg(0, { x: 0, z: -3 })).toBeCloseTo(0, 5);
    expect(slashAngleDeg(0, { x: 3, z: 0 })).toBeCloseTo(90, 5);
    expect(slashAngleDeg(0, { x: 0, z: 3 })).toBeCloseTo(180, 5);
  });
  it('東向き(90°): カメラ → 斬撃 が +x なら 0°', () => {
    expect(slashAngleDeg(90, { x: 2, z: 0 })).toBeCloseTo(0, 5);
  });
  it('真上から(水平の ずれ 0)は 0°（一人称は ねかせ）', () => {
    expect(slashAngleDeg(0, { x: 0, z: 0 })).toBe(0);
  });
});
