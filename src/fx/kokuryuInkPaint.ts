/**
 * 黒龍の 墨の すじ（LEGEND-4 PR1）の 絵を 1 枚 つくる（起動の とき 1 回。毎フレームは 動かさない）。純粋な 計算（three も DOM も 使わない）。
 *
 * 出どころ: patch-gg/pixelfx（https://github.com/patch-gg/pixelfx）の `src/fx/projectiles/rocket.js` の けむりの 部分
 * （puff の 並べ方・`cloud()` = 丸い けむりを 足して 1 つの かたまりに し、上から 光が 当たる 面だけ 明るくする 塗り方・`blur()`・色の 段）を TypeScript に 写して 作り直した。
 * ミサイルの 本体・炎の ふきだしは 入れない（水色の さし色は けむりの 光り と 小さな ひばな）。
 * rocket.js の けむりは Sprite Fusion の explosion（https://www.spritefusion.com/pixel-art-vfx/explosion、MIT License、Copyright (c) 2026 Hugo Duprez）から。
 * ライセンス: MIT License, Copyright (c) 2026 Patch / Hugo Duprez（全文は リポジトリ直下の THIRD-PARTY-NOTICES.md）。
 */

/** 絵の よこ・たて（点）。1 点 = 1/32 ブロック（docs/art/design/05-effects.md §18.6）。よこ 512 点 = 16 ブロック。右はし = 矢の 先 */
export const INK_STRIP_W = 512;
export const INK_STRIP_H = 64;
/** 1 点の 大きさ（ブロック） */
export const INK_PX_BLOCK = 1 / 32;

const hex = (h: string): number => parseInt(h.slice(1), 16);
const red = (c: number): number => (c >> 16) & 255;
const green = (c: number): number => (c >> 8) & 255;
const blue = (c: number): number => c & 255;
const rgb = (r: number, g: number, b: number): number => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number): number => {
  const k = clamp(t);
  return rgb(red(a) + (red(b) - red(a)) * k, green(a) + (green(b) - green(a)) * k, blue(a) + (blue(b) - blue(a)) * k);
};
/** 色の 段を n 個に そろえる */
const fit = (r: readonly number[], n: number): number[] => (r.length === n ? [...r] : Array.from({ length: n }, (_, i) => r[Math.round((i * (r.length - 1)) / Math.max(1, n - 1))]!));
const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 整数から 決まる 乱数 [0, 1)（シード付き。pixelfx の hash と 同じ 形） */
function hash(...ns: number[]): number {
  let h = 0x9e3779b9;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
const rand = (...ns: number[]): number => hash(...ns) / 4294967296;
const range = (lo: number, hi: number, ...ns: number[]): number => lo + (hi - lo) * rand(...ns);

/** 色の 表（c2.json）: 水色 9 段（さし色）・けむり 黒 7 段 */
const CYAN = fit(['#05060a', '#0a1018', '#0f2a3c', '#16506e', '#2a8cb8', '#5cc8e8', '#a8ecff', '#e8fbff', '#ffffff'].map(hex), 9);
const SMOKE = fit(['#030306', '#08080e', '#10101a', '#1a1a26', '#262634', '#343444', '#4a4a5c'].map(hex), 7);
/** 水色の 光を うけた けむり（わかい けむりが 寄る 段） */
const LIT = [mix(CYAN[0]!, SMOKE[0]!, 0.5), mix(CYAN[1]!, SMOKE[1]!, 0.45), mix(CYAN[2]!, SMOKE[2]!, 0.35), CYAN[3]!, CYAN[4]!, CYAN[6]!, CYAN[7]!];

interface Puff {
  x: number;
  y: number;
  r: number;
  /** こさ 0..1 */
  a: number;
  /** あかるさ 0..1 */
  b: number;
  /** 水色の 光 0..1（わかい けむりほど 強い） */
  w: number;
}

/** 1 次元の はこ ぼかし（pixelfx `blur`） */
function blur(src: Float32Array, w: number, h: number, step: number, r: number): Float32Array {
  const out = new Float32Array(src.length);
  const n = step === 1 ? w : h;
  const lines = step === 1 ? h : w;
  const k = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = step === 1 ? l * w : l;
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += j >= 0 && j < n ? src[base + j * step]! : 0;
    for (let j = 0; j < n; j++) {
      out[base + j * step] = acc * k;
      const a = j - r;
      const b = j + r + 1;
      if (a >= 0) acc -= src[base + a * step]!;
      if (b < n) acc += src[base + b * step]!;
    }
  }
  return out;
}

/** RGBA（透明 = 0）の 1 点に 色 c を こさ a で のせる（pixelfx `blendPx`） */
function blendPx(buf: Uint8ClampedArray, x: number, y: number, c: number, a: number): void {
  if (a <= 0.004 || x < 0 || y < 0 || x >= INK_STRIP_W || y >= INK_STRIP_H) return;
  const i = (y * INK_STRIP_W + x) * 4;
  const da = buf[i + 3]! / 255;
  const oa = a + da * (1 - a);
  const k = a / oa;
  buf[i] = red(c) * k + buf[i]! * (1 - k);
  buf[i + 1] = green(c) * k + buf[i + 1]! * (1 - k);
  buf[i + 2] = blue(c) * k + buf[i + 2]! * (1 - k);
  buf[i + 3] = oa * 255;
}

/** けむりの 丸い かたまりを 足して 1 つの かたまりに し、上に 向いた 面に 光を 当てる（pixelfx `cloud`） */
function cloud(buf: Uint8ClampedArray, list: readonly Puff[]): void {
  let X0 = Infinity;
  let Y0 = Infinity;
  let X1 = -Infinity;
  let Y1 = -Infinity;
  for (const q of list) {
    X0 = Math.min(X0, Math.floor(q.x - q.r));
    X1 = Math.max(X1, Math.ceil(q.x + q.r));
    Y0 = Math.min(Y0, Math.floor(q.y - q.r));
    Y1 = Math.max(Y1, Math.ceil(q.y + q.r));
  }
  const W = X1 - X0 + 3;
  const H = Y1 - Y0 + 3;
  const D = new Float32Array(W * H);
  const L = new Float32Array(W * H);
  const F = new Float32Array(W * H);
  X0--;
  Y0--;
  for (const q of list) {
    const r = q.r;
    const r2 = r * r;
    for (let y = Math.floor(q.y - r); y <= Math.ceil(q.y + r); y++) {
      const dy = y + 0.5 - q.y;
      for (let x = Math.floor(q.x - r); x <= Math.ceil(q.x + r); x++) {
        const dx = x + 0.5 - q.x;
        const d2 = (dx * dx + dy * dy) / r2;
        if (d2 >= 1) continue;
        // 丸い かたまりの 厚み: まん中は 平ら、ふちは けわしい
        const k = Math.sqrt(1 - d2) * q.a;
        const i = (y - Y0) * W + (x - X0);
        D[i] = D[i]! + k;
        L[i] = L[i]! + k * q.b;
        F[i] = F[i]! + k * q.w * (0.5 + 0.5 * clamp(0.5 + dx / r));
      }
    }
  }
  const B = blur(blur(D, W, H, 1, 2), W, H, W, 2);
  const n = SMOKE.length;
  for (let y = Y0 + 1; y < Y1 + 1; y++) {
    for (let x = X0 + 1; x < X1 + 1; x++) {
      const cx = x - X0;
      const cy = y - Y0;
      if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) continue;
      const i = cy * W + cx;
      const d = D[i]!;
      if (d < 0.05) continue;
      const a = Math.min(0.86, Math.ceil((1 - Math.exp(-d * 1.3)) * 6) / 6);
      if (a < 0.15) continue;
      const gy = B[i + W]! - B[i - W]!;
      const gx = B[i + 1]! - B[i - 1]!;
      const up = clamp(0.5 + Math.atan((gy * 0.9 + gx * 0.35) / (B[i]! * 0.16 + 0.03)) * 0.42 * 1.5);
      const w = F[i]! / d;
      const j = clamp(Math.round((L[i]! / d) * (0.3 + 0.7 * up) * (n - 1) + 0.25 + w * 1.5), 0, n - 1);
      blendPx(buf, x, y, w > 0.03 ? mix(SMOKE[j]!, LIT[j]!, Math.min(0.9, Math.ceil(w * 10) / 10)) : SMOKE[j]!, a);
    }
  }
}

/** 先の まわりの 水色の 光（まるい にじみ。4 段） */
function glow(buf: Uint8ClampedArray, cx: number, cy: number, rx: number, ry: number, c: number, amount: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d >= 1) continue;
      const a = Math.ceil(Math.pow(1 - d, 2) * 4) / 4;
      blendPx(buf, x, y, c, a * amount);
    }
  }
}

/**
 * 墨の すじの 絵（RGBA。`INK_STRIP_W` × `INK_STRIP_H`。透明の 点は 0）。右はし = 矢の 先（ここが いちばん 水色に 光る）、左へ いくほど 黒い けむりが ふくらんで うすく なる。
 * 同じ 絵が いつも 出る（乱数は 整数の 種から。シード付き）
 */
export function paintInkStrip(seed = 5): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(INK_STRIP_W * INK_STRIP_H * 4);
  const W = INK_STRIP_W;
  const midY = INK_STRIP_H / 2;
  const S = 1.3; // 点が 細かい ぶん、けむりの 大きさを ふやす（rocket.js は 1 点 = 1 ドット）
  const list: Puff[] = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    const t = (i + range(0, 0.8, seed, i, 1)) / N; // 0 = 先、1 = 左はし
    const age = t * 1.15;
    const k = t;
    const x = W - 10 - t * (W - 40);
    const big = rand(seed, i, 2) < 0.25;
    const rad = Math.min(INK_STRIP_H * 0.42, (range(2.2, 3, seed, i, 3) + ((big ? range(14, 19, seed, i, 4) : range(8, 13, seed, i, 5)) - 2.6) * (1 - Math.exp(-2.2 * age))) * S);
    const y = midY + range(-1, 1, seed, i, 6) * (2 + age * 8) + Math.sin(age * 5.3 + i) * age * 3.5;
    if (x - rad < 2) continue;
    const a = Math.min(1, age * 16) * Math.pow(1 - k, 1.25) * 0.68 * smooth(2, 70, x - rad);
    list.push({ x, y, r: rad, a, b: clamp(0.95 - k * 0.75 + range(-0.08, 0.08, seed, i, 7)), w: Math.exp(-age * range(3.5, 6, seed, i, 8)) });
  }
  cloud(buf, list);
  // 先の まわりの 水色の 光（わかい けむりが 光る）
  glow(buf, W - 14, midY, 44, 14, CYAN[4]!, 0.3);
  glow(buf, W - 8, midY, 14, 6, CYAN[7]!, 0.5);
  // 水色の 小さな ひばな（けむりに のって 後ろへ ながれて きえる）
  for (let i = 0; i < 26; i++) {
    const t = Math.pow(rand(seed, i, 20), 1.6) * 0.5;
    const x = Math.floor(W - 16 - t * (W - 60));
    const y = Math.floor(midY + range(-1, 1, seed, i, 21) * (3 + t * 22));
    const c = t < 0.15 ? CYAN[6]! : t < 0.3 ? CYAN[5]! : CYAN[4]!;
    blendPx(buf, x, y, c, 0.95);
    if (rand(seed, i, 22) < 0.5) blendPx(buf, x + 1, y, c, 0.75);
  }
  return buf;
}
