// main.ts の 流れ 3: 持ち物・画面の 状態・設定・落とし物・にわとり。
import { createCombatConfig } from '../../combat';
import { createCraftConfig } from '../../craft';
import { createToolConfig } from '../../tools';
import { setWearSettings } from '../../ui/wearGauge';
import { hasPowerRange, legendPowerOf } from '../../legend/defs';
import { setPowerFallback } from '../../ui/powerBadge';
import { type ToolNumbers, type CraftUiSettings, CRAFT_UI_SETTINGS } from '../../fx/craftConfig';
import { applyUiAlpha } from '../../ui/theme';
import { createW2Settings, createCraft2Settings, createM6Settings, createM7Settings, createLiveSettings } from '../../contracts';
import { DropField } from '../../drops';
import { createHarapanRoll } from '../../drops/harapan';
import { createAnimalManager } from '../../animals';
import { coopBlocks, coopPlan } from '../../animals/coop';
import { applyFlatten } from '../../world/flatten';
import { countryAt } from '../../world/gen/biome';
import { createRng } from '../../world/gen/random';
import { createDigConfig } from '../../dig';
import { InventoryImpl } from '../../inventory';
import { ScreenController } from '../../screen/ScreenController';
import { createScreenSettings } from '../../screen/config';
import type { WiredPlayer } from './player';

export function wireInventory(deps: WiredPlayer) {
  const { shared, game, lock, pointerLock } = deps;

  // 持ち物・画面の状態・ほる／おく
  // WEAPON-2 の設定（刀・弓・たいきゅう。settings から変えたら すぐ効く）
  const w2 = createW2Settings();
  setWearSettings(() => w2);
  const inventory = new InventoryImpl({ settings: () => w2, tick: () => game.tick });
  {
    // たいきゅうが 実際に へった量を 実績（wearTotal）へ
    const wh = inventory.wearHeld.bind(inventory);
    inventory.wearHeld = (n) => {
      const r = wh(n);
      if (r) shared.achievementsRef.feedWorn(r.worn);
      return r;
    };
    const ws = inventory.wearSlot.bind(inventory);
    inventory.wearSlot = (slot, n) => {
      const r = ws(slot, n);
      if (r) shared.achievementsRef.feedWorn(r.worn);
      return r;
    };
  }
  const screenSettings = createScreenSettings();
  // CRAFT-2 の設定（ログ・半透明。settings から変えたら すぐ効く）
  const craft2Settings = createCraft2Settings();
  applyUiAlpha(craft2Settings);
  // M6 の設定（実績・演出・すてる・たんす）。settings から変えたら すぐ効く
  const m6 = createM6Settings();
  // M7 の設定（農業。settings から変えたら すぐ効く）
  const m7 = createM7Settings();
  // E でたんす: ScreenController より先に押しを聞く（画面は ScreenController が開く）
  let modalIsOpen: () => boolean = () => false;
  game.input.onPress((action) => {
    if (action === 'toggleInventory' && !modalIsOpen()) shared.tryOpenTansu();
  });
  const screen = new ScreenController(lock, inventory, game.input, screenSettings, pointerLock);
  shared.screen = screen;
  modalIsOpen = () => screen.inventoryOpen() || shared.coopMenuIsOpen();
  // 保存の要求は、あとで作る SaveManager へ（循環をさけるため関数でつなぐ）
  const hudSignal: { full: () => void } = { full: () => {} };
  // 設定は 1 つずつ作って、settings から変えたら すぐ効くようにみんなで共有する
  const combatCfg = createCombatConfig();
  const digCfg = createDigConfig();
  const craftConfig = createCraftConfig();
  const toolConfig = createToolConfig();
  setPowerFallback((item) => (hasPowerRange(w2, item as never) ? legendPowerOf(w2, item as never) : null));
  /** 画面（ツールチップ・図鑑）用の 道具の数: 刀の 強さに レジェンダリーの P を 足す（WEAPON-7 §2.1。設定を 変えると 追従） */
  const uiWeaponDamage = (): Record<string, number> => {
    const out: Record<string, number> = { ...toolConfig.weaponDamage };
    for (const d of w2.legendary) out[d.item] = legendPowerOf(w2, d.item) ?? out[d.item] ?? 1;
    return out;
  };
  const uiTools: ToolNumbers = {
    ...toolConfig,
    get weaponDamage() {
      return uiWeaponDamage();
    },
  };
  // 画面の数値。焼く時間・ログの数は つくる側の設定と同じものを見る
  const craftUi: CraftUiSettings = { ...CRAFT_UI_SETTINGS, fuelOrder: craftConfig.fuelOrder };
  for (const n of ['bakeTicks', 'pickupLogTicks', 'pickupLogMax'] as const) {
    Object.defineProperty(craftUi, n, { enumerable: true, get: () => craftConfig[n], set: (v: number) => (craftConfig[n] = v) });
  }
  // 「いっぱい」の合図は 2 秒は出しなおさない（近くにいるあいだ毎ステップ呼ばれるため）
  const FULL_SIGNAL_GAP_TICKS = 120;
  // ログは あとで作る（たんす の いっぱい が 先に呼ばれても よいように 関数の中で読む）
  return {
    w2, inventory, screenSettings, craft2Settings, m6, m7, screen, hudSignal, combatCfg, digCfg,
    craftConfig, toolConfig, uiWeaponDamage, uiTools, craftUi, FULL_SIGNAL_GAP_TICKS,
  };
}

type WiredInventory = WiredPlayer & ReturnType<typeof wireInventory>;

export function wireDrops(deps: WiredInventory) {
  const {
    shared, FULL_SIGNAL_GAP_TICKS, combatCfg, m6, world, inventory, controller, seed, game, hudSignal,
    time, w2,
  } = deps;
  let lastFullSignal = -FULL_SIGNAL_GAP_TICKS;
  // 落とし物の設定: 戦いの設定（消えるまで・拾う距離）と M6 の すてる設定をひとつに見せる
  const dropLive = {
    get dropBagTicks() {
      return combatCfg.dropBagTicks;
    },
    get pickupRadius() {
      return combatCfg.pickupRadius;
    },
    get dropPickupDelay() {
      return m6.dropPickupDelay;
    },
    get dropThrowSpeed() {
      return m6.dropThrowSpeed;
    },
    get dropThrowUp() {
      return m6.dropThrowUp;
    },
  };
  /** ふりがな付きの HTML を 読み（ひらがな）の文にする（できごと の履歴は 文字だけ） */
  function plainReading(html: string): string {
    return html.replace(/<ruby>.*?<rt>(.*?)<\/rt><\/ruby>/g, '$1').replace(/<[^>]*>/g, '');
  }
  const drops = new DropField({
    world,
    inventory,
    player: () => controller.state.position,
    rng: createRng(seed ^ 0x5eed),
    live: dropLive,
    requestSave: () => shared.requestSave(),
    onFull: () => {
      if (game.tick - lastFullSignal < FULL_SIGNAL_GAP_TICKS) return;
      lastFullSignal = game.tick;
      hudSignal.full();
    },
    onPickup: (item, count, fromYokai) => shared.onDropPicked(item, count, fromYokai),
  });
  /** 置いて たいら に した 足もと の 列（土けむり。次 の ステップ で AnimalFx へ） */
  const pendingDust: Array<{ x: number; y: number; z: number }> = [];
  // LIVE-1（にわとり）: 設定 18 こ（settings から変えたら すぐ効く）としくみ。たまごは 落ちた アイテム にする
  const live = createLiveSettings();
  // GOLD-1 §4.7: はらぱんみみず の おとしもの の くじ（シード 付き・べつ の 流れ）
  const harapanRoll = createHarapanRoll(seed, () => live);
  const animals = createAnimalManager({
    world,
    getPlayer: () => controller.state,
    deps: {
      seed,
      settings: live,
      // たまごは 小さい 速さで ポンと 出す（遠くへ とばさない）
      dropEgg: (at) => {
        drops.scatter(at, [{ item: 'egg', count: 1 }], { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 });
      },
      // 版 3.2: あみで とれた むし。持ち物 が いっぱい なら 足もと に 落として false
      addItem: (item) => {
        if (inventory.add(item, 1) === 0) return true;
        const p = controller.state.position;
        drops.scatter({ x: p.x, y: p.y + 0.5, z: p.z }, [{ item, count: 1 }], { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 });
        return false;
      },
      tryAddItem: (item) => inventory.add(item, 1) === 0,
      carriedBefore: () => (shared.achievements.stats()['carry:*'] ?? 0) > 0,
      // LIVE-2: 小屋 の ブロック は A の coopBlocks() の 一覧 どおり 置く／消す。おとしもの・はじめて の 判定
      placeCoopBlocks: (x, y, z, dir) => {
        const list = coopBlocks(x, y, z, dir);
        for (const b of list) if (!world.isLoaded(b.x, b.z)) return false;
        // LIVE-2.1 §2.1: 足もと を たいら に（消す・うめる）してから 小屋 を 置く
        const plan = coopPlan(world, x, y, z);
        if (!plan) return false;
        applyFlatten(plan, (px, py, pz, block) => world.setBlock(px, py, pz, block));
        for (const b of list) world.setBlock(b.x, b.y, b.z, b.block);
        pendingDust.push(...plan.dust);
        return true;
      },
      removeCoopBlocks: (x, y, z, dir) => {
        for (const b of coopBlocks(x, y, z, dir)) if (world.getBlock(b.x, b.y, b.z) === b.block) world.setBlock(b.x, b.y, b.z, 'air');
      },
      dropItem: (at, item) => {
        drops.scatter(at, [{ item, count: 1 }], { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 });
      },
      grewBefore: () => (shared.achievements.stats()['grow:*'] ?? 0) > 0,
      hatchedBefore: () => (shared.achievements.stats()['hatch:*'] ?? 0) > 0,
      day: () => time.day(),
      phase: () => time.phase(),
      countryAt,
      // LIVE-4: いっしょ に たたかう マッチョ が 妖怪 に さわる 口（体力 を へらす・押す・うかす は 刀 の 切り上げ と 同じ 口〈`YokaiManager.damage`〉）
      fight: {
        playerDead: () => shared.combat.dead(),
        yokai: (id) => shared.yokaiManager?.fightBody(id) ?? null,
        hit: (id, amount, from, knock) => shared.yokaiManager?.damage(id, amount, from, knock, 'macho') ?? 0,
        blade: () => ({ thrust: w2.bladeTech.thrust, kiriageMul: w2.bladeDamageMul.kiriage, kiriageKnock: w2.bladeKnock.kiriage }),
      },
    },
  });
  return { plainReading, drops, pendingDust, live, harapanRoll, animals };
}

export type WiredDrops = WiredInventory & ReturnType<typeof wireDrops>;
