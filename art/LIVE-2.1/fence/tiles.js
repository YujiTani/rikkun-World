// とりごや の さく・もん 板 の 絵（1 ブロック = 16 点。ゲーム の 草花 の 絵 と 同じ 細かさ）
// y は 地面 から の 行（0 = いちばん 下）。
export function makeTile(w, h) {
  const px = new Array(w * h).fill(null);
  const t = {
    w, h, px,
    set(x, yb, c) { if (x < 0 || x >= w || yb < 0 || yb >= h) return; px[(h - 1 - yb) * w + x] = c; },
    rect(x, yb, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) t.set(x + i, yb + j, c); },
    get(x, yb) { return px[(h - 1 - yb) * w + x]; },
  };
  return t;
}
export function toCanvas(t, scale = 1) {
  const c = document.createElement('canvas');
  c.width = t.w * scale; c.height = t.h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const v = t.px[y * t.w + x]; if (!v) continue;
    g.fillStyle = v; g.fillRect(x * scale, y * scale, scale, scale);
  }
  return c;
}

const W = { L: '#C9A574', LH: '#D8B98C', LD: '#A98A5C', P: '#9E7C50', PH: '#B08D5E', PD: '#86683F', LIN: '#7A5434', LINH: '#8E6644' };
const NOREN = '#3D5A9E', NORD = '#2F4A86', HEM = '#EFE7D4';

// ---------- A: ＋十字 の 板さく（よこ木 3 本 ＋ まん中 の くい）----------
// l / r: その がわ に よこ木 を のばす か
export function aRail(l, r) {
  const t = makeTile(16, 32);
  for (const y of [4, 11, 18]) {
    if (l) { t.rect(0, y + 1, 7, 1, W.LH); t.rect(0, y, 7, 1, W.LD); }
    if (r) { t.rect(9, y + 1, 7, 1, W.LH); t.rect(9, y, 7, 1, W.LD); }
  }
  // くい（4 点 はば、上 は まるく）
  t.rect(6, 0, 1, 21, W.PH); t.rect(7, 0, 2, 21, W.P); t.rect(9, 0, 1, 21, W.PD);
  t.rect(7, 21, 2, 1, W.PH);
  // くい の 木目 1 点
  t.set(8, 8, W.PD); t.set(7, 15, W.PD);
  return t;
}
export function aGate() {
  const t = makeTile(24, 32);
  for (const x0 of [3, 18]) { t.rect(x0, 0, 1, 29, W.PH); t.rect(x0 + 1, 0, 1, 29, W.P); t.rect(x0 + 2, 0, 1, 29, W.PD); }
  t.rect(0, 28, 24, 2, W.LIN); t.rect(0, 30, 24, 1, W.LINH); t.set(0, 28, null); t.set(23, 28, null);
  noren(t, 6, 18);
  return t;
}
function noren(t, x0, x1, hemCol = HEM) {
  // 3 まい（すき間 1 点）、たて 10 点、すそ 1 点 生成り
  const pieces = [[x0, x0 + 3], [x0 + 4, x0 + 8], [x0 + 9, x1]];
  for (const [a, b] of pieces) {
    for (let x = a; x < b; x++) {
      t.rect(x, 18, 1, 10, x === b - 1 ? NORD : NOREN);
      t.set(x, 18, hemCol);
    }
  }
}
export function postOnly(wPx = 4, hPx = 21, c = W) {
  const t = makeTile(wPx, 32);
  t.rect(0, 0, 1, hPx, c.PH); t.rect(1, 0, wPx - 2, hPx, c.P); t.rect(wPx - 1, 0, 1, hPx, c.PD);
  return t;
}

// ---------- B: X十字 の よつめがき（たけ ＋ 藍 の むすび）----------
const B = { L: '#CDB86E', D: '#A38F4C', N: '#8C7A3E', H: '#DCCB8A', PH: '#CDB86E', P: '#B8A35A', PD: '#8C7A3E' };
export function bLattice() {
  const t = makeTile(16, 32);
  for (const [x, top] of [[3, 21], [11, 20]]) {
    t.rect(x, 0, 1, top, B.L); t.rect(x + 1, 0, 1, top - 1, B.D);
    t.set(x, 7, B.N); t.set(x + 1, 7, B.N); t.set(x, 14, B.N); t.set(x + 1, 14, B.N);
  }
  for (const y of [5, 12, 18]) {
    t.rect(0, y + 1, 16, 1, B.H); t.rect(0, y, 16, 1, B.D);
    if (y === 18) for (const x of [5, 13]) { t.set(x, y, NOREN); t.set(x, y + 1, NOREN); }
  }
  return t;
}
export function bGate() {
  const t = makeTile(24, 32);
  for (const x0 of [3, 18]) { t.rect(x0, 0, 1, 29, B.L); t.rect(x0 + 1, 0, 2, 29, B.D); t.set(x0, 10, B.N); t.set(x0 + 1, 10, B.N); t.set(x0 + 2, 10, B.N); t.set(x0, 20, B.N); t.set(x0 + 1, 20, B.N); t.set(x0 + 2, 20, B.N); }
  t.rect(0, 30, 24, 1, B.H); t.rect(0, 29, 24, 1, B.L); t.rect(0, 28, 24, 1, B.D);
  for (const x of [5, 6, 18, 19]) t.rect(x, 27, 1, 1, NOREN);
  t.rect(4, 28, 1, 3, NOREN); t.rect(19, 28, 1, 3, NOREN);
  noren(t, 6, 18);
  return t;
}

// ---------- C: X十字 の 花がき（しげみ ＋ くい ＋ なわ）----------
const G = { T: '#B7D65A', H: '#8CC24A', M: '#4E9A36', D: '#3E8B2F' };
const FY = '#F2C94C', FO = '#E8962E', FC = '#FFF3B0', ROPE = '#D9C9A0', ROPED = '#B8A57E';
const BUSH = [8, 9, 10, 10, 9, 10, 11, 11, 10, 9, 10, 11, 10, 9, 9, 8];
export function cHedge() {
  const t = makeTile(16, 32);
  // くい（まん中、なわ より 上 に 2 点）
  t.rect(7, 0, 1, 19, W.PH); t.rect(8, 0, 1, 19, W.PD); t.set(7, 19, W.P); t.set(8, 19, W.P);
  // なわ（たるみ 1 点）
  for (let x = 0; x < 16; x++) {
    const y = (x < 3 || x > 12) ? 17 : 16;
    if (x === 7 || x === 8) { t.set(x, 17, ROPE); continue; }
    t.set(x, y, ROPE);
  }
  // しげみ（くい の 前）
  for (let x = 0; x < 16; x++) {
    const top = BUSH[x];
    for (let y = 0; y < top; y++) {
      let c = y < 3 ? G.D : y < top - 2 ? G.M : G.H;
      if (y === top - 1) c = G.T;
      if ((x * 7 + y * 3) % 11 === 0 && y > 2 && y < top - 1) c = G.D;
      t.set(x, y, c);
    }
  }
  // はな（き・だいだい）
  for (const [x, c] of [[2, FY], [6, FO], [11, FY], [14, FO]]) {
    const y = BUSH[x];
    t.set(x, y, c); t.set(x - 1, y - 1, c); t.set(x + 1, y - 1, c); t.set(x, y - 2, c); t.set(x, y - 1, FC);
  }
  return t;
}
export function cGate() {
  const t = makeTile(24, 32);
  for (const x0 of [3, 18]) {
    t.rect(x0, 0, 1, 28, W.PH); t.rect(x0 + 1, 0, 1, 28, W.P); t.rect(x0 + 2, 0, 1, 28, W.PD);
    // つた
    for (let y = 1; y < 28; y += 3) { t.set(x0 + ((y / 3) % 2 ? 0 : 2), y, G.M); t.set(x0 + 1, y + 1, G.H); }
  }
  // かさ木 を しげみ で つつむ（はな の アーチ）
  for (let x = 0; x < 24; x++) {
    const bump = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0][x];
    for (let y = 27; y < 28 + bump; y++) t.set(x, y, y === 27 + bump ? G.T : y < 28 ? G.D : G.M);
  }
  for (const [x, c] of [[2, FO], [6, FY], [11, FO], [16, FY], [21, FO]]) {
    const y = 28 + [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 0][x];
    t.set(x, y, c); t.set(x - 1, y - 1, c); t.set(x + 1, y - 1, c); t.set(x, y - 2, c); t.set(x, y - 1, FC);
  }
  noren(t, 6, 18);
  return t;
}

// ---------- 草花（くらべ）----------
export function kusa() {
  const t = makeTile(16, 16);
  for (const [x, top, lean] of [[2, 9, -1], [4, 7, 0], [6, 10, 1], [8, 8, 0], [10, 9, -1], [12, 7, 1], [14, 10, 0]]) {
    for (let r = top; r < 16; r++) {
      const k = (r - top) / (16 - top); const xx = x + (k < 0.4 ? lean : 0);
      t.set(xx, 15 - r, r === top ? G.T : r < top + 2 ? G.H : G.M);
      if (r > 13) t.set(xx + 1, 15 - r, G.D);
    }
  }
  return t;
}
export function flower() {
  const t = makeTile(16, 16);
  for (const [x, top] of [[3, 12], [8, 9], [12, 11]]) {
    for (let r = top; r < 16; r++) t.set(x, 15 - r, G.D);
    t.rect(x - 1, 15 - top, 3, 3, FY); t.set(x, 15 - top + 1, FC);
  }
  return t;
}
export function grassTop() {
  const t = makeTile(16, 16);
  let s = 11;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = rnd();
    t.set(x, y, v < 0.18 ? '#55B03B' : v > 0.86 ? '#66C247' : '#5DBB3F');
  }
  return t;
}
