import { describe, expect, it } from 'vitest';
import { SPARKLE, SPARKLE_CFG, pillarOpacity, rainbowHue, sparkleCount } from './dropSparkle';

describe('dropSparkle', () => {
  it('めずらしさごとの キラキラの数（1 秒に 2・4・7・12 こ）', () => {
    expect(SPARKLE.common.rate).toBe(2);
    expect(SPARKLE.uncommon.rate).toBe(4);
    expect(SPARKLE.rare.rate).toBe(7);
    expect(SPARKLE.superRare.rate).toBe(12);
    expect(sparkleCount('superRare')).toBe(12 * SPARKLE_CFG.life);
  });
  it('むらさきは 太く・星形（にじ色は 7 段目に うつした）。あおは ゆれる。ゆれは 1 秒に 3 回未満', () => {
    expect(SPARKLE.superRare.width).toBeGreaterThan(SPARKLE.rare.width);
    expect(SPARKLE.rare.width).toBeGreaterThan(SPARKLE.common.width);
    expect(SPARKLE.superRare.stars).toBe(true);
    expect(SPARKLE.legendary.stars && SPARKLE.legendary.rainbow).toBe(true);
    expect(SPARKLE.common.rainbow || SPARKLE.rare.rainbow || SPARKLE.superRare.rainbow || SPARKLE.epic.rainbow || SPARKLE.mythic.rainbow).toBe(false);
    expect(SPARKLE_CFG.pulseHz).toBeLessThan(3);
    expect(pillarOpacity('common', 0.2)).toBe(pillarOpacity('common', 0.7));
    expect(pillarOpacity('rare', 0.25)).not.toBeCloseTo(pillarOpacity('rare', 0.75));
    expect(rainbowHue(0)).toBe(0);
    expect(rainbowHue(SPARKLE_CFG.rainbowSeconds / 2)).toBeCloseTo(0.5);
  });
});
