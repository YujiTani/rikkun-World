/**
 * 水 11 回め: 落ちる水（水の 横の 面）の「下へ 流れる すじ」。式は 純関数 `flowStripe`。shader（`render/waterWave.ts`）も 同じ 定数・同じ 形。
 * 世界の 座標と 時間だけで 決まる ので、となりの マスと つぎめが 切れない。メッシュは かわらない。
 */
export const FLOW_STRIPE = {
  /** 下へ 流れる 速さ（マス/秒） */
  speed: 1.6,
  /** すじの 横の 細かさ（1 マスに 何 本の 列が あるか） */
  columns: 5,
  /** たての くり返し（1 マスに 何 回） */
  repeat: 0.5,
  /** 1 つの すじの 長さ（くり返しの 何 わり。のこりは すき間） */
  length: 0.6,
  /** すじが ある 列の わりあい（0〜1。乱数ではなく 列の 番号から きまる） */
  density: 0.6,
  /** すじの 白さ（0〜1。水の 青に まぜる わりあい） */
  white: 0.75,
} as const;

/** 列の 番号から きまる 0〜1 の ちらばり（GLSL の `fract(sin(c * 12.9898) * 43758.5453)` と 同じ） */
export function flowHash(c: number): number {
  const s = Math.sin(c * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** 横の 面の 点（よこ u = x + z、高さ y）の、時間 t（秒）での すじの こさ 0〜1。時間が たつと 下へ ずれる */
export function flowStripe(u: number, y: number, t: number): number {
  const col = Math.floor(u * FLOW_STRIPE.columns);
  const h = flowHash(col);
  if (h > FLOW_STRIPE.density) return 0;
  const p = (y + FLOW_STRIPE.speed * t) * FLOW_STRIPE.repeat + flowHash(col + 7.3);
  const f = p - Math.floor(p);
  const L = FLOW_STRIPE.length;
  const a = Math.min(Math.max(f / 0.08, 0), 1); // 上の はしは すぐ 立ち上がり、
  const b = Math.min(Math.max((L - f) / (L * 0.8), 0), 1); // 下へ なだらかに うすく
  return a * b;
}
