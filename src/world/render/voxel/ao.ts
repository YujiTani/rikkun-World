import { AO_LEVELS } from '../config';

/**
 * 角の暗がり（AO。TEX-A、docs/art/DESIGN.md 3.2）の 式と、セクションごとの「うまり」の 3D テクスチャ（S1）。
 * シェーダー（voxelMaterial.ts）と同じ式の TypeScript 写し。テストと hook（render.aoAt）が これを使う。
 *
 * うまり: セクション（144³ 小ブロック）＋まわり 1 小ブロック。1 小ブロック 1 ビット、x 方向に 8 こずつ つめて R8UI。
 * x・z は -1〜144（146 こ）。y は -1〜153（155 こ。小ブロック地形の とび出し 9 マスが 144〜152）。
 * 並び: ((ty * OCC_NZ + tz) * OCC_W + (tx >> 3)) の ビット (tx & 7)。tx, ty, tz = 小ブロックの座標 + 1。
 */
export const OCC_NX = 146;
export const OCC_NZ = 146;
export const OCC_NY = 155;
export const OCC_W = 19; // ceil(146 / 8)
export const OCC_BYTES = OCC_W * OCC_NZ * OCC_NY;

export function occIndex(x: number, y: number, z: number): number {
  return ((y + 1) * OCC_NZ + (z + 1)) * OCC_W + ((x + 1) >> 3);
}

/** うまりを読む（範囲の外は 空） */
export function occGet(occ: Uint8Array, x: number, y: number, z: number): boolean {
  if (x < -1 || x > 144 || z < -1 || z > 144 || y < -1 || y > 153) return false;
  return ((occ[occIndex(x, y, z)] >> ((x + 1) & 7)) & 1) !== 0;
}

/** 角の段: 横の 2 つ（s1, s2）が どちらも うまっていれば 3。ほかは s1 + s2 + c */
export function aoLevel(s1: boolean, s2: boolean, c: boolean): number {
  if (s1 && s2) return 3;
  return (s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0);
}

/** 面の向きごとの 向き n と、面の中の 2 つの軸 a, b（絵の u, v の軸と同じ並び） */
const AXES: readonly { n: readonly number[]; a: readonly number[]; b: readonly number[] }[] = [
  { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  { n: [1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
  { n: [-1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
  { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] },
  { n: [0, 0, -1], a: [1, 0, 0], b: [0, 1, 0] },
];

/**
 * 小ブロック (cx, cy, cz)（セクションの中の座標）の face 向きの面の、面の中の位置 (fa, fb)（0〜1。小ブロックの中。
 * a, b は AXES の軸）での AO（1.0 = なし 〜 0.55）。面の前の層の となり 8 こを見て 4 すみの段を出し、双線形にまぜる。
 */
export function aoAtCell(occ: Uint8Array, cx: number, cy: number, cz: number, face: number, fa: number, fb: number): number {
  const { n, a, b } = AXES[face];
  const fx = cx + n[0];
  const fy = cy + n[1];
  const fz = cz + n[2];
  const o = (da: number, db: number): boolean =>
    occGet(occ, fx + a[0] * da + b[0] * db, fy + a[1] * da + b[1] * db, fz + a[2] * da + b[2] * db);
  const corner = (sa: number, sb: number): number => AO_LEVELS[aoLevel(o(sa, 0), o(0, sb), o(sa, sb))];
  const v00 = corner(-1, -1);
  const v10 = corner(1, -1);
  const v01 = corner(-1, 1);
  const v11 = corner(1, 1);
  const lo = v00 + (v10 - v00) * fa;
  const hi = v01 + (v11 - v01) * fa;
  return lo + (hi - lo) * fb;
}

/** 面の軸 a, b（ワールドの x/y/z の どれか）。aoAtCell の fa, fb を 点から出すとき使う */
export function faceAxes(face: number): { a: 0 | 1 | 2; b: 0 | 1 | 2 } {
  const t = AXES[face];
  return { a: t.a[0] ? 0 : t.a[1] ? 1 : 2, b: t.b[0] ? 0 : t.b[1] ? 1 : 2 };
}

/**
 * 小ブロックの格子（grid: 1 辺 gs。0 でないマスが うまり。原点の余白 margin マス）から うまりを つめる。
 * rowLo, rowHi = 格子の中で 中身のある y の行（rowHi は含まない）。そのほかは 空。out は 0 でうめて渡す。
 */
export function packOccupancy(grid: Uint8Array, gs: number, margin: number, rowLo: number, rowHi: number, out: Uint8Array): void {
  // うまりの y 番号 ty (0..154) ↔ 格子の y = ty - 1 + margin
  const tyLo = Math.max(0, rowLo - margin + 1);
  const tyHi = Math.min(OCC_NY, rowHi - margin + 1, gs - margin + 1);
  const gx0 = margin - 1; // 小ブロック座標 -1 の 格子の x
  for (let ty = tyLo; ty < tyHi; ty++) {
    const gy = ty - 1 + margin;
    for (let tz = 0; tz < OCC_NZ; tz++) {
      const row = (gy * gs + (tz - 1 + margin)) * gs + gx0;
      const o = (ty * OCC_NZ + tz) * OCC_W;
      for (let bx = 0; bx < OCC_W; bx++) {
        let v = 0;
        const x0 = bx * 8;
        const x1 = Math.min(8, OCC_NX - x0);
        for (let k = 0; k < x1; k++) if (grid[row + x0 + k] !== 0) v |= 1 << k;
        out[o + bx] = v;
      }
    }
  }
}
