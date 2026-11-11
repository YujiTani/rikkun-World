import { describe, expect, it } from 'vitest';
import { HAMMER_FX_MAX, HAMMER_FX_STEPS, HAMMER_SHEET, hammerFacingDeg, hammerFrameAt, hammerFrameUv, hammerFxPlacement } from './hammerSlamModel';

describe('hammerSlamModel', () => {
  it('コマ: 最初から 最後まで 1 秒 前後・おわると null', () => {
    expect(hammerFrameAt(0, false)).toBe(0);
    expect(hammerFrameAt(HAMMER_FX_STEPS - 1, false)).toBe(HAMMER_SHEET.frames - 1);
    expect(hammerFrameAt(HAMMER_FX_STEPS, false)).toBeNull();
    expect(HAMMER_FX_STEPS / 60).toBeGreaterThan(0.8);
    expect(HAMMER_FX_STEPS / 60).toBeLessThan(1.3);
  });
  it('動きを へらす: 同じ コマを 見せつづけて おわる', () => {
    expect(hammerFrameAt(0, true)).toBe(hammerFrameAt(20, true));
    expect(hammerFrameAt(999, true)).toBeNull();
  });
  it('絵の 位置は 6 × 6 の 中', () => {
    const u = hammerFrameUv(32);
    expect(u.x).toBeCloseTo(2 / 6, 9);
    expect(u.y).toBeCloseTo(0, 9);
    expect(hammerFrameUv(0).y).toBeCloseTo(5 / 6, 9);
  });
  it('向き・場所: 北へ 奥行き 2 の まん中は 前 1.5 マス', () => {
    expect(hammerFacingDeg({ dx: 0, dz: -1 })).toBe(0);
    expect(hammerFacingDeg({ dx: 1, dz: 0 })).toBe(90);
    expect(hammerFacingDeg({ dx: 0, dz: 1 })).toBe(180);
    expect(hammerFacingDeg({ dx: -1, dz: 0 })).toBe(270);
    const p = hammerFxPlacement({ x: 10.5, y: 9, z: 10.5 }, { dx: 0, dz: -1 }, 2, false);
    expect(p.x).toBeCloseTo(10.5, 9);
    expect(p.z).toBeCloseTo(9, 9);
    expect(p.y).toBeGreaterThan(9);
    expect(hammerFxPlacement({ x: 10.5, y: 9, z: 10.5 }, { dx: 0, dz: -1 }, 2, true).w).toBeGreaterThan(p.w);
  });
  it('同時に 出す 数は 描画回数の 上限 4 に 入る（1 つ 2 まい）', () => {
    expect(HAMMER_FX_MAX * 2).toBeLessThanOrEqual(4);
  });
});
