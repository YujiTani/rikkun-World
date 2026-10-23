// 雷神剣 v3: 段ごとに 強くなる 雷（つき = 刀身の 電気＋火花 / きりあげ = ＋軌跡から 枝 2〜3 / けさ = ＋体の まわりの 輪＋枝 4〜5）R1 青白 / R2 黄色
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, perpTo, camDir, lunge, swordWorld } from './lib.js';
import { jag } from './fx-common.js';
import { baseHit, DOT } from './fx2-common.js';
export const PALS = {
  blue: { W: '#F2FAFF', B: '#9FE0FF', B2: '#4FB4F0', glow: '#3A9BE8', under: '#10234E' },
  yellow: { W: '#FFF8DC', B: '#FFE98A', B2: '#F0C24A', glow: '#FFC83A', under: '#2E2160' },
};
function bolt(P, pal, pts, k = 1, a = 1, skip = null) {
  if (pts.length < 2) return; const o = skip ? { skip } : {};
  P.ribbon(pts, 6 * DOT * k + 3 * DOT, pal.under, .92 * a, o);                        // こい ふち
  P.add(true); P.ribbon(pts, 14 * DOT * k, pal.glow, .22 * a, { ...o, soft: true }); P.add(false);   // にじみ
  P.ribbon(pts, 3.4 * DOT * k, pal.B, .95 * a, o);                                      // からだ（ふつう重ね）
  P.add(true); P.ribbon(pts, 1.6 * DOT * k, pal.W, a, o); P.add(false);                  // 芯だけ 加算
}
function fine(P, a, b, seed, amp = .09, nc = 7) {
  const c = jag(P, a, b, nc, amp, seed), out = [];
  for (let k = 0; k < c.length - 1; k++) for (let q = 0; q < 4; q++) { const p = c[k].clone().lerp(c[k + 1], q / 4); if (q) p.addScaledVector(perpTo(P, c[k + 1].clone().sub(c[k]), p), (H(k * 4 + q, seed, 8) - .5) * .04); out.push(p); }
  out.push(c[c.length - 1]); return out;
}
function dot(P, pal, p, s, a = 1) { P.quad(p, s + DOT * .9, pal.under, a * .9); P.add(true); P.quad(p, s, pal.W, a); P.add(false); P.quad(p, s * .7, pal.B, a * .0); }
const trailPts = (E, n) => new THREE.CatmullRomCurve3(E.tips, false, 'centripetal').getPoints(n);
function ringBasis() { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(.38, 0, .22, 'ZXY')); return [V(1, 0, 0).applyMatrix4(m), V(0, 0, 1).applyMatrix4(m)]; }
export const makeR = pal => ({
  life: 20, pre: 8,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx, st = idx + 1;
    // ① 刀身に まとわりつく 電気と パチパチ 火花
    if (T >= -6 && T <= L + 3) {
      const { tip, base } = swordWorld(i), d = tip.clone().sub(base).normalize(), end = tip.clone().addScaledVector(d, .35), a0 = smooth((T + 6) / 3) * (1 - smooth((T - L) / 3));
      for (let s = 0; s < 1 + st; s++) bolt(P, pal, fine(P, base.clone().addScaledVector(d, .1), end, i * 7 + s * 31 + E.idx, .05 + .02 * s, 6), .5 + .1 * st, a0);
      for (let q = 0; q < 5 + 3 * st; q++) { const b = Math.floor(H(q, i, E.idx) * 3); const at = H(q, E.seed, i) ; const p0 = base.clone().lerp(end, at); const age = (i + q) % 6; const p = p0.clone().addScaledVector(camDir(P, H(q, 9, E.idx, Math.floor(i / 6)) * 6.28), .08 + .12 * age); dot(P, pal, p, DOT * (q % 2 ? 1.6 : 2.4), a0 * (1 - age / 7)); }
    }
    // ② 振った 弧に 残る 太い 軌跡
    if (T >= 0 && A <= 8) {
      const w = trailPts(E, 18), head = A <= 0 ? clamp((T + 1) / E.G) : 1, end = Math.max(2, Math.ceil(head * 18) + 1), fade = A > 0 ? 1 - A / 8 : 1;
      const pts = w.slice(0, end), prof = u => Math.max(.12, Math.sin(Math.PI * clamp(u * .9 + .08)));
      P.ribbon(pts, u => (.3 * prof(u)) + DOT * 3, pal.under, .9 * fade);
      P.add(true); P.ribbon(pts, u => .6 * prof(u), pal.glow, .28 * fade, { soft: true }); P.add(false);
      P.ribbon(pts, u => .22 * prof(u), pal.B, fade);
      P.add(true); P.ribbon(pts, u => .07 * prof(u), pal.W, fade); P.add(false);
      // ③ 軌跡から 外へ はしる 枝（きりあげ 3・けさ 5）
      const nb = idx === 0 ? 0 : idx === 1 ? 3 : 5, ps = Math.floor(Math.min(T, L + 6) / 2);
      for (let b = 0; b < nb; b++) {
        const u = (b + .6) / nb * .85 + .08; if (u > head) continue;
        const o = E.lin(u), out = E.lin(u).sub(V(0, 1.0, o.z - 1.0)).normalize(), dir = out.clone().addScaledVector(camDir(P, H(b, E.seed) * 6.28), .5).normalize();
        const br = fine(P, o, o.clone().addScaledVector(dir, .9 + .5 * H(b, 4)), b * 13 + ps * 5 + E.idx, .1, 8);
        bolt(P, pal, br, .55, fade, A > 0 ? (k => H(k, b, A) > .85 - A * .08) : null);
        if (H(b, 7) > .4) { const k0 = br[Math.floor(br.length * .5)]; bolt(P, pal, fine(P, k0, k0.clone().addScaledVector(camDir(P, b * 2.1), .35), b * 7 + ps, .06, 5), .35, fade * .9, A > 0 ? (k => H(k, b, A, 2) > .8 - A * .08) : null); }
      }
    }
    // ④ 体の まわりの 稲妻の 輪（けさ）
    if (idx === 2 && T >= L - 2 && T <= L + 16) {
      const t = T - (L - 2), fw = P.camR.clone().cross(P.camU).normalize(), cr = Math.cos(.25), sr = Math.sin(.25), b1 = P.camR.clone().multiplyScalar(cr).addScaledVector(P.camU, sr), b2 = P.camU.clone().multiplyScalar(cr).addScaledVector(P.camR, -sr), e1 = b1, e2 = b2.multiplyScalar(Math.cos(.55)).addScaledVector(fw, Math.sin(.55)), C = V(0, 1.1, lunge(i) + .15), ra = 1.45, rb = 1.05;
      const prog = clamp(t / 6), fade = t > 12 ? 1 - (t - 12) / 5 : 1, th0 = -1.0, n = 56, pts = [];
      const span = 6.283 * prog, tail = t > 8 ? 6.283 * smooth((t - 8) / 8) : 0;
      for (let k = 0; k <= n; k++) { const th = th0 + tail + (span - tail) * k / n; pts.push(C.clone().addScaledVector(e1, Math.cos(th) * ra).addScaledVector(e2, Math.sin(th) * rb)); }
      if (span - tail > .3) {
        P.ribbon(pts, u => .2 * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))) + DOT * 3, pal.under, .9 * fade);
        P.add(true); P.ribbon(pts, u => .55 * Math.max(.2, Math.sin(Math.PI * u)), pal.glow, .3 * fade, { soft: true }); P.add(false);
        P.ribbon(pts, u => .16 * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))), pal.B, fade);
        P.add(true); P.ribbon(pts, u => .06 * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))), pal.W, fade); P.add(false);
        // 輪に そって 走る 細い 稲妻
        const jg = pts.map((p, k) => k % 2 && k > 0 && k < n ? p.clone().addScaledVector(perpTo(P, pts[k + 1].clone().sub(pts[k - 1]), p), (H(k, Math.floor(T / 2)) - .5) * .22) : p);
        bolt(P, pal, jg, .4, .85 * fade);
        for (let q = 0; q < 3; q++) { const k = Math.floor(n * (.2 + .3 * q)), p0 = pts[Math.min(n, k)]; bolt(P, pal, fine(P, p0, p0.clone().addScaledVector(camDir(P, q * 2.3 + 1), .6), q * 11 + Math.floor(T / 2), .07, 6), .4, .9 * fade); }
        for (let q = 0; q < 14; q++) { const age = (t + q * 3) % 9, p = V(Math.cos(q * 1.7) * .5, .04 + age * .05, C.z + Math.sin(q * 2.3) * .5 + .0); dot(P, pal, p, DOT * 2, fade * (1 - age / 10)); }
      }
    }
    baseHit(P, E, T);
  },
});
