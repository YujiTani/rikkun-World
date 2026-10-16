import { describe, expect, it } from 'vitest';
import { generateIsland } from '../../../world/gen/generateIsland';
import { ArrayVoxelWorld } from '../../../world/VoxelWorld';
import { VoxelChunkMesher, type QuadMesh } from '../meshVoxel';
import { MICRO_PARAMS, microSurfaceHeight, newSample, sampleSurface, type ColumnSource } from './microSurface';
import { worldColumnSource } from './worldColumns';

/** ブロックの高さ（y）を関数で決める ColumnSource */
function heightSource(ty: (bx: number, bz: number) => number, reach = 8): ColumnSource {
  return { surfaceY: ty, reach: () => reach, rockOk: () => true };
}
const stepSource = heightSource((bx) => (bx < 0 ? 5 : 6)); // x = 0 で 1 ブロック上がる
const flat = heightSource(() => 5);

describe('S（小ブロックの表面の高さ）', () => {
  it('同じ入力からは いつも同じ（決定的）', () => {
    for (let i = 0; i < 200; i++) {
      const mx = (i * 37) % 300 - 40;
      const mz = (i * 91) % 300 - 40;
      expect(microSurfaceHeight(mx, mz, stepSource)).toBe(microSurfaceHeight(mx, mz, stepSource));
    }
  });

  it('はんい: ブロックの底 +3 以上、上のへり + reach 以下。地面が無い列は -1', () => {
    const none = heightSource((bx) => (bx === 3 ? -1 : 4), 8);
    for (let mx = -30; mx < 60; mx++) {
      for (let mz = 0; mz < 40; mz++) {
        const h = microSurfaceHeight(mx, mz, none);
        if (Math.floor(mx / 9) === 3) expect(h).toBe(-1);
        else {
          expect(h).toBeGreaterThanOrEqual(4 * 9 + MICRO_PARAMS.minAboveBase);
          expect(h).toBeLessThanOrEqual(5 * 9 + 8);
        }
      }
    }
    const noReach = heightSource(() => 4, 0);
    for (let mx = 0; mx < 80; mx++) expect(microSurfaceHeight(mx, 7, noReach)).toBeLessThanOrEqual(5 * 9);
  });

  it('1 ブロックの段差: 坂（となりあう列の差が 1 マス）と 崖（差が 4 マス以上）が まざる', () => {
    // x = 0 の境目（mx = -1 と 0）を z に沿って 見る。辺は 9 マスごとに 別の辺（bz）
    const diffs = new Map<number, number>();
    for (let bz = -60; bz < 60; bz++) {
      let d = 0;
      for (let k = 0; k < 9; k++) d += microSurfaceHeight(0, bz * 9 + k, stepSource) - microSurfaceHeight(-1, bz * 9 + k, stepSource);
      const avg = Math.round(d / 9);
      diffs.set(avg, (diffs.get(avg) ?? 0) + 1);
    }
    let slope = 0;
    let cliff = 0;
    for (const [d, n] of diffs) {
      if (d <= 3) slope += n;
      else cliff += n;
    }
    expect(slope).toBeGreaterThan(10);
    expect(cliff).toBeGreaterThan(10);
  });

  it('ゆるい坂: 1 小ブロックずつ上がる（隣の列との差は ほとんど 0〜2）', () => {
    let small = 0;
    let total = 0;
    for (let bz = -40; bz < 40; bz++) {
      const z = bz * 9 + 4;
      const a = microSurfaceHeight(-1, z, stepSource);
      const b = microSurfaceHeight(0, z, stepSource);
      if (b - a <= 3) {
        total++;
        if (Math.abs(b - a) <= 2) small++;
      }
    }
    expect(total).toBeGreaterThan(10);
    expect(small / total).toBeGreaterThan(0.7);
  });

  it('岩: ブロックをまたぐ大きさ（3〜12 マス）で出っぱる', () => {
    const s = newSample();
    const cells = new Set<string>();
    let minX = 1e9;
    let maxX = -1e9;
    for (let mx = 0; mx < 400; mx++) {
      for (let mz = 0; mz < 400; mz++) {
        sampleSurface(mx, mz, flat, s);
        if (s.rock) cells.add(`${mx},${mz}`);
      }
    }
    expect(cells.size).toBeGreaterThan(50);
    // 連なった岩のかたまり（4 近傍）の大きさ
    const seen = new Set<string>();
    const widths: number[] = [];
    for (const key of cells) {
      if (seen.has(key)) continue;
      const stack = [key];
      seen.add(key);
      minX = 1e9;
      maxX = -1e9;
      let minZ = 1e9;
      let maxZ = -1e9;
      while (stack.length) {
        const [x, z] = stack.pop()!.split(',').map(Number);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${z + dz}`;
          if (cells.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
      widths.push(Math.max(maxX - minX + 1, maxZ - minZ + 1));
    }
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...widths)).toBeLessThanOrEqual(13);
    expect(widths.some((w) => w > 9)).toBe(true); // 1 ブロックより大きい（またぐ）
  });
});

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
  const w = new ArrayVoxelWorld();
  const sp = generateIsland(1, w).spawn();
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
