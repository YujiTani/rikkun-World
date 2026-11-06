import { CHEST_PAL as PAL, KODO_WAKU_COLORS } from '../../blocks/chestArt';
import { CHEST_BLOCK_IDS, CHEST_RIGHT, chestBlockInfo, chestFrontAt, type ChestCompass, type ChestTier } from '../../blocks/chestBlock';
import { shapeKind } from './common';
import { LOOK_N, type KindSpec } from './types';

/**
 * MINE-1C（#350）の 宝箱 4 段階 v2 の 小ブロックの 形。元の 数は アート `docs/art/design/07-mine.md` 20.7 と、
 * 描いた プログラム `docs/art/mine-1/proto/chest2.py.txt`（`PAL`・`FEAT`・`parts()`・`lid_rot90()`）。
 *
 * 2 マス = 18×9×9 の 形を 半分に 切って 1 マス ずつ（本体 = 前から 見て 左の x 0..8、のこり = 右の x 9..17）。前 = +z。
 * 向き 4 つ は 18×9×9 を まわすだけ。あけた 形は ふたを うしろへ 90 度 立てて、からだの 中を あける。
 * ふたが 動く 0.46 秒 の メッシュ（ふた だけ べつ）は この 形の `lid` を 使う（`chestLidGrid`）。
 */

const N = LOOK_N;
const GX = 2 * N;

/** 木の まだら（1・2 段の からだ・ふた。2 色め が 点） */
const WOODY: Readonly<Partial<Record<ChestTier, { W: string; L: string }>>> = {
  1: { W: '#8A5229', L: '#965A30' },
  2: { W: '#66401F', L: '#6E4426' },
};

interface Feat {
  straps: readonly number[];
  corners: boolean;
  cornerH: number;
  rivets: boolean;
  rim: boolean;
  top: 'knob' | 'flame' | null;
  lock: 'hasp' | 'plate' | 'flame';
}
const FEAT: Readonly<Record<ChestTier, Feat>> = {
  1: { straps: [4, 13], corners: false, cornerH: 1, rivets: false, rim: false, top: null, lock: 'hasp' },
  2: { straps: [4, 13], corners: true, cornerH: 1, rivets: true, rim: false, top: null, lock: 'plate' },
  3: { straps: [4, 5, 12, 13], corners: true, cornerH: 1, rivets: false, rim: true, top: 'knob', lock: 'plate' },
  4: { straps: [4, 5, 12, 13], corners: true, cornerH: 2, rivets: false, rim: true, top: 'flame', lock: 'flame' },
};

/** 18×9×9 の 並び（x が いちばん 外）。値 = 色の 文字（'' = 空） */
type Grid = string[];
const at = (x: number, y: number, z: number): number => (x * N + y) * N + z;
const newGrid = (): Grid => new Array<string>(GX * N * N).fill('');

function box(g: Grid, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, k: string): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) g[at(x, y, z)] = k;
}

interface Parts {
  body: Grid;
  bodyOpen: Grid;
  lid: Grid;
}

function partsOf(tier: ChestTier): Parts {
  const pal = PAL[tier];
  const ft = FEAT[tier];
  const body = newGrid();
  const lid = newGrid();
  const metal = 'S';
  box(body, 1, 16, 0, 3, 3, 7, 'W');
  box(lid, 1, 16, 4, 5, 3, 7, 'L');
  box(lid, 1, 16, 6, 6, 4, 6, 'L');
  box(lid, 2, 15, 4, 4, 4, 6, 'I'); // ふたの うら
  if (ft.rim) {
    const g = 'G' in pal ? 'G' : metal;
    box(lid, 1, 16, 4, 4, 3, 3, g);
    box(lid, 1, 16, 4, 4, 7, 7, g);
    box(lid, 1, 1, 4, 4, 3, 7, g);
    box(lid, 16, 16, 4, 4, 3, 7, g);
  }
  for (const x of ft.straps) {
    box(body, x, x, 0, 3, 8, 8, metal);
    box(body, x, x, 0, 3, 2, 2, metal);
    box(lid, x, x, 4, 5, 8, 8, metal);
    box(lid, x, x, 4, 5, 2, 2, metal);
    box(lid, x, x, 6, 6, 3, 7, metal);
    if (ft.rivets) {
      body[at(x, 1, 8)] = 'R';
      lid[at(x, 5, 8)] = 'R';
    }
  }
  if (ft.corners) {
    const cm = 'G' in pal ? 'G' : metal;
    const bodyYs = ft.cornerH === 2 ? [0, 1] : [0];
    const lidYs = ft.cornerH === 2 ? [5, 4] : [5];
    for (const [xc, sx] of [[1, -1], [16, 1]] as const) {
      for (const [zc, sz] of [[3, -1], [7, 1]] as const) {
        for (const [g, ys] of [[body, bodyYs], [lid, lidYs]] as const) {
          for (const y of ys) {
            g[at(xc + sx, y, zc)] = cm;
            g[at(xc, y, zc + sz)] = cm;
            g[at(xc + sx, y, zc + sz)] = cm;
          }
        }
      }
    }
  }
  if (ft.lock === 'hasp') {
    box(lid, 8, 9, 4, 5, 8, 8, 'P');
    box(body, 8, 9, 3, 3, 8, 8, 'P');
    box(body, 8, 9, 2, 2, 8, 8, 'K');
  } else if (ft.lock === 'plate') {
    box(body, 7, 10, 1, 3, 8, 8, metal);
    box(body, 8, 9, 2, 2, 8, 8, 'K');
    box(lid, 8, 9, 4, 5, 8, 8, 'H');
  } else {
    box(body, 7, 10, 1, 3, 8, 8, 'L');
    box(body, 8, 9, 2, 2, 8, 8, 'Y');
  }
  if (ft.top === 'knob') {
    box(lid, 7, 10, 6, 6, 4, 6, metal);
    box(lid, 8, 9, 7, 7, 4, 6, metal);
  } else if (ft.top === 'flame') {
    box(lid, 7, 10, 5, 5, 7, 7, 'F');
    box(lid, 6, 11, 6, 6, 4, 7, 'F');
    box(lid, 7, 10, 7, 7, 4, 6, 'F');
    box(lid, 8, 9, 8, 8, 5, 6, 'F');
    box(lid, 8, 9, 5, 7, 7, 7, 'Y');
    box(lid, 8, 9, 7, 8, 6, 6, 'Y');
  }
  const bodyOpen = body.slice();
  box(bodyOpen, 2, 15, 1, 3, 4, 6, '');
  box(bodyOpen, 2, 15, 0, 0, 4, 6, 'I');
  box(bodyOpen, 2, 15, 1, 3, 3, 3, 'I');
  return { body, bodyOpen, lid };
}

/** ふたを うしろへ 90 度: (x, y, z) → (x, z + 1, 6 − y)。マスの 外に 出る 所は のぞく */
function lidRot90(lid: Grid): Grid {
  const out = newGrid();
  for (let x = 0; x < GX; x++) {
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const k = lid[at(x, y, z)]!;
        if (k === '') continue;
        const ny = z + 1;
        const nz = 6 - y;
        if (ny >= 0 && ny < N && nz >= 0 && nz < N) out[at(x, ny, nz)] = k;
      }
    }
  }
  return out;
}

const merge = (top: Grid, under: Grid): Grid => top.map((k, i) => (k !== '' ? k : under[i]!));

const cache = new Map<ChestTier, { closed: Grid; open: Grid; bodyOpen: Grid; lid: Grid }>();
function gridsOf(tier: ChestTier): { closed: Grid; open: Grid; bodyOpen: Grid; lid: Grid } {
  let g = cache.get(tier);
  if (!g) {
    const p = partsOf(tier);
    g = { closed: merge(p.lid, p.body), open: merge(lidRot90(p.lid), p.bodyOpen), bodyOpen: p.bodyOpen, lid: p.lid };
    cache.set(tier, g);
  }
  return g;
}

/** ふたが 動く 間 つかう: 段の 「中を あけた からだ」と 「とじた 位置の ふた」（18×9×9。色の 文字） */
export function chestLidGrid(tier: ChestTier): { bodyOpen: readonly string[]; lid: readonly string[]; color: (key: string) => string } {
  const g = gridsOf(tier);
  return { bodyOpen: g.bodyOpen, lid: g.lid, color: (k) => PAL[tier][k]! };
}

/** 1 マスの 色番号（P で パレットに 入れた もの）。木の まだらは 位置の ハッシュで 点を まぜる */
function colorIndex(P: (hex: string) => number, tier: ChestTier): (k: string, x: number, y: number, z: number) => number {
  const pal = PAL[tier];
  const base: Record<string, number> = {};
  for (const [k, c] of Object.entries(pal)) base[k] = P(c);
  const dots = WOODY[tier];
  const dot: Record<string, number> = {};
  if (dots) {
    dot.W = P(dots.W);
    dot.L = P(dots.L);
  }
  return (k, x, y, z) => {
    if (dots && (k === 'W' || k === 'L') && ((x * 7 + y * 13 + z * 5 + tier * 3) % 6 === 0 || (x * 3 + y * 5 + z * 11) % 9 === 4)) return dot[k]!;
    return base[k]!;
  };
}

/** 小ブロック (sx, sz)（0..8）→ 18×9×9 の x（u）と z（おく行き w）。right = のこりの マスが ある 向き、front = 前の 向き */
function toUW(right: readonly [number, number], front: readonly [number, number], sx: number, sz: number): [number, number] {
  const u = right[0] !== 0 ? (right[0] > 0 ? sx : N - 1 - sx) : right[1] > 0 ? sz : N - 1 - sz;
  const w = front[0] !== 0 ? (front[0] > 0 ? sx : N - 1 - sx) : front[1] > 0 ? sz : N - 1 - sz;
  return [u, w];
}

export const CHEST_FRONT_VEC: Readonly<Record<ChestCompass, readonly [number, number]>> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** ふたが 動いて いる 間 ふたを 描かない マス（あいた 宝箱の 形を「ふた なし」に する）。キーは lidlessKey */
const LIDLESS = new Set<number>();
const lidlessKey = (x: number, y: number, z: number): number => (x * 4194304 + z) * 512 + y;
export function setChestLidless(x: number, y: number, z: number, on: boolean): void {
  if (on) LIDLESS.add(lidlessKey(x, y, z));
  else LIDLESS.delete(lidlessKey(x, y, z));
}

/** 前の 向きを きめる ために となりの ブロックを 読む 関数（ゲームの つなぎで 入れる。なければ 北向き） */
let worldReader: ((x: number, y: number, z: number) => string) | null = null;
export function setChestWorldReader(f: ((x: number, y: number, z: number) => string) | null): void {
  worldReader = f;
}

/** 宝箱 16 この 見た目。P = パレットに 色を 入れて 色番号を 返す 関数 */
export function createChestKinds(P: (hex: string) => number): Record<string, KindSpec> {
  const idx = new Map<ChestTier, ReturnType<typeof colorIndex>>();
  const out: Record<string, KindSpec> = {};
  for (const id of CHEST_BLOCK_IDS) {
    const info = chestBlockInfo(id)!;
    let ci = idx.get(info.tier);
    if (!ci) idx.set(info.tier, (ci = colorIndex(P, info.tier)));
    const color = ci;
    const g = gridsOf(info.tier);
    const openGrid = info.open ? g.open : g.closed;
    const du = info.rest ? N : 0;
    const base = P(PAL[info.tier].W!);
    out[id] = {
      base,
      occludes: false, // ひくい 箱 なので どの 面にも すきまが ある（となりの 面は かくさない）
      fill: (bx, by, bz, _exposed, o) => {
        o.fill(0);
        const f = (worldReader && chestFrontAt(worldReader, bx, by, bz)) || 'n';
        const right = CHEST_RIGHT[f];
        const front = CHEST_FRONT_VEC[f];
        const grid = info.open && LIDLESS.has(lidlessKey(bx, by, bz)) ? g.bodyOpen : openGrid;
        for (let y = 0; y < N; y++) {
          for (let sz = 0; sz < N; sz++) {
            for (let sx = 0; sx < N; sx++) {
              const [u, w] = toUW(right, front, sx, sz);
              const k = grid[at(u + du, y, w)]!;
              if (k !== '') o[(y * N + sz) * N + sx] = color(k, u + du, y, w);
            }
          }
        }
      },
    };
  }
  return out;
}

/** 坑道の わく（kodo_waku）: 木の 柱と はり ＋ てつの おび（art/MINE-1/kodo_waku の 色）。穴は あけない（ふつうの 箱） */
export function createKodoWakuKind(P: (hex: string) => number): KindSpec {
  const wood = P(KODO_WAKU_COLORS.wood);
  const dark = P(KODO_WAKU_COLORS.dark);
  const iron = P(KODO_WAKU_COLORS.iron);
  const light = P(KODO_WAKU_COLORS.light);
  return shapeKind(
    260,
    wood,
    (x, y, z, h) => {
      const edge = x === 0 || x === N - 1 || z === 0 || z === N - 1;
      if (y >= 3 && y <= 5) return iron; // てつの おび
      if (edge && (x === 0 || x === N - 1) && (z === 0 || z === N - 1)) return dark; // 柱の かど
      return (h + x * 3 + y * 5 + z * 7) % 11 === 0 ? light : wood;
    },
    () => false,
  );
}
