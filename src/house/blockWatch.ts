import type { BlockId } from '../contracts';

/**
 * 世界の ブロックが かわった ことを 建築士さんの 一覧に 知らせる（#355。農業の `farm.onBlockChanged` と 同じ ように
 * `setBlock`・`fill` を 包む）。立って いる 建築士さんは 毎ステップ 足もとを しらべない ので、
 * 足もとが ほられた・置かれた ことは ここから 知る（`ArchitectManager.blockChanged`・`blocksChanged`）。
 */

/** 包まれる 世界（`VoxelWorld` が 合う） */
export interface WatchableWorld {
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number;
}

/** 知らせを 受ける 側（`ArchitectManager` が 合う） */
export interface BlockWatcher {
  /** 列 (x, z) の ブロックが かわった */
  blockChanged(x: number, z: number): void;
  /** 2 つの 角 (x0, z0)・(x1, z1) の 箱の 中が かわった */
  blocksChanged(x0: number, z0: number, x1: number, z1: number): void;
  /** マス (x, y, z) が id に かわった（家の 戸の 記録が 使う。HOUSE-1C） */
  cellChanged?(x: number, y: number, z: number, id: BlockId): void;
  /** 箱 (x0, y0, z0)〜(x1, y1, z1) の 中を ぜんぶ id に した（fill） */
  boxFilled?(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void;
}

/** world の `setBlock`・`fill` を 包む。置けた・1 マス以上 かえた ときだけ 知らせる。すでに 包んで ある 関数の 上にも かさねられる */
export function watchBlocks(world: WatchableWorld, to: BlockWatcher): void {
  const setBlock = world.setBlock.bind(world);
  world.setBlock = (x, y, z, id) => {
    const ok = setBlock(x, y, z, id);
    if (ok) {
      to.blockChanged(x, z);
      to.cellChanged?.(x, y, z, id);
    }
    return ok;
  };
  const fill = world.fill.bind(world);
  world.fill = (x0, y0, z0, x1, y1, z1, id) => {
    const n = fill(x0, y0, z0, x1, y1, z1, id);
    if (n > 0) {
      to.blocksChanged(x0, z0, x1, z1);
      to.boxFilled?.(x0, y0, z0, x1, y1, z1, id);
    }
    return n;
  };
}
