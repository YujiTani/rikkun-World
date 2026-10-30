// main.ts の 流れ 6: HUD・画面の 演出・実績と 画面。
import { DigFx } from '../../fx/DigFx';
import { CombatFx } from '../../fx/combatFx';
import { createCombatUi } from '../../fx/combatUi';
import { WeaponFx } from '../../fx/weaponFx';
import { StaggerIcons } from '../../fx/parryFx';
import { LEGEND_FX_ITEMS } from '../../fx/bladeTrailModel';
import { EventRelay } from '../../fx/eventRelay';
import { BladeHud } from '../../ui/bladeHud';
import { WearNotice } from '../../ui/wearNotice';
import { ArrowVisuals } from '../../fx/arrowVisuals';
import { FurnaceFx } from '../../fx/furnaceFx';
import { playLegend } from '../../fx/legendSounds';
import { boxOf } from '../../combat/attackFacing';
import { BuffIcons } from '../../ui/buffIcons';
import { LegendBook } from '../../legend/LegendBook';
import { NinjaBook, isNinjaGear } from '../../craft/NinjaBook';
import { SamuraiBook, isSamuraiGear } from '../../craft/SamuraiBook';
import { chargeOf, trailStyleOf } from '../../legend/defs';
import { playCraft } from '../../fx/craftSounds';
import { CraftUiHud } from '../../ui/craftUi';
import { PickupLog } from '../../ui/pickupLog';
import { LogSystem, LogPage } from '../../ui/log';
import { type ItemId, CROP_KINDS, SEED_ITEM, cropKindOfBlock, type AchievementId, type DefeatWith } from '../../contracts';
import { itemRarity, rarityIndex } from '../../drops/rarity';
import { itemType } from '../../inventory/items';
import { AchievementSystem, AchievementsPageModel, ACHIEVEMENT_DEFS } from '../../achievements';
import { CountryWatch } from '../../achievements/countryWatch';
import { CelebrateUi } from '../../ui/celebrate';
import { AchievementsPage, achievementArtUrl } from '../../ui/achievementsPage';
import { StorageScreen } from '../../ui/storageScreen';
import { DragOut } from '../../ui/dragOut';
import { CraftMadeTracker } from '../../ui/craftModel';
import { type InfoNumbers, createItemInfo } from '../../craft/info';
import { mountInventoryTabs } from '../../ui/craftPanel.tabs';
import { noticeCluster } from '../../ui/craftHint';
import { type ClockPhases, CLOCK_PHASES } from '../../ui/clockModel';
import { markUrl } from '../../ui/medalArt';
import { itemIconUrl } from '../../ui/itemIcon';
import { NatsukiPanel } from '../../ui/natsukiPanel';
import { AnimalHint } from '../../ui/animalHint';
import { Itadakimasu } from '../../ui/itadakimasu';
import { CoopMenu } from '../../ui/coopMenu';
import { coopMenuReach } from '../../ui/coopMenuModel';
import { countryAt } from '../../world/gen/biome';
import { YOKAI_NAME } from '../../yokai';
import { LevelHud } from '../../ui/levelHud';
import { ActionHint } from '../../ui/actionHint';
import { YokaiFocus } from '../../fx/yokaiFocus';
import { TitleAnnounce } from '../../ui/titleAnnounce';
import { YokaiNameplates } from '../../ui/yokaiNameplates';
import { impactOf } from '../../fx/impact';
import { Hotbar } from '../../ui/hotbar';
import { InventoryScreen } from '../../ui/inventoryScreen';
import { Notice } from '../../ui/notice';
import { GEN_CONFIG } from '../../world/gen/config';
import { heightAt as genHeightAt } from '../../world/gen/terrain';
import { WaterDropFx } from '../../fx/waterFx';
import { SprinklerFx } from '../../fx/sprinklerFx';
import { FarmSparkle, FarmSparkleView } from '../../fx/farmSparkle';
import { FarmFx } from '../../fx/farmFx';
import { FarmHint } from '../../ui/farmHint';
import { FarmAimHud } from '../../ui/farmAim';
import { NO_COMBAT, NO_SWINGS, NO_DIG } from './shared';
import type { WiredAnimalView } from './creatures';

export function wireHud(deps: WiredAnimalView) {
  const {
    shared, rig, armor, game, hud, hudSignal, w2, inventory, screen, craft, uiTools, craftUi, live,
    storage, craft2Settings, fxSound, farm, controller, dig, animals, lock, pointerLock, animalFx,
  } = deps;
  rig.setSwingSource(() => {
    const r = shared.swingBuf;
    shared.swingBuf = NO_SWINGS;
    return r;
  });
  rig.setArmorProvider((slot) => armor.equipped(slot));
  const arrowVisuals = new ArrowVisuals();
  arrowVisuals.addTo(game.scene);
  const stuckVisuals = new ArrowVisuals();
  stuckVisuals.addTo(game.scene);

  // 画面の見た目と音
  const notice = new Notice(hud);
  // 「もちもの が いっぱい」の合図は 実績（いっぱいにした）にも数える
  const showSignalRaw = notice.showSignal.bind(notice);
  shared.showSignalRaw = showSignalRaw;
  let lastFullTick = -1;
  notice.showSignal = (kind) => {
    // 「いっぱい」は 同じステップで 2 回（つくる画面と つくる口の両方から）呼ばれても 実績には 1 回だけ数える
    if (kind === 'full' && game.tick !== lastFullTick) {
      lastFullTick = game.tick;
      shared.onFullSignal();
    }
    showSignalRaw(kind);
  };
  hudSignal.full = () => notice.showSignal('full');
  // CRAFT-2: 合図が 出はじめたとき 1 件だけ 履歴へ（出たままの 同じ合図では 足さない）
  notice.onSignalStart = (k) => {
    if (!shared.skipSignalLog) log.signal(k);
  };
  // 時計の ひる の分け方（settings の clockPhases）
  const bladeHud = new BladeHud(hud, () => w2);
  const wearNotice = new WearNotice(hud);
  wearNotice.onLow = (item) => log.wearLow(item);
  wearNotice.onBroken = (item) => log.wearBroken(item);
  const clockPhases: ClockPhases = { ...CLOCK_PHASES };
  const combatUi = createCombatUi(hud, clockPhases);
  const levelHud = new LevelHud(hud);
  const buffIcons = new BuffIcons(hud);
  const hotbar = new Hotbar(hud, inventory, notice);
  /** #264: 休みの ある ためわざ（シャイニング）の 武器なら 休みの 長さ */
  const shiningCooldownOf = (item: ItemId): number | null => {
    const c = chargeOf(w2, item);
    return c?.kind === 'shining' ? c.cooldown : null;
  };
  // ねらっている所の ヒント（設定 actionHint で消せる）
  const hintSettings = { actionHint: true };
  const actionHint = new ActionHint(hud);
  const titleAnnounce = new TitleAnnounce(hud);
  const yokaiNameplates = new YokaiNameplates(hud);
  const staggerIcons = new StaggerIcons(hud, './models/fx/');
  shared.staggerIcons = staggerIcons;
  const stagIconBuf: { id: number; x: number; y: number; z: number; titled: boolean }[] = [];
  const plateBuf: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = [];
  const yokaiFocus = new YokaiFocus((id) => shared.yokaiManager!.modelOf(id), () => game.camera.position);
  const hintVisible = (): boolean => hintSettings.actionHint && screen.mode() === 'play' && !screen.inventoryOpen() && rig.crosshairVisible();
  const nameOf = (item: ItemId): string => itemType(item)?.name ?? item;
  const inventoryScreen = new InventoryScreen(hud, inventory, screen, () => screen.toggle(), {
    craft,
    armor,
    furnaces: { get: (x, y, z) => craft.furnaceAt(x, y, z) },
    nameOf,
    rarityOf: itemRarity,
    placeable: (item) => itemType(item)?.placeBlock != null,
    onFull: () => notice.showSignal('full'),
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
  });
  // CRAFT-2: ログ（左のログ＋できごと の履歴）。拾ったログ（PickupLog）は これの liveModel を読む
  const log: LogSystem = new LogSystem({ nameOf, settings: craft2Settings, live: craftUi });
  shared.log = log;
  // できごと ページ（もちもの画面の ページ置き場に入る）
  const logPage = new LogPage(log, { pageSlot: inventoryScreen.pageSlot });
  const pickupLog = new PickupLog(hud, { nameOf, rarityOf: itemRarity, log });
  // つくる がいっぱいで できなかったとき: どこから呼んでも（画面・窓口）「もちもの が いっぱい！」の合図
  {
    const makeRaw = craft.make.bind(craft);
    craft.make = (id) => {
      const r = makeRaw(id);
      if (!r.ok && r.reason === 'full') notice.showSignal('full');
      return r;
    };
  }
  // やく を押したとき: たんす から使った分と「やきはじめた」を 履歴へ（かまど の じゅんばんが 2 つ目以降でも 1 件ずつ）
  {
    const bakeRaw = craft.bake.bind(craft);
    craft.bake = (id, x, y, z) => {
      const r = bakeRaw(id, x, y, z);
      if (r.ok) {
        log.fromTansu(r.used?.tansu);
        const out = craft.recipes().find((rc) => rc.id === id)?.output.item;
        if (out) log.bakeStart(out);
      }
      return r;
    };
  }
  const craftHud = new CraftUiHud({ hud, craft, inv: inventory, nameOf, rarityOf: itemRarity }, pickupLog);
  const furnaceFx = new FurnaceFx(game.scene, fxSound, craftUi);
  shared.onDropPicked = (item, count, fromYokai) => {
    // からかさ・ろくろくび の おとしもの から たね を拾った
    if (fromYokai && CROP_KINDS.some((k) => SEED_ITEM[k] === item)) farm.noteSeedFound('yokai', item, controller.state.position);
    craft.notifyPickup(item, count);
    hotbar.pickup(item, count);
  };
  const fx = new DigFx({
    scene: game.scene,
    dig,
    hideBlockFocus: () => dig.aimedYokaiId() !== null,
    sound: fxSound,
    doll: rig.doll,
    view: rig,
    notice,
    onPickup: (item, count) => hotbar.pickup(item, count),
    events: () => {
      const r = shared.digBuf;
      shared.digBuf = NO_DIG;
      return r;
    },
  });
  shared.fx = fx;
  const farmHint = new FarmHint(hud);
  const animalHint = new AnimalHint(hud);
  shared.animalHint = animalHint;
  const natsukiPanel = new NatsukiPanel(hud);
  shared.natsukiPanel = natsukiPanel;
  // LIVE-3: いのち を いただきます の 一言 と、とりごや の メニュー（3 ページ）
  const itadakimasu = new Itadakimasu(hud);
  const coopMenu = new CoopMenu(hud, {
    meatList: (c) => animals.meatList(c),
    eggs: (c) => {
      const r = animals.coops().find((x) => x.id === c);
      return r ? r.nest.egg + r.nest.gold : 0;
    },
    busy: (c) => animals.coops().find((x) => x.id === c)?.meatBusy ?? null,
    exists: (c) => animals.coops().some((x) => x.id === c),
    // M2 の とどく きょり 5.0（小屋 の ふち から）
    inReach: (c) => {
      const r = animals.coops().find((x) => x.id === c);
      const p = controller.state.position;
      return !!r && coopMenuReach(r, p.x, p.z, 5.0);
    },
    collect: (c) => {
      const r = animals.collectCoop(c);
      if (r.egg > 0) craft.notifyPickup('egg', r.egg);
      if (r.gold > 0) craft.notifyPickup('kin_tamago', r.gold);
    },
    startMeat: (c, id) => animals.meat(c, id).ok,
    // たんす と おなじ あつかい: マウス が 出る・時計 は 止めない。とじる と ロック を かけ直す
    onOpen: () => {
      lock.setInventoryOpen(true);
      game.input.releaseAll();
      if (lock.isSimulated()) lock.simulate(false);
      pointerLock.release();
    },
    onClose: () => {
      if (lock.isSimulated()) {
        lock.simulate(true);
        lock.setInventoryOpen(false);
      } else {
        lock.beginRelock();
        lock.setInventoryOpen(false);
        pointerLock.request();
      }
      game.input.releaseAll();
    },
    kidInfo: (id) => ({ id, macho: animals.list().find((a) => a.id === id)?.breed === 'macho' }),
    tick: () => playCraft(fxSound, 'tab'),
    onPick: (id) => animalFx.setPick(id),
  });
  shared.coopMenuIsOpen = () => coopMenu.model.info().open;
  shared.openCoopMenu = (id) => void coopMenu.open(id);
  // Esc・E でも とじる（もちもの画面 は 開かない: ScreenController は ロック中 でない と 開かない）
  game.input.onPress((action) => {
    if ((action === 'closeMenu' || action === 'toggleInventory') && coopMenu.model.info().open) coopMenu.press('close');
  });
  const farmAimHud = new FarmAimHud(hud);
  return {
    arrowVisuals, stuckVisuals, notice, bladeHud, wearNotice, clockPhases, combatUi, levelHud, buffIcons,
    hotbar, shiningCooldownOf, hintSettings, actionHint, titleAnnounce, yokaiNameplates, staggerIcons,
    stagIconBuf, plateBuf, yokaiFocus, hintVisible, nameOf, inventoryScreen, log, logPage, pickupLog,
    craftHud, furnaceFx, fx, farmHint, animalHint, natsukiPanel, itadakimasu, coopMenu, farmAimHud,
  };
}

type WiredHud = WiredAnimalView & ReturnType<typeof wireHud>;

export function wireWeaponFx(deps: WiredHud) {
  const {
    shared, game, fxSound, combat, yokaiM, time, rig, combatUi, titleSound, hotbar, impactBus,
    titleOfYokai, blade, inventory, armor, bladeHud, wearNotice, nameOf, controller, w2, kodachi, slashFx,
    rainbowFx, raijinFx, fujinFx,
  } = deps;
  const combatFx = new CombatFx({
    scene: game.scene,
    sound: fxSound,
    // 出来事は上の入れ物から（combat.drainEvents は main が 1 回だけ呼ぶ）
    combat: {
      hp: () => combat.hp(),
      maxHp: () => combat.maxHp(),
      dead: () => combat.dead(),
      invincibleTicks: () => combat.invincibleTicks(),
      drainEvents: () => {
        const r = shared.combatBuf;
        shared.combatBuf = NO_COMBAT;
        return r;
      },
    },
    yokai: yokaiM,
    time,
    bags: () => combat.bags(),
    doll: rig.doll,
    view: rig,
    hearts: combatUi.hearts,
    deathScreen: combatUi.deathScreen,
    homeNotice: combatUi.homeNotice,
    edge: combatUi.edge,
    clock: combatUi.clock,
    titleSound,
    onPickup: (item, count) => hotbar.pickup(item, count),
    // #276: パンチが 当たった・妖怪を たおした
    onPunchHit: (id) => impactBus.hit(impactOf({ kind: 'punch', title: titleOfYokai(id) })),
    onDefeat: () => impactBus.hit(impactOf({ kind: 'defeat' })),
  });

  const arrowRelay = new EventRelay<import('../../contracts').BowEvent>();
  const weaponFx = new WeaponFx({
    scene: game.scene,
    sound: fxSound,
    blade,
    bow: {
      drainEvents: () => arrowRelay.take() as import('../../contracts').BowEvent[],
    },
    inventory,
    armor,
    bladeHud,
    notice: wearNotice,
    nameOf,
    handPos: () => ({ x: controller.state.position.x, y: controller.state.position.y + 1, z: controller.state.position.z }),
    settings: () => w2,
    // CHAR-4: 刃の軌跡は 体（当たり判定の 足もと）の そのステップの おわりの 位置と カメラから 作る
    body: () => controller.state.position,
    camera: game.camera,
    onWear: (e) => shared.achievements.feedWear(e),
    onBlade: (e) => { shared.achievements.feedBlade(e); for (const b of e) kodachi.onCombatEvent(b); },
    // WEAPON-7: ふつうの わざに 雷の「ビシューン」を 重ねる（ダメージは かえない）
    onTechItem: (item, tech, step) => {
      if (trailStyleOf(w2, item) === 'thunder') playLegend(fxSound, 'thunderSlash');
      // 白い 斬撃（レジェンダリー 3 本だけ。ぼくとう・かたな・きらめくかたなは 半月の 帯と 段の 星。2026-10-23 オーナー決定。わざごとの 絵・決めが 当たりに 重なる よう まって 出す。カメラの 向きで 絵を きめる）。ダメージは かえない
      if (item && LEGEND_FX_ITEMS.has(item) && tech) {
        const u = blade.state().move?.dirDeg ?? controller.state.yawDeg;
        slashFx.queueSlash({ tech, step: step ?? 1, uDeg: u, pos: () => controller.state.position, reach: w2.bladeReach[item] });
        // 上の 層（武器ごと）
        if (item === 'niji') rainbowFx.queue({ tech, step: step ?? 1, uDeg: u, pos: () => controller.state.position });
        else if (item === 'raijin_ken') raijinFx.queue({ tech, step: step ?? 1, uDeg: u, pos: () => controller.state.position });
        else if (item === 'fujin_ken') fujinFx.queue({ tech, step: step ?? 1, uDeg: u, pos: () => controller.state.position, reach: w2.bladeReach[item] });
      }
    },
    // 当たった 妖怪 1 体ごとに 白い 火花
    onTechHit: (item, e) => {
      // #276 ヒットストップ・画面の ゆれ（1 ステップに 一番 強い 1 回）
      impactBus.hit(impactOf({ kind: 'tech', tech: e.tech, step: e.step, title: titleOfYokai(e.yokaiId) }));
      if (!item || !LEGEND_FX_ITEMS.has(item)) return;
      // 当たった 妖怪の 胸（足もと + 背の 6 割）に 火花を 出す
      const yk = shared.yokaiManager?.list().find((q) => q.id === e.yokaiId);
      const chest = yk ? boxOf(yk).h * 0.6 : 0.8;
      slashFx.hit({ x: e.position.x, y: e.position.y + chest, z: e.position.z }, e.tech, blade.state().move?.dirDeg ?? controller.state.yawDeg);
      // 虹: 当てた 妖怪の 胸に 虹色の 点
      if (item === 'niji') rainbowFx.hit({ x: e.position.x, y: e.position.y + chest, z: e.position.z });
      // 雷神剣のけさ: 妖怪の まわりから 稲妻が 6 本 あつまる
      if (item === 'raijin_ken' && e.tech === 'kesa') raijinFx.hit({ x: e.position.x, y: e.position.y + chest, z: e.position.z });
    },
    onBladeCancel: () => {
      slashFx.cancelSlash();
      fujinFx.cancel();
      raijinFx.cancel();
      rainbowFx.cancel();
    },
    // 半月の 帯は レジェンダリー 3 本だけ 白い 斬撃と 置きかえ（ぼくとう・かたな・きらめくかたなは 帯を 出す）
    hideBandTrail: (item) => !!item && LEGEND_FX_ITEMS.has(item),
    // WEAPON-9: 虹の つき・きりあげ・けさ は 今の 刀の 音の 代わりに nijiSlash（1 振りに 1 回。段ごとに 3 とおり）
    replaceTechSound: (item, step) => {
      if (trailStyleOf(w2, item) !== 'rainbow') return false;
      playLegend(fxSound, 'nijiSlash', step - 1);
      return true;
    },
    onArrowPickup: () => hotbar.pickup('ya', 1),
  });
  return { combatFx, arrowRelay, weaponFx };
}

type WiredWeaponFx = WiredHud & ReturnType<typeof wireWeaponFx>;

export function wireAchievements(deps: WiredWeaponFx) {
  const {
    shared, m6, seed, w2, inventory, armor, m7, farm, pet, renderer, game, world, fxSound, fx, farmHint,
    inventoryScreen, combat, screen, log, logPage, storage, hud, nameOf, levelHud, yokaiM, reducedMotionMq,
    toolConfig, uiWeaponDamage, craftConfig, combatCfg, digCfg, craft, notice, dropper, dig, time,
  } = deps;
  shared.toItemsTab = toItemsTab;

  // ---- M6: 実績・演出・たんす画面・説明 ----
  const achievements = new AchievementSystem(() => m6);
  shared.achievements = achievements;
  shared.achievementsRef = achievements;
  // COUNTRY-1 §4.1: 「国に入った」の 判定（まん中寄りに 180 コマ・地下は 数えない）。入ったら 実績の係へ
  const countryWatch = new CountryWatch({
    at: (x, z) => countryAt(seed, x, z),
    heightAt: (x, z) => genHeightAt(seed, x, z),
    blend: GEN_CONFIG.biome.blend,
    onEnter: (kind) => {
      achievements.enterCountry(kind, false);
    },
  });
  // WEAPON-7: 手に 入れた ことの ある レジェンダリー（もちものに 入った とき。袋を ひろう・テストの add も）。実績 get.* と legend.kinds へ
  const legendBook = new LegendBook((item) => w2.legendary.some((d) => d.item === item));
  // NINJA-1 §4.2: 手に 入れた ことの ある 忍者装備（忍者帳。世界ごとに 保存）。実績 ninja.* へ。legend.kinds・get.* には 数えない
  const ninjaBook = new NinjaBook();
  /** いま 持って いる 忍者装備（もちもの・防具の マス・手に もった 物） */
  const ninjaHave = (): ItemId[] => {
    const out: ItemId[] = [];
    for (const s of inventory.slots()) if (s && isNinjaGear(s.item)) out.push(s.item);
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) {
      const it = armor.equipped(slot);
      if (it && isNinjaGear(it)) out.push(it);
    }
    const c = inventory.cursor();
    if (c && isNinjaGear(c.item)) out.push(c.item);
    return out;
  };
  // SAMURAI-1 §4.2: 手に 入れた ことの ある 侍装備（侍帳。世界ごとに 保存）。実績 samurai.* へ。忍者帳・legend.kinds・get.* には 数えない
  const samuraiBook = new SamuraiBook();
  shared.samuraiBook = samuraiBook;
  /** いま 持って いる 侍装備（もちもの・防具の マス・手に もった 物） */
  const samuraiHave = (): ItemId[] => {
    const out: ItemId[] = [];
    for (const s of inventory.slots()) if (s && isSamuraiGear(s.item)) out.push(s.item);
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) {
      const it = armor.equipped(slot);
      if (it && isSamuraiGear(it)) out.push(it);
    }
    const c = inventory.cursor();
    if (c && isSamuraiGear(c.item)) out.push(c.item);
    return out;
  };
  shared.samuraiHave = samuraiHave;
  inventory.onAdded = (item) => {
    const r = legendBook.add(item);
    if (r) achievements.feedLegend(item, r.kinds);
    const n = ninjaBook.add(item);
    if (n) achievements.feedNinja(item, n.kinds);
    const sm = samuraiBook.add(item);
    if (sm) achievements.feedSamurai(item, sm.kinds);
    achievements.feedRarity(itemRarity(item));
  };
  // M7-2: キラキラ・ハート（C）・しずく（A）・しぶき（B）
  const eyePos = { x: 0, y: 0, z: 0 };
  const sparkle = new FarmSparkle({
    settings: m7,
    crops: () => sparkleCrops(),
    stageAt: (x, y, z) => farm.crop(x, y, z)?.stage ?? null,
    happy: (fn) => pet.forEach((x, y, z) => fn(x, y, z)),
  });
  const sparkleView = new FarmSparkleView(sparkle);
  renderer.setSwaySource((cb) => sparkle.forEachSway(cb));
  sparkleView.addTo(game.scene);
  const waterFx = new WaterDropFx(game.scene);
  const sprayFx = new SprinklerFx({ period: m7.farmSprinklerSprayTicks });
  game.scene.add(sprayFx.group);
  const sparkleList: Array<{ x: number; y: number; z: number; stage: number }> = [];
  /** 作物（farm.crops）と、目の まわりの やせいの やさい（stage 3）。15 ステップに 1 回だけ 呼ばれる */
  const wildScan = { x: -999, y: -999, z: -999, r: -1, n: 0, list: [] as Array<{ x: number; y: number; z: number; stage: number }> };
  function sparkleCrops(): ReadonlyArray<{ x: number; y: number; z: number; stage: number }> {
    sparkleList.length = 0;
    for (const c of farm.crops()) sparkleList.push(c);
    // やせいの やさい は 近くを 数回に 1 回だけ さがし、毎回は まだ ある ものだけ たしかめる
    const r = Math.ceil(m7.farmSparkleRange);
    const ex = Math.floor(eyePos.x);
    const ey = Math.floor(eyePos.y);
    const ez = Math.floor(eyePos.z);
    const moved = Math.abs(ex - wildScan.x) + Math.abs(ey - wildScan.y) + Math.abs(ez - wildScan.z) >= 3;
    if (moved || wildScan.n++ % 4 === 0 || wildScan.r !== r) {
      wildScan.x = ex;
      wildScan.y = ey;
      wildScan.z = ez;
      wildScan.r = r;
      wildScan.list.length = 0;
      const y0 = Math.max(0, ey - r);
      const y1 = Math.min(world.size.y - 1, ey + r);
      for (let z = ez - r; z <= ez + r; z++)
        for (let x = ex - r; x <= ex + r; x++) {
          if (!world.isLoaded(x, z)) continue;
          for (let y = y0; y <= y1; y++) {
            const k = cropKindOfBlock(world.getBlock(x, y, z));
            if (k && k.wild) wildScan.list.push({ x, y, z, stage: 3 });
          }
        }
    }
    for (const w of wildScan.list) {
      const k = cropKindOfBlock(world.getBlock(w.x, w.y, w.z));
      if (k && k.wild) sparkleList.push(w);
    }
    return sparkleList;
  }
  const farmFx = new FarmFx({ sound: fxSound, particles: fx.particles, hint: farmHint, achievements, sparkle });
  shared.onFullSignal = () => achievements.feedFull();
  const pageModel = new AchievementsPageModel(achievements);
  const achievementsPage = new AchievementsPage(achievements, pageModel, inventoryScreen);
  // ---- CRAFT-2: できごと タブ・L キー
  /** もちもの画面を できごと タブにする（閉じていれば 開く）。開けない場面（おめでとう・案内・やられた）では 何もしない */
  function openLogTab(): void {
    if (combat.dead()) return;
    if (!screen.inventoryOpen()) {
      if (screen.mode() !== 'play') return;
      screen.toggle();
      if (!screen.inventoryOpen()) return;
    }
    inventoryScreen.setTab('log');
    pageModel.setTab('log');
    pageModel.sync(true);
    log.resetScroll();
    syncPages();
  }
  /** タブを替えた その場で ページの出し入れを 合わせる（時間が止まっていても 見た目が すぐ替わるように） */
  function toItemsTab(): void {
    if (inventoryScreen.tab() === 'items') return;
    inventoryScreen.setTab('items');
    pageModel.setTab('items');
    pageModel.sync(screen.inventoryOpen());
    syncPages();
  }
  function syncPages(): void {
    achievementsPage.update();
    logPage.update(screen.inventoryOpen() && inventoryScreen.tab() === 'log');
  }
  log.bindHost({ isOpen: () => screen.inventoryOpen(), tab: () => inventoryScreen.tab(), open: openLogTab });
  game.input.onPress((action) => {
    if (action !== 'openLog') return;
    // おめでとう画面・案内画面・やられた画面・たんす画面のあいだは 何もしない
    if (screen.mode() === 'guide' || combat.dead() || storage.ui().open) return;
    if (screen.inventoryOpen() && inventoryScreen.tab() === 'log') screen.toggle();
    else openLogTab();
  });
  achievements.onUnlock((d, silent) => {
    if (!silent) log.achievement(d.name);
  });
  const defById = new Map(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));
  const craftPanel = inventoryScreen.craftPanel!;
  const celebrate = new CelebrateUi({
    hud,
    // 実績の おしらせ(帯)は body 直下: #hud の 外に 置くと、#hud の 中の メニュー・ボスの 体力ゲージより いつも 上に 出る
    topLayer: document.body,
    badgeParent: noticeCluster(hud),
    sound: fxSound,
    screen,
    settings: () => m6,
    tileEl: (id) => craftPanel.tileElFor(id),
    itemName: nameOf,
    itemRarity: (item: ItemId) => rarityIndex(itemRarity(item)),
    itemIconUrl,
    achievement: (id: AchievementId) => {
      const d = defById.get(id)!;
      return { name: d.name, tier: d.medal, artUrl: achievementArtUrl(d) ?? markUrl('medal') };
    },
    levelUpShowing: () => levelHud.celebrating(),
    // WEAPON-7: ヌシの「あらわれた！」が 出ている 間は 上の 帯の ほかの ものを 待たせる
    appear: () => {
      const a = yokaiM.announce();
      return a ? { ticksLeft: a.ticksLeft } : null;
    },
    onTelopStart: () => playLegend(fxSound, 'legendDrop'),
    reducedMotion: () => reducedMotionMq?.matches ?? false,
  });
  shared.celebrate = celebrate;
  achievements.attach(celebrate.modal, celebrate.busy);
  // 設定を変えたらすぐ効くよう、毎回 m6 を読む
  const madeTracker = new CraftMadeTracker({
    get comboTicks() {
      return m6.craftComboTicks;
    },
    get comboMax() {
      return m6.craftComboMax;
    },
    isFirstMade: (kind, recipe) => achievements.isFirstMade(kind, recipe),
  });
  madeTracker.onMade((e) => celebrate.made(e));
  const infoNumbers = (): InfoNumbers => ({
    toolPower: toolConfig.toolPower,
    toolLevel: toolConfig.toolLevel,
    weaponDamage: uiWeaponDamage(),
    weaponReach: toolConfig.weaponReach,
    bladeReach: w2.bladeReach,
    weaponTicks: toolConfig.weaponTicks,
    arrowDamage: toolConfig.arrowDamage,
    arrowRange: toolConfig.arrowRange,
    armorValue: craftConfig.armorValue,
    punchDamage: combatCfg.punchDamage,
    punchReach: combatCfg.punchReach,
    punchTicks: combatCfg.punchTicks,
    handPower: digCfg.handPower,
    handLevel: digCfg.handLevel,
    harvestLevel: (item) => (digCfg.harvestLevel as Record<string, number>)[item] ?? 0,
    tansuSlots: m6.tansuSlots,
  });
  craftPanel.configure({
    info: createItemInfo({ recipes: () => craft.recipes(), nameOf, numbers: infoNumbers }),
    cursorHeld: () => inventory.cursor() !== null,
    isMade: (kind, id) => !achievements.isFirstMade(kind, id),
    onSelect: () => playCraft(fxSound, 'tab'),
    onFull: () => notice.showSignal('full'),
  });
  const inventoryTabs = mountInventoryTabs(inventoryScreen, {
    dot: () => pageModel.ui(screen.inventoryOpen()).tabDot,
    onSwitch: (tab) => {
      pageModel.setTab(tab);
      pageModel.sync(screen.inventoryOpen());
      syncPages();
      playCraft(fxSound, 'tab');
    },
  });
  const storageScreen = new StorageScreen(inventoryScreen, storage, m6.tansuSlots);
  shared.dragOut = new DragOut(inventoryScreen, {
    inventory,
    dropper,
    storage,
    armor,
    shiftMove: (i) => {
      if (storage.ui().open) storage.shiftClick('inv', i);
      else inventory.shiftMove(i);
    },
  });
  shared.tryOpenTansu = () => dig.tryOpenAimedStorage();
  time.onPhaseChange((p) => achievements.feedPhase(p));
  const defeatWith = (): DefeatWith => {
    const h = inventory.held()?.item;
    if (h === 'bokuto' || h === 'katana' || h === 'naginata' || h === 'crystal_katana' || h === 'yumi') return h;
    if (h === 'kin_yumi' || h === 'kongo_yumi') return 'yumi'; // GOLD-1: きんの 装備 は 実績 の 表 に 武器別 の 行 を 足さず、てつ と 同じ あつかい
    if (h === 'kin_katana' || h === 'kongo_katana') return 'katana';
    if (h === 'kin_pickaxe' || h === 'kin_axe' || h === 'kongo_pickaxe' || h === 'kongo_axe') return 'pickaxe';
    if (h === 'raijin_ken' || h === 'fujin_ken' || h === 'niji') return 'katana'; // WEAPON-7: 雷神剣で たおした ときは「かたな」と 同じ あつかい（実績の 表に 武器別の 行は 足さない）
    if (h === 'wood_pickaxe' || h === 'stone_pickaxe' || h === 'iron_pickaxe' || h === 'wood_axe' || h === 'stone_axe' || h === 'iron_axe') return 'pickaxe';
    return 'hand';
  };
  shared.onDefeatAch = (kind) => {
    log.defeat(YOKAI_NAME[kind]);
    achievements.feedDefeat({ kind, tick: game.tick, with: defeatWith(), hp: combat.hp() });
  };
  return {
    achievements, countryWatch, legendBook, ninjaBook, ninjaHave, samuraiBook, samuraiHave, eyePos,
    sparkle, sparkleView, waterFx, sprayFx, farmFx, pageModel, achievementsPage, toItemsTab, syncPages,
    craftPanel, celebrate, madeTracker, inventoryTabs, storageScreen,
  };
}

export type WiredAchievements = WiredWeaponFx & ReturnType<typeof wireAchievements>;
