// 虹 N1 ひかりの はなび / N2 プリズムの ひかり / N3 ひかりの たまと ほしの うず（1/32 の 粒・加算で 光る・白い 芯から 色に わかれる）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, perpTo, camDir } from './lib.js';
import { baseHit, glowTex, starTex, DOT } from './fx2-common.js';
const SPEC = ['#FF6A5E', '#FFB347', '#FFE66B', '#5FD98F', '#4FA3F0', '#D16BE6'], WH = '#FFF7E3', EDGE = '#2A2350';
const specAt = t => SPEC[Math.min(5, Math.max(0, Math.floor(t * 6)))];
const mix = (a, b, f) => { const x = new THREE.Color(a).lerp(new THREE.Color(b), f); return '#' + x.getHexString(); };
function rnd3(P, a, b, c) { const th = H(a, b, c) * 6.283, z = H(a, b, c, 7) * 2 - 1, r = Math.sqrt(1 - z * z); return V(Math.cos(th) * r, z, Math.sin(th) * r); }
function core(P, c, r, a) { P.quad(c, 1, EDGE, 0); P.disc(c, r * 1.12, EDGE, .85 * a, false, 14); P.sprite(glowTex('#BFE0FF', 'nij'), c, r * 3.2, a, { add: true }); P.sprite(glowTex('#FFFFFF', 'wh'), c, r * 1.6, a, { add: true }); }
function dotAdd(P, p, s, hex, a) { P.add(true).quad(p, s, hex, a); P.add(false); }
function path(E, n) { return new THREE.CatmullRomCurve3(E.tips, false, 'centripetal').getPoints(n); }
const axisOf = (E, idx) => idx === 0 ? E.swing.clone() : idx === 1 ? V(0, 1, .25).normalize() : null;

function burst(P, E, h, n, scale = 1) {
  if (h < 0 || h > 14) return; const c = E.hitPos;
  if (h < 6) core(P, c, .22 * (1 - h / 7) * scale, 1 - h / 7);
  P.add(true);
  for (let q = 0; q < n; q++) { const d = rnd3(P, q, E.seed, 9), D = (.35 + .7 * H(q, E.seed, 3)) * scale * (1 - Math.exp(-h * .4)), p = c.clone().addScaledVector(d, D), a = 1 - h / 15; P.quad(p, DOT * (q % 3 ? 1.5 : 2.5), q % 4 ? specAt(H(q, 4)) : WH, a); }
  for (let q = 0; q < 8; q++) { const d = rnd3(P, q, E.seed, 11), len = (.3 + .4 * H(q, 5)) * easeOut(h / 5) * scale, a = (1 - h / 15); P.ribbon([c.clone().addScaledVector(d, .06), c.clone().addScaledVector(d, .06 + len * .5), c.clone().addScaledVector(d, .06 + len)], [DOT, DOT * 3, DOT * .5], [WH, specAt(H(q, 6)), specAt(H(q, 6))], a, { soft: false }); }
  P.add(false);
}
// ---------- N1 ひかりの はなび
export const N1 = {
  life: 24,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 22) return;
    const O = E.lin(.82), ax = axisOf(E, idx), spread = idx === 0 ? .5 : idx === 1 ? .85 : 2.5, cnt = [150, 200, 300][idx], nst = [4, 5, 6][idx];
    const posOf = (q, age) => { const b = Math.floor(H(q, E.seed, 1) * 3), a = age - b; if (a < 0) return null; const life = 8 + Math.floor(H(q, E.seed, 2) * 13); if (a > life) return null; const d = ax ? ax.clone().addScaledVector(rnd3(P, q, E.seed, 3), spread).normalize() : rnd3(P, q, E.seed, 3); const Dm = .5 + 2.2 * Math.pow(H(q, E.seed, 4), 1.4); const f = 1 - Math.exp(-a * .3); const p = O.clone().addScaledVector(d, Dm * f); p.y -= .0035 * a * a; return { p, a, life, Dm, d }; };
    // 光の すじ（細長い 加算の 帯。根もと 白 → 先は 色）
    const ns = [8, 10, 16][idx];
    for (let s = 0; s < ns; s++) { const age = T - Math.floor(H(s, E.seed, 20) * 2); if (age < 0 || age > 12) continue; const d = ax ? ax.clone().addScaledVector(rnd3(P, s, E.seed, 21), spread * .8).normalize() : rnd3(P, s, E.seed, 21); const len = (1.0 + 1.3 * H(s, E.seed, 22)) * (1 - Math.exp(-age * .5)), t0 = Math.max(0, len - 1.0), a = 1 - Math.max(0, age - 6) / 6; const c1 = specAt(H(s, E.seed, 23)); P.add(true).ribbon([O.clone().addScaledVector(d, .15 + t0), O.clone().addScaledVector(d, .15 + t0 + (len - t0) * .5), O.clone().addScaledVector(d, .15 + len)], [DOT * 1.2, DOT * 4, DOT * .6], [WH, mix(WH, c1, .6), c1], .85 * a, { soft: true }); P.add(false); }
    // 粒（加算・1〜2 点）。半分は 白い 尾を ひく すじ粒
    P.add(true);
    for (let q = 0; q < cnt; q++) {
      const r = posOf(q, T); if (!r) continue;
      const inner = r.Dm * (1 - Math.exp(-r.a * .3)) < .8, hue = (q % 17) / 17, col = inner ? mix(specAt(hue), WH, .55) : specAt(hue), al = (inner ? 1 : .75) * (1 - Math.max(0, r.a - r.life * .6) / (r.life * .4));
      if (q % 2) { const r2 = posOf(q, T - 2) || r; P.ribbon([r2.p, r.p], [DOT * .6, DOT * 1.6], [WH, col], al * .9); } else P.quad(r.p, DOT * (q % 3 ? 2.2 : 3.2), col, al);
    }
    P.add(false);
    // 十字の 星
    for (let s = 0; s < nst; s++) { const q = s * 17 + 3, r = posOf(q, T - 3); if (!r) continue; const f = [0, 1, 2, 3, 4, 3, 2, 1, 0, 0][Math.min(9, Math.max(0, r.a - 1))]; P.sprite(starTex(s % 2 ? '#FFE66B' : '#8FD0FF', f), r.p, .55 + .25 * H(s, 8), 1, { add: true }); }
    // 芯（直径 0.3 → 0.6・4 ステップ）
    if (T <= 6) core(P, O, .15 + .15 * clamp(T / 4), 1 - Math.max(0, T - 4) / 3);
    burst(P, E, T - E.hitT, 40);
    baseHit(P, E, T);
  },
};
// ---------- N2 プリズムの ひかり
export const N2 = {
  life: 22,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 20) return;
    const w = path(E, 22), head = A <= 0 ? clamp((T + 1) / E.G) : 1, end = Math.max(2, Math.ceil(head * 22) + 1), spreadK = A > 0 ? 1 + A * .5 : 1, shift = A > 0 ? E.swing.clone().multiplyScalar(.5 * easeOut(A / 12)) : V(0, 0, 0);
    const fade = A > 8 ? 1 - (A - 8) / 12 : 1;
    const outs = w.map((p, q) => { const tg = w[Math.min(21, q + 1)].clone().sub(w[Math.max(0, q - 1)]).normalize(); const s = perpTo(P, tg, p); const c = V(0, 1.2, p.z - 1.2); return s.multiplyScalar(Math.sign(s.dot(p.clone().sub(c))) || 1); });
    const wd = (idx === 2 ? 1.5 : 1) * DOT * 3;
    P.add(true);
    for (let k = 0; k < 6; k++) {
      const off = .1 + k * wd * spreadK * 1.1, col = mix(SPEC[k], WH, (1 - k / 5) * .45);
      const pts = w.slice(0, end).map((p, q) => p.clone().addScaledVector(outs[q], off).add(shift));
      P.add(false); P.ribbon(pts, (u) => wd * 1.7 * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))), EDGE, .5 * fade); P.add(true);
      P.ribbon(pts, (u, kk) => wd * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))), col, .95 * fade, { soft: true });
      P.ribbon(pts, (u, kk) => wd * .35 * Math.max(.2, Math.sin(Math.PI * clamp(u * .95 + .03))), mix(col, '#FFFFFF', .5), .9 * fade);
    }
    // こぼれる 粒 150（けさは 2 倍）
    const n = idx === 2 ? 300 : 150, nn = Math.min(n, 300);
    for (let q = 0; q < nn; q++) {
      const b = Math.floor(H(q, E.seed, 1) * 12) + 0, age = A - b + 2; if (age < 0 || age > 14) continue; const u = H(q, E.seed, 2), k = Math.floor(H(q, E.seed, 3) * 6), idxp = Math.floor(clamp(u) * (end - 1));
      const p = w[idxp].clone().addScaledVector(outs[idxp], .1 + k * wd * 1.1 * spreadK).add(shift); p.y -= .006 * age * age; p.addScaledVector(E.swing, .015 * age);
      P.quad(p, DOT * (q % 3 ? 1.5 : 2.2), mix(SPEC[k], WH, .3), (1 - age / 15) * .95);
    }
    P.add(false);
    burst(P, E, T - E.hitT, 40);
    baseHit(P, E, T);
  },
};
// ---------- N3 ひかりの たまと ほしの うず
export const N3 = {
  life: 22,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 20) return;
    const orbAt = s => E.tips[clamp(Math.round(s), 0, L)];
    const R = [.2, .2, .3][idx];
    if (T <= L) {
      const c = orbAt(T), tg = E.dirAt(clamp(T / L)), b1 = perpTo(P, tg, c), b2 = tg.clone().cross(b1).normalize();
      core(P, c, R, 1);
      P.add(true);
      for (let k = 0; k < (idx === 2 ? 3 : 2); k++) { const pts = [], m = 16, rr = R * (1.7 + .35 * k), ph = T * .9 + k * 2; for (let q = 0; q <= m; q++) { const th = ph + q / m * 6.283; pts.push(c.clone().addScaledVector(b1, Math.cos(th) * rr).addScaledVector(b2, Math.sin(th) * rr * .45)); } P.ribbon(pts, DOT * 1.6, pts.map((_, q) => SPEC[(q + k * 2) % 6]), .9); }
      P.add(false);
    }
    P.add(true);
    const n = idx === 2 ? 220 : 200;
    for (let q = 0; q < n; q++) {
      const sb = Math.floor(H(q, E.seed, 1) * (L + 1)), age = T - sb; if (age < 0 || age > 16) continue;
      const c0 = orbAt(sb), tg = E.dirAt(clamp(sb / L)), b1 = perpTo(P, tg, c0), b2 = tg.clone().cross(b1).normalize();
      const ph = H(q, E.seed, 2) * 6.283 + age * (age < 4 ? .9 : .12), rad = age < 4 ? .3 : .3 * (1 - (age - 4) / 16 * .6) * (.6 + .6 * H(q, 3));
      const p = c0.clone().addScaledVector(b1, Math.cos(ph) * rad).addScaledVector(b2, Math.sin(ph) * rad); p.y -= .002 * Math.max(0, age - 6) ** 2;
      P.quad(p, DOT * (q % 3 ? 2.2 : 3.2), q % 5 ? SPEC[Math.floor(sb / (L + 1) * 6 + H(q, 4) * 2) % 6] : WH, 1 - Math.max(0, age - 8) / 8);
    }
    P.add(false);
    // たまが 星 4 こに わかれて 外へ
    if (A >= 0 && A < 12) for (let s = 0; s < 4; s++) { const d = rnd3(P, s, E.seed, 5); d.y = Math.abs(d.y) * .5 + .2; const p = orbAt(L).clone().addScaledVector(d.normalize(), 1.3 * (1 - Math.exp(-A * .3))); P.sprite(starTex(SPEC[(s * 2 + 1) % 6], [1, 2, 3, 4, 3, 2, 1, 0, 0, 0, 0, 0][A]), p, .55, 1, { add: true }); }
    const h = T - E.hitT; if (h >= 0 && h < 12) { burst(P, E, h, 22, .8); }
    baseHit(P, E, T);
  },
};
