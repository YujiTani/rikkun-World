import { mix } from '../looks/common';

/**
 * 小ブロック地形（VOX-2）の「表面の高さ S」。three にも world にも依らない純粋関数（同じ入力 → 同じ結果）。
 *
 * S(mx, mz) = 小ブロックの列 (mx, mz)（ワールドの小ブロック座標。1 ブロック = 9 小ブロック）で、
 * 「下から何個つまっているか」。小ブロック (mx, my, mz) は my < S ならつまっている。
 *
 * 作り方（上から順に足していく）:
 *  1. 列のブロックの高さ ×9（その列の いちばん上の地面ブロックの上のへり）。
 *  2. 1 ブロックだけの段差は、辺ごとに「坂」か「崖」を決める（slopeRate の割合で坂）。
 *     坂: ブロックの まんなかから へりに向けて、となりの高さへ なめらかに近づく（へりで 1/9 の段差）。
 *     崖: そのまま。崖の下には がれき（rubble）、上のふちには かけ（notch）を 3×3 のかたまりごとに足す。
 *  3. うねり（大きい）＋ ごつごつ（小さい）＋ 3×3 のかたまりのずれ（シード付きのノイズ）。
 *  4. 岩: ブロックをまたぐ かたまり（3〜12 マス）。ゆかを ひとつ 持ち上げる。
 *  5. はんい: そのブロックの 3 マス上〜 ブロックの上のへり＋reach（上が空気なら 8）。
 *
 * 形をアートが調整するときは、下の MICRO_PARAMS の数だけを変える。
 */
export const MICRO_PARAMS = {
  /** 全部の乱数の元（世界のシードとは別。形の模様を変えたいときに変える） */
  seed: 4242,
  /** 1 ブロックの段差のうち、坂にする辺の割合（0〜1）。のこりは崖のまま */
  slopeRate: 0.6,
  /** 大きいうねり: 波の長さ（小ブロック）と ふれはば（± 小ブロック） */
  swell: { wavelength: 30, amplitude: 2.6 },
  /** 小さいごつごつ: 波の長さと ふれはば */
  rough: { wavelength: 8, amplitude: 1.4 },
  /** 3×3 のかたまりごとのずれ（± この数）。カクカクの もと */
  chunky: { cell: 3, amplitude: 1 },
  /** 崖の下の がれき（高さ・割合）と 上のふちの かけ（深さ・割合） */
  cliff: { rubbleHeight: 3, rubbleRate: 0.5, notchDepth: 3, notchRate: 0.34 },
  /** 岩: マスの大きさ（半径）と、高さ、出る割合（36×36 小ブロックに 1 つ ためす） */
  rock: { cell: 36, chance: 0.4, minRadius: 1.5, maxRadius: 6, minHeight: 2, maxHeight: 6 },
  /** 上が空気のとき 上のブロックに はみ出してよい高さ（小ブロック）／ 十字の板（草花）のとき */
  reachAir: 8,
  reachCross: 3,
  /** そのブロックの底から これ以上は ほらない */
  minAboveBase: 3,
} as const;

/** 世界の列（ブロック単位）の情報。world から作る（terrain/worldColumns.ts） */
export interface ColumnSource {
  /** その列の いちばん上の「地面のブロック」の y。無ければ（水だけ・建物・世界の外）-1 */
  surfaceY(bx: number, bz: number): number;
  /** そのブロックの上に はみ出してよい高さ（小ブロック）。0 = はみ出さない（ほるのは よい）。-1 = ブロックの上のへりに ぴったり（木の根もと・建物の下） */
  reach(bx: number, bz: number): number;
  /** 岩を のせてよい列か */
  rockOk(bx: number, bz: number): boolean;
}

export interface SurfaceSample {
  /** S: つまっている高さ。-1 = この列は小ブロック地形にしない */
  h: number;
  /** 岩を のせる前の高さ */
  ground: number;
  /** 岩で持ち上がっているか（ground ≦ my < h の小ブロックが岩） */
  rock: boolean;
}

export function newSample(): SurfaceSample {
  return { h: -1, ground: -1, rock: false };
}

const N = 9;
const P = MICRO_PARAMS;

/** 0 以上 1 未満 */
function unit(h: number): number {
  return (h >>> 8) / 16777216;
}
function hash3(s: number, a: number, b: number, c: number): number {
  return mix(mix(mix(s, a), b), c);
}

/** 値ノイズ（0〜1）。x, z は格子の単位 */
function valueNoise(s: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = unit(mix(mix(s, ix), iz));
  const b = unit(mix(mix(s, ix + 1), iz));
  const c = unit(mix(mix(s, ix), iz + 1));
  const d = unit(mix(mix(s, ix + 1), iz + 1));
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** 岩を のぞいた 地面の高さ。この列が小ブロック地形でなければ -1 */
function groundHeight(mx: number, mz: number, src: ColumnSource): number {
  const bx = Math.floor(mx / N);
  const bz = Math.floor(mz / N);
  const ty = src.surfaceY(bx, bz);
  if (ty < 0) return -1;
  const lx = mx - bx * N;
  const lz = mz - bz * N;
  const base = (ty + 1) * N;
  const seed = P.seed;
  let h = base;

  // 1 ブロックの段差: 坂か崖
  for (let axis = 0; axis < 2; axis++) {
    const l = axis === 0 ? lx : lz;
    const p = l - 4; // -4〜4（まんなかが 0）
    if (p === 0) continue;
    const dir = p > 0 ? 1 : -1;
    const nbx = axis === 0 ? bx + dir : bx;
    const nbz = axis === 0 ? bz : bz + dir;
    const tn = src.surfaceY(nbx, nbz);
    if (tn < 0) continue;
    const d = (tn - ty) * N;
    if (d === 0) continue;
    const ex = axis === 0 ? Math.min(bx, nbx) : bx;
    const ez = axis === 1 ? Math.min(bz, nbz) : bz;
    const dE = dir > 0 ? N - 1 - l : l; // へりから何マスか（0 = へりの すぐとなり）
    const slope = Math.abs(d) === N && unit(hash3(seed + 1, ex, ez, axis)) < P.slopeRate;
    if (slope) {
      h += (Math.abs(p) / N) * d;
    } else {
      const along = Math.floor((axis === 0 ? lz : lx) / 3);
      const r = unit(hash3(seed + 2 + axis, ex * 1031 + ez, along, dir * 8 + dE));
      if (d < 0) {
        // となりが ひくい = 上のふち: かけ
        if (dE < 2 && unit(hash3(seed + 5 + axis, ex * 1031 + ez, along, dir)) < P.cliff.notchRate) {
          h -= Math.max(0, P.cliff.notchDepth - dE - (r < 0.5 ? 1 : 0));
        }
      } else if (dE < P.cliff.rubbleHeight && unit(hash3(seed + 7 + axis, ex * 1031 + ez, along, dir)) < P.cliff.rubbleRate) {
        // となりが たかい = 崖の下: がれき
        h += P.cliff.rubbleHeight - dE - (r < 0.4 ? 1 : 0);
      }
    }
  }

  // ノイズ: 大きいうねり（やや下向き）＋ 小さいごつごつ ＋ 3×3 のずれ
  h += (valueNoise(seed + 11, mx / P.swell.wavelength, mz / P.swell.wavelength) - 0.62) * 2 * P.swell.amplitude;
  h += (valueNoise(seed + 12, mx / P.rough.wavelength, mz / P.rough.wavelength) - 0.5) * 2 * P.rough.amplitude;
  const cs = P.chunky.cell;
  const k = mix(mix(seed + 13, Math.floor(mx / cs)), Math.floor(mz / cs)) % 5;
  h += k === 0 ? -P.chunky.amplitude : k === 4 ? P.chunky.amplitude : 0;

  const reach = src.reach(bx, bz);
  if (reach < 0) return base;
  const lo = ty * N + P.minAboveBase;
  const hi = base + reach;
  return Math.min(Math.max(Math.floor(h + 0.5), lo), hi);
}

/** 列 (mx, mz) の S を out に書く。岩ものせる */
export function sampleSurface(mx: number, mz: number, src: ColumnSource, out: SurfaceSample): void {
  const g = groundHeight(mx, mz, src);
  out.ground = g;
  out.h = g;
  out.rock = false;
  if (g < 0) return;

  const R = P.rock;
  const seed = P.seed + 100;
  const rcx = Math.floor(mx / R.cell);
  const rcz = Math.floor(mz / R.cell);
  const r = hash3(seed, rcx, rcz, 1);
  if (unit(r) >= R.chance) return;
  const radius = R.minRadius + unit(mix(r, 2)) * (R.maxRadius - R.minRadius);
  const margin = Math.ceil(R.maxRadius) + 1;
  const span = R.cell - 2 * margin;
  const cx = rcx * R.cell + margin + (mix(r, 3) % span);
  const cz = rcz * R.cell + margin + (mix(r, 4) % span);
  const dx = Math.abs(mx - cx);
  const dz = Math.abs(mz - cz);
  if (dx >= radius || dz >= radius) return;
  // 四角っぽい まるみ（2.5 乗）
  const d = Math.pow(Math.pow(dx, 2.5) + Math.pow(dz, 2.5), 0.4) / radius;
  if (d >= 1) return;
  const cbx = Math.floor(cx / N);
  const cbz = Math.floor(cz / N);
  if (!src.rockOk(cbx, cbz)) return;
  const gc = groundHeight(cx, cz, src);
  if (gc < 0) return;
  const t = (radius - R.minRadius) / (R.maxRadius - R.minRadius);
  const top = R.minHeight + t * (R.maxHeight - R.minHeight);
  let bump = Math.round(top * Math.sqrt(1 - d * d));
  if (bump >= 2) {
    // 3×3 のかたまりごとに 上がり下がり（ごつごつ）
    const j = mix(mix(seed + 5, Math.floor(mx / 3)), Math.floor(mz / 3)) % 4;
    bump += j === 0 ? -1 : j === 3 ? 1 : 0;
  }
  const level = gc + bump;
  if (level <= g) return;
  const bx = Math.floor(mx / N);
  const bz = Math.floor(mz / N);
  const ty = src.surfaceY(bx, bz);
  const reach = src.reach(bx, bz);
  if (reach < 0) return;
  const h = Math.min(level, (ty + 1) * N + reach);
  if (h > g) {
    out.h = h;
    out.rock = true;
  }
}

const tmp: SurfaceSample = newSample();

/** S だけ欲しいとき */
export function microSurfaceHeight(mx: number, mz: number, src: ColumnSource): number {
  sampleSurface(mx, mz, src, tmp);
  return tmp.h;
}
