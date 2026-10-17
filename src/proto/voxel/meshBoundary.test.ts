import { describe, expect, it } from 'vitest';
import { populateWorld } from '../../world/gen/populate';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { newSample, sampleSurface } from '../../world/micro/microSurface';
import { worldColumnSource } from '../../world/micro/worldColumns';
import { VoxelChunkMesher, type QuadMesh } from './meshVoxel';

// ---- 面の穴・重なり（チャンクの境目）

interface Quad {
  f: number;
  lo: number[];
  hi: number[];
}
function quadsOf(q: QuadMesh, cx: number, cz: number): Quad[] {
  const out: Quad[] = [];
  const org = [cx * 144, 0, cz * 144];
  for (const piece of q.pieces) {
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
  return out;
}
const AX = [1, 1, 0, 0, 2, 2];
/** 小面 1 つずつにばらす（重なりは数える） */
function cellsOf(quads: Quad[]): { set: Set<string>; dup: number } {
  const set = new Set<string>();
  let dup = 0;
  for (const { f, lo, hi } of quads) {
    const ax = AX[f];
    const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
    for (let i = lo[u]; i < hi[u]; i++) {
      for (let j = lo[v]; j < hi[v]; j++) set.add(`${f},${lo[ax]},${i},${j}`);
    }
    const n = (hi[u] - lo[u]) * (hi[v] - lo[v]);
    dup += n;
  }
  return { set, dup: dup - set.size };
}

describe('小ブロック地形のメッシュ（チャンクの境目）', () => {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  const sp = populateWorld(w, 1).spawn();
  const cx = Math.min(Math.floor(sp.x / 16), w.chunksX - 2);
  const cz = Math.floor(sp.z / 16);
  const mesher = new VoxelChunkMesher(w);

  it('micro: 重なる面が無い。block より 面が ふえる。greedyShape と naive で 小面が同じ', () => {
    const a = mesher.build(cx, cz, 'greedyShape', true);
    const naive = mesher.build(cx, cz, 'naive', true);
    const qa = [...quadsOf(a.solid, cx, cz), ...quadsOf(a.solidColor, cx, cz)];
    const ca = cellsOf(qa);
    expect(ca.dup).toBe(0);
    expect(a.solidColor.faces).toBeGreaterThan(500);
    const cn = cellsOf(quadsOf(naive.solid, cx, cz));
    expect(cn.dup).toBe(0);
    expect(ca.set).toEqual(cn.set);
    const block = mesher.build(cx, cz, 'greedyShape', false);
    expect(block.solidColor.faces).toBe(0);
  }, 120_000);

  it('となりあう 2 チャンクの境目: 同じ小面を 両方が出さない（穴・食いちがいなし）', () => {
    const A = mesher.build(cx, cz, 'greedyShape', true);
    const B = mesher.build(cx + 1, cz, 'greedyShape', true);
    const plane = (cx + 1) * 144;
    const pick = (m: typeof A, ccx: number, f: number): Set<string> => {
      const out = new Set<string>();
      for (const q of [...quadsOf(m.solid, ccx, cz), ...quadsOf(m.solidColor, ccx, cz)]) {
        if (q.f !== f || q.lo[0] !== plane) continue;
        for (let y = q.lo[1]; y < q.hi[1]; y++) for (let z = q.lo[2]; z < q.hi[2]; z++) out.add(`${y},${z}`);
      }
      return out;
    };
    const aPlus = pick(A, cx, 2); // A の +x 向き（A がつまり、Bが 空）
    const bMinus = pick(B, cx + 1, 3); // B の -x 向き（B がつまり、A が空）
    expect(aPlus.size + bMinus.size).toBeGreaterThan(20);
    for (const k of aPlus) expect(bMinus.has(k)).toBe(false);

    // S から 期待する面の数と くらべる（同じ高さの地面ブロックどうしの列）
    const src = worldColumnSource(w);
    const s1 = newSample();
    const s2 = newSample();
    let checked = 0;
    for (let mz = cz * 144; mz < (cz + 1) * 144; mz++) {
      const bz = Math.floor(mz / 9);
      const bxA = (plane - 1) / 9 | 0;
      const ty = src.surfaceY(bxA, bz);
      if (ty < 0 || src.surfaceY(bxA + 1, bz) !== ty) continue;
      sampleSurface(plane - 1, mz, src, s1);
      sampleSurface(plane, mz, src, s2);
      for (let y = ty * 9; y < Math.max(s1.h, s2.h); y++) {
        const k = `${y},${mz}`;
        expect(aPlus.has(k)).toBe(y < s1.h && y >= s2.h);
        expect(bMinus.has(k)).toBe(y < s2.h && y >= s1.h);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  }, 120_000);

  it('同じチャンクを 2 回作っても 同じ（決定的）', () => {
    const a = mesher.build(cx, cz, 'greedyShape', true);
    const b = mesher.build(cx, cz, 'greedyShape', true);
    expect(b.solid.faces).toBe(a.solid.faces);
    expect(b.solidColor.faces).toBe(a.solidColor.faces);
  }, 60_000);
});
