import type { BlockId } from '../../contracts';
import { ATLAS_COLS, ATLAS_HEIGHT, ATLAS_WIDTH, TILE_NAMES, TILE_SIZE, type TileName } from './textures';

/**
 * こたつ 2×2（たて 2 × よこ 2 × 高さ 1）の きまり。
 * 本体 は いちばん 北西（x・z が 小さい）の マス の `nukunuku`。のこり 3 マス は `nukunuku_e`（東）・`nukunuku_s`（南）・`nukunuku_se`（南東）。
 * 古い セーブ の 1 マス こたつ（まわり に 3 マス が 無い `nukunuku`）は、そのまま 1 マス の こたつ として 動く。
 */
export type KotatsuPart = 'nukunuku_e' | 'nukunuku_s' | 'nukunuku_se';

/** 3 マス の 本体 から の ずれ（x, z） */
export const KOTATSU_PARTS: Readonly<Record<KotatsuPart, readonly [number, number]>> = {
  nukunuku_e: [1, 0],
  nukunuku_s: [0, 1],
  nukunuku_se: [1, 1],
};

/** 本体 と 3 マス ぜんぶ（ずれ と ブロック。本体 が 先頭） */
export const KOTATSU_CELLS: ReadonlyArray<{ dx: number; dz: number; block: BlockId }> = [
  { dx: 0, dz: 0, block: 'nukunuku' },
  { dx: 1, dz: 0, block: 'nukunuku_e' },
  { dx: 0, dz: 1, block: 'nukunuku_s' },
  { dx: 1, dz: 1, block: 'nukunuku_se' },
];

export function isKotatsuPart(id: BlockId | string): id is KotatsuPart {
  return id === 'nukunuku_e' || id === 'nukunuku_s' || id === 'nukunuku_se';
}

/** こたつ の どれか の マス か（本体 でも 3 マス でも） */
export function isKotatsuBlock(id: BlockId | string): boolean {
  return id === 'nukunuku' || isKotatsuPart(id);
}

/** 本体 の マス（そのマス が 3 マス の どれか なら、ずれ を 引く。本体 や 関係 ない ブロック は そのまま）。本体 が 世界 に 在るか は 見ない */
export function kotatsuAnchorOf(id: BlockId | string, x: number, z: number): { x: number; z: number } {
  if (!isKotatsuPart(id)) return { x, z };
  const [dx, dz] = KOTATSU_PARTS[id];
  return { x: x - dx, z: z - dz };
}

/** 本体 (x, y, z) が 2×2 の そろった こたつ か（3 マス が ぜんぶ ある）。1 マス だけ の 古い こたつ は false */
export function isBigKotatsu(getBlock: (x: number, y: number, z: number) => BlockId | string, x: number, y: number, z: number): boolean {
  if (getBlock(x, y, z) !== 'nukunuku') return false;
  for (const c of KOTATSU_CELLS) if (c.block !== 'nukunuku' && getBlock(x + c.dx, y, z + c.dz) !== c.block) return false;
  return true;
}

/** 1 点 = 1/16 ブロック（絵 の 1 ドット） */
const PT = 1 / 16;
/** 天板 の ふち から ふとん の すそ まで の よこ の はば（6 点）。足もと 32×32・天板 20×20・高さ 16 */
export const KOTATSU_RUN = 6 * PT;
/** 角 の 布 の たまり（案 C。三角 2 まい ×4 角）。P = 角 の 真上 1.5 点、T = 角 から 外 へ x・z とも 3 点、A・B = 角 から へり に そって 内 へ 6 点。地面 から 0.05 点 浮かす */
export const KOTATSU_CORNER = { peak: 1.5 * PT, out: 3 * PT, along: 6 * PT, lift: 0.05 * PT } as const;

/**
 * こたつ の 面ごと の 絵 の 入口（絵 を 差しかえる ときは ここ と `kotatsuArt.ts`）。
 * 1 つ の 絵 が 16 を こえる ので、atlas の 隣り合う タイル を つなげて 1 まい の 四角 として 使う（`kotatsuUv`）。
 * w・h = 絵 の 大きさ（点）。tiles = 左上 から 右へ・下 へ の 順（`cols` れつ）
 */
export interface KotatsuTex {
  readonly tiles: readonly TileName[];
  readonly cols: number;
  readonly rows: number;
  readonly w: number;
  readonly h: number;
}
export const KOTATSU_TEX: Readonly<Record<'top' | 'slope' | 'corner', KotatsuTex>> = {
  top: { tiles: ['kotatsu_top_a', 'kotatsu_top_b', 'kotatsu_top_c', 'kotatsu_top_d'], cols: 2, rows: 2, w: 20, h: 20 },
  slope: { tiles: ['kotatsu_slope_a', 'kotatsu_slope_b'], cols: 2, rows: 1, w: 32, h: 16 },
  corner: { tiles: ['kotatsu_corner'], cols: 1, rows: 1, w: 8, h: 8 },
};

/**
 * 絵 の 点 (px, py)（左上 が 0,0）の UV [u, v]。`tiles[0]`（絵 の 左上）の 位置 から 数える。
 * atlas は 行 番号 が 大きい ほど 上〈v が 大きい〉 なので、絵 の 下半分 の タイル は 1 行 下〈番号 が 4 小さい〉 に 置く（`kotatsuTileOrder`）
 */
export function kotatsuUv(tex: KotatsuTex, px: number, py: number): [number, number] {
  const first = TILE_NAMES.indexOf(tex.tiles[0]!);
  const col = first % ATLAS_COLS;
  const row = Math.floor(first / ATLAS_COLS);
  const x = col * TILE_SIZE + Math.min(Math.max(px, 0.01), tex.cols * TILE_SIZE - 0.01);
  const y = row * TILE_SIZE + TILE_SIZE - Math.min(Math.max(py, 0.01), tex.rows * TILE_SIZE - 0.01);
  return [x / ATLAS_WIDTH, y / ATLAS_HEIGHT];
}
