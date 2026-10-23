// 虹 N1 ひかりの はなび / N2 プリズムの ひかり / N3 ひかりの たまと ほしの うず
// 色の ついた 粒・すじは ふつう重ね（色を こく たもつ）＋ 1 点の こい ふち。白い 芯と 小さな にじみだけ 加算
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, perpTo, camDir } from './lib.js';
import { baseHit, glowTex, starTex, DOT } from './fx2-common.js';
const SPEC = ['#FF3B3B', '#FF9A1F', '#FFE000', '#2FD470', '#27B4F5', '#3A6BFF', '#B455F0'], WH = '#FFF7E3', EDGE = '#2A2350';
const specAt = t => SPEC[Math.min(6, Math.max(0, Math.floor(t * 7)))];
function rnd3(P, a, b, c) { const th = H(a, b, c) * 6.283, z = H(a, b, c, 7) * 2 - 1, r = Math.sqrt(1 - z * z); return V(Math.cos(th) * r, z, Math.sin(th) * r); }
function core(P, c, r, a) { P.disc(c, r * 1.15, EDGE, .85 * a, false, 14); P.sprite(glowTex('#9FD8FF', 'nij'), c, r * 3.0, a * .8, { add: true }); P.disc(c, r * .8, '#FFFFFF', a, false, 14); }
const grain = (P, p, s, hex, a = 1) => { P.quad(p, s + DOT * 1.4, EDGE, a * .9); P.quad(p, s, hex, a); };
const colRibbon = (P, pts, w, hexes, a, edgeW) => { P.ribbon(pts, w.map(x => x + edgeW), EDGE, a * .85); P.ribbon(pts, w, hexes, a); };
function path(E, n) { return new THREE.CatmullRomCurve3(E.tips, false, 'centripetal').getPoints(n); }
const axisOf = (E, idx) => idx === 0 ? E.swing.clone() : idx === 1 ? V(0, 1, .25).normalize() : null;

function burst(P, E, h, n, scale = 1) {
  if (h < 0 || h > 14) return; const c = E.hitPos;
  for (let q = 0; q < 10; q++) { const d = rnd3(P, q, E.seed, 11), len = (.3 + .45 * H(q, 5)) * easeOut(h / 5) * scale, a = 1 - h / 15, c1 = SPEC[q % 7]; colRibbon(P, [c.clone().addScaledVector(d, .06), c.clone().addScaledVector(d, .06 + len * .5), c.clone().addScaledVector(d, .06 + len)], [DOT * 1.5, DOT * 4, DOT * .8], c1, a, DOT * 1.5); }
  for (let q = 0; q < n; q++) { const d = rnd3(P, q, E.seed, 9), D = (.35 + .7 * H(q, E.seed, 3)) * scale * (1 - Math.exp(-h * .4)), p = c.clone().addScaledVector(d, D); grain(P, p, DOT * (q % 3 ? 1.8 : 2.6), SPEC[q % 7], 1 - h / 15); }
  if (h < 6) core(P, c, .22 * (1 - h / 7) * scale, 1 - h / 7);
}
// ---------- N1
export const N1 = {
  life: 24,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 22) return;
    const O = E.lin(.82), ax = axisOf(E, idx), spread = idx === 0 ? .5 : idx === 1 ? .85 : 2.5, cnt = [150, 220, 300][idx], nst = [4, 5, 6][idx];
    const posOf = (q, age) => { const b = Math.floor(H(q, E.seed, 1) * 3), a = age - b; if (a < 0) return null; const life = 8 + Math.floor(H(q, E.seed, 2) * 13); if (a > life) return null; const d = ax ? ax.clone().addScaledVector(rnd3(P, q, E.seed, 3), spread).normalize() : rnd3(P, q, E.seed, 3); const Dm = .5 + 2.2 * Math.pow(H(q, E.seed, 4), 1.4); const f = 1 - Math.exp(-a * .3); const p = O.clone().addScaledVector(d, Dm * f); p.y -= .0035 * a * a; return { p, a, life, Dm, d }; };
    const ns = [8, 10, 16][idx];
    for (let s = 0; s < ns; s++) { const age = T - Math.floor(H(s, E.seed, 20) * 2); if (age < 0 || age > 12) continue; const d = ax ? ax.clone().addScaledVector(rnd3(P, s, E.seed, 21), spread * .8).normalize() : rnd3(P, s, E.seed, 21); const len = (1.0 + 1.3 * H(s, E.seed, 22)) * (1 - Math.exp(-age * .5)), t0 = Math.max(0, len - 1.0), a = 1 - Math.max(0, age - 6) / 6; const c1 = SPEC[s % 7]; const pts = [O.clone().addScaledVector(d, .15 + t0), O.clone().addScaledVector(d, .15 + t0 + (len - t0) * .5), O.clone().addScaledVector(d, .15 + len)]; colRibbon(P, pts, [DOT * 1.5, DOT * 5, DOT * .8], c1, .95 * a, DOT * 1.5); P.add(true).ribbon(pts, [DOT * .6, DOT * 1.6, DOT * .3], '#FFFFFF', .9 * a); P.add(false); }
    for (let q = 0; q < cnt; q++) {
      const r = posOf(q, T); if (!r) continue; const col = SPEC[q % 7], al = 1 - Math.max(0, r.a - r.life * .6) / (r.life * .4);
      if (q % 2) { const r2 = posOf(q, T - 2) || r; colRibbon(P, [r2.p, r.p], [DOT * .8, DOT * 2.4], col, al, DOT * 1.2); } else grain(P, r.p, DOT * (q % 3 ? 1.8 : 2.6), col, al);
    }
    for (let s = 0; s < nst; s++) { const q = s * 17 + 3, r = posOf(q, T - 3); if (!r) continue; const f = [0, 1, 2, 3, 4, 3, 2, 1, 0, 0][Math.min(9, Math.max(0, r.a - 1))]; P.sprite(starTex(SPEC[(s * 2 + 2) % 7], f), r.p, .55 + .25 * H(s, 8), 1, { add: false }); }
    if (T <= 6) core(P, O, .15 + .15 * clamp(T / 4), 1 - Math.max(0, T - 4) / 3);
    burst(P, E, T - E.hitT, 40);
    baseHit(P, E, T);
  },
};
// ---------- N2 プリズム（当たりの 近くに おさめる）
export const N2 = {
  life: 22,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 18) return;
    const w = path(E, 22).map(p => { const q = p.clone(); q.y = Math.min(q.y, 1.9); return q; }), head = A <= 0 ? clamp((T + 1) / E.G) : 1, end = Math.max(2, Math.ceil(head * 22) + 1), spreadK = A > 0 ? 1 + A * .12 : 1, shift = A > 0 ? E.swing.clone().multiplyScalar(.2 * easeOut(A / 12)) : V(0, 0, 0);
    const fade = A > 6 ? 1 - (A - 6) / 12 : 1;
    const mid = w[11], tg0 = w[12].clone().sub(w[10]).normalize(), s0 = perpTo(P, tg0, mid), sg = Math.sign(s0.dot(mid.clone().sub(V(0, 1.2, mid.z - 1.2)))) || 1;
    const outs = w.map((p, q) => perpTo(P, w[Math.min(21, q + 1)].clone().sub(w[Math.max(0, q - 1)]).normalize(), p).multiplyScalar(sg));
    const wd = (idx === 2 ? 1.4 : 1) * DOT * 3.2;
    for (let k = 0; k < 7; k++) {
      const off = .14 + k * wd * 1.05 * spreadK, pts = w.slice(0, end).map((p, q) => p.clone().addScaledVector(outs[q], off).add(shift)), prof = u => wd * Math.max(.25, Math.sin(Math.PI * clamp(u * .95 + .03)));
      P.ribbon(pts, u => prof(u) * 1.0 + DOT * 2, EDGE, .85 * fade);
      P.ribbon(pts, u => prof(u), SPEC[k], fade);
    }
    P.add(true); P.ribbon(w.slice(0, end).map((p, q) => p.clone().addScaledVector(outs[q], .14 + 3 * wd * spreadK).add(shift)), (u) => wd * 8 * spreadK, '#FFFFFF', .25 * fade, { soft: true }); P.add(false);
    const nn = idx === 2 ? 250 : 150;
    for (let q = 0; q < nn; q++) {
      const b = Math.floor(H(q, E.seed, 1) * 10), age = A - b + 2; if (age < 0 || age > 14) continue; const u = H(q, E.seed, 2), k = Math.floor(H(q, E.seed, 3) * 7), idxp = Math.floor(clamp(u) * (end - 1));
      const p = w[idxp].clone().addScaledVector(outs[idxp], .14 + k * wd * 1.05 * spreadK).add(shift); p.y -= .006 * age * age; p.addScaledVector(E.swing, .01 * age);
      grain(P, p, DOT * (q % 3 ? 1.8 : 2.6), SPEC[k], 1 - age / 15);
    }
    burst(P, E, T - E.hitT, 40);
    baseHit(P, E, T);
  },
};
// ---------- N3
export const N3 = {
  life: 22,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 20) return;
    const orbAt = s => E.tips[clamp(Math.round(s), 0, L)], R = [.2, .2, .3][idx];
    if (T <= L) {
      const c = orbAt(T), tg = E.dirAt(clamp(T / L)), b1 = perpTo(P, tg, c), b2 = tg.clone().cross(b1).normalize();
      for (let k = 0; k < (idx === 2 ? 3 : 2); k++) { const pts = [], m = 18, rr = R * (1.7 + .35 * k), ph = T * .9 + k * 2; for (let q = 0; q <= m; q++) { const th = ph + q / m * 6.283; pts.push(c.clone().addScaledVector(b1, Math.cos(th) * rr).addScaledVector(b2, Math.sin(th) * rr * .45)); } colRibbon(P, pts, pts.map(() => DOT * 2.4), pts.map((_, q) => SPEC[(q + k * 3) % 7]), 1, DOT * 1.5); }
      core(P, c, R, 1);
    }
    const n = idx === 2 ? 240 : 210;
    for (let q = 0; q < n; q++) {
      const sb = Math.floor(H(q, E.seed, 1) * (L + 1)), age = T - sb; if (age < 0 || age > 16) continue;
      const c0 = orbAt(sb), tg = E.dirAt(clamp(sb / L)), b1 = perpTo(P, tg, c0), b2 = tg.clone().cross(b1).normalize();
      const ph = H(q, E.seed, 2) * 6.283 + age * (age < 4 ? .9 : .12), rad = age < 4 ? .3 : .3 * (1 - (age - 4) / 16 * .6) * (.6 + .6 * H(q, 3));
      const p = c0.clone().addScaledVector(b1, Math.cos(ph) * rad).addScaledVector(b2, Math.sin(ph) * rad); p.y -= .002 * Math.max(0, age - 6) ** 2;
      grain(P, p, DOT * (q % 3 ? 1.8 : 2.6), SPEC[(Math.floor(sb / (L + 1) * 7 + H(q, 4) * 2)) % 7], 1 - Math.max(0, age - 8) / 8);
    }
    if (A >= 0 && A < 12) for (let s = 0; s < 4; s++) { const d = rnd3(P, s, E.seed, 5); d.y = Math.abs(d.y) * .5 + .2; const p = orbAt(L).clone().addScaledVector(d.normalize(), 1.3 * (1 - Math.exp(-A * .3))); P.sprite(starTex(SPEC[(s * 2 + 1) % 7], [1, 2, 3, 4, 3, 2, 1, 0, 0, 0, 0, 0][A]), p, .6, 1); }
    const h = T - E.hitT; if (h >= 0 && h < 12) burst(P, E, h, 22, .8);
    baseHit(P, E, T);
  },
};
