// CHAR-2 §4.7: キャラの絵を 1 コマずつ 切りつめて 動きごとに 棚づめする。
//   使い方: npm run pack:char   （art/char-sheets/ -> public/models/char/）
// PNG の読み書きは node の zlib だけで やる（RGBA 8 ビットのみ）。同じ入力から 同じ出力になる。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const CELL = 256;
const ROWS = 24;
const PAD = 2;
const ALPHA_MIN = 128; // palette.ts の quantizeRgba と同じ（これ未満は とうめい）
const MAX_H = 8192;

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buf) {
  const b = Buffer.from(buf);
  if (!b.subarray(0, 8).equals(SIG)) throw new Error('PNG ではない');
  let o = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    const body = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('RGBA 8 ビット（インターレースなし）だけ');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= 4 ? data[dst + i - 4] : 0;
      const up = y > 0 ? data[dst - stride + i] : 0;
      const c = i >= 4 && y > 0 ? data[dst - stride + i - 4] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + up; break;
        case 3: v = x + ((a + up) >> 1); break;
        case 4: {
          const p = a + up - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
          break;
        }
        default: throw new Error('フィルターが ふめい');
      }
      data[dst + i] = v & 255;
    }
  }
  return { width, height, data };
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // フィルター 0（なし）
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** 1 つの動き（よこ = frames × 256、たて = 24 × 256）を 切りつめて 棚づめ */
export function packMotion(src, frames) {
  if (src.width !== frames * CELL || src.height !== ROWS * CELL) throw new Error(`絵の大きさが ちがう ${src.width}x${src.height}`);
  const rects = []; // 番号 = row * frames + f
  for (let row = 0; row < ROWS; row++) {
    for (let f = 0; f < frames; f++) {
      let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
      for (let j = 0; j < CELL; j++) {
        const base = ((row * CELL + j) * src.width + f * CELL) * 4;
        for (let i = 0; i < CELL; i++) {
          if (src.data[base + i * 4 + 3] >= ALPHA_MIN) {
            if (i < x0) x0 = i;
            if (i > x1) x1 = i;
            if (j < y0) y0 = j;
            if (j > y1) y1 = j;
          }
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; } // 空のコマ（ふつうは ない）: 1 ドットだけ
      else {
        x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
        x1 = Math.min(CELL - 1, x1 + PAD); y1 = Math.min(CELL - 1, y1 + PAD);
      }
      rects.push({ row, f, ox: x0, oy: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
  }
  for (const width of [2048, 4096]) {
    const placed = shelf(rects, width);
    if (placed.height > MAX_H && width === 2048) continue;
    return render(src, frames, rects, placed, width);
  }
  throw new Error('たてが 上限を こえる');
}

function shelf(rects, width) {
  let x = 0, y = 0, rowH = 0;
  const pos = [];
  for (const r of rects) {
    if (x + r.w > width) { x = 0; y += rowH; rowH = 0; }
    pos.push([x, y]);
    x += r.w;
    if (r.h > rowH) rowH = r.h;
  }
  return { pos, height: y + rowH };
}

function render(src, frames, rects, placed, width) {
  const height = placed.height;
  const data = new Uint8Array(width * height * 4);
  const cells = [];
  rects.forEach((r, k) => {
    const [x, y] = placed.pos[k];
    for (let j = 0; j < r.h; j++) {
      const s = ((r.row * CELL + r.oy + j) * src.width + r.f * CELL + r.ox) * 4;
      data.set(src.data.subarray(s, s + r.w * 4), ((y + j) * width + x) * 4);
    }
    cells.push([x, y, r.w, r.h, r.ox, r.oy]);
  });
  return { png: { width, height, data }, packed: { width, height, cells } };
}

function stringifyAtlas(atlas) {
  const s = JSON.stringify(atlas, null, 1);
  return s.replace(/\[\n\s+(\d+),\n\s+(\d+),\n\s+(\d+),\n\s+(\d+),\n\s+(\d+),\n\s+(\d+)\n\s+\]/g, '[$1,$2,$3,$4,$5,$6]') + '\n';
}

/** srcDir（art/char-sheets/）を 読んで 書き出す物を メモリ上で つくる（ファイルは 書かない） */
export function buildAll(srcDir, { encode = true } = {}) {
  const atlas = JSON.parse(readFileSync(resolve(srcDir, 'atlas.json'), 'utf8'));
  const pngs = {};
  const files = {};
  const report = {};
  const motions = {};
  for (const [name, m] of Object.entries(atlas.motions)) {
    const { png, packed } = packMotion(decodePng(readFileSync(resolve(srcDir, `${name}.png`))), m.frames);
    pngs[name] = png;
    if (encode) files[`${name}.png`] = encodePng(png);
    report[name] = { width: png.width, height: png.height, bytes: encode ? files[`${name}.png`].length : 0 };
    motions[name] = { ...m, packed };
  }
  const out = { ...atlas, motions };
  files['atlas.json'] = Buffer.from(stringifyAtlas(out), 'utf8');
  return { atlas: out, pngs, files, report };
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(here, '..');
  const outDir = resolve(root, 'public/models/char');
  const { files, report } = buildAll(resolve(root, 'art/char-sheets'));
  mkdirSync(outDir, { recursive: true });
  for (const [n, b] of Object.entries(files)) writeFileSync(resolve(outDir, n), b);
  const gpu = (names) => names.reduce((s, n) => s + report[n].width * report[n].height, 0);
  const names = Object.keys(report);
  for (const n of names) console.log(`${n}: ${report[n].width}x${report[n].height} (GPU ${report[n].width * report[n].height} B, file ${report[n].bytes} B)`);
  const groups = {
    'はじめの 4': ['idle', 'walk', 'run', 'jump'],
    '刀の組 6': names.filter((n) => n.startsWith('katana_')),
    '弓の組 4': names.filter((n) => n.startsWith('bow_')),
    'ぜんぶ': names,
  };
  for (const [g, ns] of Object.entries(groups)) console.log(`${g}: ${gpu(ns)} B`);
  if (gpu(names) > 67108864) { console.error('64 MiB を こえた'); process.exit(1); }
}
