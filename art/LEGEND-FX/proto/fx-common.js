import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, perpTo, camDir } from './lib.js';
// 網（ディザ）で 消える ときの のこす わりあい（窓が おわって A ステップ目）
export const netKeep = A => A <= 2 ? 1 : A === 3 ? .75 : A === 4 ? .5 : A === 5 ? .35 : A === 6 ? .2 : 0;
export const skipFn = (A, key, keep = netKeep) => k => H(k, key, 3.3) > keep(A);
export let BAND_ON = false;   // 白い 斬撃が 土台に なったので 半月の 帯は 出さない
// 帯（半月の 帯）。rows: [[0..1（刃先 → 刃元）, 色, alpha], ...]
export function band(P, E, T, o = {}) {
  if (!BAND_ON) return;
  const L = E.L, A = T - L, life = o.life || 9; if (A > life || T < 0) return;
  const uMax = clamp((T + 1) / Math.max(1, L)); const N = 14, rows = o.rows;
  const f = o.frac || 1;
  const Pm = rows.map(([r]) => { const a = []; for (let k = 0; k <= N; k++) { const u = uMax * k / N; a.push(E.lin(u).lerp(E.linB(u), r * f)); } return a; });
  const fade = A > 0 ? 1 - A / life : 1;
  P.grid(Pm, (j, i) => { const u = uMax * i / N, age = T - u * L; return [rows[j][1], rows[j][2] * (o.alpha ?? 1) * fade * clamp(1 - Math.max(0, age - 2) / (L + 8) * .6) * (i === 0 ? .4 : 1)]; });
}
// ぎざぎざの 点列（a→b、n 区間）。seed で 折れ方が かわる
export function jag(P, a, b, n, amp, seed) {
  const d = b.clone().sub(a), pts = [];
  for (let k = 0; k <= n; k++) {
    const p = a.clone().addScaledVector(d, k / n);
    if (k > 0 && k < n) { const s = perpTo(P, d, p); const r = H(k, seed) * 2 - 1; const m = (k % 2 ? 1 : -1) * amp * (.35 + .65 * Math.abs(r)) * (H(k, seed, 9) > .85 ? 1.9 : 1); p.addScaledVector(s, m); p.addScaledVector(d.clone().normalize(), (H(k, seed, 5) - .5) * amp * .8); }
    pts.push(p);
  }
  return pts;
}
export function sub(arr, a, b) { return arr.slice(a, b + 1); }
export function pt(P, p, size, hex, a = 1, under = null, usz = 1.7) { if (under) P.quad(p, size * usz, under, a); P.quad(p, size, hex, a); }
