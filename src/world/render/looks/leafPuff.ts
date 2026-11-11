import { mix } from './common';
import { LOOK_N } from './types';

/**
 * はっぱの「もこもこ」の 形（オーナー 2026-11-10 OK）。
 * 空気に 出ている 面を 少し 引っこめ、面が 出会う へり・かどを 大きく まるめた 上に、大きな まるい こぶを 1〜2 こ のせる。
 * となりが はっぱ・幹の 面は いっぱいまで つめる（木の 中に 面を 残さない。つぎ目に すきまを 作らない）。
 * 細かい でこぼこ・穴は 作らない（ぶつぶつに 見えて 気持ち悪い。オーナー 2026-11-10）。こぶは ブロックの 半分くらいの 大きさ。
 */
const N = LOOK_N;

/** 形の 数（単位は 小ブロック。1 ブロック = 9） */
export const LEAF_PUFF = {
  /** 空気に 出た 面を 引っこめる 深さ */
  inset: 1.5,
  /** へり・かどの まるみの 半径 */
  corner: 4,
  /** こぶの 半径（小さい・大きい） */
  radius: [3.6, 4.6],
  /** まつ: こぶ・まるみの 上下を この 割合に つぶす（平たい 段） */
  padSquash: 0.6,
} as const;

export type LeafPuffStyle = 'round' | 'pad';

/** 1 軸の「しん」から はみ出た 長さ（まるみの 半径で 割った 数）。空気に 出ていない 側は 0 */
function over(p: number, openLo: number, openHi: number, r: number): number {
  const c = p + 0.5;
  const d = LEAF_PUFF.inset;
  if (openLo && c < d + r) return (d + r - c) / r;
  if (openHi && c > N - d - r) return (c - (N - d - r)) / r;
  return 0;
}

/** open = 空気に 出ている 面（上 1, 下 2, +x 4, -x 8, +z 16, -z 32）。色番号 color を out に 書く */
export function fillLeafPuff(h: number, open: number, out: Uint8Array, color: number, style: LeafPuffStyle): void {
  const r = LEAF_PUFF.corner;
  const sq = style === 'pad' ? LEAF_PUFF.padSquash : 1;
  let i = 0;
  for (let y = 0; y < N; y++) {
    const qy = over(y, open & 2, open & 1, r * sq);
    for (let z = 0; z < N; z++) {
      const qz = over(z, open & 32, open & 16, r);
      for (let x = 0; x < N; x++, i++) {
        const qx = over(x, open & 8, open & 4, r);
        out[i] = qx * qx + qy * qy + qz * qz <= 1 ? color : 0;
      }
    }
  }
  if (open === 0) return;
  // 面ごとに 大きな こぶ。こぶは 面に ちょうど さわる（ブロックの 外へは 出ない）
  for (let f = 0; f < 6; f++) {
    if (!(open & (1 << f))) continue;
    const axis = f < 2 ? 1 : f < 4 ? 0 : 2;
    const plus = f % 2 === 0;
    const n = 1 + (mix(h, 100 + f) % 2);
    for (let k = 0; k < n; k++) {
      const r1 = mix(h, 200 + f * 8 + k);
      const rad = LEAF_PUFF.radius[0] + ((r1 & 255) / 255) * (LEAF_PUFF.radius[1] - LEAF_PUFF.radius[0]);
      const squash = axis === 1 ? 1 : sq;
      const c = [0, 0, 0];
      c[axis] = plus ? N - rad : rad;
      const ua = (axis + 1) % 3;
      const va = (axis + 2) % 3;
      // 2 こ のせる ときは 面の 半分ずつへ（かさならない）
      const half = n === 1 ? -1 : k;
      c[ua] = spot(((r1 >>> 8) & 255) / 255, half, open, ua, rad * (ua === 1 ? squash : 1));
      c[va] = spot(((r1 >>> 16) & 255) / 255, half < 0 ? -1 : 1 - half, open, va, rad * (va === 1 ? squash : 1));
      stamp(out, c[0]!, c[1]!, c[2]!, rad, squash, color);
    }
  }
}

/** 面の 中の 1 軸の 位置。その 軸の はしが 空気なら こぶが はみ出ない 所まで、はっぱに つながる はしなら はしまで。half: -1 全体, 0 手前半分, 1 奥半分 */
function spot(t: number, half: number, open: number, axis: number, rad: number): number {
  const minusBit = axis === 0 ? 8 : axis === 1 ? 2 : 32;
  const plusBit = axis === 0 ? 4 : axis === 1 ? 1 : 16;
  const a = open & minusBit ? Math.min(rad, N / 2) : 1;
  const b = open & plusBit ? Math.max(N - rad, N / 2) : N - 1;
  const mid = (a + b) / 2;
  if (half < 0) return a + (b - a) * t;
  return half === 0 ? a + (mid - a) * t : mid + (b - mid) * t;
}

function stamp(out: Uint8Array, cx: number, cy: number, cz: number, rad: number, squashY: number, color: number): void {
  for (let y = 0; y < N; y++) {
    const dy = (y + 0.5 - cy) / squashY;
    for (let z = 0; z < N; z++) {
      const dz = z + 0.5 - cz;
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy + dz * dz <= rad * rad) out[(y * N + z) * N + x] = color;
      }
    }
  }
}
