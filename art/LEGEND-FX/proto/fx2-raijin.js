// 雷神剣 C「ばちばちの あみ」（黄色・決定）1/32 版。芯 2 点・からだ 4 点・にじみ 網 8 点・こい ふち 2 点
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, perpTo, camDir, lunge, MON_FRONT } from './lib.js';
import { jag } from './fx-common.js';
import { baseHit, glowTex, DOT } from './fx2-common.js';
const W = '#FFF8DC', Y1 = '#FFE98A', Y2 = '#F0C24A', Y3 = '#9A7430', UNDER = '#2E2160';
function bolt(P, pts, k = 1, a = 1, skip = null) {
  if (pts.length < 2) return; const o = skip ? { skip } : {};
  P.ribbon(pts, 5 * DOT * k + 3 * DOT, UNDER, .92 * a, o);                                 // こい ふち（ふつう重ね）
  P.add(true);
  P.ribbon(pts, 8 * DOT * k + 4 * DOT, Y3, .16 * a, { ...o, soft: true });                  // にじみ 網（8 点）
  P.ribbon(pts, 3 * DOT * k, Y1, .9 * a, o);                                              // からだ 4 点
  P.ribbon(pts, 1.5 * DOT * k, W, a, o);                                                     // 芯 2 点
  P.add(false);
}
const FAN = [
  [[-.1, .12], [.1, .08]],
  [[.2, .05], [-.2, .4], [.15, .75], [-.1, 1.05]],
  [[-1.3, -.12], [-.78, .15], [-.26, .45], [.26, .45], [.78, .15], [1.3, -.12]],
];
function sparkDots(P, c, seed, n, a) { for (let q = 0; q < n; q++) { const p = c.clone().addScaledVector(camDir(P, H(q, seed) * 6.28), .1 + .5 * H(q, seed, 2)); P.quad(p, 3 * DOT, UNDER, a); P.add(true).quad(p, 2 * DOT, q % 2 ? Y1 : W, a); P.add(false); } }
function fine(P, a, b, seed, amp = .09) {          // 大きな 折れ 9 ＋ 1/32 の 細かい 折れ
  const coarse = jag(P, a, b, 9, amp, seed), out = [];
  for (let k = 0; k < coarse.length - 1; k++) for (let q = 0; q < 4; q++) { const p = coarse[k].clone().lerp(coarse[k + 1], q / 4); if (q) p.addScaledVector(perpTo(P, coarse[k + 1].clone().sub(coarse[k]), p), (H(k * 4 + q, seed, 8) - .5) * .045); out.push(p); }
  out.push(coarse[coarse.length - 1]); return out;
}
export const raijinC = {
  life: 12,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx;
    if (T >= 0 && A <= 6) {
      const org = V(0, 1.25, lunge(i) + .3), ps = Math.floor(Math.min(T, L) / 2), vis = A > 0 ? 1 - A / 6.5 : 1;
      FAN[idx].forEach(([psi, phi], q) => {
        const d = V(-Math.sin(psi) * Math.cos(phi), Math.sin(phi), Math.cos(psi) * Math.cos(phi)), end = org.clone().addScaledVector(d, 2.2);
        const seed = q * 5 + ps * 13 + idx * 31, N = 30; const st = org.clone().addScaledVector(d, .3);
        const pts = fine(P, st, end, seed);
        const cutN = Math.max(2, Math.ceil(pts.length * vis));
        const sk = A > 0 ? (k => k >= cutN - 1 || H(k, q, A) > (k > cutN * .6 ? .5 : .85)) : null;
        bolt(P, pts.slice(0, cutN), .8, 1, sk);
        bolt(P, fine(P, st, end, seed + 91, .12).slice(0, cutN), .4, .55, sk);               // 重なる 細い もう 1 本
        for (const k of idx === 0 ? [14] : [10, 22]) if (k < cutN) { const b0 = pts[k]; bolt(P, fine(P, b0, b0.clone().addScaledVector(camDir(P, q * 1.9 + k * .3 + H(k, seed) * 2), .42), seed + k, .06), .45, .9, A > 0 ? (j => H(j, k, A) > .6) : null); }
      });
      sparkDots(P, org.clone().addScaledVector(V(0, 0, 1), 1.2), E.seed + ps, 10, vis);
    }
    // 当てた とき: 妖怪の まわりを ぎざぎざ 1 周（4 ステップ）
    const h = T - E.hitT; if (h >= 0 && h <= 3) {
      const c = V(0, 1.05, MON_FRONT - .05), N = 56, hw = .52, hh = .98, ps = [];
      const peri = u => { const t = u * 4; if (t < 1) return [lerp(-hw, hw, t), -hh]; if (t < 2) return [hw, lerp(-hh, hh, t - 1)]; if (t < 3) return [lerp(hw, -hw, t - 2), hh]; return [-hw, lerp(hh, -hh, t - 3)]; };
      for (let k = 0; k <= N; k++) { const [x, y] = peri((k % N) / N), j = (H(k, h, E.seed) - .5) * .13, j2 = (H(k, h, E.seed, 3) - .5) * .13; ps.push(V(c.x + x + j, c.y + y + j2, c.z - .05)); }
      ps[N] = ps[0].clone(); bolt(P, ps, .9, 1 - h * .12);
      P.add(true).sprite(glowTex('#FFD870', 'yel'), E.hitPos, .9 * (1 - h / 5), .8, { add: true }); P.add(false);
    }
    baseHit(P, E, T);
  },
};
