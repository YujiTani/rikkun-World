// 第 2 版（1/32 の 細かさ・加算の 光）の 共通: 絵（テクスチャ）・白い 斬撃の 当てた 火花
import * as THREE from 'three';
import { V, H, clamp, lerp, easeOut, pixTex, camDir } from './lib.js';
export const DOT = 1 / 32;
const cache = {};
const rgb = h => { const c = new THREE.Color(h); return c; };
// 段の ある 光の たま（芯 → からだ → 網 2 段）。加算で 使う
export function glowTex(hex, key = hex) {
  if (cache['g' + key]) return cache['g' + key];
  return cache['g' + key] = pixTex(64, 64, put => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5) / 32, chk = (x + y) % 2 === 0, sp = (x % 2 === 0 && y % 2 === 0);
      if (d < .16) put(x, y, '#FFFFFF'); else if (d < .34) put(x, y, hex); else if (d < .55) put(x, y, hex, .55); else if (d < .78) { if (chk) put(x, y, hex, .35); } else if (d < 1) { if (sp) put(x, y, hex, .3); }
    }
  });
}
// 筆の かすれの 帯（よこ 128 × たて 24。まん中 16）。body = 加算用、edge = こい ふち（ふつう重ね）
export function brushTex(seed = 1) {
  const k = 'b' + seed; if (cache[k]) return cache[k];
  const W = 128, Hh = 24, mask = [];
  for (let x = 0; x < W; x++) {
    const n = .5 + .5 * Math.sin(x * .21 + seed) * Math.cos(x * .07 + seed * 2), e = Math.round(9.6 * (.6 + .4 * n * (H(x >> 1, seed) * .5 + .75)));
    for (let y = 0; y < Hh; y++) { const dy = Math.abs(y - 11.5), edgeFrac = dy / Math.max(1, e); let on = dy < e; if (on && dy > e - 3) { if (H(x >> 1, y, seed) > .9 - (dy - (e - 3)) * .28) on = false; } if (on && H(x, y >> 1, seed, 5) > .985) on = false; mask[y * W + x] = on ? edgeFrac : -1; }
  }
  const body = pixTex(W, Hh, put => {
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const f = mask[y * W + x]; if (f < 0) continue;
      const lite = H(x >> 2, y, seed, 9) > .8 ? .12 : 0;
      put(x, y, f < .28 + lite ? '#F4FFFB' : f < .5 + lite ? '#BFF5E3' : f < .78 ? '#7FE0C0' : '#2BB39A');
    }
  });
  const edge = pixTex(W, Hh, put => {
    const on = (x, y) => x >= 0 && x < W && y >= 0 && y < Hh && mask[y * W + x] >= 0;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { if (on(x, y)) continue; let hit = false; for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2; dx++) if (on(x + dx, y + dy)) { hit = true; break; } if (hit) put(x, y, '#14675C'); }
  });
  for (const t of [body, edge]) { t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; }
  return cache[k] = { body, edge };
}
// 4 つとがりの 星（5 コマ: ひらく → とじる）。加算
export function starTex(hex, f) {
  const k = 's' + hex + f; if (cache[k]) return cache[k];
  const L = [.25, .55, 1, .65, .35][f];
  return cache[k] = pixTex(64, 64, put => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = Math.abs(x - 31.5) / 32, dy = Math.abs(y - 31.5) / 32;
      const a = Math.pow(dx / (L * .5 + .02), .5) + Math.pow(dy / (L * .5 + .02), .5);   // 4 つとがり
      const small = Math.pow(dx / (L * .18 + .02), .5) + Math.pow(dy / (L * .18 + .02), .5);
      const r = Math.hypot(dx, dy) / (L * .3 + .03);
      if (r < .35 || small < .9) put(x, y, '#FFFFFF'); else if (a < .75) put(x, y, hex); else if (a < .95) put(x, y, '#2A2350'); else if (a < 1.5 && (x + y) % 2 === 0 && a < 1.2) put(x, y, hex, .5);
    }
  });
}
// はね（12×12 点を 細かく。4 コマで ひらひら）
export function featherTex(f) {
  const k = 'f' + f; if (cache[k]) return cache[k];
  const sq = [1, .6, .25, .6][f];
  return cache[k] = pixTex(32, 32, put => {
    const S = new Map();
    for (let t = 0; t <= 1; t += .005) {
      const cx = 4 + t * 24, cy = 28 - t * 24, hw = Math.sin(Math.PI * Math.pow(t, .8)) * 4.2 * sq;
      for (let s = -hw; s <= hw; s += .5) { const x = Math.round(cx + s * .7), y = Math.round(cy + s * .7); S.set(x + ',' + y, Math.abs(s) < hw * .25 ? '#FFFFFF' : (Math.abs(s) < hw * .7 ? '#BFF5E3' : '#7FE0C0')); }
      S.set(Math.round(cx) + ',' + Math.round(cy), '#FFFFFF');
    }
    for (const kk of [...S.keys()]) { const [x, y] = kk.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!S.has((x + dx) + ',' + (y + dy))) S.set((x + dx) + ',' + (y + dy) + '!', '#14675C'); }
    for (const [kk, c] of S) { const [a, b] = kk.replace('!', '').split(',').map(Number); if (!kk.endsWith('!')) put(a, b, c); }
    for (const [kk, c] of S) if (kk.endsWith('!')) { const [a, b] = kk.replace('!', '').split(',').map(Number); put(a, b, c, 1); }
  });
}
// ---- 白い 斬撃の 当てた ときの 火花（全部の 刀）: すじ 6〜8（うち 2 は 後ろへ）＋ まん中の 光。数・速さ・止まり方は nijiSlash3.json の spark
export function baseHit(P, E, T) {
  const h = T - E.hitT; if (h < 0 || h > 18) return;
  const c = E.hitPos, th0 = Math.atan2(E.swing.dot(P.camU), E.swing.dot(P.camR)), n = 7;
  // まん中の 光 1.0 ブロック（2・2・3 ステップ）
  const fl = h < 2 ? 0 : h < 4 ? 1 : h < 7 ? 2 : -1; const fi = h < 2 ? 0 : h < 4 ? 1 : h < 7 ? 2 : -1;
  if (h < 7) { const sz = [1.0, .78, .5][fi]; P.sprite(glowTex('#BFE4FF', 'hitflash'), c, sz, 1, { add: true }); P.disc(c, sz * .16, '#FFFFFF', 1); }
  for (let q = 0; q < n; q++) {
    const back = q >= n - 2, ang = th0 + (back ? Math.PI + (H(q, E.seed, 1) - .5) * .5 : (H(q, E.seed, 2) * 2 - 1) * .87);
    const sp = 9 / 60 * (1 + (H(q, E.seed, 3) * 2 - 1) * .2) * (back ? .6 : 1), life = 14 + Math.round((H(q, E.seed, 4) * 2 - 1) * 3);
    if (h > life) continue;
    let D = 0, v = sp; for (let a = 0; a < h; a++) { D += v; v *= .86; }
    const d = camDir(P, ang), short = h >= life * .5, len = (short ? .22 : .5) * (back ? .7 : 1);
    const head = c.clone().addScaledVector(d, .12 + D), tail = head.clone().addScaledVector(d, -Math.min(len, .12 + D));
    const fade = 1 - Math.max(0, h - life * .6) / (life * .4);
    P.ribbon([tail, tail.clone().lerp(head, .6), head], [.002, .03, .008], '#1B2A4A', .9 * fade);
    P.add(true).ribbon([tail, tail.clone().lerp(head, .6), head], [.003, .05, .012], '#7FB8F0', .45 * fade, { soft: true });
    P.ribbon([tail, tail.clone().lerp(head, .6), head], [.002, .028, .006], ['#BFE4FF', '#FFFFFF', '#FFFFFF'], fade); P.add(false);
  }
}
