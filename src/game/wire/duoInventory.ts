// COOP-1 4a（docs/design/COOP-1.md §3.3）: 2P の もちもの・クラフト画面。
// 1P の `InventoryScreen`（wire/ui.ts）と 同じ 部品を もう 1 つ、2P の もちもの・2P 用の「つくる」（`duo/p2Craft.ts`）で 作る。
// id なし・マウスを うけない・いつも 半分。2P の そうびの マスは 4b まで 見た目だけ（EquipPanel の 場所だけ とる）。
import type { ArmorSlot, ArmorSystem, ItemId, ItemStack, ScreenState, Vec3 } from '../../contracts';
import { closeInvHand } from '../../duo/invClose';
import { createP2Craft, type P2Craft } from '../../duo/p2Craft';
import { itemRarity } from '../../drops/rarity';
import { playCraft } from '../../fx/craftSounds';
import { itemType } from '../../inventory/items';
import { handleCraftEvents } from '../../ui/craftUi';
import type { ArmorUi } from '../../ui/equipPanel';
import { InventoryScreen } from '../../ui/inventoryScreen';
import type { WiredLoop } from './save';

/** 2P の そうび（4a では まだ 着られない。4b で 1P と 同じ 決まりに。マスは 見た目だけ 出す） */
const NO_ARMOR: ArmorUi = {
  equipped: (_slot: ArmorSlot) => null,
  tryEquip: () => false,
  cut: () => 0,
  equippedStack: () => null,
  durability: () => null,
  drainWearEvents: () => [],
  peekWearEvents: () => [],
} satisfies ArmorSystem;

export interface DuoInventory {
  screen: InventoryScreen;
  p2Craft: P2Craft;
  /** 2P の 画面を 開く／とじる（毎ステップの `screen.update()` で 見た目に 出る）。とじる とき 手に もっている 物は 2P の もちものへ、いっぱいなら 2P の 足もとへ */
  setOpen(on: boolean): void;
  isOpen(): boolean;
  /** 毎ステップ: 2P の つくる の 出来事を 実績へ */
  step(): void;
  dispose(): void;
}

export function createDuoInventory(deps: WiredLoop, position: () => Vec3, onClose: () => void): DuoInventory {
  const { shared, hud, world, drops, craftConfig, craft2Settings, storage, uiTools, craftUi, live, achievements, fxSound } = deps;
  const inventory = shared.p2.inventory;
  const p2Craft = createP2Craft({
    world,
    inventory,
    drops,
    config: craftConfig,
    tansu: storage,
    position,
    tansuRange: () => craft2Settings.craftTansuRange,
    requestSave: () => shared.requestSave(),
    feedCraft: (events) => achievements.feedCraft(events), // 実績は 2 人で 共有（AC76）
    onEvents: (events) => handleCraftEvents(events, { sound: fxSound }), // つくった 音（できごとログ・とぶ 絵は 2P の パネルの 中だけ）
  });
  const craft = p2Craft.craft;
  let open = false;
  const state: ScreenState = { mode: () => (open ? 'inventory' : 'play'), inventoryOpen: () => open, timeScale: () => 1 };
  const nameOf = (item: ItemId): string => itemType(item)?.name ?? item;
  const screen = new InventoryScreen(
    hud,
    inventory,
    state,
    onClose,
    {
      craft,
      armor: NO_ARMOR,
      nameOf,
      rarityOf: itemRarity,
      placeable: (item) => itemType(item)?.placeBlock != null,
      tools: uiTools,
      ui: craftUi,
      meatHeal: () => live.meatHeal,
      materials: {
        count: (item) => craft.total(item),
        inTansu: (item) => craft.inTansuCount(item),
        fuelInTansu: () => craft.fuelInTansu(),
        version: () => storage.version(),
        refresh: () => craft.refreshTansu(),
      },
    },
    2,
  );
  // 1P の「つくる」と 同じ 説明・実績の ✓・音
  screen.craftPanel?.configure({
    info: deps.craftPanel.info(),
    cursorHeld: () => inventory.cursor() !== null,
    isMade: (kind, id) => !achievements.isFirstMade(kind, id),
    onSelect: () => playCraft(fxSound, 'tab'),
  });
  const dropAtFeet = (stack: ItemStack): void => {
    drops.scatter(position(), [stack]);
  };
  return {
    screen,
    p2Craft,
    setOpen(on: boolean): void {
      if (on === open) return;
      open = on;
      if (!on) closeInvHand(inventory, dropAtFeet);
    },
    isOpen: () => open,
    step: () => p2Craft.step(),
    dispose: () => screen.dispose(),
  };
}
