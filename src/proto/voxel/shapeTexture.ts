import { Data3DTexture, NearestFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { ALL_FACES, LOOK_N, LOOK_VOLUME, baseColorOf, fillBlockLook, hasLook, paletteRgb } from './looks';

/** くり返しの大きさ: 3 ブロック = 27 小ブロック */
export const TEX_REPEAT = 3;
export const TEX_N = TEX_REPEAT * LOOK_N;

/**
 * 種類ごとの色の模様（3D）。幅・高さ・奥ゆき = 27、種類の番号ぶんだけ奥ゆきにならべる。
 * texel(x, y, z + 27 * 種類) = 色（sRGB, RGBA）。空のマスは その種類の代表の色でうめる。
 */
export function buildShapeTextureData(kindCount: number): Uint8Array {
  const data = new Uint8Array(TEX_N * TEX_N * TEX_N * kindCount * 4);
  const block = new Uint8Array(LOOK_VOLUME);
  const PALETTE_RGB = paletteRgb();
  for (let kind = 0; kind < kindCount; kind++) {
    if (!hasLook(kind)) continue;
    const fallback = baseColorOf(kind);
    for (let bz = 0; bz < TEX_REPEAT; bz++) {
      for (let by = 0; by < TEX_REPEAT; by++) {
        for (let bx = 0; bx < TEX_REPEAT; bx++) {
          fillBlockLook(kind, 1000 + bx, 1000 + by, 1000 + bz, ALL_FACES, block);
          for (let z = 0; z < LOOK_N; z++) {
            for (let y = 0; y < LOOK_N; y++) {
              for (let x = 0; x < LOOK_N; x++) {
                const c = block[(y * LOOK_N + z) * LOOK_N + x] || fallback;
                const tx = bx * LOOK_N + x;
                const ty = by * LOOK_N + y;
                const tz = kind * TEX_N + bz * LOOK_N + z;
                const o = ((tz * TEX_N + ty) * TEX_N + tx) * 4;
                data[o] = PALETTE_RGB[c * 3];
                data[o + 1] = PALETTE_RGB[c * 3 + 1];
                data[o + 2] = PALETTE_RGB[c * 3 + 2];
                data[o + 3] = 255;
              }
            }
          }
        }
      }
    }
  }
  return data;
}

export function createShapeTexture(kindCount: number): Data3DTexture {
  const t = new Data3DTexture(buildShapeTextureData(kindCount), TEX_N, TEX_N, TEX_N * kindCount);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping;
  t.unpackAlignment = 1;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
