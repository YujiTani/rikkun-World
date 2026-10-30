// HOUSE-1B 試作: 見本の 絵の 表（atlas）。ゲームの 本物の atlas（TILE_NAMES）の 中身を そのまま 写し、
// 下に 試作の 絵（家の かべ・ゆか・やね・しょうじ・戸 ＋ 新しい 家具の 絵）の 行を 足した もの。
// 本物の atlas に 足すと 全部の UV が ずれて 地形の テストが 落ちる ため、試作は 写しを 使う（本実装では 本物の atlas に 足す）。
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { ATLAS_COLS, ATLAS_HEIGHT, ATLAS_WIDTH, TILE_NAMES, TILE_SIZE, buildAtlasData, type TileName } from '../../world/blocks/textures';
import { FURN_TILE_NAMES, furnTiles, type FurnTile } from './furnitureArt';
import { HOUSE_TILE_NAMES, houseTiles, type HouseTile } from './look';
import type { Px } from './tilePaint';

export type PreviewTile = TileName | `furn_${FurnTile}` | HouseTile;

const EXTRA_NAMES: readonly PreviewTile[] = [...FURN_TILE_NAMES.map((n): PreviewTile => `furn_${n}`), ...HOUSE_TILE_NAMES];
const ALL: readonly PreviewTile[] = [...TILE_NAMES, ...EXTRA_NAMES];
const INDEX = new Map<PreviewTile, number>(ALL.map((n, i) => [n, i]));
const ROWS = Math.ceil(ALL.length / ATLAS_COLS);
const HEIGHT = ROWS * TILE_SIZE;

/** 本物の atlas で 計算された UV の v に かけると、この 写しの UV に なる（本物の atlas は この 写しの 下の 部分） */
export const MAIN_V_SCALE = ATLAS_HEIGHT / HEIGHT;

/** 家具の 絵の 名前（furnitureArt の 名前）→ 見本の 絵の 名前。本物の ブロックの 絵は そのまま */
export function tileOf(name: string): PreviewTile {
  const furn = `furn_${name}` as PreviewTile;
  return INDEX.has(furn) ? furn : (name as PreviewTile);
}

/** タイルの UV の 四角 [u0, v0, u1, v1]（となりに にじまない よう 少し 内がわ。textures.ts の tileUv と 同じ 式） */
export function tileRect(name: PreviewTile): [number, number, number, number] {
  const i = INDEX.get(name);
  if (i === undefined) throw new Error(`見本の 絵に ない: ${name}`);
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  const e = 0.01;
  return [(col * TILE_SIZE + e) / ATLAS_WIDTH, (row * TILE_SIZE + e) / HEIGHT, ((col + 1) * TILE_SIZE - e) / ATLAS_WIDTH, ((row + 1) * TILE_SIZE - e) / HEIGHT];
}

/** 見本用の 絵の 表（本物の atlas の 写し ＋ 試作の 絵）の テクスチャ。本物と 同じ 色空間・フィルター */
export function createPreviewAtlas(): DataTexture {
  const main = buildAtlasData();
  const data = new Uint8Array(ATLAS_WIDTH * HEIGHT * 4);
  data.set(main); // 本物の atlas は 下の 行から 同じ 並び
  const paint = (name: PreviewTile, px: Px): void => {
    const i = INDEX.get(name)!;
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const o = ((row * TILE_SIZE + (TILE_SIZE - 1 - y)) * ATLAS_WIDTH + col * TILE_SIZE + x) * 4;
        const c = px[y * TILE_SIZE + x]!;
        data[o] = (c >> 16) & 255;
        data[o + 1] = (c >> 8) & 255;
        data[o + 2] = c & 255;
        data[o + 3] = 255;
      }
    }
  };
  const furn = furnTiles();
  for (const n of FURN_TILE_NAMES) paint(`furn_${n}`, furn[n]);
  const house = houseTiles();
  for (const n of HOUSE_TILE_NAMES) paint(n, house[n]);
  const tex = new DataTexture(data, ATLAS_WIDTH, HEIGHT, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
