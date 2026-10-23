// 風神剣 v3: 振るたびに 風の 帯が 体の まわりを 1〜1.5 周 まわって 消える（W1 帯 1 本 / W2 帯 2 本 ミントと ラベンダー）
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, lunge } from './lib.js';
import { baseHit, brushTex, DOT } from './fx2-common.js';
// 3 段の 軌道の かたむき（φ = z まわり、ψ = x まわり）。つき = 水平に 近い・きりあげ = ななめ上・けさ = 逆の ななめ
const TILT = [{ phi: .12, psi: .12, th0: -.6 }, { phi: .42, psi: .85, th0: -1.9 }, { phi: -.55, psi: .4, th0: .5 }];
const RA = [1.4, 1.45, 1.6];
function basis(t, rot = 0) { const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(t.psi + rot * .3, 0, t.phi + rot * .25, 'ZXY')); return [V(1, 0, 0).applyMatrix4(m), V(0, 0, 1).applyMatrix4(m)]; }
function orbit(P, E, T, i, o) {
  const t = TILT[E.idx], [e1, e2] = basis(t, o.rot), C = V(0, 1.0 + (o.dy || 0), lunge(i) + .15), ra = RA[E.idx] * o.k, rb = ra * .72;
  const life = 24, tt = T; if (tt < 0 || tt > life) return;
  const turns = 1.3, prog = easeOut(clamp(tt / 20)) * .75 + clamp(tt / 20) * .25;
  const head = t.th0 + o.off + 6.283 * turns * prog, S = 3.5 * Math.min(1, (tt + 1) / 4) * (1 - smooth((tt - 13) / 9));
  if (S < .15) return;
  const n = 44, pts = []; for (let k = 0; k < n; k++) { const th = head - S * (1 - k / (n - 1)); const r = 1 + .06 * Math.sin(th * 2 + o.off); pts.push(C.clone().addScaledVector(e1, Math.cos(th) * ra * r).addScaledVector(e2, Math.sin(th) * rb * r)); }
  const dC = C.distanceTo(P.eye), tex = brushTex(o.seed, o.pal);
  const wmax = .42 * o.wk * (E.idx === 2 ? 1.15 : 1);
  const wf = (u, k) => wmax * 1.25 * Math.max(.03, Math.pow(Math.sin(Math.PI * Math.pow(u, .75)), .9)) * (1 + .1 * Math.sin(k * 1.9 + o.off));
  const al = (u, k) => (pts[k].distanceTo(P.eye) > dC + .15 ? .6 : 1) * (tt > 18 ? 1 - (tt - 18) / 6 : 1);
  const rep = Math.max(1, S * ra * 1.2 / 4);
  P.brush(pts, wf, tex.edge, { rep, a: (u, k) => al(u, k) * .95, ro: 9, scroll: o.seed * .13 });
  P.brush(pts, wf, tex.body, { rep, a: al, ro: 10, scroll: o.seed * .13 });
  // 芯だけ 加算
  P.add(true); P.ribbon(pts, (u, k) => wf(u, k) * .22, o.core, .9, { soft: false }); P.add(false);
  // ちりを 少し（ふつう重ね・こいふち）
  for (let q = 0; q < 6; q++) { const k = Math.floor(H(q, o.seed, E.idx) * (n - 4)) + 2, p = pts[k].clone().addScaledVector(V(0, 1, 0), .1 * Math.sin(q + tt * .3)); P.quad(p, DOT * 3.2, o.edge, .85 * al(0, k)); P.quad(p, DOT * 2, o.dust, al(0, k)); }
}
const MINT = { pal: 'mint', core: '#F4FFFB', edge: '#14675C', dust: '#7FE0C0' }, LAV = { pal: 'lav', core: '#FFFFFF', edge: '#3A2578', dust: '#C9B0FF' }, SKY = { pal: 'sky', core: '#FFFFFF', edge: '#1E5E9A', dust: '#A9E2FF' };
// つき = 帯 1 本・きりあげ = 2 本・けさ = 3 本（ミント・ラベンダー・水色）
export const W = {
  life: 26,
  draw(P, E, T, i) {
    const cols = [MINT, LAV, SKY], n = E.idx + 1;
    for (let j = 0; j < n; j++) orbit(P, E, T, i, { ...cols[j], k: 1 - j * .1, wk: 1 - j * .08, off: j * 6.283 / n, rot: j, dy: j * .06, seed: j + 1 + E.idx * 3 });
    baseHit(P, E, T);
  },
};
