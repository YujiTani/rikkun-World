import {
  BoxGeometry,
  DataTexture,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Material,
} from 'three';
import type { BlockId } from '../contracts';
import { BLOCK_TILES, TILE_SIZE, getTilePixels, type TileName } from '../world/blocks/textures';

const textureCache = new Map<TileName, DataTexture>();

/** 16x16 のタイル 1 枚の DataTexture（ぼかさない）。同じタイルは使いまわす */
export function tileTexture(name: TileName): DataTexture {
  let tex = textureCache.get(name);
  if (tex) return tex;
  const px = getTilePixels(name);
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const c = px[y * TILE_SIZE + x];
      // DataTexture の 1 行目は下
      const o = ((TILE_SIZE - 1 - y) * TILE_SIZE + x) * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c[3];
    }
  }
  tex = new DataTexture(data, TILE_SIZE, TILE_SIZE, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  textureCache.set(name, tex);
  return tex;
}

/** 面ごとの明るさ（+x, -x, +y, -y, +z, -z）。ちょっとだけ立体に見せる */
const FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.7, 0.7] as const;

const matCache = new Map<BlockId, Material[]>();

/** BoxGeometry の面の順（+x, -x, +y, -y, +z, -z）の材料 6 まい。使いまわすので dispose しない */
export function getBlockMaterials(id: BlockId): Material[] {
  let mats = matCache.get(id);
  if (mats) return mats;
  const tiles = BLOCK_TILES[id];
  const [top, bottom, side] = tiles ?? (['stone', 'stone', 'stone'] as const);
  const names: TileName[] = [side, side, top, bottom, side, side];
  mats = names.map((n, i) => {
    const v = Math.round(255 * FACE_SHADE[i]);
    return new MeshBasicMaterial({ map: tileTexture(n), color: (v << 16) | (v << 8) | v });
  });
  matCache.set(id, mats);
  return mats;
}

/** 1 辺 1 の箱（拡大縮小して使う）。使いまわすので dispose しない */
export const UNIT_BOX = new BoxGeometry(1, 1, 1);
