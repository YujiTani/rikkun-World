import type { BlockId, BlockType, IslandInfo, SpawnPoint, TestArea } from '../contracts';
import { BLOCK_TYPES } from './blocks/blockTypes';
import { skyDarkness } from './light/skyDarkness';
import type { WorldRenderer, RebuildStats } from './render/WorldRenderer';
import type { ArrayVoxelWorld } from './VoxelWorld';

/** window.__rikkun.world.*（M1-01 §6.1）。つなぎ込み担当が組み立てて入れる */
export interface WorldHook {
  seed(): number;
  size(): { x: number; y: number; z: number };
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number;
  groundHeight(x: number, z: number): number;
  countBlocks(): Record<BlockId, number>;
  hash(): string;
  spawn(): SpawnPoint;
  testArea(): TestArea;
  genTimeMs(): number;
  blockTypes(): BlockType[];
  rebuildStats(): RebuildStats;
  /** M4 光: そのマスの光（空の光・ブロックの光・時刻をふくんだ明るさ 0〜15・見た目の明るさ 0〜1）と、空の光の弱まり（昼 0〜夜 11） */
  lightAt(x: number, y: number, z: number): { sky: number; block: number; level: number; brightness: number };
  skyDarkness(): number;
}

export function createWorldHook(world: ArrayVoxelWorld, renderer: WorldRenderer, island: IslandInfo): WorldHook {
  return {
    seed: () => island.seed,
    size: () => ({ ...world.size }),
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
    fill: (x0, y0, z0, x1, y1, z1, id) => world.fill(x0, y0, z0, x1, y1, z1, id),
    groundHeight: (x, z) => island.groundHeight(x, z),
    countBlocks: () => world.countBlocks(),
    hash: () => world.hash(),
    spawn: () => island.spawn(),
    testArea: () => island.testArea(),
    genTimeMs: () => island.genTimeMs,
    blockTypes: () => BLOCK_TYPES.map((t) => ({ ...t })),
    rebuildStats: () => renderer.rebuildStats(),
    lightAt: (x, y, z) => ({
      sky: renderer.light.skyLight(x, y, z),
      block: renderer.light.blockLight(x, y, z),
      level: renderer.light.level(x, y, z),
      brightness: renderer.light.brightness(x, y, z),
    }),
    skyDarkness: () => skyDarkness.value,
  };
}
