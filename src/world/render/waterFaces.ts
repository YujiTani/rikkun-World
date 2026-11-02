import { AIR } from '../blocks/blockTypes';
import { MAGMA_TUNING, liquidAmountOf, magmaBoilsAt } from '../blocks/liquids';
import { tileUv } from '../blocks/textures';
import { magmaAmount } from '../blocks/magma';

/**
 * WATER-1 §3: 水の マスの 面の 高さ。水面の 高さ = 量 ÷ 8、すぐ 上が 同じ 液体なら いっぱい(1)。
 * 高さが ちがう 液体どうしの 横の 面は、高い ほうの マスが 描く(となりの 液面の 高さ 〜 自分の 液面)。
 * WATERFALL-1: マグマも 同じ（同じ 種類どうしだけ つながる。水と マグマの 間は ふつうの 面）。マグマの 液面の 印は 小さい（ゆっくり・小さく ゆれる）。
 * 結果は このファイルの scratch（毎フレーム 新しい 物を 作らない）。
 */
export const WATER_SPAN = {
  /** 面の 下の 辺の 高さ(マスの 底からの 距離 0〜1) */
  lo: 0,
  /** 面の 上の 辺の 高さ */
  hi: 1,
  /** 下の 辺・上の 辺の 頂点が 液面か(ゆらめきの 印。水 = 1、マグマ = MAGMA_TUNING.waveAmpMul) */
  waveLo: 0,
  waveHi: 0,
  /** 版 2: 煮えたぎる マグマの 面なら その 1 コマ目の UV（印に 2 を 足して shader が コマを ずらす）。ほかは null */
  uv: null as [number, number, number, number] | null,
};
/** 印に 足す 「煮えたぎる」の しるし（shader は 1.5 以上を 煮えたぎる と 読む） */
const BOIL_FLAG = 2;
const BOIL_UV = tileUv('magma_boil_0');

/**
 * 液体の マス (x, y, z)（番号 b）の face 向きの 面を 描くか。描くなら true を 返して `WATER_SPAN` に 高さ（と 煮えたぎる マグマの UV）を 書く。
 * nIdx = その 向きの となりの 番号（0 以上。世界の 外は 呼ぶ 前に 外す）。
 */
export function waterFaceSpan(world: { getIndex(x: number, y: number, z: number): number }, x: number, y: number, z: number, b: number, face: { readonly dir: readonly number[] }, nIdx: number): boolean {
  if (!spanOf(world, x, y, z, b, face, nIdx)) return false;
  if (magmaAmount(b) > 0 && magmaBoilsAt(x, y, z)) {
    WATER_SPAN.waveLo += BOIL_FLAG;
    WATER_SPAN.waveHi += BOIL_FLAG;
    WATER_SPAN.uv = BOIL_UV;
  } else WATER_SPAN.uv = null;
  return true;
}

/** その マスが 液面(自由な 液面)を もつか: 低い(量 < 8)、または 上が 空気 */
function freeSurface(aboveIdx: number, amount: number): boolean {
  return amount < 8 || aboveIdx === AIR;
}

/**
 * 液体の マス (x, y, z)（番号 b）の face 向きの 面を 描くか。描くなら true を 返して `WATER_SPAN` に 高さを 書く。
 * nIdx = その 向きの となりの 番号（0 以上。世界の 外は 呼ぶ 前に 外す）。
 */
function spanOf(world: { getIndex(x: number, y: number, z: number): number }, x: number, y: number, z: number, b: number, face: { readonly dir: readonly number[] }, nIdx: number): boolean {
  const amt = liquidAmountOf(b);
  const mark = magmaAmount(b) > 0 ? MAGMA_TUNING.waveAmpMul : 1;
  const same = (i: number): boolean => amt(i) > 0;
  const a = amt(b);
  const s = WATER_SPAN;
  const aboveIdx = world.getIndex(x, y + 1, z);
  if (face.dir[1] === 1) {
    if (nIdx !== AIR) return false;
    s.lo = 0;
    s.hi = a / 8;
    s.waveLo = 0;
    s.waveHi = mark;
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
  const h = same(aboveIdx) ? 1 : a / 8;
  const topWave = freeSurface(aboveIdx, a) && !same(aboveIdx) ? mark : 0;
  if (nIdx === AIR) {
    s.lo = 0;
    s.hi = h;
    s.waveLo = 0;
    s.waveHi = topWave;
    return true;
  }
  if (!same(nIdx)) return false;
  const nx = x + face.dir[0];
  const nz = z + face.dir[2];
  const nAbove = world.getIndex(nx, y + 1, nz);
  const na = amt(nIdx);
  const hn = same(nAbove) ? 1 : na / 8;
  if (!(h > hn)) return false;
  s.lo = hn;
  s.hi = h;
  s.waveLo = freeSurface(nAbove, na) && !same(nAbove) ? mark : 0;
  s.waveHi = topWave;
  return true;
}
