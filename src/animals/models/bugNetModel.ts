import { COL, type Part, type Prim, type V3 } from './chickenSpec';
import { cachedModel, type BuiltModel } from './voxelMesh';

/**
 * LIVE-1 版 3.2 の むし（B2「おもち いもむし」）と むしとりあみ（N3「ふかい ふくろ」）の 形（DESIGN 16.16）。
 * 数は オーナーが 選んだ 試作（art/v3/proto/livestockV3.ts の `bug('B2')`・`net('N3')`）と 同じ。単位は 1/16 ブロック。
 * 乱数なし。1 回 だけ 作って 使いまわす（骨 1 本・動かない 形）。
 */
const box = (a: V3, b: V3, col: number): Prim => ({ k: 'box', a, b, col });
const ell = (c: V3, r: V3, col: number, p?: number): Prim => ({ k: 'ell', c, r, col, p });
const mir = (a: V3, b: V3, col: number): Prim[] => [box(a, b, col), box([-b[0], a[1], a[2]], [-a[0], b[1], b[2]], col)];

/** むし の 三角形 の 上限（DESIGN 16.16） */
export const BUG_TRI_LIMIT = 200;
/** むしとりあみ の 三角形 の 上限（DESIGN 16.16） */
export const NET_TRI_LIMIT = 700;

export const BUG_COL = { body: 0xf3e6c8, band: 0xe8962e } as const;
export const NET_COL = { grip: 0x3d5a9e, pole: 0xc9b26a, ring: 0x8c5e3a, bag: 0xefe7d4 } as const;

/** むし: 生成りの まる 5 つ（1.7 点 ごと・少し 弓なり）＋ だいだいの 帯 ＋ だいだいの 頭 ＋ 目 2 ＋ 触角 2。足は 描かない。前 = −z、中心 を 原点 の 近くに */
export function bugSpec(): Part[] {
  const arch = 0.8;
  const dz = 0.4;
  const prims: Prim[] = [];
  for (let i = 0; i < 5; i++) {
    const z = 3.2 - i * 1.7 + dz;
    const y = 1.6 + Math.sin((i / 4) * Math.PI) * arch;
    prims.push(ell([0, y, z], [1.6, 1.6, 1.0], i === 4 ? BUG_COL.band : BUG_COL.body, 2.4));
    if (i < 4) prims.push(ell([0, y, z - 0.85], [1.5, 1.5, 0.45], BUG_COL.band, 2.4));
  }
  prims.push(box([-1.2, 2, -5 + dz], [-0.2, 3, -4.4 + dz], COL.eye), box([0.4, 2, -5 + dz], [1.4, 3, -4.4 + dz], COL.eye));
  prims.push(...mir([0.5, 3, -4.5 + dz], [1.5, 4.2, -3.5 + dz], BUG_COL.body));
  return [{ name: 'bug', pivot: [0, 0, 0], prims }];
}

/** むしとりあみ: 柄 1×22（下 7 点 が 藍の にぎり）・しずく形の わ（こい木）・先へ 細く 下へ たれる 生成りの ふくろ（まん中 に 藍の すじ）。柄 = +y、ふくろ = +z */
export function netSpec(): Part[] {
  const cy = 26;
  const R = 4.5;
  const rim = (x: number, y: number): number => {
    const dx = x - 0.5;
    const dy = y - cy;
    const ry = dy < 0 ? R * 1.25 : R;
    return Math.hypot(dx / R, dy / ry);
  };
  const prims: Prim[] = [
    { k: 'fn', a: [0, 0, 0], b: [1, 22, 1], f: (_x, y) => (y < 7 ? NET_COL.grip : NET_COL.pole) },
    box([-0.5, 0, -0.5], [1.5, 6, 1.5], NET_COL.grip),
    { k: 'fn', a: [-5, 19, -1], b: [6, 32, 1], f: (x, y, z) => (z < 0 && Math.abs(rim(x, y) - 1) < 0.13 ? NET_COL.ring : -1) },
    {
      k: 'fn',
      a: [-5, 10, 0],
      b: [6, 32, 9],
      f: (x, y, z) => {
        const k = Math.max(0, 1 - z / 9); // 先へ 細く・下へ たれる
        const yy = y + z * 0.9;
        const r = rim(x, yy) / Math.max(0.15, k);
        if (r > 1.05 || r < 0.8) return -1;
        return Math.abs(x - 0.5) < 0.6 && z > 1 ? NET_COL.grip : NET_COL.bag;
      },
    },
  ];
  return [{ name: 'net', pivot: [0, 0, 0], prims }];
}

export function getBugModel(): BuiltModel {
  return cachedModel('bug:B2', bugSpec);
}

export function getNetModel(): BuiltModel {
  return cachedModel('net:N3', netSpec);
}
