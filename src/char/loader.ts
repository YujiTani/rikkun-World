// コマ表（PNG）と atlas.json の読みこみ。PNG は 色番号 1 バイトのドットにして持つ（仕様 §4.8 ①）。
import { quantizeRgba } from './palette';
import type { SpriteMotion } from './motion';

export const CELL = 256;
export const DIRS = 8;
export const TIERS = 3;
export const ROWS = DIRS * TIERS;
export const MOTIONS: readonly SpriteMotion[] = ['idle', 'walk', 'run', 'jump'];
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
  motions: Record<string, { frames: number; fps: number }>;
}

/** 色番号にした 1 つの動きのコマ表 */
export interface IndexedAtlas {
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** width × height バイト。0 = とうめい、1〜20 = 色見本の番号 */
  indices: Uint8Array;
}

export function parseAtlasJson(raw: unknown): AtlasInfo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const motions: AtlasInfo['motions'] = {};
  const m = (o.motions ?? {}) as Record<string, { frames?: number; fps?: number }>;
  for (const [k, v] of Object.entries(m)) motions[k] = { frames: Number(v?.frames) || 8, fps: Number(v?.fps) || 0 };
  const h = Number(o.modelH);
  return {
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

/** 絵を読んで 色番号にする。大きさが決まりと ちがえば 失敗（Error） */
export async function loadIndexedAtlas(url: string, loadImage: LoadImage): Promise<IndexedAtlas> {
  const img = await loadImage(url);
  const { width, height } = img;
  if (width % CELL !== 0 || height !== CELL * ROWS || width / CELL > 32) {
    throw new Error(`${url}: 絵の大きさが ちがいます（${width}×${height}）`);
  }
  return { width, height, cols: width / CELL, rows: ROWS, indices: quantizeRgba(img.data, width, height) };
}
