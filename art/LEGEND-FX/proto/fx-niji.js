// 虹 3 案（A ひかりの つぶの かわ / B にじの ほしくず / C ほどける にじの リボン）。粒は 1 振り 200 点まで（ここでは 1 描画に まとめる）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, perpTo, camDir, pixTex } from './lib.js';
import { netKeep } from './fx-common.js';

export const RB = ['#FF6A5E', '#FFB347', '#FFE66B', '#5FD98F', '#4FA3F0', '#D16BE6'], WH = '#FFF7E3', SH = '#2A2350';
const CELL = .0625;
function dot(P, p, s, hex, a = 1) { P.quad(p.clone().addScaledVector(P.camR, CELL * .8).addScaledVector(P.camU, -CELL * .8), s, SH, a * .95); P.quad(p, s, hex, a); }
function dotShadowFirst(P, list) { for (const d of list) P.quad(d.p.clone().addScaledVector(P.camR, CELL * .8).addScaledVector(P.camU, -CELL * .8), d.s, SH, d.a * .95); for (const d of list) P.quad(d.p, d.s, d.hex, d.a); }
function cross(P, p, cell, hex, arm = 2, a = 1) {
  const L = [];
  L.push({ p, s: cell * 1.3, hex: WH, a });
  for (let j = 1; j <= arm; j++) for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) L.push({ p: p.clone().addScaledVector(P.camR, x * j * cell * 1.1).addScaledVector(P.camU, y * j * cell * 1.1), s: cell * (j === 1 ? 1.1 : .8), hex: j === 1 ? WH : hex, a });
  dotShadowFirst(P, L);
}
// 星の 絵（4 つとがり・5 コマで ひらいて とじる）
const starTex = {};
function star(ci, f) {
  const key = ci + ':' + f; if (starTex[key]) return starTex[key];
  const hex = ci === 6 ? WH : RB[ci], n = [1, 2, 3, 4, 5][f], set = new Map();
  for (let j = -n; j <= n + 1; j++) { const w = j >= 1 && j <= 0 ? 0 : 0; for (const c of [7, 8]) { set.set((c) + ',' + (7 + j + (j > 0 ? 1 : 0) - (j > 0 ? 1 : 0)), 0); } }
  const px = new Map(); const put = (x, y, h) => px.set(x + ',' + y, h);
  for (let j = 1; j <= n; j++) { const th = j <= 2 ? 2 : 1; for (const [x, y] of [[8 + j, 7], [8 + j, 8], [7 - j, 7], [7 - j, 8], [7, 8 + j], [8, 8 + j], [7, 7 - j], [8, 7 - j]]) if (j <= 2 || ((x === 7 || x === 8) && (y === 7 || y === 8)) === false) { if (j > 2 && !((x === 8 + j && y === 8) || (x === 7 - j && y === 7) || (y === 8 + j && x === 8) || (y === 7 - j && x === 7))) continue; put(x, y, hex); } }
  for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) put(x, y, WH);
  if (f >= 2) for (const [x, y] of [[9, 9], [6, 6], [9, 6], [6, 9]]) put(x, y, hex);
  return starTex[key] = pixTex(16, 16, pt => {
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!px.has((x + dx) + ',' + (y + dy))) pt(x + dx, y + dy, SH); }
    for (const [k, h] of px) { const [x, y] = k.split(',').map(Number); pt(x, y, h); }
  });
}
const STAR = .05 * 16;

// 当たった ときの プリズムの はじけ
function burst(P, E, h, m = 1) {
  if (h < 0 || h > 10) return; const c = E.hitPos, life = 9;
  P.add(true).disc(c, (.45 * (1 - h / 5)) + .05, '#FFFFFF', h < 5 ? .85 : 0, true); P.disc(c, .22 * (1 - h / 8) * 1.4, WH, h < 8 ? .6 : 0, true); P.add(false);
  const nr = Math.round(14 * m);
  for (let q = 0; q < nr; q++) {
    const th = q / nr * 6.28 + H(q, E.seed) * .3, d = camDir(P, th), len = (.35 + .55 * H(q, E.seed, 3)) * easeOut(h / 6), a = (1 - h / life);
    const a0 = c.clone().addScaledVector(d, .08), a1 = c.clone().addScaledVector(d, .08 + len);
    P.add(true).ribbon([a0, a0.clone().lerp(a1, .5), a1], [.03, .05, .005], RB[q % 6], .85 * a, { soft: true }); P.add(false);
    P.ribbon([a0, a1], [.02, .006], WH, a * .9);
  }
  const nd = Math.round(22 * m), L = [];
  for (let q = 0; q < nd; q++) {
    const th = H(q, E.seed, 5) * 6.28, sp = .5 + .7 * H(q, E.seed, 6), D = sp * easeOut(h / 8), d = camDir(P, th);
    for (let t = 0; t < (q % 3 === 0 ? 3 : 1); t++) L.push({ p: c.clone().addScaledVector(d, .1 + Math.max(0, D - t * .07)), s: CELL * (t ? .8 : 1.2) * (1 - h / 12), hex: RB[(q + t) % 6], a: 1 });
  }
  dotShadowFirst(P, L);
  const ns = m > 1 ? 4 : 3;
  for (let q = 0; q < ns; q++) { const th = q * 2.2 + .5, p = c.clone().addScaledVector(camDir(P, th), (.35 + .25 * q) * easeOut(h / 7)); if (h < 8) cross(P, p, CELL, RB[(q * 2) % 6], 2 + (q === 0 ? 1 : 0), 1 - h / 10); }
}
function sideOf(P, E) { return perpTo(P, E.swing, E.tips[0].clone().lerp(E.tips[E.L], .5)); }

// ---------- A ひかりの つぶの かわ（プリズムで 虹色に わかれる）
const A_ = {
  life: 14,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 10) return;
    const side = sideOf(P, E), n = idx === 2 ? 14 : 16, Ls = [];
    // まっすぐな 光の おび（プリズムの 入口）
    if (T <= L + 3) { const hd = clamp((T + 1) / E.G), pts = []; for (let k = 0; k <= 8; k++) pts.push(E.lin(hd * k / 8)); const fa = A > 0 ? 1 - A / 4 : 1; if (fa > 0) { P.add(true).ribbon(pts, [.02, .12, .12, .12, .12, .12, .12, .1, .03], '#FFFFFF', .55 * fa, { soft: true }); P.add(false); P.ribbon(pts, .03, WH, fa); } }
    for (let s = 0; s <= L; s++) for (let q = 0; q < n; q++) {
      const age = T - s; if (age < 0) continue; const life = 6 + Math.floor(H(q, s, E.seed) * 5); if (age > life) continue;
      const u = clamp((s - .5 + H(q, s, 2)) / L), c = H(q, s, 3), tan = E.dirAt(u), x = age / life;
      const inward = (idx === 0 ? side.clone().multiplyScalar((c - .5) * .5) : E.linB(u).sub(E.lin(u)).normalize().multiplyScalar(c * .4));
      const p = E.lin(u).addScaledVector(inward, 1 + x * 1.2).addScaledVector(tan, (.4 + .2 * H(q, s, 4)) * easeOut(x));
      if (idx === 1) p.y += .15 * Math.sin(Math.PI * Math.min(1, x * 1.2)) - .45 * x * x * x;
      const shrink = life - age <= 1;
      Ls.push({ p, s: shrink ? CELL : CELL * 1.7, hex: RB[Math.min(5, Math.floor(c * 6))], a: 1 });
    }
    for (let q = 0; q < 12; q++) { const b = Math.floor(H(q, E.seed, 8) * (L + 1)), age = T - b; if (age < 0 || age > 5) continue; Ls.push({ p: E.lin(clamp((b + H(q, 9)) / L)).addScaledVector(camDir(P, H(q, 10) * 6.28), .15 + .25 * H(q, 11)), s: CELL * .8, hex: WH, a: 1 - age / 6 }); }
    dotShadowFirst(P, Ls);
    if (T <= L) cross(P, E.tips[Math.min(L, T)], CELL * 1.3, WH, 3);
    if (idx === 2) for (let q = 0; q < 3; q++) { const t0 = L - 2 + q, age = T - t0; if (age < 0 || age > 6) continue; cross(P, E.lin(.6 + q * .2).addScaledVector(camDir(P, 1.5 + q), .15), CELL * (1.3 - (age > 3 ? .4 : 0)), q % 2 ? '#FFE66B' : '#8FD0FF', 2, 1 - age / 8); }
  },
  hit(P, E, T) { burst(P, E, T - E.hitT, E.idx === 2 ? 1.6 : 1); },
};
// ---------- B にじの ほしくず
const B_ = {
  life: 14,
  draw(P, E, T) {
    const L = E.L, idx = E.idx; if (T < 0 || T > L + 14) return;
    const ns = [4, 6, 12][idx], Ls = [];
    for (let j = 0; j < ns; j++) {
      const sp = Math.floor(j * (L + 1) / ns * 1.0), age = T - sp; if (age < 0 || age > 6) continue;
      const fr = [0, 2, 4, 3, 2, 1, 0][age], ci = idx === 2 ? j % 6 : (j * 2) % 6, last = j === ns - 1, u = (j + .5) / ns;
      const p = E.lin(u).addScaledVector(camDir(P, j * 2.1), .05);
      P.sprite(star(last && idx === 2 ? 6 : ci, fr), p, STAR * (last && idx === 2 ? 1.5 : 1) * (idx === 0 ? .9 : .85), 1);
      // まわりの ほしくず
      for (let q = 0; q < 5; q++) { const lif = 7; const a2 = T - sp - Math.floor(H(q, j) * 2); if (a2 < 0 || a2 > lif) continue; const d = camDir(P, H(q, j, 2) * 6.28); Ls.push({ p: p.clone().addScaledVector(d, (.1 + .3 * H(q, j, 3)) * easeOut(a2 / lif)).add(V(0, .12 * a2 / lif, 0)), s: a2 > lif - 2 ? CELL : CELL * 1.5, hex: RB[(j + q) % 6], a: 1 }); }
    }
    dotShadowFirst(P, Ls);
  },
  hit(P, E, T) { burst(P, E, T - E.hitT, E.idx === 2 ? 1.4 : 1); },
};
// ---------- C ほどける にじの リボン
const C_ = {
  life: 14,
  draw(P, E, T) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 10) return;
    const N = 24, hd = clamp((T + 1) / Math.max(1, E.G)), rows = 7, wid = [.3, .4, .5][idx] * .5;
    const nodes = []; for (let k = 0; k <= N; k++) { const u = Math.min(1, k / N) * hd; nodes.push(u); }
    const s0 = A > 0 ? Math.min(N, Math.floor((A - 1) * 3)) + (A > 0 ? 0 : 0) : 0, s1 = A > 8 ? N : N;
    const grid = []; const sh = [];
    for (let j = 0; j < rows; j++) { const row = []; for (let k = s0; k <= N; k++) { const u = nodes[k]; row.push(E.lin(u).lerp(E.linB(u), j / (rows - 1) * wid * 2)); } grid.push(row); }
    if (A < 9 && grid[0].length >= 2) {
      const off = P.camR.clone().multiplyScalar(.04).addScaledVector(P.camU, -.04);
      P.grid(grid.map(r => r.map(p => p.clone().add(off))), () => [SH, .9]);
      P.grid(grid, (j, k) => [RB[Math.min(5, j)], 1]);
      P.grid([grid[0], grid[0].map(p => p.clone())], () => [WH, 0]);
      P.add(true).ribbon(grid[1], .08, '#FFFFFF', .25, { soft: true }); P.add(false);
    }
    const Ls = [];
    for (let b = 1; b <= 8; b++) for (let q = 0; q < 6; q++) {
      const age = A - b; if (A <= 0 || age < 0) continue; const life = 6 + Math.floor(H(q, b, E.seed) * 5); if (age > life) continue;
      const k = Math.min(N, (b - 1) * 3 + (q % 3)), u = nodes[k], c = H(q, b, 2), x = age / life;
      const p = E.lin(u).lerp(E.linB(u), c * wid * 2).addScaledVector(E.dirAt(u), (.4 + .2 * H(q, b, 4)) * easeOut(x));
      if (idx === 1) p.y += .35 * easeOut(x) - .2 * x * x;
      Ls.push({ p, s: life - age <= 1 ? CELL : CELL * 1.7, hex: RB[Math.min(5, Math.floor(c * 6))], a: 1 });
    }
    dotShadowFirst(P, Ls);
    if (T <= L) cross(P, E.tips[Math.min(L, T)], CELL * 1.2, WH, 2);
  },
  hit(P, E, T) { burst(P, E, T - E.hitT, E.idx === 2 ? 1.6 : 1); },
};
export function niji() {
  const mk = v => ({ life: v.life, draw(P, E, T, i) { v.draw(P, E, T, i); v.hit(P, E, T); } });
  return { A: mk(A_), B: mk(B_), C: mk(C_) };
}
