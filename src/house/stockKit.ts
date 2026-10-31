// HOUSE-1E 材料（もちもの＋近くの たんす）の テスト用の 道具。本番の コードからは 使わない（テスト専用。editor/testkit.ts と 同じ あつかい）。
// 本物の もちもの（InventoryImpl）・たんす（StorageSystem）・数える 係（CraftSystemImpl）を つなぐ。たんすの 数え方・きょりは「つくる」と 同じ。
// HouseSystem・createSheetPort には stockDeps(stock) を わたす（deps の `craft`・`tansu`。e2e/helpers/house.ts の「1E の 約束」）。
import type { BlockId, ItemId, ItemStack, Vec3 } from '../contracts';
import { CraftSystemImpl } from '../craft/CraftSystem';
import { InventoryImpl } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { StorageSystem } from '../storage/StorageSystem';

/** たんすを 置く 世界（ブロックを 持つ だけ。house の 世界〔地面〕とは べつ） */
class TansuWorld {
  readonly size = { x: 256, y: 64, z: 256 };
  private readonly blocks = new Map<string, BlockId>();
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: -9999, z0: -9999, x1: 9999, z1: 9999 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(): boolean {
    return false;
  }
}

export interface Stock {
  bag: InventoryImpl;
  /** プレイヤーの 足もと（このまま HouseSystem の player に わたす。動かすと きょりが かわる） */
  player: Vec3;
  /** 設定 craftTansuRange（はじめ 40 マス）。かえると 数える たんすが かわる */
  range: { v: number };
  storage: StorageSystem;
  craft: CraftSystemImpl;
  /** プレイヤーから (dx, dz) マス はなれた 所に たんすを 置いて 中身を 入れる（きょりは hypot(dx, dz)。同じ 高さ）。置いた 場所を 返す */
  putTansu(dx: number, dz: number, items: Partial<Record<ItemId, number>>): Vec3;
  /** たんすの 中の その アイテムの 数 */
  inTansu(at: Vec3, item: ItemId): number;
}

export function makeStock(opts: { player?: Vec3; range?: number } = {}): Stock {
  const world = new TansuWorld();
  const bag = new InventoryImpl();
  const player: Vec3 = opts.player ?? { x: 64.5, y: 11, z: 64.5 };
  const range = { v: opts.range ?? 40 };
  const storage = new StorageSystem({
    world,
    inventory: bag,
    player: () => player,
    scatter: () => undefined,
    inventoryOpen: () => false,
    openScreen: () => undefined,
    closeScreen: () => undefined,
  });
  const craft = new CraftSystemImpl({ world, inventory: bag, tansu: storage, player: () => player, tansuRange: () => range.v });
  const putTansu = (dx: number, dz: number, items: Partial<Record<ItemId, number>>): Vec3 => {
    const at: Vec3 = { x: Math.floor(player.x) + dx, y: player.y, z: Math.floor(player.z) + dz };
    world.setBlock(at.x, at.y, at.z, 'tansu');
    let slot = 0;
    for (const [item, total] of Object.entries(items) as Array<[ItemId, number]>) {
      const max = itemType(item)?.maxStack ?? 1;
      for (let left = total; left > 0; left -= max) storage.set(at.x, at.y, at.z, slot++, { item, count: Math.min(max, left) } satisfies ItemStack);
    }
    return at;
  };
  const inTansu = (at: Vec3, item: ItemId): number => storage.countItem(at.x, at.y, at.z, item);
  return { bag, player, range, storage, craft, putTansu, inTansu };
}

/**
 * HouseSystem・createSheetPort の deps に まぜる 材料の もと（1E）。
 *   craft  … もちもの＋近くの たんす の 数え方（`total(item)`・`tansuInRange()`。CraftSystemImpl）
 *   tansu  … たんすから 取り出す・しらべる（StorageSystem。`takeItem`・`countItem`・`get`・`set`）
 * どちらも 無ければ もちものだけ（1E の 前の テストの 形は そのまま 動く）
 */
export function stockDeps(stock: Stock): { craft: Stock['craft']; tansu: Stock['storage'] } {
  return { craft: stock.craft, tansu: stock.storage };
}
