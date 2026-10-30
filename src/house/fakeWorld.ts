import type { AnimalWorld } from '../animals/terrain';
import type { BlockId } from '../contracts';

/**
 * 建築士さんの ユニットテスト用の 小さな 世界（テストだけが 使う）。
 * 地面は 高さ関数 height(x, z)（いちばん 上の 固い ブロックの y）、そのうえは 空気。water(x, z) が true の 列は 地面の すぐ上の 1 マスが 水。
 * set() で 1 マス 書きかえられる（プレイヤーが ブロックを 置いた・ほった つもり）。
 */
export interface FakeWorldOpts {
  height?: (x: number, z: number) => number;
  water?: (x: number, z: number) => boolean;
  loaded?: (x: number, z: number) => boolean;
}

export type FakeWorld = AnimalWorld & {
  topY(x: number, z: number): number;
  set(x: number, y: number, z: number, id: BlockId): void;
};

const SOFT = new Set<string>(['air', 'water', 'torch', 'kusa', 'flower_y', 'flower_o', 'flower_p', 'nobana', 'susuki', 'saku']);

export function makeFakeWorld(o: FakeWorldOpts = {}): FakeWorld {
  const height = o.height ?? (() => 10);
  const edits = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const getBlock = (x: number, y: number, z: number): BlockId | 'outside' => {
    if (y < 0 || y >= 64) return 'outside';
    const e = edits.get(key(x, y, z));
    if (e !== undefined) return e;
    const h = height(x, z);
    if (y < h) return 'dirt';
    if (y === h) return 'grass';
    if (y === h + 1 && o.water?.(x, z)) return 'water';
    return 'air';
  };
  return {
    size: { y: 64 },
    isLoaded: (x, z) => o.loaded?.(x, z) ?? true,
    getBlock,
    isSolid: (x, y, z) => {
      const id = getBlock(x, y, z);
      return id === 'outside' || !SOFT.has(id);
    },
    topY(x, z) {
      for (let y = 63; y >= 0; y--) if (getBlock(x, y, z) !== 'air') return y;
      return 0;
    },
    set(x, y, z, id) {
      edits.set(key(x, y, z), id);
    },
  };
}
