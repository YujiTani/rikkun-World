// HOUSE-1C PR-2（#340）建築の ブロックの 絵: かためた つち ＋ 足場（案 B「しらきの はしご わく」。決定 docs/decisions/2026-10-31-house-build-look.md）。
// 数と 色の 元: 試作 ブランチ house-1c-art（f907db9）の src/proto/house1c/art.ts の PAL_H1.B と 絵 8 まい（名前は そのまま）。
// 世界の 絵の 表（textures.ts の TILE_NAMES）の さいごに 8 まい 足す（houseTextures.ts）。持つ 道具の 色と アイコンは ui/itemArtBuild.ts が 同じ 表を 読む。
import type { Px as NumPx } from './houseTilePaint';

/** 16×16 の 絵（'#rrggbb'、'' = すける）。[y * 16 + x]、y = 0 が 上 */
type Px = string[];

export const BUILD_TILE_NAMES = ['h1_soil_top', 'h1_soil_side', 'h1_pole', 'h1_pole_end', 'h1_plank', 'h1_plank_end', 'h1_tie', 'h1_flag'] as const;
export type BuildTile = (typeof BUILD_TILE_NAMES)[number];

const N = 16;
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const solid = (c: string): Px => new Array<string>(N * N).fill(c);
function put(t: Px, x: number, y: number, c: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) t[y * N + x] = c;
}
function rect(t: Px, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(t, i, j, c);
}
function speck(t: Px, c: string, seed: number, n: number, keep?: (x: number, y: number) => boolean): void {
  const r = lcg(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    if (!keep || keep(x, y)) put(t, x, y, c);
  }
}
/** たての しま（列ごとの 色）。長い 箱は 長さの 向きに 1 行 だけ のばして 使う */
function columns(cols: readonly string[]): Px {
  const t = solid(cols[0]!);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = cols[Math.min(cols.length - 1, x)]!;
  return t;
}
const spread = (spec: ReadonlyArray<readonly [number, string]>): string[] => spec.flatMap(([n, c]) => Array.from({ length: n }, () => c));

// ============================================================ 色の 表（案 B）
const BUILD_PAL = {
  // 白木（四角い 角材）
  pole: '#E2CDA2', poleL: '#F1E2C2', poleD: '#C8AF80', poleE: '#AD9468', ring: '#CDB283',
  plank: '#D9BE8A', plankL: '#E8D2A4', plankD: '#AD8E5C',
  tie: '#4A4A52', tieL: '#6E6E78',
  // 藍の のぼり（建築士さんの はっぴと 同じ 藍 ＋ 白い 回）
  flag: '#2F4780', flagL: '#3D5A9E', flagW: '#EFE7D4',
  // はんこの ます目（どうづきの 四角い 足の あと）
  soil: '#9C7752', soilL: '#AB8761', soilD: '#83613E', grain: '#93704C', grit: '#7A5A39',
} as const;

function paintBuildTiles(): Record<BuildTile, Px> {
  const P = BUILD_PAL;
  // かためた つち（上）: うすい まだら（2×2）の 上に、8×8 の 四角い あと 4 つ（上・左の ふちが 光、下・右の ふちが かげ）＋ こまかい つぶ
  const soilTop = solid(P.soil);
  const r = lcg(22);
  for (let y = 0; y < N; y += 2) {
    for (let x = 0; x < N; x += 2) {
      const v = r();
      if (v < 0.22) rect(soilTop, x, y, 2, 2, P.soilL);
      else if (v > 0.84) rect(soilTop, x, y, 2, 2, P.soilD);
    }
  }
  for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
    rect(soilTop, ox + 1, oy + 1, 6, 1, P.soilL);
    rect(soilTop, ox + 1, oy + 1, 1, 6, P.soilL);
    rect(soilTop, ox + 1, oy + 7, 7, 1, P.soilD);
    rect(soilTop, ox + 7, oy + 1, 1, 7, P.soilD);
  }
  const inCell = (x: number, y: number): boolean => x % 8 > 1 && x % 8 < 7 && y % 8 > 1 && y % 8 < 7;
  speck(soilTop, P.grain, 201, 14, inCell);
  speck(soilTop, P.grit, 202, 6, inCell);
  // 横の 面: 上 2 行は 上と 同じ、下は 少し 暗い 土
  const soilSide = solid(P.soilD);
  for (let x = 0; x < N; x++) for (let y = 0; y < 2; y++) soilSide[y * N + x] = soilTop[y * N + x]!;
  speck(soilSide, P.soil, 401, 30, (_x, y) => y > 2);
  speck(soilSide, P.grit, 402, 10, (_x, y) => y > 2);

  // 角材: 平らな 面・角に 光と かげの 1 列。切り口は ふちが 光と かげ
  const pole = columns(spread([[1, P.poleL], [4, P.pole], [1, P.ring], [5, P.pole], [1, P.ring], [3, P.pole], [1, P.poleD]]));
  const poleEnd = solid(P.pole);
  rect(poleEnd, 0, 0, 16, 1, P.poleL);
  rect(poleEnd, 0, 0, 1, 16, P.poleL);
  rect(poleEnd, 0, 15, 16, 1, P.poleE);
  rect(poleEnd, 15, 0, 1, 16, P.poleE);
  rect(poleEnd, 4, 4, 8, 8, P.ring);
  rect(poleEnd, 6, 6, 4, 4, P.pole);

  // 足場板: はばの 向きに ふち（光・かげ）と 木目の すじ
  const plank = columns(spread([[1, P.plankL], [3, P.plank], [1, P.plankD], [4, P.plank], [1, P.plankD], [5, P.plank], [1, P.plankD]]));
  const plankEnd = solid(P.plankD);
  rect(plankEnd, 1, 1, 14, 14, P.plank);

  // 鉄の かすがい
  const tie = solid(P.tie);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) tie[y * N + x] = y < 3 || y > 12 ? P.tieL : P.tie;

  // のぼり: 藍の 布 ＋ 建築士さんの せなかの しるし「回」
  const flag = solid(P.flag);
  rect(flag, 0, 0, 16, 2, P.flagL);
  rect(flag, 3, 4, 10, 10, P.flagW);
  rect(flag, 6, 7, 4, 4, P.flag);

  return { h1_soil_top: soilTop, h1_soil_side: soilSide, h1_pole: pole, h1_pole_end: poleEnd, h1_plank: plank, h1_plank_end: plankEnd, h1_tie: tie, h1_flag: flag };
}

const toPx = (t: Px): NumPx => t.map((c) => (c ? parseInt(c.slice(1), 16) : 0));

/** 絵 8 まい（0xRRGGBB の 列。上の 行から） */
export function buildTiles(): Record<BuildTile, NumPx> {
  const t = paintBuildTiles();
  return Object.fromEntries(BUILD_TILE_NAMES.map((n) => [n, toPx(t[n])])) as Record<BuildTile, NumPx>;
}
