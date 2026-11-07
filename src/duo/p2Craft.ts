// COOP-1 4a（§2.6「2P が つくる」・AC76）: 2P の「つくる」。材料の 数え方は 1P の CraftSystemImpl と まったく 同じ（もちもの → 足りない 分は 近い たんす）。
// 数えるのは 2P の もちものと、2P の 足もとから `craftTansuRange` の 中の たんす（共有）。1P の もちものは 数えない。
import type { CraftEvent, Inventory, Vec3, VoxelWorld } from '../contracts';
import { CraftSystemImpl, type CraftDeps } from '../craft/CraftSystem';
import type { FurnaceWorld } from '../craft/FurnaceWorld';

export interface P2CraftDeps {
  /** 1P の CraftSystemImpl と 同じ 世界 */
  world: Pick<VoxelWorld, 'getBlock'>;
  /** 2P の もちもの（1P の もちものは 数えない） */
  inventory: Inventory;
  /** 世界の たんす（1P と 共有。`StorageSystem`） */
  tansu: NonNullable<CraftDeps['tansu']>;
  /** 2P の 足もと（たんすの きょりの はかり始め） */
  position: () => Vec3;
  /** 使える たんすの きょり（`craft2Settings.craftTansuRange`。1P と 同じ 設定） */
  tansuRange: () => number;
  requestSave: () => void;
  drops?: CraftDeps['drops'];
  config?: CraftDeps['config'];
  /** COOP-1 4c: 世界の かまど（1P と 共有。2P の「やく」は ここへ 入れる。すすめるのは FurnaceWorld.update だけ） */
  furnaces?: FurnaceWorld;
  /** 実績へ（`achievements.feedCraft`。実績は 2 人で 共有） */
  feedCraft: (events: CraftEvent[]) => void;
  /** 音など 2P の 側の 受け手（任意。出来事が あった ステップに 1 回） */
  onEvents?: (events: CraftEvent[]) => void;
}

export interface P2Craft {
  /** 2P の 画面（InventoryScreen）に わたす */
  craft: CraftSystemImpl;
  /** 毎ステップ 1 回。出来事を 取り出して 実績へ（なければ 呼ばない） */
  step(): void;
}

export function createP2Craft(d: P2CraftDeps): P2Craft {
  const craft = new CraftSystemImpl({
    world: d.world,
    inventory: d.inventory,
    drops: d.drops,
    requestSave: d.requestSave,
    config: d.config,
    tansu: d.tansu,
    player: d.position,
    tansuRange: d.tansuRange,
    furnaces: d.furnaces,
    who: 2,
  });
  return {
    craft,
    step(): void {
      craft.update(); // 時計・ひろったログ・開いている かまどが こわれた かの 確認（世界の かまどは すすめない。FurnaceWorld.update が 1 回）
      const events = craft.drainEvents();
      if (events.length === 0) return;
      d.feedCraft(events);
      d.onEvents?.(events);
    },
  };
}
