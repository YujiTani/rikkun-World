import type {
  BlockId,
  CoopPlacePreview,
  ThrowAim,
  DigBlockedReason,
  DigEvent,
  DigState,
  DigSystem,
  Inventory,
  LockStatus,
  ItemId,
  PlayerState,
  ToolInfo,
  TargetInfo,
  VoxelWorld,
  Vec3,
} from '../contracts';
import type { Action, ActionState } from '../input/actions';
import { cropKindOfBlock } from '../contracts';
import type { FlattenPlan } from '../world/flatten';
import { createDigConfig, type DigConfig } from './config';
import { createRng, type Rng } from '../world/gen/random';
import type { PunchGate } from '../combat/PlayerCombat';
import type { ParryInput } from '../combat/parry';
import { isBladeItem } from '../tools/blade/BladeSystem';
import { IRON_HARVEST_LEVEL, blockFamily, effectivePower, toolFamily, toolRank } from './toolFamily';
import { ToolHintModel, bestHotbarSlot, type ToolHintState } from './toolHint';
import { previewRightClick, type LeftClickKind, type RightClickPreview } from './rightClick';
import { DigAim } from './digAim';
import { DigAnimals } from './digAnimals';
import { DigAttack } from './digAttack';
import { BlockBreaker } from './digBreak';
import { DigChalk } from './digChalk';
import { COOP_BLOCKS, center, sameBlock, type DigCore } from './digCore';
import { DigFarm } from './digFarm';
import { DigInput } from './digInput';
import { BlockPlacer } from './digPlace';
import type { AttackLast, DigM4Deps } from './digPorts';

// 外から読まれる 型は ここから 出しなおす（名前と 形は 変えない）
export type { AttackLast, DigM4Deps } from './digPorts';

/** 出来事の列が読まれずにたまりすぎないように */
const MAX_QUEUE = 256;

/** 空振りを押しっぱなしで振りなおす間かく（歩数。M3 のパンチと同じ 0.5 秒） */
const WHIFF_REPEAT_TICKS = 30;

/** ほっているあいだ、腕を振りなおす間かく（人形用） */
const DIG_SWING_REPEAT = 20;

const HOTBAR_ACTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `hotbar${n}` as Action);
const A_NEXT = 'hotbarNext' as Action;
const A_PREV = 'hotbarPrev' as Action;

const NO_DIG_EVENTS: DigEvent[] = [];

/** ほる時間（ステップ。すでの強さで数える）。かたさ × 60 ÷ 強さ、切り上げ。ほれないなら理由 */
export function digSteps(
  cfg: DigConfig,
  id: BlockId,
  level: number = cfg.handLevel,
): { steps: number } | { blocked: DigBlockedReason } {
  const h = cfg.hardness[id];
  if (h === null || h === undefined) return { blocked: 'unbreakable' };
  const need = cfg.harvestLevel[id] ?? 0;
  if (need > level) return { blocked: need >= IRON_HARVEST_LEVEL ? 'needIron' : 'needTool' }; // MINE-1B: てつの つるはしが いる ブロックは べつの しらせ
  return { steps: Math.max(1, Math.ceil((h * 60) / cfg.handPower - 1e-9)) };
}

/** ITEM-FX-1: ふとん（ねる）・たこ（あげる／もどす）の 右クリック */
const GADGET_KINDS: ReadonlySet<string> = new Set(['sleep', 'kite']);

/** ねらう・ほる・おく（M2 §2.2〜2.4, §4.1, §4.3, §5）。毎ステップ update() を呼ぶ */
export class DigSystemImpl implements DigSystem {
  private tickCount = 0;

  // ほった量の記憶（最後の 1 こだけ）
  private memBlock: Vec3 | null = null;
  private memId: BlockId | null = null;
  /** ほった量（ステップ。小数あり） */
  private mem = 0;
  private active = false;
  /** ひびが MAX で、ひと押しを待っている */
  private ready = false;
  private blockedReason: DigBlockedReason | null = null;
  private cooldown = 0;
  private prevPrimary = false;
  /** secondary を押しつづけている歩数（押していなければ 0） */
  private secondaryTicks = 0;
  /** HOUSE-1A: 今の 右クリックの 押しは 建築士さんに 話しかけた（はなす まで 置く・耕す などは しない） */
  private talkLatch = false;

  /** 空振りの合計回数 */
  private whiffs = 0;
  /** primary を押しつづけている歩数（空振り用。押していなければ -1） */
  private whiffHold = -1;
  private prevSecondary = false;
  private digSwingTimer = 0;

  /** 押した瞬間に 素手だったか（たねを使い切ったあと 押しっぱなしで 素手たがやしを はじめない） */
  private pressStartedEmpty = false;
  /** BAL-D: あう道具の ヒント（§4.6） */
  private readonly toolHintModel = new ToolHintModel();

  private drainQueue: DigEvent[] = [];
  private hookQueue: DigEvent[] = [];

  /**
   * ねらいの線の出どころ（CHAR-1 §4.5）。つなぎ込みが `aimPivot` を入れる。
   * なければ 今の 目（足もと + eyeHeight）。
   */
  aimOrigin?: (player: PlayerState, out: Vec3) => Vec3;

  /**
   * 届く距離のはかり始め（CHAR-1 第 5.2 版 §4.5。つなぎ込みが P = `aimPivot` を入れる）。
   * なければ 出どころ（aimOrigin／目）と同じ。あるときは、線を出どころから 遠くまでのばし、
   * 最初に当たったブロックの点が この点から reach 以内のときだけ ねらう。
   */
  reachOrigin?: (player: PlayerState, out: Vec3) => Vec3;

  /** WEAPON-3: 体の点 B（P の 真上・肩の高さ）。つなぎ込みが `aimOrigin` の 高さで 入れる。なければ 足もと + 1.40 */
  bodyOrigin?: (player: PlayerState, out: Vec3) => Vec3;

  // 係（こわす・置く・畑・にわとり・攻撃の向き・左クリックのふりわけ・ねらい）
  private readonly aim: DigAim;
  private readonly breaker: BlockBreaker;
  private readonly placer: BlockPlacer;
  private readonly chalk: DigChalk;
  private readonly animals: DigAnimals;
  private readonly farm: DigFarm;
  private readonly attack: DigAttack;
  private readonly input: DigInput;

  constructor(
    world: VoxelWorld,
    private readonly player: () => PlayerState,
    private readonly actions: ActionState,
    private readonly lock: LockStatus,
    private readonly inventory: Inventory,
    private readonly eyeHeight: () => number,
    readonly config: DigConfig = createDigConfig(),
    /** ドロップ数の乱数（シード付き。テストで再現できる） */
    rng: Rng = createRng(20240601),
    /** 戦い（M3）。線上で妖怪がブロックより手前ならパンチにする。なければ M2 のとおり */
    private readonly gate: PunchGate | null = null,
    private readonly m4: DigM4Deps = {},
  ) {
    const core: DigCore = {
      world,
      inventory,
      m4: this.m4,
      config: this.config,
      lock,
      gate,
      player: () => this.player(),
      tgt: () => this.aim.tgt,
      bodyTgt: () => this.aim.bodyTgt,
      tick: () => this.tickCount,
      emit: (e) => this.emit(e),
    };
    const origin = (p: PlayerState, out: Vec3): Vec3 => this.aim.origin(p, out);
    this.aim = new DigAim({
      world,
      config: this.config,
      inventory,
      m4: this.m4,
      eyeHeight: () => this.eyeHeight(),
      aimOrigin: () => this.aimOrigin,
      reachOrigin: () => this.reachOrigin,
    });
    this.breaker = new BlockBreaker(core, rng);
    this.placer = new BlockPlacer(core);
    this.chalk = new DigChalk(core);
    this.animals = new DigAnimals({
      ...core,
      animalHit: () => this.aim.animalHit,
      origin,
      previewRightClick: (repeat) => this.previewRightClick(repeat),
    });
    this.farm = new DigFarm({
      ...core,
      dir: this.aim.dir,
      originScratch: this.aim.originScratch,
      origin,
      hasReachOrigin: () => !!this.reachOrigin,
      justPressed: () => this.justPressed(),
    });
    this.attack = new DigAttack({
      ...core,
      actions,
      bodyOrigin: () => this.bodyOrigin,
      aimBlock: (p, o, d) => this.aim.aimBlock(p, o, d),
      origin,
      dir: this.aim.dir,
    });
    this.input = new DigInput({ ...core, actions, isCarrying: () => this.animals.isCarrying() }, this.attack);
  }

  target(): TargetInfo | null {
    return this.aim.tgt;
  }

  state(): DigState {
    let progress = 0;
    let crack = 0;
    if (this.memBlock && this.mem > 0) {
      const r = digSteps(this.config, this.memId!, this.m4.tools?.current().level);
      if ('steps' in r) {
        const n = r.steps;
        progress = Math.min(1, this.mem / n);
        const cs = this.config.crackStages;
        crack = this.ready ? cs : Math.min(cs, 1 + Math.floor((cs * this.mem) / n));
      }
    }
    return {
      active: this.active,
      block: this.memBlock && this.mem > 0 ? { ...this.memBlock } : null,
      progress,
      crackStage: crack,
      ready: this.ready,
      blockedReason: this.blockedReason,
    };
  }

  whiffCount(): number {
    return this.whiffs;
  }

  drainEvents(): DigEvent[] {
    // 毎ステップ呼ばれる。何も無いときは同じ空配列を返す（ごみを作らない）
    if (this.drainQueue.length === 0) return NO_DIG_EVENTS;
    const out = this.drainQueue;
    this.drainQueue = [];
    return out;
  }

  peekEvents(): DigEvent[] {
    return this.hookQueue.slice();
  }

  /** テストの窓口用: 読んで空にする（画面側の列には影響しない） */
  takeHookEvents(): DigEvent[] {
    const out = this.hookQueue;
    this.hookQueue = [];
    return out;
  }

  update(): void {
    this.attack.begin();
    try {
      this.updateInner();
    } finally {
      this.attack.end();
    }
  }

  /**
   * WEAPON-5: パリィの この ステップの 入力（`main.ts` が 妖怪の 更新の 前に `parry.update` へ わたす）。
   * 刀が わざ・かまえ替えの さいごなら 先行入力に して、刀の 先行入力は すてる（あとに 押した 方が 勝つ）。
   */
  parryInput(tick: number): ParryInput {
    const enabled = this.lock.playInputEnabled() && !this.gate?.blocksInput();
    const blade = this.m4.blade;
    const pressed = enabled && this.actions.wasPressed('primary');
    const held = enabled && (this.actions.isHeld('primary') || pressed);
    const item = this.inventory.held()?.item ?? null;
    const run = this.actions.isHeld('run');
    // WEAPON-6: つなぎの窓で パリィを 押した ステップは 刀は まだ 続く（始まるのは 次の ステップか C の おそい方）
    let nb = blade?.busyNext?.(enabled && run && pressed && isBladeItem(item)) ?? { busy: false, accepts: false };
    // WEAPON-7: ため中・ためわざ中も 「刀が いそがしい」(さいご 8F は 先行入力)
    const lnb = this.m4.legend?.busyNext();
    if (lnb && lnb.busy) nb = lnb;
    if (enabled && run && pressed && isBladeItem(item) && nb.busy && nb.accepts) {
      blade?.dropBuffer?.();
      this.m4.legend?.dropBuffer();
    }
    return { tick, item, run, pressed, held, active: enabled, bladeBusy: nb.busy, bladeAccepts: nb.accepts };
  }

  private updateInner(): void {
    const enabled = this.lock.playInputEnabled() && !this.gate?.blocksInput();

    // ホットバー
    // もちもの画面を開いているときも 1〜9 でえらべる（遊びの入力は止まっていても、画面は見えている）
    if (!this.lock.overlayVisible() && !this.gate?.blocksInput()) {
      for (let i = 0; i < 9; i++) if (this.actions.wasPressed(HOTBAR_ACTIONS[i])) this.inventory.select(i);
    }
    if (enabled) {
      if (this.actions.wasPressed(A_NEXT)) this.inventory.selectNext(1);
      if (this.actions.wasPressed(A_PREV)) this.inventory.selectNext(-1);
    }

    // ねらい（ステップごとに決め直す）
    const p = this.player();
    this.chalk.step(p.position.x, p.position.z); // MINE-1B: チョークの「来た ほう」の 足あと
    this.aim.update(p, enabled);
    this.animals.tickNetLock();
    // 左クリックのふりわけ（パリィ・刀のわざ・ため・弓・パンチ）
    this.input.step(p, this.aim.originScratch, this.aim.dir, enabled);
    const primary = this.input.primary;
    const secondary = this.input.secondary;
    // HOUSE-1A: 建築士さんを たたいた（左クリックを 押した ステップ）。体力は ない。よろけるだけ
    if (enabled && this.aim.architectHit && this.actions.wasPressed('primary')) this.m4.architects?.hit?.(this.aim.architectHit.id);
    this.updateWhiff(primary, secondary);
    this.toolHintModel.tick(this.inventory.selected());
    this.updateDig(primary);
    if (!this.active) this.toolHintModel.idle();
    this.prevPrimary = primary;
    this.prevSecondary = secondary;
    this.updatePlace(secondary);
    this.tickCount++;
  }

  /** 何もねらっていない（ブロックも妖怪もない）ときのクリックで腕を振る。押した瞬間と、押しっぱなしの 0.5 秒ごと */
  private updateWhiff(primary: boolean, secondary: boolean): void {
    if (!primary) this.whiffHold = -1;
    else if (!this.input.punching && (!this.aim.tgt || this.input.yokaiBlocks || this.aim.architectHit !== null)) {
      const every = this.m4.tools?.current().ticks ?? WHIFF_REPEAT_TICKS;
      if (this.whiffHold < 0 || this.whiffHold >= every) {
        this.whiffs++;
        this.m4.tools?.swingWhiff();
        this.whiffHold = 0;
      }
      this.whiffHold++;
    } else this.whiffHold = this.whiffHold < 0 ? 0 : this.whiffHold + 1;
    if (secondary && !this.aim.tgt && (!this.prevSecondary || this.actions.wasPressed('secondary'))) {
      this.whiffs++;
      this.m4.tools?.pushSwing('whiff');
    }
  }

  private updateDig(primary: boolean): void {
    const cfg = this.config;
    this.active = false;
    this.blockedReason = null;

    // HOUSE-1A: 建築士さんを ねらって いる 間は 後ろの ブロックを ほらない（左クリックを 押しつづけても。ほりかけの ひびは もどる）
    if (this.input.punching || this.input.yokaiBlocks || (primary && this.aim.architectHit !== null)) {
      this.decay();
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    const t = this.aim.tgt;
    if (!primary) this.farm.releaseUnripe();
    if (this.aim.bodyTgt && this.aim.bodyPlaced === null) { this.decay(); return; } // 体の 本体は こわせない（ブロックを 置く ためだけに ねらって いる）
    if (primary && t) {
      const h = this.farm.tryHarvest(t);
      if (h !== 'none') {
        if (h === 'unripe') this.decay();
        else if (h === 'done') {
          this.clearMem();
          this.cooldown = this.config.digCooldown;
        }
        return;
      }
    }
    // LIVE-2 §2.3: 中 に 子 が いる 小屋 は こわせない。ほる 段 を 進めず（ひび 0）、押した ステップ に しらせ（A が 合図・音・出来事 を 出す）
    if (primary && t && COOP_BLOCKS.has(t.id) && this.animals.coopLocked(t, this.justPressed())) {
      this.clearMem();
      this.active = false;
      return;
    }
    if (primary && t) {
      const tool = this.m4.tools?.current();
      const r = digSteps(cfg, t.id, tool?.level);
      if ('blocked' in r) {
        this.blockedReason = r.blocked;
        if (this.justPressed()) {
          this.emit({ type: 'blocked', tick: this.tickCount, block: { ...t.block }, id: t.id, reason: r.blocked });
        }
        this.decay();
        return;
      }
      // 別のブロックをほり始めたら前の分は捨てる
      if (!this.memBlock || !sameBlock(this.memBlock, t.block) || this.memId !== t.id) {
        this.memBlock = { ...t.block };
        this.memId = t.id;
        this.mem = 0;
        this.ready = false;
      }
      this.active = true;
      if (this.justPressed() || ++this.digSwingTimer >= DIG_SWING_REPEAT) {
        this.digSwingTimer = 0;
        this.m4.tools?.pushSwing('dig');
      }
      if (this.ready) {
        // MAX で止まっている: 押し直した瞬間だけこわれる（押しっぱなしでは待つ）
        if (this.justPressed()) this.breakBlock(t);
        return;
      }
      // 強さ ÷ すでの強さ だけ進む（すでの何ステップ分で数える。持ちかえてもそのまま続く）。
      // あわない道具は 強さが 半分（BAL-D §2.8）
      this.mem += this.stepPower(tool, t.id) / cfg.handPower;
      if (this.mem >= r.steps - 1e-9) {
        this.mem = r.steps;
        this.ready = true;
        this.emit({ type: 'ready', tick: this.tickCount, block: { ...t.block }, id: t.id });
      }
      this.updateToolHint(tool, t);
      return;
    }
    this.decay();
  }

  /** 1 ステップに 進む 強さ（あわない道具は 半分。道具が つながっていなければ すでの強さ） */
  private stepPower(tool: ToolInfo | undefined, id: BlockId): number {
    if (!tool) return this.config.handPower;
    return effectivePower(tool.item, tool.power, id, this.config.handPower);
  }

  /** あう道具の ヒント（BALANCE.md §4.6）。あわない道具で ほっている 1 ステップごとに 数える */
  private updateToolHint(tool: ToolInfo | undefined, t: TargetInfo): void {
    const bf = blockFamily(t.id);
    if (bf === null || toolFamily(tool?.item ?? null) === bf) {
      this.toolHintModel.idle();
      return;
    }
    const slots = this.inventory.slots();
    const items: Array<ItemId | undefined> = [];
    for (let i = 0; i < 9; i++) items.push(slots[i]?.item);
    const slot = bestHotbarSlot(items, (it) => it !== undefined && toolFamily(it) === bf, toolRank);
    this.toolHintModel.digTick(`${t.block.x},${t.block.y},${t.block.z}`, slot, this.inventory.selected(), this.ready);
  }

  /** あう道具の ヒント（光らせるマス）。出ていなければ null */
  toolHint(): ToolHintState | null {
    return this.toolHintModel.current();
  }

  /** はなしている間、ほった量が少しずつもどる（digDecayRate） */
  private decay(): void {
    if (!this.memBlock) return;
    // MAX になったら減らない（こわれるか、別のブロックをほり始めるまで MAX のまま）
    if (this.ready) return;
    const tool = this.m4.tools?.current();
    this.mem -= this.config.digDecayRate * (this.memId ? this.stepPower(tool, this.memId) : 1) / this.config.handPower;
    this.ready = false;
    if (this.mem <= 1e-9) this.clearMem();
  }

  /** primary を押した瞬間か（同じステップのうちに はなして押し直したときも含む） */
  private justPressed(): boolean {
    return !this.prevPrimary || this.actions.wasPressed('primary');
  }

  private clearMem(): void {
    this.memBlock = null;
    this.memId = null;
    this.mem = 0;
    this.ready = false;
  }

  /** ひびが MAX の ブロックを こわす（世界の書きかえ・ドロップは BlockBreaker）。こわしたあとの しめくくりは ここ */
  private breakBlock(t: TargetInfo): void {
    const end = this.breaker.breakBlock(t, this.aim.bodyGlass);
    if (end === 'done') this.toolHintModel.forget(`${t.block.x},${t.block.y},${t.block.z}`);
    this.clearMem();
    this.active = false;
    if (end !== 'abort') this.cooldown = this.config.digCooldown;
  }

  private updatePlace(secondary: boolean): void {
    if (!secondary) {
      this.animals.releaseRight(this.secondaryTicks);
      this.secondaryTicks = 0;
      this.talkLatch = false;
      return;
    }
    if (this.actions.wasPressed('secondary')) this.secondaryTicks = 0; // はなして すぐ押しなおした分も 新しい 1 回
    const every = this.config.placeRepeatTicks;
    const first = this.secondaryTicks === 0;
    const due = this.secondaryTicks % every === 0;
    const pourDue = this.secondaryTicks % Math.max(1, this.m4.farm?.settings().farmPourRepeatTicks ?? every) === 0;
    if (first) {
      this.pressStartedEmpty = this.inventory.held() === null;
      this.animals.beginPress();
      // HOUSE-1A: 建築士さんを ねらって いたら 話しかける（この 押しは それだけ。だっこ中は にわとりが さき）
      this.talkLatch = this.aim.architectHit !== null && !this.animals.isCarrying();
      if (this.talkLatch) this.m4.architects?.talk(this.aim.architectHit!.id);
    }
    this.secondaryTicks++;
    if (this.talkLatch) return;
    if (this.aim.bodyTgt) {
      // 体の 上: 置く だけ（ワールドの 耕す・まく・開く などは しない）
      if (due && this.placer.spot()) this.placer.tryPlace();
      return;
    }
    // 00・0・0b・8b（LIVE-1 版 3.2 §2.3）。押した ステップ で きまり、押しつづけ の くりかえし では しない
    if (first) this.animals.rightFirst();
    if (this.animals.step(this.secondaryTicks)) return;
    // たんす > かまど > 防具 > 置く（たんす・かまど・防具は押した瞬間だけ）。ヒントと同じ previewRightClick で決める
    const pv = this.previewRightClick(!first);
    if (!pv) {
      // LIVE-2.1: こたつ も 置けない 所 では 合図 `coopNoRoom`（`ここ には おけない よ`）。押した ステップ だけ
      if (first && this.aim.tgt && this.inventory.held()?.item === 'nukunuku') this.animals.hint('coopNoRoom');
      return;
    }
    if (pv.kind === 'place') {
      if (due) this.placer.tryPlace();
      return;
    }
    const t = this.aim.tgt;
    if (pv.kind === 'till') {
      if (due && t && (first || this.inventory.held() !== null || this.pressStartedEmpty)) this.farm.doTill(t);
      return;
    }
    if (pv.kind === 'plant') {
      if (due && t) this.farm.doPlant(t, pv.item);
      return;
    }
    if (pv.kind === 'ripen') {
      if (due) this.farm.doRipen(); // MINE-1B: いしばい。みのる 前の 作物 1 つに 1 こ（みのった あとは この 種類に ならない）
      return;
    }
    if (pv.kind === 'chalkDraw') {
      if (due && t) this.chalk.draw(t, first); // MINE-1B: チョーク。同じ マスは 押しつづけても 1 回
      return;
    }
    if (pv.kind === 'pour') {
      if (pourDue && t) this.farm.doPour(t);
      return;
    }
    if (!first) return;
    if (pv.kind === 'bucketFill') this.farm.doBucketFill();
    else if (pv.kind === 'bucketPlace') this.farm.doBucketPlace();
    else if (pv.kind === 'bucketHint') this.m4.farm?.noteHint('bucket', this.farm.playerChest());
    else if (pv.kind === 'bucketNo' && t) this.m4.bucket?.no({ x: t.place.x, y: t.place.y, z: t.place.z });
    if (pv.kind === 'kitPut' || pv.kind === 'kitWait' || pv.kind === 'kitNeedEgg' || pv.kind === 'kitMax' || pv.kind === 'kitFull') this.animals.doKit(t);
    else if (pv.kind === 'coopMenu') this.animals.doCoopMenu(t);
    else if (pv.kind === 'coopCollect') this.animals.doCoopCollect(t);
    else if (pv.kind === 'rawMeat') this.animals.hint('rawMeat');
    else if (pv.kind === 'coopNoEgg') this.animals.hint('coopNoEgg');
    else if (pv.kind === 'coopPlace' || pv.kind === 'coopNoRoom' || pv.kind === 'coopMax') this.animals.doCoopPlace(t);
    if (pv.kind === 'fill') this.farm.doFill();
    else if (pv.kind === 'fillHint') this.m4.farm?.noteHint('fill', this.farm.playerChest());
    else if (pv.kind === 'pet' && t) this.farm.doPet(t);
    if (pv.kind === 'storage' && t) this.m4.storage?.open(t.block.x, t.block.y, t.block.z);
    else if (pv.kind === 'furnace' && t) this.m4.craft?.openFurnace(t.block.x, t.block.y, t.block.z);
    else if ((pv.kind === 'doorOpen' || pv.kind === 'doorClose') && t) this.placer.toggleDoor(t);
    else if (GADGET_KINDS.has(pv.kind)) this.m4.gadgets?.[pv.kind as 'sleep' | 'kite']();
    else if (pv.kind === 'armor' && pv.item) this.m4.armor?.tryEquip(pv.item);
    else if (pv.kind === 'seedHint' && t) this.m4.farm?.noteHint('till', center(t.block));
    else if (pv.kind === 'eat' && pv.item) this.farm.doEat(pv.item);
  }

  /** 照準 の 下 の わ の たまり 0〜1（なかま を 押しつづけ て いる あいだ だけ。だっこ した ら 0） */
  carryProgress(): number {
    return this.animals.carryProgress(this.secondaryTicks);
  }

  /** LIVE-2.1 §2.2: なげる ときの ねらい（ねらった ブロック の 置く マス・目・前） */
  throwAim(): ThrowAim {
    return this.animals.throwAim();
  }

  /** LIVE-2.1 §3.2: いま ねらって いる こたつ の 本体 の マス（こたつ で なければ null）と、たまご を 持って いる か（天板 の 3 わく を 出す わけ） */
  aimedKit(): { kit: { x: number; y: number; z: number } | null; holdingEgg: boolean } {
    return this.animals.aimedKit();
  }

  /** 置く 前 の すけた 小屋（toriya を 持って 地面 を ねらって いる とき だけ。毎フレーム 描く 側 が 読む） */
  coopGhost(): CoopPlacePreview | null {
    return this.animals.coopGhost();
  }

  /**
   * 今、右クリックしたら何が起きるか（何も起きないなら null）。実行（updatePlace）と同じ判定。
   * 遊べない間（画面が開いている・やられている）は null。
   */
  previewRightClick(repeat = false): RightClickPreview | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    // HOUSE-1A: 建築士さんを ねらって いる とき の 右クリックは 話しかけるだけ（置く・耕す などの 案内は 出さない。実行 updatePlace と 同じ 順）
    if (this.aim.architectHit && !this.animals.isCarrying()) return { kind: 'talk', item: null };
    if (this.aim.bodyTgt) return this.placer.spot() ? { kind: 'place', item: this.inventory.held()!.item } : null;
    const st = this.m4.storage;
    const craft = this.m4.craft;
    const armor = this.m4.armor;
    return previewRightClick({
      target: this.aim.tgt,
      animal: () => this.animals.animalPreview(repeat),
      carrying: () => this.animals.isCarrying(),
      throwKind: () => this.animals.throwKind(),
      kit: () => this.animals.kitState(),
      coop: () => this.animals.coopState(),
      coopSpot: () => this.animals.coopSpot(),
      held: this.inventory.held()?.item ?? null,
      isTansu: (x, y, z) => st?.isTansu(x, y, z) ?? false,
      isFurnace: (x, y, z) => craft?.isFurnace(x, y, z) ?? false,
      canEquip: (item) => armor?.canEquip(item) ?? false,
      water: () => this.farm.waterPreview(repeat),
      bucket: () => this.farm.bucketPreview(repeat),
      petSpot: () => this.farm.petSpot(),
      canPlace: () => this.placer.spot() !== null,
      canChalk: () => this.chalk.canDraw(),
      canRipen: () => this.farm.ripenSpot(),
      canTill: () => this.farm.tillSpot(),
      canPlant: () => this.farm.plantSpot(),
      isSeedHintSpot: () => this.farm.seedHintSpot(),
      isVeg: (item) => this.farm.isVeg(item),
    });
  }

  /** `farm.bucketSpot()`: 今の ねらいで 4e が 水を 置く マス（置けない・水を ねらう ときは null） */
  bucketSpot(): Vec3 | null {
    return this.farm.bucketSpot();
  }

  /** `attack.preview()`（§4.8）: 今 左クリックしたら どうなるか */
  attackPreview(): { use: 'attack' | 'dig' | 'harvest' | 'whiff' | 'none'; rule: 1 | 2 | 3 | 4 | null; dirDeg: number | null; targetId: number | null } {
    return this.attack.attackPreview();
  }

  /** `attack.last()`（§4.8）: さいごに 始めた 攻撃。まだなければ null */
  attackLast(): AttackLast | null {
    return this.attack.attackLast();
  }

  /** 刀の わざ・パンチの 間は 攻撃の向き u。そうでなければ null（キャラの向きを u に 固定する） */
  attackFaceDeg(): number | null {
    return this.attack.attackFaceDeg();
  }

  /** 今、左クリックしたら 何をするか（たたく・ほる・や を うつ）。出すヒントの薄い行用（妖怪が手前なら 'hit'） */
  previewLeftClick(): LeftClickKind | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    const tool = this.m4.tools?.current();
    if (tool?.kind === 'bow') return 'shoot';
    const t = this.aim.tgt;
    if (this.aimedYokaiId() !== null) return 'hit';
    // HOUSE-1A: 建築士さんを ねらって いる 間は 後ろの ブロックを ほらない ので「ほる」は 出さない
    if (this.aim.architectHit) return null;
    if (!t) return null;
    // ＋マークの線で ブロックより手前に 妖怪 → ほらない（#34）ので 案内も 出さない
    if (this.attack.freshDecision()?.use === 'whiff') return null;
    if (this.m4.farm && cropKindOfBlock(t.id)) return 'harvest';
    return 'steps' in digSteps(this.config, t.id, tool?.level) ? 'dig' : null;
  }

  /** LIVE-1: 今 ねらっている にわとり の id（なければ null） */
  animalTarget(): number | null {
    return this.aim.animalHit ? this.aim.animalHit.id : null;
  }

  /** HOUSE-1A: 今 ねらっている 建築士さんの id（なければ null）。ふちどりを 出す */
  aimedArchitect(): string | null {
    return this.aim.architectHit ? this.aim.architectHit.id : null;
  }

  /** ねらっている（手前の・とどく距離内の）妖怪の id。たたく ヒントとふちどりが同じ判定を使う。遊べない間は null */
  aimedYokaiId(): number | null {
    return this.attack.aimedYokaiId();
  }

  /** 置く 前 の すけた こたつ（`nukunuku` を 持って ブロック を ねらって いる とき だけ。置けない 所 は ok=false で 赤）。毎フレーム 描く 側 が 読む。`flat` = たいら に なる 足もと の 板（置ける とき だけ） */
  kotatsuGhost(): { x: number; y: number; z: number; ok: boolean; flat?: FlattenPlan['plate'] } | null {
    return this.placer.kotatsuGhost();
  }

  /** 置いた とき に たいら に した 列（土けむり を 出す 用）。取ったら 空に なる。つなぎ込み が `AnimalFx.flattenDust()` に わたす */
  takeFlattenDust(): Array<{ x: number; y: number; z: number }> {
    return this.placer.takeFlattenDust();
  }

  /**
   * たんす をねらって `toggleInventory`（E）: たんす の形で開く（M6 §2.9 (2)）。
   * ScreenController より先に呼ぶこと（画面は ScreenController が開くので、ここでは触らない）。ねらっていなければ false
   */
  tryOpenAimedStorage(): boolean {
    const st = this.m4.storage;
    const t = this.aim.tgt;
    if (!st || !t || !this.lock.playInputEnabled() || !st.isTansu(t.block.x, t.block.y, t.block.z)) return false;
    return st.open(t.block.x, t.block.y, t.block.z, { screenOpens: true });
  }

  private emit(e: DigEvent): void {
    this.drainQueue.push(e);
    this.hookQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
  }
}
