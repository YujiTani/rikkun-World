// main.ts の 流れ 9 の つづき: 2P の あそび（COOP-1 作業 3a。docs/design/COOP-1.md §2.5・§2.6・§9.5）。
// 2P の ほる・おく・こうげき・ハート・たおれて もどる・けいけんち。歩く・カメラ・えらびは wire/duo.ts。
// 2P が 参加する たびに 一式を 作り、やめる たびに 片づける（倒れたまま やめても 次は 元気）。
import type * as THREE from 'three';
import type { PlayerCombatImpl as PlayerCombatT } from '../../combat';
import { PlayerCombatImpl } from '../../combat';
import { createCombatConfig } from '../../combat/config';
import type { DigSystemImpl } from '../../dig/DigSystem';
import type { DigFx } from '../../fx/DigFx';
import type { Action, ActionState } from '../../input/actions';
import type { PlayerController } from '../../player/PlayerController';
import { ToolSystemImpl } from '../../tools';
import { createBladeSystem, isBladeItem } from '../../tools/blade/BladeSystem';
import { createWeaponDamage } from '../../tools/blade/weaponDamage';
import type { YokaiPartner } from '../../yokai/ai/target';
import { queueKodachiSlash } from '../../fx/kodachiSlash';
import { ParryFx, bladeMidInto } from '../../fx/parryFx';
import { isParrySound, playParry } from '../../fx/parrySounds';
import { parryGlowLevel } from '../../combat/parry';
import { FX_SETTINGS } from '../../fx/config';
import { createRng } from '../../world/gen/random';
import type { DuoHud } from '../../ui/duoHud';
import { halvesCoveredBy, hudNoticeShow, type DuoHalves, type Who } from '../../ui/duoHalves';
import { buffsOfHeld } from '../../ui/buffIconsModel';
import { anyCraftNow } from '../../ui/craftModel';
import { legendMoveMulOf } from '../../legend/defs';
import { lifeUiOf } from '../../fx/combatFxModel';
import { actionHintView, fillHintCtx, type DuoAimStep2, type DuoHintInput, type DuoAimHud } from '../../ui/duoAimHud';
import type { LockStatus, Inventory, ItemId, Vec3 } from '../../contracts';
import type { GetaPlayer } from '../../craft/geta';
import type { BladeSystem, CraftSystem } from '../../contracts';
import { bindWho } from '../../duo/credit';
import { createP2Dig } from '../../duo/p2Dig';
import { invMayOpen } from '../../duo/invRules';
import { createP2DigFx } from '../../duo/p2DigFx';
import { createP2Kodachi, type P2Kodachi } from '../../duo/p2Kodachi';
import { feedP2Impact } from '../../duo/p2Impact';
import { createP2Partner } from '../../duo/p2Partner';
import { p2SpeedMul } from '../../duo/p2Legend';
import { createP2Parry, type P2Parry } from '../../duo/p2Parry';
import { createP2Wear } from '../../duo/p2Wear';
import { createP2Feed, type P2Feed } from '../../duo/p2Feed';
import { createP2Sounds, type P2Sounds } from '../../duo/p2Sounds';
import { P2Life } from '../../duo/p2Life';
import { sampleStacks } from '../../duo/sample';
import { ALL_RECIPES } from '../../craft/recipes';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { pickableMate, pickLegend } from '../../duo/rules';
import { createDuoLegend, type DuoLegend } from './duoLegend';
import { wireDuoFarm, type DuoFarm } from './duoFarm';
import { wireDuoAnimals, type DuoAnimals } from './duoAnimals';
import { createDuoGadgets, type DuoGadgets } from './duoGadgets';
import { kiteInfo, seatInfo } from '../../duo/p2Gadgets';
import { DUO_TUNING } from '../../duo/tuning';
import { shoulderAimDeg } from '../../duo/shoulderAim';
import type { DuoPlayHook, DuoVec3 } from '../../duo/types';
import type { ThunderHook } from '../../fx/thunderFx';
import type { FlashSrc } from '../../duo/flash';
import type { P2GashaPort } from './gashaPeople';
import type { WiredLoop } from './save';

const DEG = Math.PI / 180;

export interface DuoPlayCtx {
  deps: WiredLoop;
  ui: DuoHud;
  /** COOP-1 5f-1: 照準まわり（＋・ヒント・おしらせの 印・構え・ロック・弓の 丸）を 各半分に */
  aim: DuoAimHud;
  /** COOP-1 5f-2: 2P の 半分の 部品（時計・おしらせ・ふち・つくれる マーク・バフ・名札・すみ）。中身は ui/duoHalves.ts */
  halves: DuoHalves;
  /** 2P の 入力 */
  actions: ActionState;
  /** 2P の 入力が 通る か（もちもの画面が 開いていない・倒れていない） */
  lock: LockStatus;
  /** 参加している あいだの 2P の 体（参加前は 呼ばない） */
  ctl2: () => PlayerController;
  joined: () => boolean;
  /** 2P の もちもの画面が 開いているか（とりごやの メニューを ひらかない・とじる） */
  invOpen: () => boolean;
  /** 2P の パッドが ささっているか */
  padPresent: () => boolean;
  /** 2P の カメラ（小太刀の 斬撃の 向き・2P の パリィの 火花の 向きに 使う。1P の game.camera ではない） */
  camera2: () => THREE.PerspectiveCamera;
  /** COOP-1 4d-1: 2P が 刀を 持って Shift（run）を 押した。2P の 人形の パリィの 絵を 先に 読む（1P の step.ts と 同じ。初回から 受けの 絵が 出る ように） */
  preloadParry: () => void;
  /** 2P の 向きを この 角度（度。+ が 右）だけ 回す（次の ステップの 2P の カメラへ。`duo.aimAt(2, …)` が 向きを 変える ため。毎ステップ 向きは カメラから もどされる） */
  lookBy: (deg: number) => void;
  /** 2P が 出る 所（1P の 横） */
  joinSpot: () => DuoVec3;
  dev: boolean;
  /** COOP-1 4c: 2P が かまど（ZL）・たんす（Y か ZL）を ねらって 開いた。2P の 画面の ページを 開く */
  openFurnace: (x: number, y: number, z: number) => void;
  openTansu: (x: number, y: number, z: number) => void;
  /** COOP-1 4c: 2P の つくる（2P が かまどを こわした とき 中身は こわした 人 = 2P の もちものへ。参加している あいだだけ 呼ぶ） */
  craft2: () => Pick<CraftSystem, 'furnaceBroken' | 'status' | 'recipes'> & { notifyPickup(item: ItemId, count: number): void };
}

/** 参加の あいだ だけ ある 一式 */
interface Live {
  combat: PlayerCombatT;
  life: P2Life;
  dig: DigSystemImpl;
  fx: DigFx;
  tools: ToolSystemImpl;
  blade: Pick<BladeSystem, 'drainEvents' | 'shape' | 'state'>;
  /** 2P の 音（足音・こうげき・刀と 弓。COOP-1 3c） */
  sounds: P2Sounds;
  /** 足音に わたす 体の ようす（使いまわす。毎ステップ new しない） */
  walkBody: GetaPlayer;
  /** 2P の 足もとの ブロック id */
  ground: () => string;
  mate: { readonly position: Vec3; readonly inventory: Inventory };
  yokai: YokaiPartner;
  /** 2P の 道具・そうびの へった／こわれた の 音・お知らせ・かけら（COOP-1 4b） */
  wear: { step(): void };
  /** 忍びの 手甲の 小太刀の 追い打ち（2P の そうびを 見る。1P の 追い打ちとは 別） */
  kodachi: P2Kodachi;
  /** 2P の パリィ（COOP-1 4d-1。1P と 同じ createParry を 2P の 入力・そうび・向きで） */
  parry: P2Parry;
  /** 2P の パリィの 火花・青白い 光（1P の ParryFx と 別の 2 つ目。やめる ときに 片づける） */
  parryFx: ParryFx;
  /** COOP-1 4d-3: がしゃどくろ・少女が 見る 2P の 口（参加ごとに 1 つ） */
  gasha: P2GashaPort;
  /** COOP-1 4d-2: 2P の レジェンダリーの わざ（1P と 同じ 部品の 2 つ目）と その 絵 */
  legend: DuoLegend;
  /** COOP-1 5a: 2P の 畑（m4 の 口・半分の チップとしるし） */
  farm: DuoFarm;
  /** COOP-1 5b: 2P の 出来事を 実績へ（共有） */
  feed: P2Feed;
  /** COOP-1 5c: 2P の にわとり・とりごや（m4 の 口・メニュー・半分の チップ／パネル／わ／一言） */
  animals: DuoAnimals;
  /** COOP-1 5e: 2P の いす・おふろ・たこ・わらじ・ふとんの 待ちを 起こす 入力 */
  gadgets: DuoGadgets;
}

/** 2P の パリィの 火花を 出す 刀の まん中（毎回 同じ 入れものに 書く） */
const sparkAt2: Vec3 = { x: 0, y: 0, z: 0 };

/** 2P の つくれる マークの 答え（毎ステップ 同じ 入れものに 書く） */
const hudShow = { craft: false, medal: 0 };
/** 画面を 開いて いない（何も 消さない） */
const NO_HALVES: readonly Who[] = [];

/** 2P の 手もと（足もと + 1。毎回 同じ 入れものに 書く。1P の WeaponFx.handPos と 同じ 高さ） */
const handScratch: Vec3 = { x: 0, y: 0, z: 0 };
function handAt(p: Vec3): Vec3 {
  handScratch.x = p.x;
  handScratch.y = p.y + 1;
  handScratch.z = p.z;
  return handScratch;
}

export function wireDuoPlay(c: DuoPlayCtx) {
  const { deps, ui, halves } = c;
  const { shared, game, world, controller, w2, seed, toolConfig, digCfg, drops, fxSound, craft, storage, dig: dig1, combat: combat1, weaponFx, kodachiFx, achievements, animals, coopMenu: coopMenu1 } = deps;
  const p2 = shared.p2;
  // 2P の そうびの たいきゅうの 設定と 時計を 本物に（1P の armor と 同じ。COOP-1 4b）
  shared.p2Wear.settings = () => w2;
  shared.p2Wear.tick = () => game.tick;
  const dev = c.dev;
  let live: Live | null = null;
  // COOP-1 4d-3: がしゃどくろの 間欠泉で 落下ダメージを 受けない・わざの 間 入力を 止める（2P の lock と combat に 一度だけ 重ねる。止める 係は 最後に 登録された もの）
  let gashaNoFall = false;
  let gashaBlock: (() => boolean) | null = null;
  const lockPlay = c.lock.playInputEnabled.bind(c.lock);
  c.lock.playInputEnabled = () => lockPlay() && !(gashaBlock?.() ?? false);

  shared.duoMate = () => live?.mate ?? null;
  shared.duoDropMate = () => pickableMate(live?.mate ?? null, live?.life.down ?? false);
  shared.duoYokai = () => live?.yokai ?? null;
  shared.p2LoadReset = () => live?.kodachi.clear(); // セーブを 読んだ とき 前の 世界の 妖怪 id に 追い打ちが 当たらない ように
  shared.p2LevelUp = () => live?.life.fill();
  shared.p2Hp = () => live?.life.hp ?? 0;
  shared.p2Down = () => live?.life.down ?? false;
  shared.p2Gasha = () => live?.gasha ?? null;
  // COOP-1 4d-2: その人の わざ（1P は 今の legend。2P が いなければ who 2 は null）
  shared.legendFor = (who) => pickLegend(who, live !== null, deps.legend, live?.legend.p2.legend ?? null);

  /** 2P の もちもの画面を 開いて よいか（倒れて いる・シャイニング中は だめ。AC105） */
  const mayOpenInv = (): boolean => invMayOpen({ down: live?.life.down ?? false, legendLocked: live?.legend.p2.locked() ?? false });

  function build(): Live {
    const ctl = c.ctl2();
    const feed = createP2Feed(achievements); // COOP-1 5b: 2P の 出来事を 実績へ（実績は 2 人で 共有）
    let y2: ReturnType<typeof bindWho> | null = null;
    const yokai2 = () => (y2 ??= bindWho(shared.yokaiManager!, 2));
    const tools = new ToolSystemImpl({ inventory: p2.inventory, world, player: () => ctl.state, yokai: yokai2, base: { dig: digCfg, combat: createCombatConfig() }, config: toolConfig, settings: w2 });
    const weaponDamage = createWeaponDamage({ settings: w2, base: toolConfig.weaponDamage, held: () => p2.inventory.held(), armor: p2.armor });
    const blade = createBladeSystem({
      world,
      yokai: yokai2,
      settings: w2,
      // 刀の 強さは 1P と 同じ 部品（侍の 手甲は 2P の そうび）
      weaponDamage,
      onHit: () => {
        p2.inventory.wearHeld(w2.toolWear.blade.hit);
      },
      lunge: (dx, dz) => ctl.lunge(dx, dz),
      tick: () => game.tick,
    });
    // COOP-1 4d-2: 2P の わざ（雷・真空波・らせん・シャイニング）。1P と 同じ 部品を 2P の 入力・そうび・カメラで
    const legend = createDuoLegend({
      world,
      yokai: () => shared.yokaiManager!,
      w2,
      seed,
      tick: () => game.tick,
      scene: game.scene as THREE.Scene,
      renderer: game.renderer,
      camera: c.camera2(),
      p2,
      ctl,
      blade,
      sound: fxSound,
      camFx: shared.duoCamFx(2),
      impact: shared.impactFor(2),
      reducedMotion: () => deps.reducedMotionMq?.matches ?? false,
      yokaiList: () => shared.yokaiManager!.list(),
    });
    // 2P の 体力の 持ち主（1P と 同じ 道。やられた 画面・音は 1P に つながない）
    const combat = new PlayerCombatImpl({
      config: { ...createCombatConfig(), respawnDelayTicks: DUO_TUNING.p2ReturnSteps },
      tool: tools,
      world,
      player: { get: () => ctl.state, set: (v) => ctl.set(v) },
      inventory: p2.inventory,
      armor: p2.armor, // 2P の そうび（ふせぐ・こわれる・羽織・袋。1P と 同じ 部品）
      yokai: yokai2,
      spawn: () => ({ ...c.joinSpot(), yawDeg: controller.state.yawDeg, pitchDeg: 0 }),
      drops,
      tickDrops: false,
      settings: w2,
      rng: createRng(seed ^ 0x2b2b),
      // シャイニング中は 受ける ダメージ 1/3・落下ダメージなし（1P と 同じ 部品の 口）。がしゃどくろの 間欠泉も 落ちない
      takenMul: () => legend.p2.combat.takenMul(),
      noFall: () => gashaNoFall || legend.p2.combat.noFall(),
      requestSave: () => shared.requestSave(),
    });
    // 倒れた 場所(AC44 の 待ちで ずれないように とめる)
    let downPos: Vec3 | null = null;
    const life = new P2Life({
      combat,
      p1Down: () => combat1.dead(),
      onDown: () => {
        downPos = { ...ctl.state.position };
        ani.down(); // COOP-1 5c: だっこ中の 羽を 足もとに おろし、メニューを とじる
      },
      onWait: () => {
        if (downPos) ctl.set({ position: { ...downPos }, velocity: { x: 0, y: 0, z: 0 } });
      },
    });
    // COOP-1 4d-1: 2P の パリィ（1P と 同じ createParry。火花・青白い 光は 2 つ目の ParryFx）
    const reduced = (): boolean => deps.reducedMotionMq?.matches ?? false;
    const parryFx = new ParryFx({ scene: game.scene as THREE.Scene, camera: c.camera2(), basePath: './models/fx/' });
    const parry = createP2Parry({
      settings: w2,
      reducedMotion: reduced,
      armor: p2.armor,
      yawDeg: () => ctl.state.yawDeg,
      onSpark: () => parryFx.spark(bladeMidInto(sparkAt2, ctl.state.position, ctl.state.facingDeg), reduced(), ctl.state.facingDeg),
    });
    const ani = wireDuoAnimals({ deps, position: () => ctl.state.position, dig: () => dig, down: () => life.down, padOn: c.padPresent, playing: () => c.lock.playInputEnabled(), invOpen: c.invOpen, craft2: c.craft2 });
    // COOP-1 5e: 2P の いす・おふろ・たこ・わらじ・ふとんの 待ち（1P と 同じ 部品を 2P の 体・もちもので）
    const gadgets = createDuoGadgets({
      sleep: deps.gadgets.sleep,
      attachSeat: deps.attachSeat2,
      detachSeat: deps.detachSeat2,
      scene: game.scene,
      tick: () => game.tick,
      ctl,
      actions: c.actions,
      combat,
      p2,
      padPresent: c.padPresent,
      panelOpen: () => shared.p2House.panelOpen(),
    });
    const farm = wireDuoFarm({ deps, inventory: p2.inventory, vitals: combat, target: () => dig.target(), playing: () => c.lock.playInputEnabled() });
    const dig = createP2Dig({
      world,
      p2,
      actions: c.actions,
      position: () => ctl.state,
      lock: c.lock,
      eyeHeight: () => ctl.settings.eyeHeight,
      partner: () => controller.state.position,
      // 2P の もちもの画面の 開き口 3 つ(Y・かまど・たんす)は ぜんぶ invMayOpen を 通る（倒れて いる・シャイニング中は 開かない。4d-2）
      onOpenFurnace: (x, y, z) => {
        if (mayOpenInv()) c.openFurnace(x, y, z);
      },
      onOpenTansu: (x, y, z) => {
        if (mayOpenInv()) c.openTansu(x, y, z);
      },
      // COOP-1 5b: 1P と 同じ 口を 2P にも（実績 obtain:*・はらぱんみみず・ZL で 着る・建築中の 家の 守り・宝箱）。守りと くじは 1 つを 2 人で
      onPickup: (item, count) => c.craft2().notifyPickup(item, count),
      armor: p2.armor,
      chestPort: { open: (x, y, z, who) => dig1.chestPort?.open(x, y, z, who) },
      ...(shared.harapanPort ? { harapan: shared.harapanPort } : {}),
      ...(shared.buildPort ? { build: shared.buildPort } : {}),
      gate: combat,
      config: digCfg,
      rng: createRng(20240602),
      m4: {
        yakata: { locked: (x, y, z) => shared.yakataLocked(x, y, z) },
        tools,
        blade,
        w2,
        yokai: yokai2,
        parry: parry.parry, // Shift＋ZR の ふりわけ（routeAttackInput）は 1P と 同じ 道
        legend: legend.p2.legend, // ZR だけ → ため（run＋ZR は パリィ）。ふりわけは 1P と 同じ DigSystemImpl
        // COOP-1 5d: ほんだな（ZL）と 建築士さん（ZL で 話す・ほるで おっとっと）。who 2 で 呼ぶ。いす・おふろは 2P 自身の SeatSystem（5e。wireSeat の seatFor(2)）
        furniture: { use: (kind, x, y, z) => deps.furniture.use(kind, x, y, z, 2) },
        gadgets: { sleep: () => void deps.gadgets.port.sleep(2), kite: gadgets.useKite }, // COOP-1 5e: ふとん（1P と 同じ 1 つ）・たこ（2P の）
        architects: {
          rayHit: (origin, dir, reach) => shared.house?.manager.rayHit(origin, dir, reach) ?? null,
          talk: (id) => shared.house?.talkTo(id, 2) ?? false,
          hit: (id) => shared.house?.hit(id, 2),
        },
        ...farm.m4, // COOP-1 5a: 畑・じょうろ・バケツ・なでる・食べる（2P の もちもの・ハートで）
        ...ani.m4, // COOP-1 5c: にわとり（包み〈who: 2〉）・設定・とりごやの メニュー（2P の 半分）
        // かまどを こわした 中身は こわした 人（2P）の もちものへ（4c）。開く 口は onOpenFurnace に つなぐので ここは 空
        craft: { isFurnace: (x, y, z) => craft.isFurnace(x, y, z), openFurnace: () => {}, furnaceBroken: (x, y, z) => c.craft2().furnaceBroken(x, y, z), fixedDrop: (id) => craft.fixedDrop(id) },
        storage,
        scatterItem: (pos, item, count) => {
          drops.scatter(pos, [{ item, count }]);
        },
        nowTick: () => game.tick,
      },
    });
    const fx = createP2DigFx({ scene: game.scene as THREE.Scene, dig, sound: fxSound, hideBlockFocus: () => dig.aimedYokaiId() !== null, events: feed.tapDig(() => dig.drainEvents()), notice: c.aim.notice2 });
    const mate = {
      get position() {
        return ctl.state.position;
      },
      inventory: p2.inventory,
    };
    // 妖怪から 見た 2P（ダメージの 種類〔火の玉 'ball'〕と 2P の そうびも 伝える）
    const yokai: YokaiPartner = createP2Partner({
      position: () => ctl.state.position,
      targetable: () => c.joined() && !life.down && c.padPresent(),
      life,
      armor: p2.armor,
    });
    const wear = createP2Wear({
      inventory: p2.inventory,
      armor: p2.armor,
      sound: fxSound,
      notice: ui.wearNotice,
      nameOf: (item) => itemType(item)?.name ?? item,
      handPos: () => handAt(ctl.state.position),
      burst: (at, item) => weaponFx.breakShards(at, item),
      onEvents: feed.wear,
    });
    const kodachi = createP2Kodachi({
      armor: p2.armor,
      yokai: shared.yokaiManager!,
      playerPos: () => ctl.state.position,
      sound: fxSound,
      tick: () => game.tick,
      onFire: (info) => {
        if (info.yokaiId !== null) queueKodachiSlash(kodachiFx, c.camera2(), shared.yokaiManager!, ctl.state.position, info.yokaiId);
      },
    });
    const walkBody: GetaPlayer = { running: false, onGround: false, inWater: false, velocity: ctl.state.velocity };
    const ground = () => world.getBlock(Math.floor(ctl.state.position.x), Math.floor(ctl.state.position.y - 0.05), Math.floor(ctl.state.position.z));
    const gasha: P2GashaPort = {
      ctl, life, armor: p2.armor, blade, held: () => p2.inventory.held(), weaponDamage,
      setNoFall: (on) => { gashaNoFall = on; },
      blockInput: (fn) => { gashaBlock = fn; },
      onBigHit: (part) => kodachi.onBigHit(part),
      // 4d-2: 2P の 波・雷・ドームが がしゃどくろに 当たる（AC110）。4d-1: 少女の 弾を 2P の パリィで うける（AC111）
      legend: legend.p2.legend,
      waves: () => legend.p2.waves.list(),
      parry: (h) => parry.hit({ dirDeg: h.dirDeg, by: h.by, yokaiId: null, amount: h.amount }),
      camera: c.camera2(),
      // 4d-0: 2P に 当たった/当てた 止め・ゆれは 2P の 半分の カメラだけ（世界は 止めない）
      hitStop: (n) => { shared.duoCamFx(2).freeze(n); },
      shake: (a) => { if (FX_SETTINGS.fxShake) shared.duoCamFx(2).addTrauma(a); },
      shakeTo: (l) => { const fx = shared.duoCamFx(2), d = l - fx.trauma(); if (d > 0 && FX_SETTINGS.fxShake) fx.addTrauma(d); },
    };
    return { combat, life, dig, fx, tools, blade, sounds: createP2Sounds(fxSound, p2.armor), walkBody, ground, mate, yokai, wear, kodachi, parry, parryFx, gasha, legend, farm, feed, animals: ani, gadgets };
  }

  /** 2P の 足音。1P の step.ts と 同じ 決まり: 遊び画面が 開いて いない・やられて いない・ひるんで いない ときだけ 歩く */
  function stepFoot(l: Live): void {
    const s = c.ctl2().state;
    const walking = c.lock.playInputEnabled() && !l.combat.dead() && !l.combat.flinching();
    const b = l.walkBody;
    b.running = walking && s.running;
    b.onGround = walking && s.onGround;
    b.inWater = s.inWater;
    b.velocity = s.velocity;
    l.sounds.step(b, l.ground);
  }

  /** 2P の パリィ: 妖怪の 更新の 直前に 毎ステップ 1 回（createStep が shared.preYokai で 呼ぶ）。入力 → 体の 止め。参加して いない あいだは 何も しない */
  function preYokai(): void {
    const l = live;
    if (!l) return;
    const tick = game.tick + 1;
    if (l.life.down) l.parry.cancel(tick); // 倒れた: 取り消し（入力が 通らない ので update も 自分で 取り消す）
    const pin = l.dig.parryInput(tick);
    if (pin.run && pin.active && isBladeItem(pin.item)) c.preloadParry();
    l.parry.update(pin);
    // 歩く倍率・ジャンプ止め・向き（1P の step.ts と 同じ 式。刀・弓・ためとの かけ合わせは 2P に それらの 動きの 制限が 入る とき〔4d-2〜〕）
    const pm = l.parry.motion();
    const lm = l.legend.p2.legend.motion(); // 4d-2: ため中の 歩き・わざの 間の 足どめ・シャイニングの うかぶ（1P の step.ts と 同じ かけ合わせ）
    const m = c.ctl2().motion;
    m.speedMul = p2SpeedMul(pm.speedMul, lm.speedMul, w2, p2.inventory.held()?.item ?? null); // 風神剣の 走る 1.2 倍も（1P の step.ts:73 と 同じ）
    m.jumpLocked = pm.jumpLocked || lm.jumpLocked;
    m.noRun = lm.noRun; m.hoverY = lm.hoverY ?? null;
    m.faceDeg = pm.jumpLocked ? c.ctl2().state.yawDeg : (lm.faceDeg ?? null); // パリィの あいだは 今 向いている 方を向く。わざの あいだは わざの 向き
  }
  shared.preYokai = preYokai;
  shared.p2Parry = () => live?.parry ?? null;
  shared.p2FarmHint = () => live?.farm.hint ?? null; // COOP-1 5a: 畑の 合図〔by: 2〕の 行き先
  shared.p2FarmAim = () => live?.farm.aim() ?? null;
  shared.p2Animals = () => live?.animals.port ?? null; // COOP-1 5c: 出来事〔by: 2〕の 配り・こたつの わく・着地点の 丸
  // COOP-1 5e: ふとんの 「2 人」の 数（参加していて 倒れておらず 2P は パッドが ある 人。1 人の ときは 1）と、2P の 待ちを 起こす 入力
  shared.sleepReady = () => (live ? (combat1.dead() ? 0 : 1) + (!live.life.down && c.padPresent() ? 1 : 0) : 1);
  shared.p2SleepWake = () => live?.gadgets.wakeStep();

  /** 2P の パリィの 後始末と 見た目（体の 止め・音・火花・青白い 光）。ctl2.update の あとに 呼ぶ */
  function stepParry(l: Live): void {
    const s = c.ctl2().state;
    // 始めた ステップは すべらず 止まる（1P と 同じ）
    if (l.parry.parry.startedNow() || l.legend.p2.legend.motion().stopNow) s.velocity.x = s.velocity.z = 0; // わざを 始めた ステップも 止まる
    for (const n of l.parry.parry.sounds()) if (isParrySound(n)) playParry(fxSound, n);
    const ps = l.parry.state();
    l.parryFx.step({ visible: ps.glowLeft > 0, level: parryGlowLevel(ps.glowLeft, w2), position: s.position, reduced: deps.reducedMotionMq?.matches ?? false, facingDeg: s.facingDeg });
    l.parryFx.update();
  }

  // COOP-1 5f-1: 2P の 照準まわり（毎ステップ 使いまわす 入れもの）
  const hintIn: DuoHintInput = {
    who: 2, duo: true, hintOn: true, playing: false, crosshairVisible: true, down: false,
    open: { inventory: false, coopMenu: false, book: false }, right: null, left: null,
    ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false }, padIndex: null, lastInput: 'gamepad',
  };
  const aimStep: DuoAimStep2 = { hint: null, crossVisible: false, blade: null, stance: null, bowStage: 0, dt: 0 };
  /** 2P の 半分の ヒント・＋・構え・弓の 丸（1P の step.ts と 同じ 部品の 同じ 答え）。もちもの画面・倒れた・本の あいだは `playInputEnabled` が false で 出ない */
  function stepAim(l: Live, dt: number): void {
    const playing = c.lock.playInputEnabled();
    const tool = l.tools.current();
    fillHintCtx(hintIn.ctx, tool, l.dig.carryProgress(), animals.carrying(2) !== null); // だっこの わ・だっこ中（1P の step.ts と 同じ 形。5f-1 × 5c）
    hintIn.hintOn = deps.hintSettings.actionHint;
    hintIn.playing = playing;
    hintIn.down = l.life.down;
    hintIn.right = l.dig.previewRightClick();
    hintIn.left = l.dig.previewLeftClick();
    const bs = l.blade.state();
    aimStep.hint = actionHintView(hintIn);
    aimStep.crossVisible = playing;
    aimStep.blade = bs;
    aimStep.stance = playing && bs.item !== null ? bs.stance : null;
    aimStep.bowStage = playing ? l.tools.bow().pose().stage : 0;
    aimStep.dt = dt;
    c.aim.step2(aimStep);
  }

  /** 毎ステップ（2P の 体を 動かした あと） */
  function step(dt: number): void {
    const l = live;
    if (!l) return;
    // 小太刀の 追い打ちは 先に 1 ステップ すすめ、このステップの 当たりは あとで 入れる（当てた ステップを 0 に する ため。1P と 同じ 順）
    l.kodachi.step();
    l.dig.update();
    l.gadgets.step(); // COOP-1 5e: 2P の たこ・わらじ
    l.farm.step(); // COOP-1 5a: 2P の 半分の 畑の チップ・しるし
    l.animals.step(); // COOP-1 5c: 2P の ねらい・メニュー・チップ・パネル・わ・一言
    // COOP-1 4d-1: 2P の パリィの 絵・音・火花・青白い 光（1P の step.ts と 同じ 決まり。入力は 妖怪の 更新の 前に preYokai が 入れた）
    stepParry(l);
    l.life.step();
    // 2P の 音（1P と 同じ 音・同じ 大きさ。距離で 小さく しない。COOP-1 3c）。出来事は 毎ステップ 取り出す（たまり続けない ように）
    const combatEvents = l.combat.drainEvents();
    l.sounds.combat(combatEvents);
    l.feed.combat(combatEvents);
    // 2P の ふち・もどったよは 2P の 半分の 中（1P と 同じ lifeUiOf の 答え。倒れた 表示は 今の duo-p2-down。音は l.sounds.combat）
    for (const ev of combatEvents) {
      const a = lifeUiOf(ev);
      if (a !== null) halves.life(a);
    }
    l.kodachi.combat(combatEvents);
    l.combat.takeHookEvents();
    l.sounds.swings(l.tools.drainSwings(), p2.inventory.held()?.item ?? null);
    const arrowEvents = l.tools.drainArrowEvents();
    l.sounds.arrows(arrowEvents);
    l.feed.arrows(arrowEvents);
    const bladeEvents = l.blade.drainEvents();
    l.sounds.blade(bladeEvents);
    l.feed.blade(bladeEvents);
    l.kodachi.blade(bladeEvents);
    l.legend.slash(bladeEvents); // 虹の 刀の 斬撃は 2P 用の 絵へ（1P の 絵には 入れない）
    // 2P の 当たりの 手ごたえ（止め・ゆれ）は 2P の 半分の カメラだけ（COOP-1 4d-0。出す のは wire/duo.ts が この あと flush）
    feedP2Impact(shared.impactFor(2), deps.titleOfYokai, combatEvents, bladeEvents, arrowEvents);
    l.kodachi.drainEvents(); // 追い打ちの 出来事は たまり続けない ように 毎ステップ 取り出す（2P の 分は テストの 窓口に 出さない）
    l.wear.step(); // 2P の 道具・そうびの へった／こわれた（音・お知らせ・かけら）。出来事は 毎ステップ 空に する
    stepFoot(l);
    l.tools.takeHookEvents();
    // 2P の レベルアップは 2P の 半分にだけ 出す（1P の 演出・ログ・実績は 1P の level が 受け持つ。実績は creatures の feedDefeat で 共有）
    let up = false;
    for (const e of p2.levels.drainEvents()) {
      if (e.type === 'levelUp') up = true;
    }
    if (up) fxSound.play('levelUp');
    p2.levels.takeHookEvents();
    l.fx.update(dt);
    ui.updateLife(dt, l.combat.hp(), l.combat.invincibleTicks() > 0, l.life.down);
    ui.updateArmor(p2.armor.snapshot().hudIcons); // ハートの 右の 防具の 絵（1P の step.ts と 同じ）
    ui.stepWear();
    ui.updateLevel(dt, p2.levels.get(), up);
    stepAim(l, dt);
    stepHalves(l, dt);
  }

  /** COOP-1 5f-2: 2P の 半分の 部品を すすめる（世界で 1 つの 物は 1P と 同じ 答え。つくれる マークは 2P の もちもので。メダルの 印は 2P の かたまりに 入れない） */
  function stepHalves(l: Live, dt: number): void {
    const yk = shared.yokaiManager;
    if (!yk) return;
    const open2 = c.invOpen() || l.animals.menuOpen();
    halves.world(yk.announce(), deps.time.phase(), deps.time.dayTick(), deps.timeSettings, deps.time.day() + 1);
    // 2P の 名札の 材料（もちもの画面が 開いて いる あいだは 出さない）
    yk.nameplates(halves.plates2, 2);
    if (open2) halves.plates2.length = 0;
    const show = hudNoticeShow(2, true, anyCraftNow(c.craft2(), p2.inventory), 0, hudShow);
    halves.step(dt, yk.inkDim(2), buffsOfHeld(p2.inventory.held()?.item ?? null, (i) => legendMoveMulOf(w2, i)), deps.reducedMotionMq?.matches ?? false, show.craft, open2 ? halvesCoveredBy(2, true) : NO_HALVES);
  }

  let thunder1: ThunderHook | null = null;
  const thunder1Hook = (): ThunderHook => (thunder1 ??= deps.thunderFx.hook(game));

  const invOf = (who: 1 | 2): Inventory | null => (who === 1 ? deps.inventory : live ? p2.inventory : null);
  const ctlOf = (who: 1 | 2): PlayerController | null => (who === 1 ? controller : live ? c.ctl2() : null);

  const hook: DuoPlayHook = {
    aimAt(who, cell) {
      const ctl = ctlOf(who);
      if (!dev || !ctl) return;
      if (who === 1) {
        // 1P の ねらいの 線は 肩の 点 S から 出る（目から 向けると 右へ ずれて 外れる）ので、S から まとの 中心を 通る 向きに する
        ctl.set(shoulderAimDeg(deps.rig.getInfo().pivot, cell));
        return;
      }
      const p = ctl.state.position;
      const dx = cell.x + 0.5 - p.x;
      const dy = cell.y + 0.5 - (p.y + ctl.settings.eyeHeight);
      const dz = cell.z + 0.5 - p.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const yaw = Math.atan2(dx, -dz) / DEG;
      // 2P の 向き（yaw）は 毎ステップ 2P の カメラから もどされる ので、カメラも 同じ だけ 回す（ctl.set だけだと 次の ステップで 消える）
      if (who === 2) c.lookBy((((yaw - ctl.state.yawDeg + 180) % 360) + 360) % 360 - 180);
      ctl.set({ yawDeg: yaw, pitchDeg: Math.asin(dy / len) / DEG });
    },
    target(who) {
      const t = who === 1 ? dig1.target() : (live?.dig.target() ?? null);
      return t ? { block: { ...t.block }, place: { ...t.place }, id: t.id } : null;
    },
    frame(who) {
      const fx = who === 1 ? shared.fx : live?.fx;
      if (!fx) return { visible: false, color: '' };
      const mat = fx.outline.mesh.material as THREE.MeshBasicMaterial;
      return { visible: fx.outline.mesh.visible, color: `#${mat.color.getHexString()}` };
    },
    give(who, item, count, slot = 0) {
      const inv = invOf(who);
      if (!dev || !inv) return;
      inv.setSlot(slot, { item, count });
      inv.select(slot);
    },
    sample(who) {
      const inv = invOf(who);
      if (!dev || !inv) return;
      inv.clear();
      sampleStacks(ITEM_TYPES, ALL_RECIPES, inv.size).forEach((s, i) => inv.setSlot(i, s));
      inv.select(0);
    },
    // COOP-1 5f-2（§12.0）: その人の ホットバーの 選びを slot（0 はじまり）に する（2P の えらんだ 名前を UI 検査で 出す ため）
    select(who, slot) {
      const inv = invOf(who);
      if (!dev || !inv) return;
      inv.select(slot);
    },
    count: (who, item) => invOf(who)?.count(item) ?? 0,
    armor: (who) => (who === 1 ? deps.armor.snapshot() : live ? p2.armor.snapshot() : null),
    equip(who, head, body, arms = null, legs = null) {
      if (!dev) return;
      if (who === 1) deps.armor.set(head, body, arms, legs);
      else if (live) p2.armor.set(head, body, arms, legs);
    },
    // COOP-1 5f-1（§12.0・AC174）: その人の 半分に 出ている ヒント。1P は 今の `#action-hint` の 中身 ＋ pad。2P が いなければ who 2 は null
    actionHint: (who) => c.aim.hint(who),
    hearts(who) {
      if (who === 1) return { hp: combat1.hp(), maxHp: combat1.maxHp(), down: combat1.dead() };
      return live ? { hp: live.life.hp, maxHp: live.life.maxHp, down: live.life.down } : { hp: 0, maxHp: 0, down: false };
    },
    level: (who) => (who === 1 ? deps.level.get() : live ? p2.levels.get() : null),
    setLevel(who, level, xp = 0) {
      if (!dev) return;
      (who === 1 ? deps.level : p2.levels).set(level, xp);
    },
    addXp(who, amount) {
      if (!dev) return;
      (who === 1 ? deps.level : p2.levels).addXp(amount);
    },
    hurt(who, amount) {
      if (!dev) return;
      if (who === 1) {
        // by なしの debugDamage は playerHit を 出さない ので、1P の ふちは ここで 光らせる（2P の life.damage と 同じ 見え方）
        combat1.debugDamage(amount);
        deps.combatUi.edge.flash();
      } else live?.life.damage(amount, { type: 'yokai' });
    },
    legend: (who) => shared.legendFor(who)?.state() ?? null, // 4d-2（§12.0）: その人の わざ（legend.state() と 同じ 形）。下は 雷の 絵の 窓口
    // COOP-1 5a（§12.0）: その人の 半分の 畑の 合図・しるしの 中身（1P は 今の チップと farm.hud()。2P が いなければ who 2 は null）
    farmHint: (who) => (who === 1 ? deps.farmHint.model.current() : (live?.farm.hintKind() ?? null)),
    farmAim: (who) => {
      if (who === 2) return shared.p2FarmAim();
      const t = dig1.target();
      return t ? deps.farm.aim(t.block.x, t.block.y, t.block.z) : null;
    },
    // COOP-1 5e（§12.0）: その人の すわって いる 物・たこ（1P は 今の seat・kite と 同じ 中身。2P が いなければ who 2 は null）
    seat: (who) => seatInfo(who === 1 ? deps.seat : (live?.gadgets.seat ?? null)),
    kite: (who) => kiteInfo(who === 1 ? deps.gadgets.kite : (live?.gadgets.kite ?? null)),
    thunder: (who) => pickLegend(who, live !== null, thunder1Hook(), live?.legend.thunderHook() ?? null),
    // COOP-1 5c（§12.0）: だっこ・とりごやの メニュー（1P は 今の 物。2P が いなければ who 2 は null）
    carrying: (who) => (who === 1 || live ? animals.carrying(who) : null),
    coopMenu: (who) => (who === 1 ? coopMenu1.model.info() : (live?.animals.menuInfo() ?? null)),
    coopMenuPress(who, button, id) {
      if (!dev) return;
      if (who === 1) coopMenu1.press(button, id);
      else live?.animals.menuPress(button, id);
    },
  };

  return {
    hook,
    step,
    /** 倒れている あいだ true（2P の 入力を ぜんぶ はなす） */
    down: (): boolean => live?.life.down ?? false,
    legendLocked: (): boolean => live?.legend.p2.locked() ?? false, // 4d-2: シャイニング中 true（2P の もちもの画面・持ちかえの 止め）
    mayOpenInv, // 2P が もちもの画面を 開いて よいか（Y の 開き口。AC105）
    stepLegend: (): void => live?.legend.step(), // 2P の わざ: 毎ステップ 1 回。パリィの よせの あとに 呼ぶ（わざが 勝つ）
    stepLegendFx: (): void => live?.legend.stepFx(), // 2P の わざの 絵と うすい 光の もと: 2P の カメラを 決めた あとに 1 回
    flashSrc: (): FlashSrc | null => live?.legend.flashSrc() ?? null, // うすい 光の もと（2P が いなければ null）
    renderInPane: (r: THREE.WebGLRenderer, cam: THREE.Camera): void => live?.legend.renderInPane(r, cam), // 2P の 雷の 板を 区画に 重ねる（afterPane）
    /** COOP-1 5e: 2P の いす・おふろ。体を 動かす 前後に 1 回ずつ（ctl2.update の まわり）。目の さがりは 2P の カメラへ */
    seatBefore: (): void => live?.gadgets.seatBefore(),
    seatAfter: (): void => live?.gadgets.seatAfter(),
    eyeDrop2: (): number => live?.gadgets.eyeDrop() ?? 0,
    /** 2P が たんすを ねらって Y（1P の E と 同じ）。開いたら true（かまどを ねらった Y は false＝「もちもの」の ページ） */
    /** 2P の とりごやの メニューが 開いている（2P の 遊びの 入力を 止め、パッドを メニューの わりあてに する） */
    coopMenuOpen: (): boolean => live?.animals.menuOpen() ?? false,
    /** 2P の パッド（十字・A・B）を とりごやの メニューへ（ひらいて いる ときだけ きく） */
    coopPad: (a: Action): void => live?.animals.pad(a),
    /** 2P が やめる 直前（保存の 前）: だっこ・むし・おにくの かたづけ（COOP-1 5c） */
    beforeLeave: (): void => live?.animals.leave(),
    tryOpenTansu: (): boolean => (mayOpenInv() ? (live?.dig.tryOpenAimedStorage() ?? false) : false),
    onJoin(): void {
      live?.legend.dispose();
      live?.fx.dispose();
      live?.parryFx.dispose();
      live?.farm.dispose();
      live?.animals.dispose();
      live?.gadgets.dispose();
      live = build();
    },
    onLeave(): void {
      if (live) {
        // 2P の パリィの 体の 止めを もどす（2P の 体は 次の 参加でも 使いまわす）
        Object.assign(c.ctl2().motion, { speedMul: 1, jumpLocked: false, faceDeg: null, noRun: false, hoverY: null });
        live.legend.dispose(); // ためている・シャイニング中でも すぐ 消す（カメラの 口も 手ばなす）
        live.parry.cancel(game.tick);
        live.parryFx.dispose();
      }
      live?.fx.dispose();
      live?.farm.dispose();
      live?.animals.dispose();
      live?.gadgets.dispose(); // COOP-1 5e: 待ちを 消し・たこを おろし・立たせる
      live = null;
      deps.gadgets.sleep.settle(); // 待って いた 1P は この ステップから 1 人の ときと 同じ ねむり（sleepReady が 1 に なった）
      gashaNoFall = false;
    },
  };
}
