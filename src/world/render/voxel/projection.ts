import { BLOCK_INDEX, BLOCK_TYPES } from '../../blocks/blockTypes';
import { BLOCK_TILES, TILE_NAMES, getTilePixels, type TileName } from '../../blocks/textures';
import { microSoil } from '../../micro/microSurface';

/**
 * 元の 16×16 の絵（タイル）を ブロックの面に そのまま 投影する きまり（TEX-A、docs/art/DESIGN.md 4.1・4.2）。
 * シェーダー（voxelMaterial.ts）と同じ式の TypeScript 写し。テストと hook（render.texelAt）が これを使う。
 *
 * 面の向きの番号: 0 上, 1 下, 2 +x（東）, 3 -x（西）, 4 +z（南）, 5 -z（北）。
 * 向きは 9×9×9 の前の main の `pushFace` の UV と同じ: 上 = (x, z)、下 = (x, 1 - z)、東 = (1 - z, 1 - y)、
 * 西 = (z, 1 - y)、南 = (x, 1 - y)、北 = (1 - x, 1 - y)。絵の上（行 0）が ブロックの上。
 */
export const KINDS = BLOCK_TYPES.length;

/** 面の向き → [上, 下, 横] のどれか */
export function tileSlot(face: number): 0 | 1 | 2 {
  return face === 0 ? 0 : face === 1 ? 1 : 2;
}

/** ブロックの番号 × [上, 下, 横] → タイルの番号（無ければ -1） */
export function tileIndexOf(kind: number, slot: number): number {
  const t = BLOCK_TILES[BLOCK_TYPES[kind]?.id as keyof typeof BLOCK_TILES];
  return t ? TILE_NAMES.indexOf(t[slot]) : -1;
}

/** シェーダーに渡す表: kind * 3 + slot → タイルの番号（無ければ -1） */
export function tileTable(): number[] {
  const out: number[] = [];
  for (let k = 0; k < KINDS; k++) for (let s = 0; s < 3; s++) out.push(tileIndexOf(k, s));
  return out;
}

/** 面の中の位置（0〜1）から 絵の画素 (px, py)。py は絵の上から。fx, fy, fz = ワールド座標の小数部 */
export function pixelInTile(face: number, fx: number, fy: number, fz: number): { px: number; py: number } {
  let u: number;
  let v: number;
  switch (face) {
    case 0:
      u = fx;
      v = fz;
      break;
    case 1:
      u = fx;
      v = 1 - fz;
      break;
    case 2:
      u = 1 - fz;
      v = 1 - fy;
      break;
    case 3:
      u = fz;
      v = 1 - fy;
      break;
    case 4:
      u = fx;
      v = 1 - fy;
      break;
    default:
      u = 1 - fx;
      v = 1 - fy;
  }
  return { px: clamp15(Math.floor(u * 16)), py: clamp15(Math.floor(v * 16)) };
}
const clamp15 = (n: number): number => (n < 0 ? 0 : n > 15 ? 15 : n);

/** 横の面の「地面の てっぺんから 何小ブロック下か」の 符号（形の面・上下の面は 255 = 世界の高さで決める） */
export const ROW_NONE = 255;
/** てっぺんから fromTop 小ブロック下 → 符号。9 小ブロック = 絵の 16 行 なので 9 より下は 9〜17 をくり返す */
export function rowCodeOf(fromTop: number): number {
  return fromTop < 9 ? fromTop : 9 + (fromTop % 9);
}

const DIRT_TILE = TILE_NAMES.indexOf('dirt');
const GRASS = BLOCK_INDEX.grass;
const DIRT = BLOCK_INDEX.dirt;
const STONE = BLOCK_INDEX.stone;

/**
 * 小ブロック地形の横の面: その場所の 絵の行 = 地面のてっぺんからの深さ（1 小ブロック = 16/9 行）。16 行より下は 土の絵
 * （くさ のとき。ほかは 同じ絵を くり返す）。fy = 小ブロックの中の高さの小数部（0 = 下）。
 */
export function terrainSideRow(kind: number, rowCode: number, fy: number, tile: number): { tile: number; py: number } {
  let py = Math.floor(((rowCode + 1 - fy) * 16) / 9);
  if (py < 0) py = 0;
  if (py >= 16) {
    py %= 16;
    if (kind === GRASS) tile = DIRT_TILE;
  }
  return { tile, py };
}

/**
 * 小ブロック地形のマスの「絵のもと」にするブロックの種類（岩は いし、くさの上の土が見える所は つち）。
 * colKind = 地面ブロックの種類、fromTop = てっぺんから 何小ブロック下、rock = 岩のマス、wx, wz = 小ブロックの座標。
 */
export function terrainKindOf(colKind: number, fromTop: number, rock: boolean, wx: number, wz: number): number {
  if (rock) return STONE;
  if (colKind === GRASS && fromTop < 2 && microSoil(wx, wz)) return DIRT;
  return colKind;
}

// ---------------------------------------------------------------- タイルの平均色

/** sRGB の 0〜255 → 線形 0〜1（シェーダーの 絵の 画素〔sRGB テクスチャ〕と そろえる） */
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const avgCache = new Map<TileName, [number, number, number]>();
/** タイルの平均の色（線形） */
export function tileAverage(name: TileName): [number, number, number] {
  let a = avgCache.get(name);
  if (!a) {
    const px = getTilePixels(name);
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of px) {
      r += srgbToLinear(p[0]);
      g += srgbToLinear(p[1]);
      b += srgbToLinear(p[2]);
    }
    a = [r / px.length, g / px.length, b / px.length];
    avgCache.set(name, a);
  }
  return a;
}

/** シェーダー用: タイルの番号 → 平均の色（線形。3 つずつ） */
export function tileAverageTable(): number[] {
  const out: number[] = [];
  for (const n of TILE_NAMES) out.push(...tileAverage(n));
  return out;
}

/**
 * 鉱石の「とびだす つぶ」（B。MINE-1B）を 小ブロックごとの 色で ぬる 距離〔ブロック。プレイヤーから 水平に〕。これより 遠くは 平らな 絵
 * （B の つぶの ならびを 16 点に うつした 絵 = ブロックの 絵）。07-mine.md 20.8
 */
export const GRAIN_NEAR = 16;
/** つぶの ある 種類の 地の 石に 使う 絵（ふつうの いし） */
export const GRAIN_BODY_TILE = TILE_NAMES.indexOf('stone');

/** 遠くで 絵の画素を 平均色へよせる距離（小ブロック・箱の段）: 40 ブロックから 80 ブロックへ */
export const FADE_NEAR = 40;
export const FADE_FAR = 80;
export function avgFade(dist: number): number {
  const t = Math.min(1, Math.max(0, (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
  return t * t * (3 - 2 * t);
}
