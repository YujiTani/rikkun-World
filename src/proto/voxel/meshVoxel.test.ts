import { describe, expect, it } from 'vitest';
import { populateWorld } from '../../world/gen/populate';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { VoxelChunkMesher, type QuadMesh, type VoxelMode } from './meshVoxel';

const MODES: VoxelMode[] = ['naive', 'greedyColor', 'greedyShape', 'box'];

interface Quad {
  f: number;
  /** ワールドの小ブロック座標（整数）の 最小・最大の角 */
  lo: number[];
  hi: number[];
}

/** メッシュの四角を ぜんぶ取り出す（positions はチャンクの中の小ブロック座標） */
function quadsOf(q: QuadMesh, cx = 0, cz = 0): Quad[] {
  const out: Quad[] = [];
  const org = [cx * 144, 0, cz * 144];
  for (const piece of q.pieces) {
    expect(piece.vertexCount).toBeLessThanOrEqual(65535);
    for (let k = 0; k < piece.vertexCount / 4; k++) {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < 4; v++) {
        for (let a = 0; a < 3; a++) {
          const p = piece.positions[(k * 4 + v) * 3 + a] + org[a];
          lo[a] = Math.min(lo[a], p);
          hi[a] = Math.max(hi[a], p);
        }
      }
      out.push({ f: piece.data[k * 16 + 3], lo, hi });
    }
  }
  expect(out.length).toBe(q.faces);
  return out;
}

/** 四角を 1 小面ずつにばらして "面の向き,位置,位置,位置" の集まりにする（重なりは数える） */
function cells(q: QuadMesh, cx = 0, cz = 0): { set: Set<string>; dup: number } {
  const set = new Set<string>();
  let dup = 0;
  for (const { f, lo, hi } of quadsOf(q, cx, cz)) {
    const ax = [1, 1, 0, 0, 2, 2][f];
    expect(lo[ax]).toBe(hi[ax]);
    const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
    for (let i = lo[u]; i < hi[u]; i++) {
      for (let j = lo[v]; j < hi[v]; j++) {
        const key = `${f},${lo[ax]},${i},${j}`;
        if (set.has(key)) dup++;
        set.add(key);
      }
    }
  }
  return { set, dup };
}

/** x = plane（ブロック単位）の面（±x 向き）の四角の数。y は ブロック単位の範囲 */
function facesOnPlaneX(q: QuadMesh, plane: number, y0 = -Infinity, y1 = Infinity): number {
  let n = 0;
  for (const { f, lo } of quadsOf(q)) {
    if (f !== 2 && f !== 3) continue;
    if (lo[0] === plane * 9 && lo[1] >= y0 * 9 && lo[1] < y1 * 9) n++;
  }
  return n;
}

function smallWorld(): ArrayVoxelWorld {
  return new ArrayVoxelWorld({ x: 16, y: 6, z: 16 });
}

describe('小ブロックの見える面だけ作る（受け入れ基準 3）', () => {
  for (const mode of MODES) {
    it(`${mode}: ならんだ 2 ブロックの間（同じ種類）の面は 0 枚、まわりの面はある`, () => {
      const w = smallWorld();
      w.setBlock(5, 2, 5, 'dirt');
      w.setBlock(6, 2, 5, 'dirt');
      const q = new VoxelChunkMesher(w).build(0, 0, mode).solid;
      expect(q.faces).toBeGreaterThan(0);
      expect(facesOnPlaneX(q, 6)).toBe(0);
      expect(facesOnPlaneX(q, 5)).toBeGreaterThan(0); // 外側の面
      expect(facesOnPlaneX(q, 7)).toBeGreaterThan(0);
    });

    it(`${mode}: ちがう種類（つち と いし）の間も 0 枚、上に重ねた間も 0 枚`, () => {
      const w = smallWorld();
      w.setBlock(5, 2, 5, 'grass');
      w.setBlock(6, 2, 5, 'stone');
      w.setBlock(5, 3, 5, 'sand');
      const q = new VoxelChunkMesher(w).build(0, 0, mode).solid;
      expect(facesOnPlaneX(q, 6, 2, 3)).toBe(0); // y = 2 の段（グラスといしの間）
      // y = 3 の面（グラスの上・すなの下）は 0 枚
      let between = 0;
      for (const { f, lo } of quadsOf(q)) {
        if ((f === 0 || f === 1) && lo[1] === 3 * 9 && lo[0] >= 5 * 9 && lo[0] < 6 * 9) between++;
      }
      expect(between).toBe(0);
    });
  }

  it('ブロックが無ければ 何も作らない', () => {
    const q = new VoxelChunkMesher(smallWorld()).build(0, 0, 'naive');
    expect(q.solid.faces).toBe(0);
  });
});

describe('まとめても見えている形が同じ（受け入れ基準 4）', () => {
  it('本物の島の 3 チャンクで、naive・greedyColor・greedyShape の小面が ぜんぶ同じ（穴も重なりもない）', () => {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    const info = populateWorld(w, 1);
    const sp = info.spawn();
    const cx = Math.floor(sp.x / 16);
    const cz = Math.floor(sp.z / 16);
    const mesher = new VoxelChunkMesher(w);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) {
      const x = Math.min(cx + dx, w.chunksX - 1);
      const z = Math.min(cz + dz, w.chunksZ - 1);
      const naive = mesher.build(x, z, 'naive').solid;
      const color = mesher.build(x, z, 'greedyColor').solid;
      const shape = mesher.build(x, z, 'greedyShape').solid;
      expect(naive.faces).toBeGreaterThan(1000);
      const a = cells(naive, x, z);
      const b = cells(color, x, z);
      const c = cells(shape, x, z);
      expect(a.dup).toBe(0);
      expect(b.dup).toBe(0);
      expect(c.dup).toBe(0);
      expect(b.set).toEqual(a.set);
      expect(c.set).toEqual(a.set);
      expect(color.areaSmall).toBe(naive.areaSmall);
      expect(shape.areaSmall).toBe(naive.areaSmall);
      expect(naive.areaSmall).toBe(naive.faces);
      // まとめると枚数は減る。形だけのほうが色もみるより少ない
      expect(color.faces).toBeLessThan(naive.faces);
      expect(shape.faces).toBeLessThanOrEqual(color.faces);
    }
  }, 120_000);
});

describe('hybrid の中くらい（箱）と 頂点の大きさ', () => {
  it('box: ならんだ ブロックの間の面は 0 枚、外の面だけ。広さは ブロックの面 1 つ = 81', () => {
    const w = smallWorld();
    w.setBlock(5, 2, 5, 'dirt');
    w.setBlock(6, 2, 5, 'stone');
    w.setBlock(6, 3, 5, 'stone');
    const q = new VoxelChunkMesher(w).build(0, 0, 'box').solid;
    expect(facesOnPlaneX(q, 6, 2, 3)).toBe(0);
    // 3 ブロックで 18 面。ふれあう 2 組（4 面）は無いので 14 面分
    expect(q.areaSmall).toBe(81 * 14);
  });

  it('box の面の広さは、同じ形の greedyShape（小ブロック）のうち「つまった ブロックの外の面」と同じ向きの数', () => {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    const sp = populateWorld(w, 1).spawn();
    const cx = Math.floor(sp.x / 16);
    const cz = Math.floor(sp.z / 16);
    const q = new VoxelChunkMesher(w).build(cx, cz, 'box').solid;
    const c = cells(q, cx, cz);
    expect(c.dup).toBe(0);
    expect(q.faces).toBeGreaterThan(50);
    expect(q.areaSmall).toBe(c.set.size);
  }, 60_000);

  it('1 つの 頂点の集まりは 65535 個以下（Uint16 の index）。大きいチャンクは分けて、四角は 1 枚も欠けない', () => {
    const w = new ArrayVoxelWorld({ x: 0, z: 0 });
    const sp = populateWorld(w, 1).spawn();
    const cx = Math.floor(sp.x / 16);
    const cz = Math.floor(sp.z / 16);
    const q = new VoxelChunkMesher(w).build(cx, cz, 'naive').solid;
    expect(q.pieces.length).toBeGreaterThan(1);
    for (const p of q.pieces) {
      expect(p.vertexCount).toBeLessThanOrEqual(65535);
      expect(p.indices).toBeInstanceOf(Uint16Array);
      expect(p.positions).toBeInstanceOf(Uint16Array);
    }
    expect(q.pieces.reduce((n, p) => n + p.vertexCount / 4, 0)).toBe(q.faces);
  }, 60_000);
});
