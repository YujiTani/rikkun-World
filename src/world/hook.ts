import type { BlockId, BlockType, IslandInfo, SpawnPoint, TestArea, WorldRegions } from '../contracts';
import { BLOCK_TYPES } from './blocks/blockTypes';
import { skyDarkness } from './light/skyDarkness';
import type { WorldRenderer, RebuildStats, SectionInfo, SectionStats, MeshStats, RebuildLogEntry } from './render/WorldRenderer';
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
  /** 引数なし: 読みこんだ全部。(cx, cz): その列だけ */
  hash(cx?: number, cz?: number): string;
  spawn(): SpawnPoint;
  testArea(): TestArea;
  /** M5: 地形の場所 */
  regions(): WorldRegions;
  genTimeMs(): number;
  blockTypes(): BlockType[];
  rebuildStats(): RebuildStats;
  /** M4 光: そのマスの光（空の光・ブロックの光・時刻をふくんだ明るさ 0〜15・見た目の明るさ 0〜1）と、空の光の弱まり（昼 0〜夜 11） */
  lightAt(x: number, y: number, z: number): { sky: number; block: number; level: number; brightness: number };
  skyDarkness(): number;
  /** M5: 最初の明るさの計算にかかったミリ秒 */
  lightInitMs(): number;
  /** セクションごとの光が持っているメモリ（バイト）と、作り直し待ちのセクションの数（VOX-C） */
  lightMemoryBytes(): number;
  lightPending(): number;
  /** VOX-E: セクション (sx, sy, sz) = (floor(x/16), floor(y/16), floor(z/16)) の いま描いている段・メッシュの数・三角形・プレイヤーからの水平の距離 */
  sectionInfo(sx: number, sy: number, sz: number): SectionInfo;
  /** VOX-E: 段ごとのセクションの数と距離の幅（micro + box + lod + none === total） */
  sectionStats(): SectionStats;
  /** VOX-E: ジオメトリの合計バイトと上限・メッシュの数・dispose の累計・作り直し待ちの数（0 で落ちついた） */
  meshStats(): MeshStats;
  /** VOX-E: セクションのメッシュを作り直した記録（古い順）。clear === true は返してから空にする */
  rebuildLog(clear?: boolean): RebuildLogEntry[];
}

export function createWorldHook(world: ArrayVoxelWorld, renderer: WorldRenderer, island: IslandInfo): WorldHook {
  return {
    seed: () => island.seed,
    size: () => {
      const b = world.loadedBounds();
      return { x: b.x1 - b.x0, y: world.size.y, z: b.z1 - b.z0 };
    },
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
    fill: (x0, y0, z0, x1, y1, z1, id) => world.fill(x0, y0, z0, x1, y1, z1, id),
    groundHeight: (x, z) => island.groundHeight(x, z),
    countBlocks: () => world.countBlocks(),
    hash: (cx, cz) => (cx === undefined || cz === undefined ? world.hash() : world.hashColumn(cx, cz)),
    spawn: () => island.spawn(),
    testArea: () => island.testArea(),
    regions: () => island.regions(),
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
    lightInitMs: () => renderer.light.initMs,
    lightMemoryBytes: () => renderer.light.memoryBytes(),
    // まだ光が受けとっていない変化（setBlock のすぐあと）もふくめる: 0 なら本当に落ちついた
    lightPending: () => renderer.light.pendingCount() + world.uncollectedLightChanges(),
    sectionInfo: (sx, sy, sz) => renderer.sectionInfo(sx, sy, sz),
    sectionStats: () => renderer.sectionStats(),
    meshStats: () => renderer.meshStats(),
    rebuildLog: (clear) => renderer.rebuildLog(clear === true),
  };
}
