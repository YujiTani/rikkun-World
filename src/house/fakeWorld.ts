import type { AnimalWorld } from '../animals/terrain';
import type { BlockId } from '../contracts';
import { ALL_WATER_IDS } from '../world/blocks/water';

/**
 * 建築士さんの ユニットテスト用の 小さな 世界（テストだけが 使う）。
 * 地面は 高さ関数 height(x, z)（いちばん 上の 固い ブロックの y）、そのうえは 空気。water(x, z) が true の 列は 地面の すぐ上の 1 マスが 水。
 * set() で 1 マス 書きかえられる（プレイヤーが ブロックを 置いた・ほった つもり。建築士さんには 自分では 知らせない = `groundChanged`・`blockChanged` を 呼ぶ）。
 * reads は 世界を 読んだ 回数（isLoaded・getBlock・isSolid・topY の 呼び出し）。「立って いる 間は 読まない」を 数えて 見る ため。
 */
export interface FakeWorldOpts {
  height?: (x: number, z: number) => number;
  water?: (x: number, z: number) => boolean;
  loaded?: (x: number, z: number) => boolean;
}

export type FakeWorld = AnimalWorld & {
  topY(x: number, z: number): number;
  set(x: number, y: number, z: number, id: BlockId): void;
  /** 本物の 世界と 同じ 名前の 書きかえ（`HouseSystem.buildNow` が 使う。いつも 置ける） */
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  /** 世界を 読んだ 回数。テストが 0 に もどして 数え なおして よい */
  reads: number;
};

const SOFT = new Set<string>(['air', ...ALL_WATER_IDS, 'torch', 'kusa', 'flower_y', 'flower_o', 'flower_p', 'nobana', 'susuki', 'saku']);

export function makeFakeWorld(o: FakeWorldOpts = {}): FakeWorld {
  const height = o.height ?? (() => 10);
  const edits = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const blockAt = (x: number, y: number, z: number): BlockId | 'outside' => {
    if (y < 0 || y >= 64) return 'outside';
    const e = edits.get(key(x, y, z));
    if (e !== undefined) return e;
    const h = height(x, z);
    if (y < h) return 'dirt';
    if (y === h) return 'grass';
    if (y === h + 1 && o.water?.(x, z)) return 'water';
    return 'air';
  };
  const w: FakeWorld = {
    size: { y: 64 },
    reads: 0,
    isLoaded: (x, z) => {
      w.reads++;
      return o.loaded?.(x, z) ?? true;
    },
    getBlock: (x, y, z) => {
      w.reads++;
      return blockAt(x, y, z);
    },
    isSolid: (x, y, z) => {
      w.reads++;
      const id = blockAt(x, y, z);
      return id === 'outside' || !SOFT.has(id);
    },
    topY(x, z) {
      w.reads++;
      for (let y = 63; y >= 0; y--) if (blockAt(x, y, z) !== 'air') return y;
      return 0;
    },
    set(x, y, z, id) {
      edits.set(key(x, y, z), id);
    },
    setBlock(x, y, z, id) {
      edits.set(key(x, y, z), id);
      return true;
    },
  };
  return w;
}
