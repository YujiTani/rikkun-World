import { mix } from './common';
import { LOOK_N } from './types';

/**
 * はっぱの「もこもこ」の 形（?leaf=moko の 試し）。
 * 空気に 出ている 面だけを 2 マス 引っこめて、その上に まるい こぶ（球）を のせる。
 * となりが はっぱ・幹の 面は いっぱいまで つめる（木の 中に 面を 残さない。つぎ目に すきまを 作らない）。
 * 1 マスだけの 穴は 作らない（遠くで ちらつく）。
 */
const N = LOOK_N;

/** 形の 数（単位は 小ブロック。1 ブロック = 9） */
export const LEAF_PUFF = {
  /** 空気に 出た 面を 引っこめる 深さ */
  inset: 2,
  /** 1 つの 面に のせる こぶの 数（少ない・多い） */
  perFace: [2, 3],
  /** こぶの 半径（小さい・大きい） */
  radius: [2.6, 3.5],
} as const;

export type LeafPuffStyle = 'round' | 'pad';

/** open = 空気に 出ている 面（上 1, 下 2, +x 4, -x 8, +z 16, -z 32）。色番号 color を out に 書く */
export function fillLeafPuff(h: number, open: number, out: Uint8Array, color: number, style: LeafPuffStyle): void {
  const d = LEAF_PUFF.inset;
  const lo = [open & 8 ? d : 0, open & 2 ? d : 0, open & 32 ? d : 0];
  const hi = [open & 4 ? N - 1 - d : N - 1, open & 1 ? N - 1 - d : N - 1, open & 16 ? N - 1 - d : N - 1];
  let i = 0;
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++, i++) {
        out[i] = x >= lo[0]! && x <= hi[0]! && y >= lo[1]! && y <= hi[1]! && z >= lo[2]! && z <= hi[2]! ? color : 0;
      }
    }
  }
  if (open === 0) return;
  // 面ごとに こぶを のせる。こぶは 面に ちょうど さわる 高さ（ブロックの 外へは 出ない）
  for (let f = 0; f < 6; f++) {
    if (!(open & (1 << f))) continue;
    const axis = f < 2 ? 1 : f < 4 ? 0 : 2;
    const plus = f % 2 === 0;
    const r0 = mix(h, 100 + f);
    const n = LEAF_PUFF.perFace[0] + (r0 % (LEAF_PUFF.perFace[1] - LEAF_PUFF.perFace[0] + 1));
    for (let k = 0; k < n; k++) {
      const r1 = mix(h, 200 + f * 8 + k);
      const rad = LEAF_PUFF.radius[0] + ((r1 & 255) / 255) * (LEAF_PUFF.radius[1] - LEAF_PUFF.radius[0]);
      const c = [0, 0, 0];
      c[axis] = plus ? N - rad : rad;
      // 面の 中の 位置: k ごとに 面の 半分ずつへ ちらす（かたまらない）
      const ua = (axis + 1) % 3;
      const va = (axis + 2) % 3;
      const half = k % 2 === 0 ? 0 : 1;
      c[ua] = spot(((r1 >>> 8) & 255) / 255, half, open, ua, rad);
      c[va] = spot(((r1 >>> 16) & 255) / 255, (half + (k >> 1)) % 2, open, va, rad);
      stamp(out, c[0]!, c[1]!, c[2]!, rad, style === 'pad' && axis !== 1 ? 0.62 : 1, color);
    }
  }
}

/** 面の 中の 1 軸の 位置。その 軸の はしが 空気なら 球が はみ出ない 所まで、はっぱに つながる はしなら はしまで */
function spot(t: number, half: number, open: number, axis: number, rad: number): number {
  const minusBit = axis === 0 ? 8 : axis === 1 ? 2 : 32;
  const plusBit = axis === 0 ? 4 : axis === 1 ? 1 : 16;
  const a = open & minusBit ? rad : 0.5;
  const b = open & plusBit ? N - rad : N - 0.5;
  const mid = (a + b) / 2;
  return half === 0 ? a + (mid - a) * t : mid + (b - mid) * t;
}

function stamp(out: Uint8Array, cx: number, cy: number, cz: number, rad: number, squashY: number, color: number): void {
  const ry = rad * squashY;
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(N - 1, Math.ceil(cy + ry));
  const z0 = Math.max(0, Math.floor(cz - rad));
  const z1 = Math.min(N - 1, Math.ceil(cz + rad));
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(N - 1, Math.ceil(cx + rad));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / squashY;
    for (let z = z0; z <= z1; z++) {
      const dz = z + 0.5 - cz;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy + dz * dz <= rad * rad) out[(y * N + z) * N + x] = color;
      }
    }
  }
}
