/** 色の計算（DOM なし）。DOM しらべ（e2e/helpers/uiRules.ts）と ユニットテストで使う */
import { ALLOWED_COLORS } from './palette';

export interface Rgba {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

/** ブラウザの計算後の色（`rgb()`・`rgba()`・`color(srgb …)`・`transparent`）を読む。読めなければ null */
export function parseCssColor(s: string): Rgba | null {
  const str = s.trim().toLowerCase();
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const num = (x: string): number => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x));
  let m = /^rgba?\(([^)]+)\)$/.exec(str);
  if (m) {
    const p = m[1].replace(/[,/]/g, ' ').split(/\s+/).filter(Boolean);
    if (p.length < 3) return null;
    const ch = (x: string): number => (x.endsWith('%') ? (parseFloat(x) / 100) * 255 : parseFloat(x));
    const a = p.length >= 4 ? num(p[3]) : 1;
    const out = { r: ch(p[0]), g: ch(p[1]), b: ch(p[2]), a };
    return [out.r, out.g, out.b, out.a].every(Number.isFinite) ? out : null;
  }
  m = /^color\(srgb\s+([^)]+)\)$/.exec(str);
  if (m) {
    const p = m[1].replace(/\//g, ' ').split(/\s+/).filter(Boolean);
    if (p.length < 3) return null;
    const a = p.length >= 4 ? num(p[3]) : 1;
    const out = { r: num(p[0]) * 255, g: num(p[1]) * 255, b: num(p[2]) * 255, a };
    return [out.r, out.g, out.b, out.a].every(Number.isFinite) ? out : null;
  }
  return null;
}

/** `top`（半透明）を `base` の上にかさねた色 */
export function composite(top: Rgba, base: Rgba): Rgba {
  const a = top.a + base.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number): number => (t * top.a + b * base.a * (1 - top.a)) / a;
  return { r: mix(top.r, base.r), g: mix(top.g, base.g), b: mix(top.b, base.b), a };
}

export function luminance(c: Rgba): number {
  const f = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** 明るさの比（WCAG。1〜21） */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 必要な比: 24px 以上で 太さ 700 以上なら 3、ほかは 4.5 */
export function requiredContrast(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 && fontWeight >= 700 ? 3 : 4.5;
}

/** 使ってよい色か（不透明度は見ない。±tol まで同じ色とみなす） */
export function isAllowedColor(c: Rgba, tol = 1.5): boolean {
  if (c.a === 0) return true;
  return ALLOWED_COLORS.some((p) => Math.abs(p.rgb[0] - c.r) <= tol && Math.abs(p.rgb[1] - c.g) <= tol && Math.abs(p.rgb[2] - c.b) <= tol);
}
