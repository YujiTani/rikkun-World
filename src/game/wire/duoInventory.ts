// COOP-1 4a（docs/design/COOP-1.md §3.3）: 2P の もちもの・クラフト画面。
// 1P の `InventoryScreen`（wire/ui.ts）と 同じ 部品を もう 1 つ、2P の もちもの・2P 用の「つくる」（`duo/p2Craft.ts`）で 作る。
// id なし・マウスを うけない・いつも 半分。2P の そうびの マスは 2P の そうび p2.armor に つながる（4b。着る のは パッドで そうびの マスに おく）。
// 4c: 「やく」は 世界の かまど（1P と 共有。入れた 物の 持ち主は 2P）、「たんす」は 世界の たんすの 中身を そのまま 読み書き（TansuView）。
import type { ItemId, ItemStack, ScreenState, Vec3 } from '../../contracts';
import { closeInvHand } from '../../duo/invClose';
import { createP2Craft, type P2Craft } from '../../duo/p2Craft';
import { createDropPicked, owned2 } from '../../duo/p2Feed';
import { p2ArmorUi } from '../../duo/p2Equip';
import { itemRarity } from '../../drops/rarity';
import { playCraft } from '../../fx/craftSounds';
import { TansuView } from '../../storage/TansuView';
import { itemType } from '../../inventory/items';
import { handleCraftEvents } from '../../ui/craftUi';
import { InventoryScreen } from '../../ui/inventoryScreen';
import { StorageScreen } from '../../ui/storageScreen';
import type { WiredLoop } from './save';

export interface DuoInventory {
  screen: InventoryScreen;
  p2Craft: P2Craft;
  /** 2P の 画面を 開く／とじる（毎ステップの `screen.update()` で 見た目に 出る）。とじる とき 手に もっている 物は 2P の もちものへ、いっぱいなら 2P の 足もとへ */
  setOpen(on: boolean): void;
  isOpen(): boolean;
  /** 2P の 画面を「やく」の ページで 開く（かまどは 世界の 物。中身は 1P と 同じ かまど） */
  openFurnace(x: number, y: number, z: number): void;
  /** 2P の 画面を「たんす」の ページで 開く（たんすは 世界の 物〔共有〕。1P と 同時に 開いても 中身は 同じ） */
  openTansu(x: number, y: number, z: number): void;
  /** 毎ステップ: 2P の つくる の 出来事を 実績へ */
  step(): void;
  /** 毎ステップ: たんすが 遠く なった・こわれた ら とじる → たんすの ページ → 画面 の 順で 描く */
  update(): void;
  dispose(): void;
}

export function createDuoInventory(deps: WiredLoop, position: () => Vec3, onClose: () => void): DuoInventory {
  const { shared, hud, world, drops, craftConfig, craft2Settings, storage, uiTools, craftUi, live, achievements, fxSound, m6, furnaceWorld, farm } = deps;
  const inventory = shared.p2.inventory;
  const p2Craft = createP2Craft({
    world,
    inventory,
    drops,
    config: craftConfig,
    furnaces: furnaceWorld, // 世界の かまど（1P と 1 つ）
    houseLearned: () => shared.house?.learnedRecipes() ?? [], // おぼえた 家の レシピは 世界で 1 つ（2P の「つくる」も 同じ）
    tansu: storage,
    position,
    tansuRange: () => craft2Settings.craftTansuRange,
    requestSave: () => shared.requestSave(),
    feedCraft: owned2(achievements, (events) => achievements.feedCraft(events)), // 実績は 2 人で 共有（AC76）。持ち主は 2P（帯は 2P の 半分。5f-2）
    onEvents: (events) => handleCraftEvents(events, { sound: fxSound }), // つくった 音（できごとログ・とぶ 絵は 2P の パネルの 中だけ）
  });
  const craft = p2Craft.craft;
  // やけた 物が 2P の もちものに 入った: 2P の つくる の「ひろった」の 出来事（実績へ。2P の ログは 出さない。§2.6）
  shared.p2Delivered = (item, count, tick) => craft.notifyPickup(item, count, tick);
  // COOP-1 5b（AC132）: 2P が 落とし物を ひろった 知らせ（1P の ui.ts と 同じ 中身。ホットバーの ぽん〔extra〕は 2P には ない）
  shared.p2DropPicked = createDropPicked({
    notifyPickup: (item, count) => craft.notifyPickup(item, count),
    noteSeedFound: (item, at) => farm.noteSeedFound('yokai', item, at),
    position,
  });
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
      furnaces: { get: (x, y, z) => craft.furnaceAt(x, y, z) }, // 「やく」は 世界の かまど（2P の つくる から 見る）
      armor: p2ArmorUi(shared.p2), // 2P の そうび（COOP-1 4b。1P の そうびではない）
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
  // 2P の「たんす」: 世界の たんすの 中身を そのまま 読み書き。遠く なった・こわれた ら 2P の パネルごと とじる（1P と 同じ 決まり）
  const tansuView = new TansuView({
    inventory,
    tansu: storage,
    position,
    closeDist: () => m6.tansuCloseDist,
    onFull: () => deps.shared.p2ShowSignal('full'), // 2P の たんすが いっぱい: 2P の 半分に（5f-1）
    onClose: () => api.setOpen(false),
  });
  const tansuScreen = new StorageScreen(screen, tansuView, m6.tansuSlots);
  const api: DuoInventory = {
    screen,
    p2Craft,
    setOpen(on: boolean): void {
      if (on === open) return;
      open = on;
      if (!on) {
        // とじると「開いている かまど・たんす」も なくなる（3 つ目の タブも 消える）。手に もっている 物は 2P の もちものへ
        craft.closeFurnace();
        tansuView.close();
        closeInvHand(inventory, dropAtFeet);
      }
    },
    isOpen: () => open,
    openFurnace(x: number, y: number, z: number): void {
      tansuView.close();
      craft.openFurnace(x, y, z);
      api.setOpen(true);
    },
    openTansu(x: number, y: number, z: number): void {
      craft.closeFurnace();
      if (tansuView.open(x, y, z)) api.setOpen(true);
    },
    step: () => p2Craft.step(),
    update(): void {
      tansuView.update();
      tansuScreen.update();
      screen.update();
    },
    dispose: () => {
      tansuScreen.dispose();
      screen.dispose();
    },
  };
  return api;
}
