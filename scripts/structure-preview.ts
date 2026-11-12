/**
 * 建物の 形を ななめ上から 見る 道具（ゲームを 起動しない。node だけで 動く）。
 *   npx jiti scripts/structure-preview.ts <名前> <出力の PNG>       例: torii /tmp/torii.png
 *   npx jiti scripts/structure-preview.ts --list                    名前の 一覧
 * 4 つの 向きを 1 枚に ならべる。色 = ブロックの 絵の 平均の 色（上・左〔南〕・右〔東〕の 面で 明るさを かえる）。ゆらぎの シードは 引数の 3 つめ（既定 7）。
 * 地面は 足もとの 高さの 平らな 板（緑）。土台で うめた 所は 土台の ブロックの 色で 見える。
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { BLOCK_TILES, getTilePixels } from '../src/world/blocks/textures';
import { placeStructure } from '../src/world/gen/structures/place';
import { STRUCTURES } from '../src/world/gen/structures/registry';
import { ROTS, type PlacedCell } from '../src/world/gen/structures/types';
import type { BlockId } from '../src/contracts';
import { placeStairs, type Dir4 } from '../src/world/gen/structures/ishidan';

type RGB = readonly [number, number, number];

/** ブロックの 面ごとの 平均の 色（[上, 下, よこ] の 絵の 平均）。絵が なければ 灰色 */
function faceColors(id: BlockId): { top: RGB; side: RGB } {
  const t = BLOCK_TILES[id];
  const avg = (name: Parameters<typeof getTilePixels>[0]): RGB => {
    const px = getTilePixels(name);
    let r = 0, g = 0, b = 0, n = 0;
    for (const p of px) if (p[3] > 0) { r += p[0]; g += p[1]; b += p[2]; n++; }
    return n === 0 ? [128, 128, 128] : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  if (!t) return { top: [128, 128, 128], side: [110, 110, 110] };
  return { top: avg(t[0]), side: avg(t[2]) };
}

const SHADE = { top: 1.0, left: 0.78, right: 0.58 } as const;
const HW = 8; // 1 マスの 横の 半分（画素）
const HH = 4; // 1 マスの 上の ひし形の 縦の 半分
const VH = 9; // 1 マスの 高さ（画素）
const SCALE = 3; // 出力を 何倍に するか

class Canvas {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number, bg: RGB) {
    this.px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.px.set([bg[0], bg[1], bg[2], 255], i * 4);
  }
  poly(pts: readonly (readonly [number, number])[], c: RGB, edge: RGB): void {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k]!));
        const xb = Math.min(this.w - 1, Math.round(xs[k + 1]!) - 1);
        for (let x = xa; x <= xb; x++) this.px.set([c[0], c[1], c[2], 255], (y * this.w + x) * 4);
        if (xa <= xb) {
          this.px.set([edge[0], edge[1], edge[2], 255], (y * this.w + xa) * 4);
        }
      }
    }
  }
}

const shade = (c: RGB, k: number): RGB => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];

/** ブロック 1 こ（x, y, z）を 画面の (ox, oy) を 基準に 描く。見る 向き = 南東から（x + z が 大きい ほど 手前） */
function cube(cv: Canvas, ox: number, oy: number, x: number, y: number, z: number, id: BlockId): void {
  const { top, side } = faceColors(id);
  const cx = ox + (x - z) * HW;
  const cy = oy + (x + z) * HH - y * VH;
  const T = shade(top, SHADE.top);
  const L = shade(side, SHADE.left);
  const R = shade(side, SHADE.right);
  const dark = (c: RGB): RGB => shade(c, 0.8);
  // 上の 面
  cv.poly([[cx, cy - HH], [cx + HW, cy], [cx, cy + HH], [cx - HW, cy]], T, dark(T));
  // 左（南）の 面
  cv.poly([[cx - HW, cy], [cx, cy + HH], [cx, cy + HH + VH], [cx - HW, cy + VH]], L, dark(L));
  // 右（東）の 面
  cv.poly([[cx, cy + HH], [cx + HW, cy], [cx + HW, cy + VH], [cx, cy + HH + VH]], R, dark(R));
}

function crc32(buf: Uint8Array): number {
  let c: number;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]!) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

interface Panel {
  cells: PlacedCell[];
  /** 地面の 高さ */
  ground: (x: number, z: number) => number;
  /** 見る はんい（まん中から） */
  r: number;
}

/** 図で 書く 建物: 4 つの 向き。地面は 平ら */
function shapePanels(name: string, seed: number): Panel[] {
  const shape = STRUCTURES[name as keyof typeof STRUCTURES];
  return ROTS.map((rot) => {
    const placed = placeStructure(shape, 0, 0, rot, seed, () => 0);
    if (!placed) throw new Error(`${name}: 置けない`);
    return { cells: placed.blocks.filter((b) => b.id !== 'air'), ground: () => 0, r: Math.max(...placed.foot.map(Math.abs)) + 2 };
  });
}

/** 石段: 4 つの 向き × ちがう かたむきの 山の 斜面（高さ 9 から すそへ） */
function stairPanels(seed: number): Panel[] {
  const dirs: Dir4[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const slopes = [1.0, 0.8, 0.7, 0.6];
  return dirs.map((d, i) => {
    const ground = (x: number, z: number): number => Math.max(0, 7 - Math.floor((x * d[0] + z * d[1] + 5) * slopes[i]!));
    const st = placeStairs(-5 * d[0], -5 * d[1], d, seed, ground, (x, z) => ground(x, z) <= 1);
    if (!st) throw new Error('石段: 置けない');
    return { cells: st.blocks.filter((b) => b.id !== 'air'), ground, r: Math.max(...st.foot.map(Math.abs)) + 1 };
  });
}

const structureNames = (): string[] => [...Object.keys(STRUCTURES), 'ishidan'];

function main(): void {
  const [name, out, seedArg] = process.argv.slice(2);
  if (name === '--list' || name === undefined) {
    console.log(structureNames().join('\n'));
    return;
  }
  if (out === undefined || !structureNames().includes(name)) {
    console.error('使い方: npx jiti scripts/structure-preview.ts <名前> <出力の PNG> [シード]（名前は --list）');
    process.exit(1);
  }
  const seed = Number(seedArg ?? 7);
  const panels = name === 'ishidan' ? stairPanels(seed) : shapePanels(name, seed);
  const R = Math.max(...panels.map((p) => p.r));
  const maxY = Math.max(...panels.flatMap((p) => p.cells.map((b) => b.y))) + 1;
  const oy = Math.max(2 * R * HH + HH + 2 + maxY * VH, (maxY + 1) * VH + HH);
  const pw = (2 * R + 1) * 2 * HW + 4;
  const ph = oy + 2 * R * HH + HH + VH + 4;
  const cv = new Canvas(pw * panels.length, ph, [214, 232, 247]);
  panels.forEach((p, n) => {
    const ox = n * pw + pw / 2;
    const cells: PlacedCell[] = [];
    const taken = new Set(p.cells.map((b) => `${b.x},${b.y},${b.z}`));
    // 地面: 平らな（または 斜面の）草の 板。草の 下は つち（同じ 列の 上の ブロックが 地面を うめる 所は 省く）
    for (let z = -R; z <= R; z++) {
      for (let x = -R; x <= R; x++) {
        const g = p.ground(x, z);
        for (let y = Math.max(0, g - 2); y <= g; y++) if (!taken.has(`${x},${y},${z}`)) cells.push({ x, y, z, id: y === g ? 'grass' : 'dirt' });
      }
    }
    cells.push(...p.cells);
    cells.sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y);
    for (const c of cells) cube(cv, ox, oy, c.x, c.y, c.z, c.id);
  });
  // 拡大
  const W = cv.w * SCALE;
  const H = cv.h * SCALE;
  const big = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / SCALE) * cv.w + Math.floor(x / SCALE)) * 4;
    big.set(cv.px.subarray(s, s + 4), (y * W + x) * 4);
  }
  writeFileSync(out, png(W, H, big));
  console.log(`${name}: ${W}x${H} → ${out}（向き 0〜3 を 左から）`);
}

main();
