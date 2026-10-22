import { describe, expect, it } from 'vitest';
import * as sparkle from './dropSparkle';
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

// WEAPON-7 AC12d: ヌシの 刀の 袋は 袋そのものの 色も にじ色に ゆっくり 変わる（点滅なし）。
// 仮の 名前 `bagBodyHue(seconds)`（0〜1 の 色相。今の `rainbowHue` を 使い回してよい）。ほかの 名前に したら ここだけ 直す。
describe('WEAPON-7 AC12d: 袋の 色（にじ色）', () => {
  const hue = (t: number): number => (sparkle as unknown as { bagBodyHue: (t: number) => number }).bagBodyHue(t);
  it('1 秒ごとに 色相が ちがい、3 秒で 1 回り 以下（ゆっくり）', () => {
    const hs = [0, 1, 2, 3].map(hue);
    expect(new Set(hs.slice(0, 3).map((x) => x.toFixed(4))).size).toBe(3);
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(hs[i + 1]! - hs[i]!);
      expect(Math.min(d, 1 - d), `${i}→${i + 1}`).toBeLessThanOrEqual(1 / 3 + 1e-9);
    }
    for (const h of hs) expect(h >= 0 && h < 1).toBe(true);
  });
  it('なめらか: 1 ステップ(1/60 秒)の 変わりは 小さい（点滅しない）', () => {
    for (let k = 0; k < 600; k++) {
      const d = Math.abs(hue((k + 1) / 60) - hue(k / 60));
      expect(Math.min(d, 1 - d)).toBeLessThan(0.01);
    }
  });
  it('光の柱・わ は 今の legendary の まま（7 段目は にじ色・星）', () => {
    expect(SPARKLE.legendary.rainbow).toBe(true);
    expect(SPARKLE.legendary.stars).toBe(true);
    expect(rainbowHue(0)).toBe(0);
  });
});
