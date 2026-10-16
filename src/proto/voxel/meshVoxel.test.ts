import { describe, expect, it } from 'vitest';
import { generateIsland } from '../../world/gen/generateIsland';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { VoxelChunkMesher, type QuadMesh, type VoxelMode } from './meshVoxel';

const MODES: VoxelMode[] = ['naive', 'greedyColor', 'greedyShape'];

/** 四角を 1 小面ずつにばらして "面の向き,位置,位置,位置" の集まりにする（重なりは数える） */
function cells(q: QuadMesh): { set: Set<string>; dup: number } {
  const set = new Set<string>();
  let dup = 0;
  for (let k = 0; k < q.faces; k++) {
    const f = q.data[k * 16 + 3];
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < 4; v++) {
      for (let a = 0; a < 3; a++) {
        const p = Math.round(q.positions[(k * 4 + v) * 3 + a] * 9);
        lo[a] = Math.min(lo[a], p);
        hi[a] = Math.max(hi[a], p);
      }
    }
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

/** x = plane の面（±x 向き）の四角の数 */
function facesOnPlaneX(q: QuadMesh, plane: number, y0 = -Infinity, y1 = Infinity): number {
  let n = 0;
  for (let k = 0; k < q.faces; k++) {
    const f = q.data[k * 16 + 3];
    if (f !== 2 && f !== 3) continue;
    const y = q.positions[k * 12 + 1];
    if (Math.abs(q.positions[k * 12] - plane) < 1e-4 && y >= y0 - 1e-4 && y < y1 - 1e-4) n++;
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
      for (let k = 0; k < q.faces; k++) {
        const f = q.data[k * 16 + 3];
        if ((f === 0 || f === 1) && Math.abs(q.positions[k * 12 + 1] - 3) < 1e-4) {
          const x = q.positions[k * 12];
          if (x >= 5 - 1e-4 && x < 6 - 1e-4) between++;
        }
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
    const w = new ArrayVoxelWorld();
    const info = generateIsland(1, w);
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
      const a = cells(naive);
      const b = cells(color);
      const c = cells(shape);
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
