// 虹 v3: 刀身が にじ色に光り、白い芯で ふちが 分光した 弧が 体の まわりを 流れ、体の うしろで スターバースト、星くずが 漂う
// 段ごとに 強く: つき = 刀身＋弧 1 本＋ちり / きりあげ = 弧 2 本 / けさ = 弧 3 本＋スターバースト＋ちり多め。粒は 丸い 点と 十字の 小さな 星
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, smooth, perpTo, camDir, lunge, swordWorld } from './lib.js';
import { baseHit, starTex, glowTex, DOT } from './fx2-common.js';
const SPEC = ['#FF1F3D', '#FF8A00', '#FFE600', '#00E060', '#00B4FF', '#2E5CFF', '#B030FF'], EDGE = '#2A2350', WH = '#FFF7E3';
function shiftPts(P, pts, off) { return pts.map((p, k) => { const t = (k === 0 ? pts[1].clone().sub(pts[0]) : k === pts.length - 1 ? p.clone().sub(pts[k - 1]) : pts[k + 1].clone().sub(pts[k - 1])); return p.clone().addScaledVector(perpTo(P, t, p), off(k)); }); }
// 白い 芯＋両ふちに 赤〜紫の 帯（にごらない ふつう重ね）。芯と にじみだけ 加算
function prism(P, pts, wf, a = 1, alphaFn = null, halo = false) {
  const al = (u, k) => (alphaFn ? alphaFn(u, k) : 1) * a, n = pts.length, N = 7;
  P.ribbon(pts, (u, k) => wf(u, k) * 1.12 + DOT * 3, EDGE, .85 * a, { });
  if (halo) { P.add(true); P.ribbon(pts, (u, k) => wf(u, k) * 5, pts.map((_, k) => SPEC[(k * 2 + 1) % 7]), .38 * a, { soft: true }); P.ribbon(pts, (u, k) => wf(u, k) * 8, '#FFFFFF', .12 * a, { soft: true }); P.add(false); }
  for (let j = 0; j < N; j++) {
    const o = (j - (N - 1) / 2) / N, pp = shiftPts(P, pts, k => o * wf(k / (n - 1), k) * 1.0);
    P.ribbon(pp, (u, k) => wf(u, k) / N * 1.3, j === 3 ? '#FFFFFF' : SPEC[j > 3 ? j - 1 : j], (u, k) => al(u, k));
  }
  P.add(true); P.ribbon(pts, (u, k) => wf(u, k) * .3, '#FFFFFF', .95 * a, {}); P.ribbon(pts, (u, k) => wf(u, k) * 1.9, '#BFD8FF', .22 * a, { soft: true }); P.add(false);
}
// 1 つの 粒の 中に 虹: 中心が 白、外へ 赤→だいだい→黄→緑→青→むらさきの 同心の しま
const RING = ['#B030FF', '#2E5CFF', '#00B4FF', '#00E060', '#FFE600', '#FF8A00', '#FF1F3D', '#FFFFFF'], RF = [1, .86, .72, .58, .44, .32, .2, .09];
const dotRB = (P, p, r, a = 1) => { r = Math.max(r, DOT * 2.5); P.disc(p, r + DOT * .6, EDGE, a * .85, false, 12); for (let j = 0; j < 8; j++) P.disc(p, r * RF[j], RING[j], a, false, 12); };
// 十字の 星: 芯が 白、4 本の 腕に そって 白→赤→黄→緑→青→むらさき
const ARM = ['#FFFFFF', '#FF1F3D', '#FFE600', '#00E060', '#2E5CFF', '#B030FF'];
function crossStar(P, p, sz, a = 1, rot = 0) {
  for (let k = 0; k < 4; k++) {
    const d = camDir(P, rot + k * Math.PI / 2), pts = [0, .2, .4, .65, .85, 1].map(f => p.clone().addScaledVector(d, sz * f * (k % 2 ? .75 : 1)));
    P.ribbon(pts, [DOT * 2.2, DOT * 2, DOT * 1.7, DOT * 1.2, DOT * .8, DOT * .3], EDGE, .8 * a);
    P.ribbon(pts, [DOT * 1.4, DOT * 1.3, DOT * 1.1, DOT * .8, DOT * .5, DOT * .15], ARM, a);
  }
  dotRB(P, p, DOT * 2.5, a);
}
export const makeNJ = (glow) => ({
  life: 36, pre: 8,
  draw(P, E, T, i) {
    const L = E.L, A = T - L, idx = E.idx, st = idx + 1, C = V(0, 1.1, lunge(i) + .15);
    // ① 刀身が プリズムの にじ色に 光る
    if (T >= -6 && T <= L + 3) {
      const { tip, base } = swordWorld(i), d = tip.clone().sub(base).normalize(), end = tip.clone().addScaledVector(d, .3), a0 = smooth((T + 6) / 3) * (1 - smooth((T - L) / 3));
      const pts = [0, .25, .5, .75, 1].map(f => base.clone().lerp(end, f));
      prism(P, pts, (u) => .2 * Math.max(.3, Math.sin(Math.PI * clamp(u * .92 + .04))), a0, null, glow);
      crossStar(P, end, .22, a0, T * .1);
      for (let q = 0; q < 4; q++) { const f = (H(q, 8) + T * .09 * (1 + q * .2)) % 1, p = base.clone().lerp(end, f); crossStar(P, p, .08 + .05 * H(q, 9), a0, q + T * .05); }
    }
    // ② わざの終わり: 刀の通り道に フレアが 順に 1・2・3 つ（ずらして、大きさも ばらばら）
    const nF = idx + 1, mult = [[1], [1, .65], [.5, .85, .65]][idx], perm = (idx === 2 ? [[0, 2, 1], [1, 0, 2], [2, 1, 0], [1, 2, 0]][Math.floor(H(E.seed, 31) * 4)] : idx === 1 ? (H(E.seed, 32) > .5 ? [0, 1] : [1, 0]) : [0]);
    let dly = 0;
    for (let f = 0; f < nF; f++) {
      if (f > 0) dly += 4 + Math.floor(H(E.seed, f, 33 + idx) * 5);
      const t = T - L - dly, m = mult[perm[f]];
      if (t < -1 || t > 15) continue;
      const back = f === 0 ? 0 : 3 + Math.floor(H(E.seed, f, 35 + idx) * 7), sw = swordWorld(Math.max(0, i - (T - L) - back)), dd = sw.tip.clone().sub(sw.base).normalize();
      const O = sw.tip.clone().addScaledVector(dd, .25).addScaledVector(P.camR, (H(E.seed, f, 36) - .5) * .3 * (f > 0)).addScaledVector(P.camU, (H(E.seed, f, 37) - .5) * .3 * (f > 0));
      const S = [.6, .85, .95][idx] * m * clamp(O.distanceTo(P.eye) / 3.3, .4, 1) * (f === 0 && idx === 0 ? .85 : 1), grow = easeOut(clamp((t + 1) / 5)), fade = t > 7 ? 1 - (t - 7) / 8 : 1, g = grow * S;
      const nr = Math.round([12, 18, 26][idx] * (.6 + .4 * m));
      for (let q = 0; q < nr; q++) {
        const th = q / nr * 6.283 + H(q, 1) * .12, d = camDir(P, th), long = q % 2 === 0, len = (long ? 1.0 + .6 * H(q, 2) : .45 + .25 * H(q, 3)) * g, r0 = .08 * S, hue = SPEC[q % 7];
        const pts = [0, .25, .5, .75, 1].map(f => O.clone().addScaledVector(d, r0 + len * f));
        const w = long ? 1 : .7;
        P.ribbon(pts, [DOT * 1.6 * w, DOT * 3.1 * w, DOT * 4.2 * w, DOT * 2.8 * w, DOT * .8], EDGE, .7 * fade);
        P.ribbon(pts, [DOT * 1 * w, DOT * 2.3 * w, DOT * 3.2 * w, DOT * 2 * w, DOT * .4], ['#FFFFFF', SPEC[0], SPEC[2], SPEC[4], SPEC[6]], fade);
      }
      if (glow) { P.add(true); P.disc(O, 1.0 * g, '#FFFFFF', .28 * fade, true, 20); for (let j = 0; j < 7; j++) P.disc(O, (.5 + j * .1) * g * 1.15, SPEC[j], .2 * fade, true, 18); P.disc(O, .45 * g, '#FFFFFF', .7 * fade, true, 18); P.add(false); }
      P.add(true); P.disc(O, .22 * g + .03, '#FFFFFF', .95 * fade, true, 16); P.disc(O, .55 * g, '#BFD8FF', .35 * fade, true, 18); P.add(false);
      // 光の輪（にじ色）
      const nrg = idx === 0 ? 0 : m > 1 ? 2 : 1;
      for (let k = 0; k < nrg; k++) {
        const R = (.4 + k * .3) * g, pts = []; for (let q = 0; q <= 40; q++) pts.push(O.clone().addScaledVector(camDir(P, q / 40 * 6.283), R));
        P.ribbon(pts, DOT * 3.2, EDGE, .6 * fade * (1 - k * .2));
        for (let j = 0; j < 7; j++) { const rr = R + (j - 3) * DOT * .9, pp = []; for (let q = 0; q <= 40; q++) pp.push(O.clone().addScaledVector(camDir(P, q / 40 * 6.283), rr)); P.ribbon(pp, DOT * 1.1, SPEC[j], .9 * fade); }
      }
      // レンズフレア: 画面の 一直線に ならぶ 丸い 光
      const ld = camDir(P, -.55 + idx * .1), no = Math.round([2, 3, 4][idx] * (.7 + .3 * m));
      for (let q = 0; q < no; q++) {
        const off = (q - 1) * (.35 + .2 * H(q, 4)) * g * 1.3, rr = (.05 + .09 * H(q, 5)) * (.6 + S * .5);
        dotRB(P, O.clone().addScaledVector(ld, off), rr, .9 * fade);
        if (q % 2) { P.add(true); P.disc(O.clone().addScaledVector(ld, off), rr * 1.8, '#BFD8FF', .22 * fade, true, 10); P.add(false); }
      }
      // 星くず
      const nd = [5, 7, 11][idx];
      for (let q = 0; q < nd; q++) {
        const th = H(q, 3, E.seed, f) * 6.283, v = (.3 + 1.1 * H(q, 5)) * S, p = O.clone().addScaledVector(camDir(P, th), v * (1 - Math.exp(-(t + 1) * .3)) + .05).add(V(0, -.02 * t, 0)), a = fade * (.6 + .4 * Math.sin(t + q));
        if (q % 3 === 0) crossStar(P, p, .09 + .06 * H(q, 6), a, q * .7 + t * .08);
        else dotRB(P, p, DOT * (2.5 + H(q, 7) * 1.6), a);
      }
    }
    // 当てた とき: 丸い にじ色の 点
    const h = T - E.hitT;
    if (h >= 0 && h < 12) for (let q = 0; q < 9; q++) { const d = camDir(P, H(q, 9, E.idx) * 6.28), D = (.3 + .6 * H(q, 3)) * (1 - Math.exp(-h * .4)); dotRB(P, E.hitPos.clone().addScaledVector(d, D), DOT * (2.5 + 1.5 * H(q, 5)), 1 - h / 12); }
    baseHit(P, E, T);
  },
});
export const NJ = makeNJ(false);

