import type { BlockId } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { blockIndexOf } from '../world/blocks/blockTypes';
import { generateIsland } from '../world/gen/generateIsland';
import { SAVE_GEN, SAVE_VERSION, saveKey, type KeyValueStore } from '../save/SaveManager';

/** M6 までの 保存（M7 の データ・印 なし、gen=2）を 作る。`changes` は 島とちがうマス（空なら 何もさわらず保存したのと同じ） */
export function makeLegacySaveText(seed: number, changes: Array<{ x: number; y: number; z: number; id: BlockId }>): string {
  const world = new ArrayVoxelWorld();
  generateIsland(seed, world);
  const eb = world.loadedBounds();
  const sx = eb.x1;
  const sy = world.size.y;
  const sz = eb.z1;
  const byIndex = new Map<number, number>();
  for (const c of changes) {
    const b = blockIndexOf(c.id);
    if (b < 0 || c.x < 0 || c.y < 0 || c.z < 0 || c.x >= sx || c.y >= sy || c.z >= sz) continue;
    byIndex.set((c.y * sz + c.z) * sx + c.x, b);
  }
  const blocks: number[] = [];
  for (const [i, b] of [...byIndex].sort((a, c) => a[0] - c[0])) blocks.push(i, b);
  return JSON.stringify({
    version: SAVE_VERSION,
    gen: SAVE_GEN,
    size: [sx, sy, sz],
    seed,
    blocks,
    inventory: null,
    player: null,
    bags: [],
    tick: 0,
  });
}

export function writeLegacySave(store: KeyValueStore, seed: number, changes: Array<{ x: number; y: number; z: number; id: BlockId }>): void {
  store.setItem(saveKey(seed), makeLegacySaveText(seed, changes));
}
