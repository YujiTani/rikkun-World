// 風神剣 F1 ひとふでの かぜ / F2 ちいさな たつまき / F3 はねと ちりの つむじ（1/32・筆の 帯・加算）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, perpTo, camDir, lunge, MON_FRONT } from './lib.js';
import { baseHit, brushTex, featherTex, glowTex, DOT } from './fx2-common.js';
const EDGE = '#2B6699';
function band(P, pts, wmax, seed, a = 1, o = {}) {
  if (pts.length < 2) return; const t = brushTex(seed % 3 + 1);
  let len = 0; for (let k = 1; k < pts.length; k++) len += pts[k].distanceTo(pts[k - 1]);
  const prof = o.fat ? (u => Math.pow(Math.sin(Math.PI * clamp(u * .6 + .38)), .7) * (.55 + .45 * u)) : (u => Math.pow(Math.sin(Math.PI * clamp(u)), .75));
  const wf = (u, k) => wmax * 1.25 * Math.max(.04, prof(u)) * (1 + .12 * Math.sin(k * 1.7 + seed));
  const al = o.alphaFn || a;
  P.brush(pts, wf, t.edge, { rep: Math.max(1, len / 4), a: typeof al === 'function' ? ((u, k) => al(u, k) * .95) : a * .95, ro: 9, scroll: seed * .13 });
  P.brush(pts, wf, t.body, { rep: Math.max(1, len / 4), a: al, add: true, ro: 12, scroll: seed * .13 });
}
function puff(P, p, s, a = 1, hex = '#F4FCFF') { P.quad(p, s * 1.5, EDGE, a * .8); P.add(true).quad(p, s, hex, a); P.add(false); }
const curve = (nodes, n) => new THREE.CatmullRomCurve3(nodes, false, 'centripetal').getPoints(n);
function path(E, off, n) { return curve(E.tips.map((t, k) => t.clone().add(off ? off(k, t) : V(0, 0, 0))), n); }
function curlTail(P, pts, dir, len, rad, turns, side) {
  const out = pts.slice(), e = pts[pts.length - 1];
  for (let q = 1; q <= 4; q++) out.push(e.clone().addScaledVector(dir, len * q / 4));
  const E2 = e.clone().addScaledVector(dir, len), n = Math.round(9 * turns);
  for (let q = 1; q <= n; q++) { const th = q / n * 6.283 * turns, r = rad * (1 - .5 * q / n); out.push(E2.clone().addScaledVector(side, rad).addScaledVector(side, -r * Math.cos(th)).addScaledVector(dir, r * Math.sin(th))); }
  return out;
}
function dustBurst(P, E, T, n, o) {
  for (let q = 0; q < n; q++) {
    const b = Math.floor(H(q, E.seed, 1) * (o.span ?? E.G + 1)), age = T - b; if (age < 0 || age > o.life) continue;
    const u = H(q, E.seed, 2), p0 = E.lin(u), dir = (o.dir || E.swing).clone().add(camDir(P, H(q, E.seed, 3) * 6.28).multiplyScalar(.5 * H(q, 4))).normalize();
    const D = (o.d0 ?? .5) + H(q, E.seed, 5) * (o.d1 ?? 1.3), p = p0.clone().addScaledVector(dir, D * (1 - Math.exp(-age * .32)));
    if (o.fall) p.y -= o.fall * Math.max(0, age - 8) * .02 * (1 + H(q, 6)); p.y += (o.rise || 0) * age * .01;
    puff(P, p, DOT * (q % 3 ? 1.4 : 2), 1 - Math.max(0, age - o.life * .6) / (o.life * .4), q % 2 ? '#CDEFFC' : '#8FF0D2');
  }
}
const sideAway = (P, d, p) => { const s = perpTo(P, d, p); const c = V(0, 1.2, p.z - 1.2); return s.multiplyScalar(Math.sign(s.dot(p.clone().sub(c))) || 1); };

// ---------- F1 ひとふでの かぜ
export const F1 = {
  life: 20,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 18) return;
    const head = A <= 0 ? clamp((T + 1) / E.G) : 1;
    // 本体: 刃先を 追って のびる 太い 帯（まん中 0.35）
    {
      const w = path(E, null, 22), mainP = curlTail(P, w, E.swing, .55, .14, .001, perpTo(P, E.swing, w[w.length - 1])).slice(0, 28);
      const nAll = mainP.length, end = A <= 0 ? Math.max(2, Math.ceil(head * 22)) : Math.min(nAll, 22 + Math.ceil(A * 3)), start = A > 0 ? Math.floor(clamp((A - 1) / 8) * nAll) : 0;
      if (end - start >= 2 && A < 9) band(P, mainP.slice(start, end), .6 * (idx === 2 ? 1.15 : 1), 1 + idx, 1, { fat: true });
    }
    // かざり: 弧から 大きく はみ出す 細い 帯 2〜3 本（先が まく）
    const nd = idx === 2 ? 3 : 2;
    for (let k = 0; k < nd; k++) {
      const amp = [.6, 1.0, 1.25][k], turns = idx === 2 ? 1.8 : 1.2;
      let base;
      if (idx === 0) {                                     // つき: ドリル（刀の まわりを らせん）
        const w = path(E, null, 20), tan = E.swing, b1 = perpTo(P, tan, w[10]), b2 = tan.clone().cross(b1).normalize();
        base = w.map((p, q) => { const u = q / 19, th = u * 6.283 * 1.3 + k * 3.14 + T * .25; return p.clone().addScaledVector(b1, Math.cos(th) * .38 * Math.sin(Math.PI * u * .9 + .3)).addScaledVector(b2, Math.sin(th) * .38); });
        base = curlTail(P, base, E.swing, .5, .12, .001, b1);
      } else {
        const w = path(E, null, 22).map((p, q, ar) => { const u = q / (ar.length - 1), tg = ar[Math.min(ar.length - 1, q + 1)].clone().sub(ar[Math.max(0, q - 1)]).normalize(); return p.clone().addScaledVector(sideAway(P, tg, p), amp * Math.pow(Math.sin(Math.PI * clamp(u * .9 + .05)), .8)); });
        const dir = idx === 1 ? V(0, 1, 0) : E.swing, e = w[w.length - 1];
        base = curlTail(P, w, dir, idx === 1 ? 1.0 : .7, idx === 1 ? .5 : .38, turns, perpTo(P, dir, e).multiplyScalar(idx === 2 ? -1 : 1));
      }
      const pts = base.length > 60 ? base.filter((_, q) => q % 2 === 0 || q === base.length - 1) : base; const nAll = pts.length;
      const end = A <= 0 ? Math.max(2, Math.ceil(head * nAll * .55)) : Math.min(nAll, Math.ceil(nAll * (.55 + .45 * clamp(A / 5)))), start = A > 2 ? Math.floor(clamp((A - 2) / 14) * nAll) : 0;
      if (end - start >= 2 && A < 16) band(P, pts.slice(start, end), .34 - k * .04, 4 + k + idx * 3, .9 - (A > 2 ? (A - 2) * .02 : 0), { fat: true, alphaFn: A > 8 ? ((u, kk) => .9 * (1 - (A - 8) / 9) * (kk % 2 ? 1 : .55)) : undefined });
    }
    dustBurst(P, E, T, idx === 2 ? 20 : 8, { life: 12, d0: .3, d1: 1.2, fall: 1 });
    if (idx === 2 && A >= 0) { const g = E.tips[L]; for (let q = 0; q < 20; q++) { const age = A - Math.floor(H(q, 3) * 5); if (age < 0 || age > 14) continue; const th = H(q, 4) * 6.28 + age * .2, r = .15 + .5 * H(q, 5) * easeOut(age / 8); puff(P, V(g.x + Math.cos(th) * r, .04 + age * .02, lunge(i) + 1.2 + Math.sin(th) * r * .8), DOT * 1.7, 1 - age / 15, '#CDEFFC'); } }
    // 当てた とき: 小さな 筆の うず（直径 0.8・6 ステップで ほどける）＋ ちり 12
    const h = T - E.hitT;
    if (h >= 0 && h <= 8) {
      const c = E.hitPos.clone().add(V(0, .1, 0)), m = 26, sp = [];
      for (let q = 0; q <= m; q++) { const u = q / m, th = u * 6.283 * 1.6 + h * .5, r = .04 + .36 * u; sp.push(c.clone().addScaledVector(P.camR, Math.cos(th) * r).addScaledVector(P.camU, Math.sin(th) * r * .85)); }
      const s0 = Math.floor(clamp((h - 3) / 5) * m * .9), e0 = Math.max(s0 + 3, Math.ceil(clamp(h / 3 + .15) * m));
      band(P, sp.slice(s0, Math.min(m + 1, e0)), .12, 7 + idx, 1, { fat: true });
      for (let q = 0; q < 12; q++) { const d = camDir(P, H(q, E.seed, 8) * 6.28), D = (.4 + .7 * H(q, 9)) * (1 - Math.exp(-h * .45)); puff(P, c.clone().addScaledVector(d, D), DOT * 1.7, 1 - h / 9, '#CDEFFC'); }
    }
    baseHit(P, E, T);
  },
};
// ---------- F2 ちいさな たつまき
export const F2 = {
  life: 24,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 20) return;
    // 本体: 弧に そう 細い 風の 帯
    { const w = path(E, null, 20), head = A <= 0 ? clamp((T + 1) / E.G) : 1, end = Math.max(2, Math.ceil(head * 20)), start = A > 0 ? Math.floor(clamp((A - 1) / 7) * 20) : 0; if (end - start >= 2 && A < 8) band(P, w.slice(start, end), .3, 2 + idx, 1, { fat: true }); }
    if (A >= 0) {
      const Ht = [1.5, 3.5, 2.5][idx], Rw = [.5, .6, .8][idx] * (idx === 2 ? 1.3 : 1), age = A, cz = lunge(i) + .65 + .5 * clamp(age / 12), cx = .25;
      const grow = clamp((age + 1) / 4), spin = age / 12 * 6.283;
      const rings = 4;
      for (let j = 0; j < rings; j++) {
        const dieAt = [17, 15, 12, 10][j]; if (age > dieAt) continue;
        const f = (j + .5) / rings, y = Ht * f * grow + .06, r = lerp(.1, Rw, Math.pow(f, .9)) * grow, th0 = spin * (1 + f * .2) + j * 1.2, arc = 4.4, m = 20, pts = [];
        for (let q = 0; q <= m; q++) { const th = th0 + q / m * arc; pts.push(V(cx + Math.cos(th) * r, y + .08 * Math.sin(th * 2), cz + Math.sin(th) * r * .85)); }
        const al = (j < 2 ? 1 : .55) * (age > dieAt - 3 ? (dieAt - age) / 3 : 1);
        band(P, pts, .2 + .1 * f, 3 + j, .95, { alphaFn: (u, k) => al * (j >= 2 && k % 2 ? .6 : 1) });
      }
      for (let q = 0; q < 14; q++) { const ag = age - Math.floor(H(q, 1) * 6); if (ag < 0 || ag > 12) continue; const th = H(q, 2) * 6.28 + ag * .35, r = .2 + .6 * H(q, 3), y = .05 + ag * .09 * (.5 + H(q, 4)); puff(P, V(cx + Math.cos(th) * r, y, cz + Math.sin(th) * r), DOT * 1.7, 1 - ag / 13, '#CDEFFC'); }
    }
    const h = T - E.hitT;
    if (h >= 0 && h <= 6) for (let q = 0; q < 16; q++) { const th = q / 16 * 6.283, r = (.15 + .75 * easeOut(h / 6)); puff(P, V(Math.cos(th) * r, .05 + h * .02, MON_FRONT + .3 + Math.sin(th) * r * .7), DOT * 1.7, 1 - h / 7, '#CDEFFC'); }
    baseHit(P, E, T);
  },
};
// ---------- F3 はねと ちりの つむじ
export const F3 = {
  life: 34,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx; if (T < 0 || A > 32) return;
    { const w = path(E, null, 22), head = A <= 0 ? clamp((T + 1) / E.G) : 1, end = Math.max(2, Math.ceil(head * 22)), start = A > 0 ? Math.floor(clamp((A - 1) / 8) * 22) : 0; if (end - start >= 2 && A < 9) band(P, w.slice(start, end), .5, 1 + idx, 1, { fat: true }); }
    const nf = [6, 10, 16][idx], up = idx === 1;
    for (let j = 0; j < nf; j++) {
      const b = Math.floor(H(j, E.seed, 1) * (E.G + 1)), age = T - b; if (age < 0 || age > 30) continue;
      const u = H(j, E.seed, 2), p0 = E.lin(u), dir = (up ? V(0, 1, 0) : E.swing).clone().addScaledVector(camDir(P, H(j, E.seed, 3) * 6.28), .55).normalize();
      const D = 1.0 + 1.3 * H(j, E.seed, 5), p = p0.clone().addScaledVector(dir, D * (1 - Math.exp(-age * .3)));
      p.y -= (age > 8 ? Math.pow(age - 8, 1.25) * .022 : 0) * (.6 + H(j, 6)); p.x += Math.sin(age * .45 + j) * .05 * Math.min(1, age / 8);
      const fr = Math.floor(age / 2 + j) % 4, a = 1 - Math.max(0, age - 22) / 8;
      P.sprite(featherTex(fr), p, .42, a, { rot: Math.sin(age * .3 + j) * .8 + j });
    }
    dustBurst(P, E, T, 40, { life: 26, d0: .5, d1: 1.7, fall: 1.2, span: E.G + 2, dir: up ? V(0, 1, 0) : null });
    if (idx === 2 && A >= 0) { const g = E.tips[L]; for (let q = 0; q < 18; q++) { const age = A - Math.floor(H(q, 3) * 6); if (age < 0 || age > 18) continue; const th = H(q, 4) * 6.28 + age * .3, r = .2 + .5 * H(q, 5), y = .04 + age * .04 * H(q, 6); puff(P, V(g.x * .3 + Math.cos(th) * r, y, lunge(i) + 1.2 + Math.sin(th) * r * .8), DOT * 1.7, 1 - age / 19, '#CDEFFC'); } }
    const h = T - E.hitT;
    if (h >= 0 && h <= 10) for (let q = 0; q < 4; q++) { const th = q * 1.7 + .6, p = E.hitPos.clone().addScaledVector(camDir(P, th), .7 * (1 - Math.exp(-h * .35))); p.y -= h * .01; P.sprite(featherTex((h + q) % 4), p, .38, 1 - h / 11, { rot: q + h * .3 }); }
    baseHit(P, E, T);
  },
};
