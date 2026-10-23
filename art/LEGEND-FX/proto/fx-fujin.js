// 風神剣 3 案（A かぜの すじ / B つむじかぜの はっぱ / C かぜの うずもよう）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, perpTo, camDir, MON_FRONT } from './lib.js';
import { band, netKeep, skipFn, pt } from './fx-common.js';

const PAL = { W: '#F6FFFB', M1: '#B8F2DC', M2: '#5FD0AA', edge: '#1B7A6E', leaf1: '#7FCB5A', leaf2: '#3E8A3A', leafEdge: '#245C2A', dust: '#E8FFF6' };

// 筆でかいたような 帯: 先が とがり、太さが かわり、ふちが ギザッと かすれる
function brush(P, pts, o) {
  const n = pts.length; if (n < 2) return;
  const wmax = o.w * 1.5, seed = o.seed || 0, a = o.a ?? 1;
  const prof = (u, k) => { const base = Math.pow(Math.sin(Math.PI * clamp(u * .92 + .04)), .7); const rag = .72 + .5 * H(k, seed, 1); return wmax * (o.headFat ? lerp(.35, 1, u) * Math.pow(Math.sin(Math.PI * clamp(u * .5 + .46)), .6) : base) * rag; };
  const skipRag = k => H(k, seed, 4) > .93;
  P.ribbon(pts, (u, k) => prof(u, k) + .05, PAL.edge, a * .95, { skip: o.skip || skipRag });
  P.ribbon(pts, (u, k) => prof(u, k), o.body || PAL.M2, a, { skip: o.skip });
  P.ribbon(pts, (u, k) => prof(u, k) * .55, o.mid || PAL.M1, a, { skip: o.skip });
  P.ribbon(pts, (u, k) => prof(u, k) * .28, PAL.W, a, { skip: o.skip });
  if (!o.noGlow) { P.add(true).ribbon(pts, (u, k) => prof(u, k) * 2.2, PAL.M2, .22 * a, { soft: true, skip: o.skip }); P.add(false); }
}
function feather(P, p, rot, s, a = 1, kind = 0) {
  const e = kind ? PAL.leafEdge : PAL.edge, c = kind ? (H(rot, 1) > .5 ? PAL.leaf1 : PAL.leaf2) : (H(rot, 2) > .5 ? PAL.W : PAL.M1);
  P.quad(p, [s * 1.9, s * .8], e, a, rot); P.quad(p, [s * 1.5, s * .5], c, a, rot);
}
function dust(P, p, s, a = 1) { P.quad(p, s * 1.7, PAL.edge, a * .8); P.quad(p, s, PAL.W, a); }

// 点列に 先の のび と まき を つける
function extend(P, pts, d, len, turns, rad, side) {
  const out = pts.slice(), e = pts[pts.length - 1];
  for (let q = 1; q <= 3; q++) out.push(e.clone().addScaledVector(d, len * q / 3));
  const E2 = e.clone().addScaledVector(d, len), n = 6 * turns, c = E2.clone().addScaledVector(side, rad);
  for (let q = 1; q <= n; q++) { const th = q / n * Math.PI * 2 * turns, r = rad * (1 - .45 * q / n); const cc = E2.clone().addScaledVector(side, rad); out.push(cc.clone().addScaledVector(side, -r * Math.cos(th)).addScaledVector(d, r * Math.sin(th))); }
  return out;
}
function smoothPts(E, off, n) {
  const nodes = E.tips.map((t, k) => t.clone().add(off(k, t)));
  const c = new THREE.CatmullRomCurve3(nodes, false, 'centripetal'); return c.getPoints(n);
}
const growOf = (E, T) => clamp((T + 1) / E.G);

// ---------- A かぜの すじ
const A_ = {
  life: 14,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 9) return;
    const sideV = perpTo(P, E.swing, E.tips[0].clone().lerp(E.tips[L], .5));
    const turns = idx === 2 ? 2 : 1, wmax = [.1, .09, .075];
    for (let k = 0; k < 3; k++) {
      const off = (j, t) => {
        if (idx === 0) return sideV.clone().multiplyScalar((k - 1) * .17 * (1 - j / L * .85));
        return E.bases[j].clone().sub(t).multiplyScalar(.15 * k / Math.max(.2, E.bases[j].distanceTo(t)));
      };
      const win = smoothPts(E, off, 14);
      const full = extend(P, win, E.swing, idx === 0 ? .55 : .6, turns, idx === 2 ? .17 : .13, perpTo(P, E.swing, win[win.length - 1]).multiplyScalar(idx === 2 ? -1 : 1));
      const nWin = win.length, nAll = full.length;
      let end = A <= 0 ? Math.ceil(growOf(E, T) * (nWin - 1)) + 1 : Math.min(nAll, nWin + Math.ceil((A / 3) * (nAll - nWin)));
      let start = A > 0 ? Math.floor((A / 9) * nAll) : 0;
      if (end - start < 2) continue;
      const cut = full.slice(start, end);
      const dd = A > 0 ? A / 9 : 0;
      brush(P, cut, { w: wmax[k] * (idx === 2 ? 1.25 : 1) * (1 - dd * .3), seed: k * 7 + idx, body: k === 0 ? PAL.M2 : k === 1 ? PAL.M2 : PAL.M1, mid: k === 2 ? PAL.W : PAL.M1, headFat: true, a: 1, skip: A > 0 ? (j => (j < 4 && H(j, k, E.seed) > .5)) : null });
    }
    // ちり・はね
    const e = E.tips[L];
    for (let q = 0; q < 9; q++) {
      const b = Math.floor(H(q, E.seed, 1) * (E.G + 2)), age = T - b; if (age < 0 || age > 10) continue;
      const p = E.lin(H(q, E.seed, 2)).addScaledVector(E.swing, .6 * easeOut(age / 10)).addScaledVector(camDir(P, H(q, 4) * 6.28), .12);
      if (q % 3 === 0) feather(P, p, H(q, 6) * 6 + age * .3, .09, 1 - age / 12); else dust(P, p, .045, 1 - age / 11);
    }
    if (idx === 2 && A >= 0) for (let q = 0; q < 6; q++) {  // 草の つぶ
      const age = A, vx = (H(q, 20) - .5) * .8, vz = (H(q, 21) - .3) * .6, vy = .9 + H(q, 22) * .5, g = V(e.x, 0, e.z);
      const t = age / 8, p = g.clone().add(V(vx * t, vy * t - 1.7 * t * t, vz * t)); if (p.y < 0.02) p.y = .02; if (age > 9) continue;
      P.quad(p, .1, PAL.leafEdge, 1); P.quad(p, .07, q % 2 ? PAL.leaf1 : PAL.leaf2, 1);
    }
  },
  hit(P, E, T) {
    const h = T - E.hitT; if (h < 0 || h > 9) return; const c = E.hitPos;
    for (let q = 0; q < 4; q++) {
      const th = [-1.0, -.4, .35, .95][q] + .3, d = camDir(P, th + 3.14 * .0), D = .75 * easeOut(h / 8), tail = Math.max(0, D - .45), perp = camDir(P, th + 1.57);
      const pts = [0, .5, 1].map((s, j) => c.clone().addScaledVector(d, .12 + tail + (D - tail) * s).addScaledVector(perp, (j === 1 ? .09 : 0)));
      brush(P, pts, { w: .07 * (1 - h / 10), seed: q + E.idx * 5, noGlow: true });
    }
    if (h < 5) { const r = .06 + .1 * Math.sin(h / 4 * 3.14); P.disc(c, r + .035, PAL.edge, .9); P.disc(c, r, PAL.W, .95); P.disc(c.clone().add(V(.1, .08, 0)), r * .6, PAL.M1, .95); }
  },
};
// ---------- B つむじかぜの はっぱ（ミントの わっか＋はね）
const B_ = {
  life: 16,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 11) return;
    band(P, E, T, { life: 6, alpha: .55, frac: .9, rows: [[0, PAL.W, .25], [.5, PAL.M1, .3], [1, PAL.M2, 0]] });
    const tau = Math.min(T, L + .0), tp = E.lin(clamp(tau / L));
    const tan = E.dirAt(clamp(tau / L)), b1 = perpTo(P, tan, tp), b2 = tan.clone().cross(b1).normalize();
    const R = [.2, .24, .33][idx], spread = A > 0 ? 1 + A * .12 : 1, drift = A > 0 ? E.swing.clone().multiplyScalar(.04 * A) : V(0, 0, 0);
    const rings = idx === 2 ? 3 : 2;
    for (let q = 0; q < rings; q++) {
      const arc = []; const ph = T / 6 * 6.28 + q * 2.1, m = 16, lag = q * .5;
      for (let k = 0; k <= m; k++) { const th = ph - k / m * (3.6 + q * .6); const rr = R * (.75 + .25 * k / m) * (1 + q * .35) * spread; const c = E.lin(clamp((tau - lag - k / m * 1.3) / L)); arc.push(c.add(drift).addScaledVector(b1, Math.cos(th) * rr).addScaledVector(b2, Math.sin(th) * rr * .8)); }
      arc.reverse();
      const keep = A > 0 ? netKeep(Math.max(0, A - 1)) : 1; if (keep === 0) continue;
      brush(P, arc, { w: .09 * (idx === 2 ? 1.2 : 1) * (A > 0 ? 1 - A * .06 : 1), seed: q + idx * 3, headFat: false, skip: A > 0 ? skipFn(A, q + 40, netKeep) : null, a: 1 });
    }
    // はっぱ・はね・ちり
    const nl = [3, 6, 8][idx];
    for (let q = 0; q < nl; q++) {
      const ph = T / 6 * 6.28 + q * 6.28 / nl, lagq = H(q, E.seed) * 2, rr = R * (1.1 + .5 * H(q, 3)) * spread;
      const c = E.lin(clamp((tau - lagq) / L)).add(drift);
      let p = c.addScaledVector(b1, Math.cos(ph) * rr).addScaledVector(b2, Math.sin(ph) * rr * .8);
      if (A > 0) p.y -= .004 * A * A * (1 + H(q, 5)); const sway = Math.sin((T + q) * .7) * .03; p.x += sway;
      if (T - (E.G - 2) > 0 || true) feather(P, p, T * .5 + q, .12, A > 8 ? (11 - A) / 3 : 1, q % 2 ? 1 : 0);
    }
    for (let q = 0; q < 8; q++) { const ph = -T / 5 * 6.28 + q * .8, rr = R * (.8 + H(q, 7) * .8) * spread; if (A > 0 && H(q, A, E.seed) > netKeep(A)) continue; dust(P, E.lin(clamp((tau - H(q, 8) * 2) / L)).add(drift).addScaledVector(b1, Math.cos(ph) * rr).addScaledVector(b2, Math.sin(ph) * rr), .05); }
  },
  hit(P, E, T) {
    const h = T - E.hitT; if (h < 0 || h > 10) return; const c = E.hitPos;
    for (let q = 0; q < 6; q++) { const th = -.9 + q * .36 + H(q, E.idx) * .2, D = .8 * easeOut(h / 9) * (.7 + .5 * H(q, 2)), p = c.clone().addScaledVector(camDir(P, th), D); p.y -= .03 * h; feather(P, p, h * .5 + q, .12, 1 - h / 11, 1); }
    for (let q = 0; q < 6; q++) { const th = -.7 + q * .3, p = c.clone().addScaledVector(camDir(P, th), .6 * easeOut(h / 8) * (.5 + H(q, 3))); dust(P, p, .06, 1 - h / 9); }
  },
};
// ---------- C かぜの うずもよう（筆の うず）
function swirl(P, c, size, t, seed, a = 1) {   // t: 0..1（ほどけながら 流れる）
  const turns = 1.7, m = 22, pts = [], rot = t * 2.2 + seed * 3;
  const grow = clamp(t * 2.2 + .15), tail = clamp((t - .45) * 1.8);
  for (let k = 0; k <= m; k++) {
    const u = k / m, th = rot + u * turns * 6.28, r = size * (.12 + .88 * u) * (1 + t * .5);
    pts.push(c.clone().addScaledVector(P.camR, Math.cos(th) * r).addScaledVector(P.camU, Math.sin(th) * r * .8));
  }
  const s0 = Math.floor(tail * m * .85), s1 = Math.max(s0 + 2, Math.ceil(grow * m));
  const cut = pts.slice(s0, Math.min(pts.length, s1 + 1)); if (cut.length < 2) return;
  brush(P, cut, { w: size * .5 * (1 - t * .3), seed, a, headFat: true, skip: t > .6 ? (k => H(k, seed, t * 3 | 0) > 1 - (1 - t) * 2.2) : null });
}
const C_ = {
  life: 16,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 10) return;
    band(P, E, T, { life: 9, alpha: .85, rows: [[0, PAL.W, .9], [.3, '#D2F5E8', .75], [.65, PAL.M1, .5], [1, '#8FD6F2', .1]] });
    const us = [[.5], [.35, .8], [.25, .55, .88]][idx], baseSize = [.34, .36, .4][idx];
    us.forEach((u, q) => {
      const t0 = Math.floor(u * L) + q * 1, age = T - t0; if (age < 0 || age > 9) return;
      const big = idx === 2 && q === 2 ? 1.5 : 1;
      const p = E.lin(u).addScaledVector(E.swing, .3 * easeOut(age / 9));
      swirl(P, p, baseSize * big * (.7 + .3 * Math.min(1, age / 3)), age / 9, q + idx * 4 + .5, 1);
    });
    for (let q = 0; q < 5; q++) { const b = Math.floor(H(q, E.seed) * L), age = T - b; if (age < 0 || age > 10) continue; dust(P, E.lin(H(q, 2)).addScaledVector(E.swing, .5 * easeOut(age / 10)).addScaledVector(camDir(P, H(q, 3) * 6.28), .15), .05, 1 - age / 11); }
  },
  hit(P, E, T) { const h = T - E.hitT; if (h < 0 || h > 8) return; swirl(P, E.hitPos.clone().add(V(0, .15, 0)), .24, h / 8, E.idx + 9.5, 1); },
};
export function fujin() {
  const mk = v => ({ life: v.life, draw(P, E, T, i) { v.draw(P, E, T, i); v.hit(P, E, T); } });
  return { A: mk(A_), B: mk(B_), C: mk(C_) };
}
