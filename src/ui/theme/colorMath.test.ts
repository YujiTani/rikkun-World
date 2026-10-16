import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, isAllowedColor, parseCssColor, requiredContrast, type Rgba } from './colorMath';
import { ALL_RK_VARS, PALETTE_HEX } from './palette';

const c = (s: string): Rgba => {
  const v = parseCssColor(s);
  if (!v) throw new Error(s);
  return v;
};

describe('色の計算', () => {
  it('rgb・rgba・color(srgb) を読む', () => {
    expect(c('rgb(255, 90, 95)')).toEqual({ r: 255, g: 90, b: 95, a: 1 });
    expect(c('rgba(0, 0, 0, 0.5)').a).toBe(0.5);
    expect(c('color(srgb 1 0.5 0 / 0.25)')).toEqual({ r: 255, g: 127.5, b: 0, a: 0.25 });
    expect(c('rgb(16 20 31 / 72%)').a).toBeCloseTo(0.72);
    expect(parseCssColor('nonsense')).toBeNull();
  });

  it('仕様の目安の比: ng on bg-800 = 5.2、text-sub on bg-700 = 6.8', () => {
    expect(contrastRatio(c('rgb(255, 90, 95)'), c('rgb(26, 33, 50)'))).toBeGreaterThanOrEqual(5.2);
    expect(contrastRatio(c('rgb(174, 184, 208)'), c('rgb(37, 47, 71)'))).toBeGreaterThanOrEqual(6.7);
  });

  it('ink on アクセント・ng、text on パネルは 4.5 以上', () => {
    expect(contrastRatio(c('rgb(20,20,20)'), c('rgb(255, 200, 61)'))).toBeGreaterThan(4.5);
    expect(contrastRatio(c('rgb(20,20,20)'), c('rgb(255, 90, 95)'))).toBeGreaterThan(4.5);
    expect(contrastRatio(c('rgb(20,20,20)'), c('rgb(255, 138, 31)'))).toBeGreaterThan(4.5);
    expect(contrastRatio(c('rgb(255,255,255)'), c('rgb(16, 20, 31)'))).toBeGreaterThan(15);
  });

  it('HUD の下地を 白の上にかさねても 白い字は 4.5 以上', () => {
    const hud = composite(c('rgb(16 20 31 / 72%)'), c('rgb(255,255,255)'));
    expect(contrastRatio(c('rgb(255,255,255)'), hud)).toBeGreaterThan(4.5);
  });

  it('必要な比: 24px 以上で 太さ 700 以上のときだけ 3', () => {
    expect(requiredContrast(24, 700)).toBe(3);
    expect(requiredContrast(24, 500)).toBe(4.5);
    expect(requiredContrast(20, 800)).toBe(4.5);
  });

  it('使ってよい色の判定', () => {
    expect(isAllowedColor(c('rgb(255, 200, 61)'))).toBe(true);
    expect(isAllowedColor(c('rgb(255, 200, 61 / 40%)'))).toBe(true);
    expect(isAllowedColor(c('rgb(1, 2, 3)'))).toBe(false);
    expect(isAllowedColor(c('rgba(1, 2, 3, 0)'))).toBe(true);
  });
});

describe('tokens.css', () => {
  const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');

  it('仕様の変数が ぜんぶ あり、色の値が palette.ts と同じ', () => {
    for (const name of ALL_RK_VARS) expect(css, name).toMatch(new RegExp(`${name}\\s*:`));
    for (const [name, hex] of Object.entries(PALETTE_HEX)) {
      if (name === '--rk-hud-bg' || name === '--rk-scrim') continue; // 不透明度つきの書き方
      expect(css, name).toMatch(new RegExp(`${name}:\\s*${hex}\\b`, 'i'));
    }
    expect(css).toMatch(/--rk-hud-bg:\s*rgb\(16 20 31 \/ var\(--rk-ui-hud-a\)\)/);
    expect(css).toMatch(/--rk-scrim:\s*rgb\(0 0 0 \/ var\(--rk-ui-scrim-a\)\)/);
    expect(css).toMatch(/--rk-scrim-modal:\s*rgb\(0 0 0 \/ 50%\)/);
  });

  it('components.css は 色を じかに書かない', () => {
    const comp = readFileSync(resolve(__dirname, 'components.css'), 'utf8');
    expect(comp).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // rgb( は 影の黒だけ（tokens にある）。ここには書かない
    expect(comp).not.toMatch(/rgba?\(/);
  });
});
