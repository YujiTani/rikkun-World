/**
 * #202 ブロックの型: セクションのメッシュ作りでの 型の使い分け（タスク票 docs/tickets/PERF-3.md の基準 5・6）。
 * 前提にした口（いまの試作にある物。developer はこの名前・型のまま作る）:
 *  - proto/voxel/looks の kataStats: number[]（[毎回計算, 型なしの種類, 型, 地下の型] の数え。fill(0) で数え直す）
 *    毎回計算 = 水のそば、または 地下で kataUnder=0 のとき。地下の型 = 地下で @under の型を使った数。
 *    はっぱは 地下でも「型」（[2]）に数える（地下あつかいしない）。
 *  - kata.ts の decideKata, index.ts の setKataTable
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { decideKata } from '../../../proto/voxel/looks/kata';
import { kataStats, setKataTable } from '../../../proto/voxel/looks';
import { SectionMesher, type SectionMeshData } from './sectionMesher';

/** 型を使うのは 小ブロック（micro）の段だけ（box は 729 マスの形を作らない） */
const TIERS = ['micro'] as const;

/** 石の台（y 1〜20）。ほかは空気 */
function slab(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 64, y: 48, z: 64 });
  w.fill(0, 0, 0, 63, 0, 63, 'bedrock');
  w.fill(0, 1, 0, 63, 20, 63, 'stone');
  return w;
}

function build(w: ArrayVoxelWorld, sx: number, sy: number, sz: number, tier: 'box' | 'micro'): { d: SectionMeshData; s: { unique: number; plain: number; kata: number; under: number } } {
  kataStats.fill(0);
  const d = new SectionMesher(w).build(sx, sy, sz, tier);
  return { d, s: { unique: kataStats[0], plain: kataStats[1], kata: kataStats[2], under: kataStats[3] } };
}

function sameMesh(a: SectionMeshData, b: SectionMeshData): void {
  expect(b.triangles).toBe(a.triangles);
  expect(b.pieces.length).toBe(a.pieces.length);
  for (let i = 0; i < a.pieces.length; i++) {
    expect(Array.from(b.pieces[i].positions)).toEqual(Array.from(a.pieces[i].positions));
    expect(Array.from(b.pieces[i].data)).toEqual(Array.from(a.pieces[i].data));
  }
}

beforeEach(() => setKataTable(decideKata('')));
afterEach(() => setKataTable(decideKata('')));

describe('基準 6: 地下の見分け', () => {
  // 石の台の中の ほらあな（空気 5×4×5）。台のてっぺんは y=20、ほらあなは y 5〜8
  const cave = (w: ArrayVoxelWorld): void => void w.fill(20, 5, 20, 24, 8, 24, 'air');

  for (const tier of TIERS) {
    it(`[${tier}] ほらあなの かべ（地面より下の空気に面する）は 地下の型。毎回計算ではない`, () => {
      const w = slab();
      cave(w);
      const { s } = build(w, 1, 0, 1, tier);
      expect(s.under, '地下の型').toBeGreaterThan(0);
      expect(s.unique, '毎回計算').toBe(0);
      expect(s.kata, '地下でない型').toBe(0);
    });

    it(`[${tier}] &kataUnder=0 なら 地下のかべは 毎回計算`, () => {
      const w = slab();
      cave(w);
      setKataTable(decideKata('?kataUnder=0'));
      const { s } = build(w, 1, 0, 1, tier);
      expect(s.unique).toBeGreaterThan(0);
      expect(s.under).toBe(0);
    });

    it(`[${tier}] はっぱは 地下でも 地下あつかいしない（地下の数が はっぱ 1 つで ふえない）`, () => {
      const without = slab();
      const withLeaf = slab();
      // 大きいほらあなの まんなかに はっぱ 1 つ（かべから はなれている）
      for (const w of [without, withLeaf]) w.fill(18, 3, 18, 28, 12, 28, 'air');
      withLeaf.fill(23, 7, 23, 23, 7, 23, 'leaves');
      const a = build(without, 1, 0, 1, tier).s;
      const b = build(withLeaf, 1, 0, 1, tier).s;
      expect(a.under).toBeGreaterThan(0);
      expect(b.under, 'はっぱは 地下に数えない').toBe(a.under);
      expect(b.kata, 'はっぱは ふつうの型').toBe(a.kata + 1);
      expect(b.unique).toBe(a.unique);
    });
  }

  it('[micro] 崖の横の面は 地下ではない', () => {
    const w = slab();
    w.fill(24, 11, 0, 63, 20, 63, 'air');
    const { s } = build(w, 1, 0, 1, 'micro');
    expect(s.kata, '崖の横の面は ふつうの型').toBeGreaterThan(0);
    expect(s.under, '崖は 地下ではない').toBe(0);
    expect(s.unique).toBe(0);
  });
});

describe('基準 5: 水がとなりにあるブロックは 型を使わず 毎回計算', () => {
  // 水でうまった 3×3×3 のほらあなが 石の台の中。見える面は ぜんぶ 水に面している
  const pond = (w: ArrayVoxelWorld): void => void w.fill(20, 5, 20, 22, 7, 22, 'water');

  for (const tier of TIERS) {
    it(`[${tier}] 水のそばの石は 毎回計算に数える（型・地下の型ではない）`, () => {
      const w = slab();
      pond(w);
      const { s } = build(w, 1, 0, 1, tier);
      expect(s.unique, '毎回計算').toBeGreaterThan(0);
      expect(s.kata).toBe(0);
      expect(s.under, '水が地下より先').toBe(0);
    });

    it(`[${tier}] 水のそばの形は 型なし（?kata=off）と 完全に同じ`, () => {
      const w = slab();
      pond(w);
      const on = build(w, 1, 0, 1, tier).d;
      setKataTable(decideKata('?kata=off'));
      const off = build(w, 1, 0, 1, tier).d;
      expect(on.triangles).toBeGreaterThan(0);
      sameMesh(off, on);
    });
  }
});
