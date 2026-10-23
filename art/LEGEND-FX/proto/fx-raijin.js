// 雷神剣 3 案（A はしる いなずま / B でんきの たまが かける / C ばちばちの あみ）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, perpTo, camDir, pixTex, lunge, MON_FRONT } from './lib.js';
import { band, jag, sub, netKeep, skipFn, pt } from './fx-common.js';

export const PALS = {
  yellow: { W: '#FFF8DC', Y1: '#FFE98A', Y2: '#F0C24A', under: '#2E2160', glow: '#FFC83A', edge: '#F0C24A' },
  purple: { W: '#F7ECFF', Y1: '#D9B4FF', Y2: '#B070FF', under: '#2A1658', glow: '#9A55FF', edge: '#B070FF' },
};
// 1 本の いなずまを 4 重＋グローで
function bolt(P, pts, pal, k = 1, a = 1, skip = null) {
  if (pts.length < 2) return;
  const o = skip ? { skip } : {};
  P.add(true).ribbon(pts, .5 * k, pal.glow, .55 * a, { ...o, soft: true }); P.add(false);
  P.ribbon(pts, .2 * k, pal.under, .95 * a, o);
  P.ribbon(pts, .12 * k, pal.Y2, a, o); P.ribbon(pts, .076 * k, pal.Y1, a, o); P.ribbon(pts, .032 * k, pal.W, a, o);
}
function sparks(P, pal, T, E, n, from, birthSpan, life = 9) {
  for (let q = 0; q < n; q++) {
    const b = Math.floor(H(q, E.seed, 1) * birthSpan), age = T - b; if (age < 0 || age > life) continue;
    const p0 = from(q, b), th = H(q, E.seed, 2) * 6.28, d = camDir(P, th);
    const p = p0.clone().addScaledVector(d, .55 * easeOut(age / life) * (.5 + H(q, 3)));
    const s = .06 * (1 - age / life * .7); pt(P, p, s, q % 3 ? pal.Y1 : pal.W, 1, pal.under, 1.9);
  }
}
function rays(P, pal, E, h, count, life, r = 1) {
  if (h < 0 || h > life + 2) return; const c = E.hitPos;
  P.add(true).disc(c, .4 * (1 - h / (life * .6)) + .05, pal.glow, h < life * .6 ? .45 : 0, true); P.add(false);
  for (let q = 0; q < count; q++) {
    const lf = life * (.8 + .4 * H(q, E.seed, 7)); if (h > lf) continue;
    const th = (q / count + (H(q, 4) - .5) * .2) * 6.28, d = camDir(P, th);
    const D = (.7 * r) * easeOut(h / lf), tail = Math.max(0, D - .34 * r);
    const a = c.clone().addScaledVector(d, .1 + tail), b = c.clone().addScaledVector(d, .1 + D);
    const pts = jag(P, a, b, 3, .05 * r, q + E.idx * 20 + Math.floor(h / 2) * 3);
    bolt(P, pts, pal, .55, 1 - h / lf * .6);
  }
  const R = .22 * (1 - h / 4); if (R > 0) { P.disc(c, R + .05, pal.under, 1); P.disc(c, R, pal.Y1, 1); P.disc(c, R * .5, pal.W, 1); }
}

// ---------- A はしる いなずま
function mainLines(P, E, T, N) {
  const head = clamp((T + 1) / E.G), ps = Math.floor(Math.min(T, E.L) / 2), res = [];
  for (let li = 0; li < 3; li++) {
    const amp = [.1, .075, .05][li], pts = [];
    for (let k = 0; k <= N; k++) {
      const u = Math.min(k / N, head), p = E.lin(u);
      if (k > 0 && k < N && k / N <= head) { const s = perpTo(P, E.dirAt(u), p), r = H(k, li, ps, E.seed); p.addScaledVector(s, (k % 2 ? 1 : -1) * amp * (.3 + .7 * r) * (H(k, li, ps, 8) > .86 ? 1.8 : 1)); p.addScaledVector(E.dirAt(u), (H(k, li, ps, 6) - .5) * amp); }
      pts.push(p);
    }
    res.push(pts);
  }
  return { lines: res, head };
}
const A_ = pal => ({
  life: 9,
  draw(P, E, T) {
    const L = E.L, A = T - L; if (T < 0 || A > 6) return; const N = 18, idx = E.idx;
    const { lines, head } = mainLines(P, E, T, N);
    const cuts = A > 0 ? (idx === 0 ? [0, 6, 12, 18] : [0, 4, 9, 13, 18]).map((c, q, ar) => q === 0 || q === ar.length - 1 ? c : c + Math.round((H(q, E.seed, 11) - .5) * 2)) : [0, N];
    const keepF = A > 0 ? netKeep(A) : 1; if (keepF === 0) return;
    const wk = (idx === 2 ? 1.5 : 1) * (A > 0 ? 1 - A * .05 : 1);
    const drift = q => E.swing.clone().multiplyScalar(A > 0 ? .3 * (.6 + .4 * H(q, E.seed, 12)) * easeOut(A / 6) : 0);
    // 本すじ（1 本目は 太く、2・3 本目は 細く かさねる）
    const pieceOf = k => { for (let q = 0; q < cuts.length - 1; q++) if (k <= cuts[q + 1]) return q; return cuts.length - 2; };
    lines.forEach((pts, li) => {
      for (let q = 0; q < cuts.length - 1; q++) {
        const dr = drift(q), seg = sub(pts, cuts[q], cuts[q + 1]).map(p => p.clone().add(dr));
        bolt(P, seg, pal, li === 0 ? wk : wk * .55, 1 - (A > 0 ? A * .06 : 0), skipFn(A, q * 5 + li));
      }
    });
    // 枝
    const nb = [2, 2, 3, 5][idx + 1] || 3, base = lines[0];
    for (let b = 0; b < nb; b++) {
      const k = 3 + Math.floor(b * (N - 5) / nb) + (b % 2), u = k / N; if (u > head) continue;
      const up = idx === 0 ? camDir(P, 1.2 + (b % 2) * .7) : idx === 1 ? camDir(P, 1.2 + (b - 1) * .6) : camDir(P, (b % 2 ? 1 : -1) * (.9 + .3 * H(b, E.seed)));
      const len = (idx === 2 ? .5 : idx === 1 ? .45 : .28), a0 = base[k].clone().add(drift(pieceOf(k)));
      const pts = jag(P, a0, a0.clone().addScaledVector(up, len), 5, .06, b + Math.floor(Math.min(T, L) / 2) * 7 + idx * 40);
      bolt(P, pts, pal, .55 * wk, 1 - (A > 0 ? A * .06 : 0), skipFn(A, 77 + b));
    }
    // つき: 先の 小さな 火の玉
    if (idx === 0) { const p = base[Math.min(N, Math.round(head * N))].clone(), sz = A > 0 ? Math.max(0, 1 - A / 3) : 1; if (sz > 0) { P.add(true).disc(p, .3 * sz, pal.glow, .5, true); P.add(false); P.disc(p, .15 * sz, pal.under, 1); P.disc(p, .11 * sz, pal.Y1, 1); P.disc(p, .05 * sz, pal.W, 1); } }
    // けさ: 地面へ 小さな 放電
    if (idx === 2 && T >= L - 1) { const e = E.tips[L], g = V(e.x, .03, e.z); bolt(P, jag(P, e, g, 5, .07, 5 + Math.floor(Math.min(T, L) / 2)), pal, .8, 1 - (A > 0 ? A * .12 : 0), skipFn(A, 99)); }
    sparks(P, pal, T, E, idx === 2 ? 14 : 8, (q, b) => lines[0][Math.floor(H(q, E.seed, 20) * N)].clone(), E.G + 1);
  },
  hit(P, E, T) { rays(P, pal, E, T - E.hitT, E.idx === 2 ? 12 : 7, 8, E.idx === 2 ? 1.25 : 1); },
});

// ---------- B でんきの たまが かける
const orbTex = {};
function orbFrames(pal) {
  if (orbTex[pal.Y2]) return orbTex[pal.Y2];
  return orbTex[pal.Y2] = [0, 1, 2, 3].map(f => pixTex(32, 32, put => {
    const R = 10;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy), an = Math.atan2(dy, dx);
      const sp = Math.pow(Math.max(0, Math.cos(5 * (an + f * .63))), 3) * 5 + Math.pow(Math.max(0, Math.cos(3 * (an - f * 1.1))), 4) * 3;
      const r = R + sp;
      if (d < r * .35) put(x, y, pal.W); else if (d < r * .68) put(x, y, pal.Y1); else if (d < r) put(x, y, '#B070FF'); else if (d < r + 1.6) put(x, y, pal.under, .95);
    }
  }));
}
const B_ = pal => ({
  life: 9,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 6) return;
    band(P, E, T, { life: 6, alpha: .5, frac: .9, rows: [[0, '#FFFFFF', .22], [.5, pal.Y2, .3], [1, pal.Y2, 0]] });
    const r = [.16, .25, .35][idx];
    const nodeAt = s => E.tips[clamp(Math.round(s), 0, L)];
    if (T < L) {
      const p = nodeAt(T), f = Math.floor(T / 2) % 4, sz = 2 * r * 1.35;
      P.add(true).disc(p, r * 2.3, pal.glow, .4, true); P.add(false);
      P.sprite(orbFrames(pal)[f], p, sz, 1);
    }
    // のこる ばちばち（点＋ミニいなずま）
    for (let s = Math.max(0, T - 2); s <= Math.min(T, L); s++) {
      const age = T - s, c = nodeAt(s);
      for (let q = 0; q < 3; q++) { const th = H(s, q, E.seed) * 6.28, p = c.clone().addScaledVector(camDir(P, th), .08 + .1 * H(s, q, 2) * (1 + age)); pt(P, p, .075, q ? pal.Y1 : pal.W, 1 - age * .3, pal.under, 1.8); }
      if (age < 2) { const th = H(s, 9, E.seed) * 6.28, d = camDir(P, th); bolt(P, jag(P, c, c.clone().addScaledVector(d, .26), 3, .05, s * 3 + idx), pal, .42, 1 - age * .4); }
    }
    // はじける
    if (A >= 0 && A < 6) {
      const c = nodeAt(L);
      for (let q = 0; q < 6; q++) { const th = q / 6 * 6.28 + .3 + (H(q, E.seed) - .5) * .4, p = c.clone().addScaledVector(camDir(P, th), .65 * easeOut(A / 5)); const s = .13 * (1 - A / 6); pt(P, p, s, q % 2 ? pal.W : pal.Y1, 1, '#B070FF', 1.5); pt(P, p, s * 1.6, pal.under, .0); }
      if (A < 3) { P.add(true).disc(c, .35 * (1 - A / 3), pal.glow, .5, true); P.add(false); }
      if (idx === 2) { const g = V(c.x, 0, c.z); P.flatRing(g, .8 * easeOut(A / 5), .09, pal.under, 1 - A / 6); P.flatRing(g, .8 * easeOut(A / 5), .05, pal.Y1, 1 - A / 6); }
    }
  },
  hit(P, E, T) {
    const h = T - E.hitT; if (h < 0 || h > 12) return;
    if (h < 3) { const c = E.hitPos, r = [.16, .25, .35][E.idx]; P.add(true).disc(c, r * 2.2, pal.glow, .4, true); P.add(false); P.sprite(orbFrames(pal)[h % 4], c, 2 * r * 1.35, 1); }
    else rays(P, pal, E, h - 3, 6, 7, E.idx === 2 ? 1.2 : 1);
  },
});

// ---------- C ばちばちの あみ
const FAN = [
  [[-.1, .12], [.1, .08]],
  [[.2, .05], [-.2, .4], [.15, .75], [-.1, 1.05]],
  [[-1.3, .12], [-.78, .22], [-.26, .3], [.26, .3], [.78, .22], [1.3, .12]],
];
const C_ = pal => ({
  life: 9,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 6) return;
    const org = V(0, 1.25, lunge(i) + .15 + .15), ps = Math.floor(Math.min(T, L) / 2);
    const vis = A > 0 ? 1 - A / 6.5 : 1;
    FAN[idx].forEach(([psi, phi], q) => {
      const d = V(-Math.sin(psi) * Math.cos(phi), Math.sin(phi), Math.cos(psi) * Math.cos(phi)), end = org.clone().addScaledVector(d, 2.2);
      const pts = jag(P, org, end, 9, .1, q * 5 + ps * 13 + idx * 31);
      const n = Math.max(2, Math.round(pts.length * vis)); const cut = pts.slice(0, Math.max(2, Math.min(pts.length, Math.ceil((pts.length - 1) * vis) + 1)));
      bolt(P, cut, pal, idx === 2 ? .85 : .8, 1, A > 0 ? skipFn(A, q, a => a <= 2 ? 1 : .7) : null);
      if (idx > 0) { const k = 4, b0 = pts[k]; if (k / 8 <= vis) bolt(P, jag(P, b0, b0.clone().addScaledVector(camDir(P, q * 1.9 + 1), .3), 3, .05, q + ps * 9), pal, .5, 1); }
    });
  },
  hit(P, E, T) {
    const h = T - E.hitT; if (h < 0 || h > 4) return;
    const c = V(0, 1.05, MON_FRONT - .05), ps = [], N = 24, hw = .5, hh = .95;
    const peri = u => { const t = u * 4; if (t < 1) return [lerp(-hw, hw, t), -hh]; if (t < 2) return [hw, lerp(-hh, hh, t - 1)]; if (t < 3) return [lerp(hw, -hw, t - 2), hh]; return [-hw, lerp(hh, -hh, t - 3)]; };
    for (let k = 0; k <= N; k++) { const [x, y] = peri((k % N) / N), j = (H(k, h, E.seed) - .5) * .16; ps.push(V(c.x + x * (k % 2 ? 1 : 1.0) + j, c.y + y + j, c.z - .08 * (h % 2))); }
    ps[N] = ps[0].clone();
    bolt(P, ps, pal, .8, 1 - h * .15);
    const r = .22 * (1 - h / 4); if (r > 0) P.add(true).disc(E.hitPos, r + .1, pal.glow, .5, true), P.add(false);
  },
});
export function raijin(pal) {
  const mk = f => { const v = f(pal); return { life: 12, draw(P, E, T, i) { v.draw(P, E, T, i); v.hit(P, E, T); } }; };
  return { A: mk(A_), B: mk(B_), C: mk(C_) };
}
