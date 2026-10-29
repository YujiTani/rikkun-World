/**
 * #308 gashaGirl.ts を 分けた もの: 少女の 小さな 計算（シード付き乱数・イージング・向き）。
 */
export const D2R = Math.PI / 180;

// ---------- 乱数（シード付き。state を 外に 持って、さきよみ できる） ----------
export function mulberry(s: number): [number, number] {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** プレイヤーの 向き(yawDeg)から 前(fx, fz)と 右(rx, rz) */
export const fwdOf = (p: { yawDeg: number }): { fx: number; fz: number; rx: number; rz: number } => { const y = p.yawDeg * D2R; return { fx: Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: Math.sin(y) }; };
