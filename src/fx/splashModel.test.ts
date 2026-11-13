import { describe, expect, it } from 'vitest';
import { SPLASH, splashLife, splashRate, splashRise, splashSpread } from './splashModel';

describe('しぶき（splashModel）', () => {
  it('落差 3 いかは 出ない・4 から 出る', () => {
    expect(splashRate(3)).toBe(0);
    expect(splashRate(0)).toBe(0);
    expect(splashRate(SPLASH.minDrop)).toBeGreaterThan(0);
  });

  it('落差が 大きい ほど 数が ふえ、高く 上がり、ひろがる', () => {
    expect(splashRate(12)).toBeGreaterThan(splashRate(5));
    expect(splashRise(12)).toBeGreaterThan(splashRise(5));
    expect(splashSpread(12)).toBeGreaterThan(splashSpread(5));
  });

  it('数・高さ・ひろがりには 上限が ある（とても 高い 滝でも）', () => {
    expect(splashRate(500)).toBe(splashRate(SPLASH.capDrop));
    expect(splashRise(500)).toBe(splashRise(SPLASH.capDrop));
    expect(splashSpread(500)).toBe(splashSpread(SPLASH.capDrop));
    expect(SPLASH.maxParticles).toBeLessThanOrEqual(400);
  });

  it('つぶの 寿命は 正（落差が 大きい ほど 少し 長い）', () => {
    expect(splashLife(4)).toBeGreaterThan(0);
    expect(splashLife(20)).toBeGreaterThanOrEqual(splashLife(4));
  });
});
