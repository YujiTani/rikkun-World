// コマ表（PNG）と atlas.json の読みこみ。PNG は 色番号 1 バイトのドットにして持つ（仕様 §4.8 ①）。
import { PALETTE_SIZE, quantizeRgba, type PaletteRgb } from './palette';
import type { SpriteMotion } from './motion';
import { GRID_ROWS, parsePacked, validatePacked, type Packed } from './packing';

export const CELL = 256;
export const DIRS = 8;
export const TIERS = 3;
export const ROWS = GRID_ROWS; // = DIRS * TIERS（packing.ts が持つ）
/** はじめに読む 4 つ（たつ・あるく → はしる・ジャンプ） */
export const BASE_MOTIONS: readonly SpriteMotion[] = ['idle', 'walk', 'run', 'jump'];
/** 刀の組（読む順。持ったときは いつも中段なので 中段から） */
export const KATANA_MOTIONS: readonly SpriteMotion[] = [
  'katana_thrust',
  'katana_walk_chudan',
  'katana_kesa',
  'katana_walk_jodan',
  'katana_kiriage',
  'katana_walk_gedan',
];
/** 弓の組（読む順） */
export const BOW_MOTIONS: readonly SpriteMotion[] = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];
/** WEAPON-5: 刀の パリィ（受け・すき / きめ）。刀を 持ったとき 刀の組の あとに 読む */
export const PARRY_MOTIONS: readonly SpriteMotion[] = ['parry', 'parryKime'];
export const MOTIONS: readonly SpriteMotion[] = [...BASE_MOTIONS, ...KATANA_MOTIONS, ...PARRY_MOTIONS, ...BOW_MOTIONS];
/** atlas.json に modelH がないときの 背の高さ（試しの表示と同じ） */
export const DEFAULT_MODEL_H = 1.7;
export const SPAN = 2.0;
export const CENTER = 0.95;
/** ゲームの キャラの背の高さ（足もとから ネコ耳の先まで） */
export const CHAR_HEIGHT = 1.8;

export type LoadImage = (url: string) => Promise<ImageData>;

export interface AtlasInfo {
  cell: number;
  dirs: number;
  tiers: number[];
  modelH: number;
  motions: Record<string, { frames: number; fps: number; packed?: Packed }>;
  /** CHAR-5: そのキャラの色見本 22 色（0〜255）。なければ undefined（= 女の子の色見本） */
  palette?: PaletteRgb;
}

/** 色番号にした 1 つの動きのコマ表 */
export interface IndexedAtlas {
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** width × height バイト。0 = とうめい、1〜22 = 色見本の番号 */
  indices: Uint8Array;
  /** 切りつめた絵のとき 四角の表（なければ 今の 格子の形） */
  packed?: Packed;
}

export function parseAtlasJson(raw: unknown): AtlasInfo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const motions: AtlasInfo['motions'] = {};
  const m = (o.motions ?? {}) as Record<string, { frames?: number; fps?: number; packed?: unknown }>;
  for (const [k, v] of Object.entries(m)) {
    const packed = parsePacked(v?.packed);
    motions[k] = { frames: Number(v?.frames) || 8, fps: Number(v?.fps) || 0, ...(packed ? { packed } : {}) };
  }
  const h = Number(o.modelH);
  let palette: PaletteRgb | undefined;
  const rawPal = o.palette;
  if (
    Array.isArray(rawPal) &&
    rawPal.length === PALETTE_SIZE &&
    rawPal.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
  ) {
    palette = rawPal.map((c) => [c[0], c[1], c[2]] as [number, number, number]);
  }
  return {
    ...(palette ? { palette } : {}),
    cell: Number(o.cell) || CELL,
    dirs: Number(o.dirs) || DIRS,
    tiers: Array.isArray(o.tiers) ? (o.tiers as number[]) : [0, 75, -75],
    modelH: h > 0 ? h : DEFAULT_MODEL_H,
    motions,
  };
}

/** ふつうの読みこみ: fetch → 色をかえずに デコード → ImageData */
export const defaultLoadImage: LoadImage = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas 2d が使えません');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
    canvas.width = 0;
    canvas.height = 0;
    return data;
  } finally {
    bmp.close();
  }
};

export const defaultLoadJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

/** 読んだ絵を 色番号にする。packed があれば 切りつめた形、なければ 格子の形。決まりと ちがえば 失敗（Error） */
export function indexImage(url: string, img: ImageData, packed?: Packed, frames?: number, palette?: PaletteRgb): IndexedAtlas {
  const { width, height } = img;
  if (packed) {
    try {
      validatePacked(packed, width, height, frames ?? Math.floor(packed.cells.length / ROWS));
    } catch (e) {
      throw new Error(`${url}: ${(e as Error).message}`);
    }
    return { width, height, cols: frames ?? packed.cells.length / ROWS, rows: ROWS, indices: quantizeRgba(img.data, width, height, palette), packed };
  }
  if (width % CELL !== 0 || height !== CELL * ROWS || width / CELL > 32) {
    throw new Error(`${url}: 絵の大きさが ちがいます（${width}×${height}）`);
  }
  return { width, height, cols: width / CELL, rows: ROWS, indices: quantizeRgba(img.data, width, height, palette) };
}

/** 絵を読んで 色番号にする */
export async function loadIndexedAtlas(url: string, loadImage: LoadImage, packed?: Packed, frames?: number): Promise<IndexedAtlas> {
  return indexImage(url, await loadImage(url), packed, frames);
}
