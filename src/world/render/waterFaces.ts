import { AIR } from '../blocks/blockTypes';
import { isWaterIndex, waterAmount } from '../blocks/water';

/**
 * WATER-1 §3: 水の マスの 面の 高さ。水面の 高さ = 量 ÷ 8、すぐ 上が 水なら いっぱい(1)。
 * 高さが ちがう 水どうしの 横の 面は、高い ほうの マスが 描く(となりの 水面の 高さ 〜 自分の 水面)。
 * 結果は このファイルの scratch（毎フレーム 新しい 物を 作らない）。
 */
export const WATER_SPAN = {
  /** 面の 下の 辺の 高さ(マスの 底からの 距離 0〜1) */
  lo: 0,
  /** 面の 上の 辺の 高さ */
  hi: 1,
  /** 下の 辺・上の 辺の 頂点が 水面か(ゆらめきの 印。1 = ゆらす) */
  waveLo: 0,
  waveHi: 0,
};

/** その マスが 水面(自由な 水面)を もつか: 低い(量 < 8)、または 上が 空気 */
function freeSurface(aboveIdx: number, amount: number): boolean {
  return amount < 8 || aboveIdx === AIR;
}

/** 水の マスの 高さ(0〜1)。すぐ 上が 水なら 1 */
function cellHeight(world: { getIndex(x: number, y: number, z: number): number }, x: number, y: number, z: number, amount: number): number {
  return isWaterIndex(world.getIndex(x, y + 1, z)) ? 1 : amount / 8;
}

/**
 * 水の マス (x, y, z)（番号 b）の face 向きの 面を 描くか。描くなら true を 返して `WATER_SPAN` に 高さを 書く。
 * nIdx = その 向きの となりの 番号（0 以上。世界の 外は 呼ぶ 前に 外す）。
 */
export function waterFaceSpan(world: { getIndex(x: number, y: number, z: number): number }, x: number, y: number, z: number, b: number, face: { readonly dir: readonly number[] }, nIdx: number): boolean {
  const a = waterAmount(b);
  const s = WATER_SPAN;
  const aboveIdx = world.getIndex(x, y + 1, z);
  if (face.dir[1] === 1) {
    if (nIdx !== AIR) return false;
    s.lo = 0;
    s.hi = a / 8;
    s.waveLo = 0;
    s.waveHi = 1;
    return true;
  }
  if (face.dir[1] === -1) {
    if (nIdx !== AIR) return false;
    s.lo = 0;
    s.hi = 1;
    s.waveLo = 0;
    s.waveHi = 0;
    return true;
  }
  const h = isWaterIndex(aboveIdx) ? 1 : a / 8;
  const topWave = freeSurface(aboveIdx, a) && !isWaterIndex(aboveIdx) ? 1 : 0;
  if (nIdx === AIR) {
    s.lo = 0;
    s.hi = h;
    s.waveLo = 0;
    s.waveHi = topWave;
    return true;
  }
  if (!isWaterIndex(nIdx)) return false;
  const nx = x + face.dir[0];
  const nz = z + face.dir[2];
  const nAbove = world.getIndex(nx, y + 1, nz);
  const na = waterAmount(nIdx);
  const hn = cellHeight(world, nx, y, nz, na);
  if (!(h > hn)) return false;
  s.lo = hn;
  s.hi = h;
  s.waveLo = freeSurface(nAbove, na) && !isWaterIndex(nAbove) ? 1 : 0;
  s.waveHi = topWave;
  return true;
}
