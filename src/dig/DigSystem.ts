import type {
  ArmorSystem,
  BlockId,
  CraftSystem,
  DigBlockedReason,
  DigEvent,
  DigState,
  DigSystem,
  Inventory,
  LockStatus,
  ItemId,
  PlayerState,
  SwingAnim,
  ToolInfo,
  TargetInfo,
  VoxelWorld,
  Vec3,
  DigFarmPort,
  DigVitalsPort,
  BladeSystem,
  W2Settings,
  FarmEvent,
  PetPort,
  WateringPort,
  BucketPort,
  BucketPreview,
  WaterRay,
  YokaiInfo,
  YokaiWorld,
} from '../contracts';
import type { Action, ActionState } from '../input/actions';
import { cropKindOfBlock, seedKindOfItem, vegKindOfItem } from '../contracts';
import { itemType } from '../inventory/items';
import { BODY_H, BODY_W, FARM_BREAK_DROP, NO_DROP_BLOCKS, createDigConfig, type DigConfig } from './config';
import { createRng, randInt, type Rng } from '../world/gen/random';
import type { PunchGate } from '../combat/PlayerCombat';
import { centerOfYokai, decideAttack, type AttackDecision, type AttackHold } from '../combat/attackFacing';
import { cellInWall } from '../world/wall';
import { lookDirection, raycastBlocks } from './raycast';
import { isBladeItem } from '../tools/blade/BladeSystem';
import { routeAttackInput, type ParryInput, type Parry } from '../combat/parry';
import { blockFamily, effectivePower, toolFamily, toolRank } from './toolFamily';
import { ToolHintModel, bestHotbarSlot, type ToolHintState } from './toolHint';
import { computeWaterRay, createWaterRay, previewRightClick, type LeftClickKind, type RightClickPreview } from './rightClick';

/** 出来事の列が読まれずにたまりすぎないように */
const MAX_QUEUE = 256;

/** 空振りを押しっぱなしで振りなおす間かく（歩数。M3 のパンチと同じ 0.5 秒） */
const WHIFF_REPEAT_TICKS = 30;

/** ほっているあいだ、腕を振りなおす間かく（人形用） */
const DIG_SWING_REPEAT = 20;

const HOTBAR_ACTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `hotbar${n}` as Action);
const A_NEXT = 'hotbarNext' as Action;
const A_PREV = 'hotbarPrev' as Action;

/** DigSystem が使う道具・武器の窓口（M4。`ToolSystemImpl` が合う） */
export interface DigToolPort {
  current(): ToolInfo;
  /** 毎ステップ。ゆみの引きと、飛んでいる や を進める */
  step(primary: boolean, eye: Vec3, dir: Vec3): void;
  pushSwing(anim: SwingAnim): void;
  /** 何もない所を振った（武器なら武器の振り） */
  swingWhiff(): void;
  /** WEAPON-3: 今の 持ち物の パンチの 届く距離（なければ 3.5） */
  punchParams?(): { damage: number; reach: number; ticks: number };
}

/** M4 の つなぎ目（どれもなくてよい。なければ M2 のとおり） */
export interface DigM4Deps {
  tools?: DigToolPort;
  craft?: Pick<CraftSystem, 'isFurnace' | 'openFurnace' | 'furnaceBroken' | 'fixedDrop'>;
  armor?: Pick<ArmorSystem, 'tryEquip'> & {
    /** 着られるアイテムか（右クリックのヒントと実行が同じ判定を使う） */
    canEquip(item: ItemId): boolean;
  };
  /** ほって持ち物に入った（拾ったログ用。A の窓口につなぐ） */
  onPickup?: (item: ItemId, count: number) => void;
  /** 支えをなくした たいまつ を地面に落とす（なければ 持ち物へ直接入れる） */
  scatterItem?: (pos: Vec3, item: ItemId, count: number) => void;
  /** M6: たんす（`StorageSystem` が合う） */
  storage?: DigStoragePort;
  /** M7: 農業（`FarmSystem` が合う。なければ M6 のとおり） */
  farm?: DigFarmPort;
  /** M7: 体力を聞く・もどす（`PlayerCombat` が合う） */
  vitals?: DigVitalsPort;
  /** M7-2: じょうろ（`WateringPort`。A）。4a くむ・4b まく・4c からっぽ の 判定と 実行 */
  water?: WateringPort;
  /** BUCKET-1: バケツ（`BucketPort`。`farm/bucket.ts`）。4d〜4g の 判定と 実行 */
  bucket?: BucketPort;
  /** M7-2: なでる・ごきげん（`PetPort`。C の `farm/pet.ts`） */
  pet?: PetPort;
  /** M7-2: 農業 の 出来事 を 足す（A の `emit`。`pet` の 出来事 用）。なければ 出さない */
  emitFarm?: (e: FarmEvent) => void;
  /** M7-2: 出来事 の `tick`（なければ この 係 の 歩数） */
  nowTick?: () => number;
  /** WEAPON-2: 刀（ひだりクリックの ふりわけ §2.1-6 で わざを 渡す）。なければ 刀も ほるだけ */
  blade?: Pick<BladeSystem, 'update' | 'state' | 'dropBuffer' | 'busyNext' | 'nextStart' | 'yieldToParry'>;
  /** WEAPON-5: パリィ（刀の Shift＋クリック）。なければ 今のまま */
  parry?: Pick<Parry, 'state' | 'inWindow' | 'dropBuffer'>;
  /** WEAPON-2: たいきゅうの へる量（ほる・たがやす）。なければ へらさない */
  w2?: W2Settings;
  /** WEAPON-3: 妖怪の 世界（一覧を 向きの決まりに わたす）。`blade`・`w2` と そろっていれば 近接の 攻撃は 向いている方へ */
  yokai?: () => YokaiWorld;
}

/** WEAPON-3: さいごに 始めた 攻撃（`attack.last()`） */
export interface AttackLast {
  tick: number;
  kind: 'blade' | 'punch';
  rule: number;
  baseDeg: number;
  keyDeg: number | null;
  dirDeg: number;
  targetId: number | null;
  tiltDeg: number;
}

/** DigSystem が使う たんす の窓口（M6 §2.9） */
export interface DigStoragePort {
  isTansu(x: number, y: number, z: number): boolean;
  /** 開く。もちもの画面は、開いていなければ 開く（screenOpens: true なら 画面は別の所で開くので 触らない） */
  open(x: number, y: number, z: number, opts?: { screenOpens?: boolean }): boolean;
  /** 置いた（向きを記録する） */
  placed(x: number, y: number, z: number, yawDeg: number): void;
  /** こわした（中身をばらまく） */
  broken(x: number, y: number, z: number): number;
}

const NO_DIG_EVENTS: DigEvent[] = [];

const TECH_OF_STANCE = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' } as const;

/** ほる時間（ステップ。すでの強さで数える）。かたさ × 60 ÷ 強さ、切り上げ。ほれないなら理由 */
export function digSteps(
  cfg: DigConfig,
  id: BlockId,
  level: number = cfg.handLevel,
): { steps: number } | { blocked: DigBlockedReason } {
  const h = cfg.hardness[id];
  if (h === null || h === undefined) return { blocked: 'unbreakable' };
  if ((cfg.harvestLevel[id] ?? 0) > level) return { blocked: 'needTool' };
  return { steps: Math.max(1, Math.ceil((h * 60) / cfg.handPower - 1e-9)) };
}

/** ねらう・ほる・おく（M2 §2.2〜2.4, §4.1, §4.3, §5）。毎ステップ update() を呼ぶ */
export class DigSystemImpl implements DigSystem {
  private tickCount = 0;
  private tgt: TargetInfo | null = null;

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
  /** ふりわけ の 前の 生の 押し（刀の わざの 押した しゅんかん用） */
  private prevPrimaryRaw = false;
  /** WEAPON-5: パリィの 先行入力の 間に 押した ふつうの こうげき（パリィが おわった ステップに わざを 出す） */
  private pendingTech = false;
  /** このステップはパンチ（ほらない） */
  private punching = false;
  /** ＋マークの線で ブロックより手前に 妖怪が いて 空ぶりに なる（ほらない。#34） */
  private yokaiBlocks = false;
  /** secondary を押しつづけている歩数（押していなければ 0） */
  private secondaryTicks = 0;

  /** 空振りの合計回数 */
  private whiffs = 0;
  /** primary を押しつづけている歩数（空振り用。押していなければ -1） */
  private whiffHold = -1;
  private prevSecondary = false;
  private digSwingTimer = 0;

  /** すで の たがやし: 数えている ブロック・回数・前の 1 回の ステップ */
  private tillBlock: Vec3 | null = null;
  private tillCount = 0;
  /** 押した瞬間に 素手だったか（たねを使い切ったあと 押しっぱなしで 素手たがやしを はじめない） */
  private pressStartedEmpty = false;
  private tillLast = -Infinity;
  /** まだ の作物を ゆらした ブロック（押しつづけで くりかえさない） */
  private unripeBlock: Vec3 | null = null;
  /** BAL-D: あう道具の ヒント（§4.6） */
  private readonly toolHintModel = new ToolHintModel();

  /** ねらいの線 の みず の 情報（毎回 つくらず 書きかえる） */
  private readonly waterRay: WaterRay = createWaterRay();

  private drainQueue: DigEvent[] = [];
  private hookQueue: DigEvent[] = [];
  private readonly dir = { x: 0, y: 0, z: 0 };
  private readonly originScratch = { x: 0, y: 0, z: 0 };
  /** aimedYokaiId 用（毎フレーム呼ばれても new しない） */
  private readonly yokaiOriginScratch = { x: 0, y: 0, z: 0 };

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
  private readonly reachScratch = { x: 0, y: 0, z: 0 };

  /** WEAPON-3: 体の点 B（P の 真上・肩の高さ）。つなぎ込みが `aimOrigin` の 高さで 入れる。なければ 足もと + 1.40 */
  bodyOrigin?: (player: PlayerState, out: Vec3) => Vec3;
  private readonly bodyScratch = { x: 0, y: 0, z: 0 };
  private readonly pvDir = { x: 0, y: 0, z: 0 };
  private readonly pvOrigin = { x: 0, y: 0, z: 0 };
  private readonly targetScratch = { x: 0, y: 0, z: 0 };
  private lastAttack: AttackLast | null = null;
  private prevPunchDir: number | null = null;

  /** 出どころ o から d の向きの線で ねらうブロック（reachOrigin があれば その点から reach 以内のものだけ）。distance は o から */
  private aimBlock(p: PlayerState, o: Vec3, d: Vec3): TargetInfo | null {
    const t = this.aimBlockRaw(p, o, d);
    // 見えない壁の外のマスは ほれない（VOX-D W4）。ブロックも おく所も 壁の中だけ
    return t && cellInWall(t.block.x, t.block.z) && cellInWall(t.place.x, t.place.z) ? t : null;
  }

  private aimBlockRaw(p: PlayerState, o: Vec3, d: Vec3): TargetInfo | null {
    const reach = this.config.reach;
    if (!this.reachOrigin) return raycastBlocks(this.world, o.x, o.y, o.z, d.x, d.y, d.z, reach);
    const r = this.reachOrigin(p, this.reachScratch);
    const span = Math.hypot(o.x - r.x, o.y - r.y, o.z - r.z);
    const t = raycastBlocks(this.world, o.x, o.y, o.z, d.x, d.y, d.z, reach + span);
    if (!t) return null;
    const hx = o.x + d.x * t.distance - r.x;
    const hy = o.y + d.y * t.distance - r.y;
    const hz = o.z + d.z * t.distance - r.z;
    return Math.hypot(hx, hy, hz) <= reach ? t : null;
  }

  private origin(p: PlayerState, out: Vec3): Vec3 {
    if (this.aimOrigin) return this.aimOrigin(p, out);
    out.x = p.position.x;
    out.y = p.position.y + this.eyeHeight();
    out.z = p.position.z;
    return out;
  }

  constructor(
    private readonly world: VoxelWorld,
    private readonly player: () => PlayerState,
    private readonly actions: ActionState,
    private readonly lock: LockStatus,
    private readonly inventory: Inventory,
    private readonly eyeHeight: () => number,
    readonly config: DigConfig = createDigConfig(),
    /** ドロップ数の乱数（シード付き。テストで再現できる） */
    private readonly rng: Rng = createRng(20240601),
    /** 戦い（M3）。線上で妖怪がブロックより手前ならパンチにする。なければ M2 のとおり */
    private readonly gate: PunchGate | null = null,
    private readonly m4: DigM4Deps = {},
  ) {}

  target(): TargetInfo | null {
    return this.tgt;
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
    this.listCacheTick = -1;
    this.inUpdate = true;
    try {
      this.updateInner();
    } finally {
      this.inUpdate = false;
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
    const nb = blade?.busyNext?.(enabled && run && pressed && isBladeItem(item)) ?? { busy: false, accepts: false };
    if (enabled && run && pressed && isBladeItem(item) && nb.busy && nb.accepts) blade?.dropBuffer?.();
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
    const d = lookDirection(p.yawDeg, p.pitchDeg, this.dir);
    const o = this.origin(p, this.originScratch);
    this.tgt = this.aimBlock(p, o, d);

    // 同じステップのうちに押してはなす短いタップも拾う（wasPressed）
    const primaryAny = enabled && (this.actions.isHeld('primary') || this.actions.wasPressed('primary'));
    // WEAPON-5: 刀＋Shift は パリィ（押した）か 何も出さない（押しつづけ）。ほる・わざは しない
    const parryM = this.m4.parry;
    const route = this.m4.blade && parryM ? routeAttackInput({ item: this.inventory.held()?.item, run: this.actions.isHeld('run'), pressed: this.actions.wasPressed('primary'), held: primaryAny }) : 'normal';
    const pstate = parryM ? parryM.state() : null;
    const parryBusy = pstate !== null && pstate.phase !== 'idle';
    let primaryRaw = primaryAny && route === 'normal';
    if (parryBusy && primaryRaw) {
      // パリィの 間の ふつうの こうげき: 先行入力の 区間なら あとに 押した 方が 勝つ（パリィが おわった ステップに わざ）
      if (this.actions.wasPressed('primary') && parryM!.inWindow()) {
        parryM!.dropBuffer();
        this.pendingTech = true;
      }
      primaryRaw = false;
    }
    if (route === 'parry' && this.pendingTech) this.pendingTech = false;
    const pendingNow = this.pendingTech && !parryBusy;
    if (pendingNow) this.pendingTech = false;
    const secondary = enabled && (this.actions.isHeld('secondary') || this.actions.wasPressed('secondary'));
    const tools = this.m4.tools;
    const eye = { x: o.x, y: o.y, z: o.z };
    const bow = tools?.current().kind === 'bow';
    // ゆみ を持っているあいだは ほる・たたく をしない（や は tools が飛ばす）
    let primary = primaryRaw && !bow;
    // 刀（WEAPON-2 §2.1-6・WEAPON-3 §4.4）: 向いている方の 妖怪（1）・＋マークで ねらった 妖怪（2）・何もない（4）→ わざ。作物・ブロック → しゅうかく・ほる
    const blade = this.m4.blade;
    const list = enabled && !bow ? this.yokaiList() : null;
    const dec = enabled && !bow ? this.buildDecision(p, d, o, this.tgt, list) : null;
    if (blade) {
      const held = this.inventory.held()?.item ?? null;
      const bladeItem = isBladeItem(held) ? held : null;
      let tech = false;
      if (bladeItem && enabled) {
        if (parryBusy) tech = false;
        else if (pendingNow) tech = true;
        else if (blade.state().phase !== 'idle') tech = true;
        else if (primaryRaw) {
          if (dec) tech = dec.use === 'attack' || dec.use === 'whiff';
          else {
            const y = this.gate?.aimedYokai?.(eye, d, this.tgt?.distance ?? null) ?? null;
            tech = y !== null || !this.tgt;
          }
        }
      }
      if (parryM && tech && primaryRaw && this.actions.wasPressed('primary') && blade.state().phase !== 'idle' && pstate?.buffered) parryM.dropBuffer();
      // WEAPON-6: パリィが 始まったら つなぎの窓の わざは やめる
      if (parryBusy && blade.state().combo) blade.yieldToParry?.();
      const body = this.bodyPoint(p, this.bodyScratch);
      blade.update({
        item: bladeItem,
        techPressed: tech && ((primaryRaw && (!this.prevPrimaryRaw || this.actions.wasPressed('primary'))) || pendingNow),
        techHeld: tech && primaryRaw,
        stancePressed: enabled && !parryBusy && this.actions.wasPressed('stanceNext' as Action),
        eye,
        dir: d,
        position: p.position,
        yawDeg: p.yawDeg,
        active: enabled,
        body,
        attackDirDeg: dec?.dirDeg ?? p.yawDeg,
        attackTarget: dec && dec.targetId !== null && list ? this.targetCenter(list, dec.targetId) : null,
      });
      if (parryBusy) blade.dropBuffer?.();
      if (tech) primary = false;
      if (dec && bladeItem) {
        const bs = blade.state();
        if (bs.tech !== null && bs.frame === 1 && bs.move) {
          this.lastAttack = {
            tick: this.tickCount, kind: 'blade', rule: dec.rule ?? 4, baseDeg: dec.baseDeg, keyDeg: dec.keyDeg,
            dirDeg: bs.move.dirDeg, targetId: dec.targetId, tiltDeg: bs.move.tiltDeg,
          };
        }
      }
    }
    this.prevPrimaryRaw = primaryRaw;
    tools?.step(primaryRaw, eye, d);
    this.punching = this.gate ? this.gate.primaryStep(primary, eye, d, this.tgt?.distance ?? null, dec ?? undefined) : false;
    {
      const pd = this.gate?.punchDirDeg?.() ?? null;
      if (pd !== null && this.prevPunchDir === null && dec) {
        this.lastAttack = {
          tick: this.tickCount, kind: 'punch', rule: dec.rule ?? 4, baseDeg: dec.baseDeg, keyDeg: dec.keyDeg,
          dirDeg: pd, targetId: dec.targetId, tiltDeg: 0,
        };
      }
      this.prevPunchDir = pd;
    }
    // ＋マークの線で ブロックより手前に 妖怪 → ほらずに 空ぶり（M3 AC18・#34。刀は 上で わざに なる）
    this.yokaiBlocks = dec !== null && dec.use === 'whiff' && this.tgt !== null;
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
    else if (!this.punching && (!this.tgt || this.yokaiBlocks)) {
      const every = this.m4.tools?.current().ticks ?? WHIFF_REPEAT_TICKS;
      if (this.whiffHold < 0 || this.whiffHold >= every) {
        this.whiffs++;
        this.m4.tools?.swingWhiff();
        this.whiffHold = 0;
      }
      this.whiffHold++;
    } else this.whiffHold = this.whiffHold < 0 ? 0 : this.whiffHold + 1;
    if (secondary && !this.tgt && (!this.prevSecondary || this.actions.wasPressed('secondary'))) {
      this.whiffs++;
      this.m4.tools?.pushSwing('whiff');
    }
  }

  private updateDig(primary: boolean): void {
    const cfg = this.config;
    this.active = false;
    this.blockedReason = null;

    if (this.punching || this.yokaiBlocks) {
      this.decay();
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }

    const t = this.tgt;
    if (!primary) this.unripeBlock = null;
    if (primary && t && this.tryHarvest(t)) return;
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

  private breakBlock(t: TargetInfo): void {
    const { x, y, z } = t.block;
    const craft = this.m4.craft;
    const wasFurnace = craft?.isFurnace(x, y, z) ?? false;
    const wasTansu = t.id === 'tansu';
    this.world.setBlock(x, y, z, 'air');
    if (wasTansu) this.m4.storage?.broken(x, y, z);
    this.dropUnsupportedTorches(x, y, z);
    const farmDrop = FARM_BREAK_DROP[t.id] ?? null;
    const fixed = farmDrop ? farmDrop.count : (craft?.fixedDrop(t.id) ?? null);
    const dropItem: ItemId = farmDrop ? farmDrop.item : t.id;
    const max = Math.max(1, this.config.dropMax[this.config.rarity[t.id] ?? 'common'] ?? 1);
    const n = NO_DROP_BLOCKS.has(t.id) ? 0 : fixed !== null ? fixed : randInt(this.rng, 1, max);
    const got = n - this.inventory.add(dropItem, n);
    if (got > 0) this.m4.onPickup?.(dropItem, got);
    // たんす は入らなければ 落とし物にする（なくさない。M6）
    if (wasTansu && got < n) this.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, t.id, n - got);
    if (wasFurnace) craft!.furnaceBroken(x, y, z);
    // M7: はたけ の 上の作物・くさ の 上の やせいの やさい、くさ から たね
    const farm = this.m4.farm;
    if (farm) {
      this.giveStacks(farm.onBlockBroken(x, y, z, t.id), x, y, z);
      if (t.id === 'grass') {
        const seed = farm.grassSeed(x, z);
        if (seed) this.giveStacks([{ item: seed, count: 1 }], x, y, z);
      }
    }
    this.emit({ type: 'break', tick: this.tickCount, block: { x, y, z }, id: t.id, gotItem: got > 0, count: got });
    this.wearForBlock();
    this.toolHintModel.forget(`${x},${y},${z}`);
    this.clearMem();
    this.active = false;
    this.cooldown = this.config.digCooldown;
  }

  /** ほった ブロックを こわした: 持っている 道具の たいきゅうを へらす（先に 効かせた あと。WEAPON-2 §4.6 (3)） */
  private wearForBlock(): void {
    const w = this.m4.w2?.toolWear;
    const it = this.inventory.held()?.item;
    if (!w || !it) return;
    let n = 0;
    if (it.endsWith('_pickaxe') || it.endsWith('_axe')) n = w.pickaxe.block;
    else if (it === 'kuwa') n = w.kuwa.block;
    else if (isBladeItem(it) || it === 'naginata') n = w.blade.block;
    if (n > 0) this.inventory.wearHeld?.(n);
  }

  /** (x, y, z) をこわした。下や横の支えをなくした たいまつ は落ちて アイテム になる（start_torch は こわれない） */
  private dropUnsupportedTorches(x: number, y: number, z: number): void {
    for (const [dx, dy, dz] of TORCH_NEIGHBORS) {
      const tx = x + dx;
      const ty = y + dy;
      const tz = z + dz;
      if (this.world.getBlock(tx, ty, tz) !== 'torch' || this.torchSupported(tx, ty, tz)) continue;
      this.world.setBlock(tx, ty, tz, 'air');
      if (this.m4.scatterItem) this.m4.scatterItem({ x: tx + 0.5, y: ty, z: tz + 0.5 }, 'torch', 1);
      else {
        const left = this.inventory.add('torch', 1);
        if (left === 0) this.m4.onPickup?.('torch', 1);
      }
    }
  }

  /** 持ち物へ入れる。入らない分は 落とし物（なければ 捨てる） */
  private giveStacks(stacks: ReadonlyArray<{ item: ItemId; count: number }>, x: number, y: number, z: number): void {
    for (const s of stacks) {
      if (s.count <= 0) continue;
      const left = this.inventory.add(s.item, s.count);
      const got = s.count - left;
      if (got > 0) this.m4.onPickup?.(s.item, got);
      if (left > 0) this.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, s.item, left);
    }
  }

  /** ひだりクリックで 作物・やせいの やさい を しゅうかく（§2.5）。作物をねらっていれば true（ほらない） */
  private tryHarvest(t: TargetInfo): boolean {
    const farm = this.m4.farm;
    if (!farm || !cropKindOfBlock(t.id)) return false;
    const { x, y, z } = t.block;
    const ripe = farm.crop(x, y, z)?.ripe ?? false;
    if (!ripe) {
      const same = this.unripeBlock && sameBlock(this.unripeBlock, t.block);
      if (!same || this.justPressed()) {
        this.unripeBlock = { ...t.block };
        farm.harvest(x, y, z); // 出来事 notRipe
      }
      this.decay();
      return true;
    }
    const r = farm.harvest(x, y, z);
    if (r.ok) {
      this.giveStacks(r.items, x, y, z);
      this.m4.tools?.pushSwing('dig');
      this.clearMem();
      this.cooldown = this.config.digCooldown;
    }
    return true;
  }

  private updatePlace(secondary: boolean): void {
    if (!secondary) {
      this.secondaryTicks = 0;
      return;
    }
    if (this.actions.wasPressed('secondary')) this.secondaryTicks = 0; // はなして すぐ押しなおした分も 新しい 1 回
    const every = this.config.placeRepeatTicks;
    const first = this.secondaryTicks === 0;
    const due = this.secondaryTicks % every === 0;
    const pourDue = this.secondaryTicks % Math.max(1, this.m4.farm?.settings().farmPourRepeatTicks ?? every) === 0;
    if (first) this.pressStartedEmpty = this.inventory.held() === null;
    this.secondaryTicks++;
    // たんす > かまど > 防具 > 置く（たんす・かまど・防具は押した瞬間だけ）。ヒントと同じ previewRightClick で決める
    const pv = this.previewRightClick(!first);
    if (!pv) {
      if (!first) return;
      return;
    }
    if (pv.kind === 'place') {
      if (due) this.tryPlace();
      return;
    }
    const t = this.tgt;
    if (pv.kind === 'till') {
      if (due && t && (first || this.inventory.held() !== null || this.pressStartedEmpty)) this.doTill(t);
      return;
    }
    if (pv.kind === 'plant') {
      if (due && t) this.doPlant(t, pv.item);
      return;
    }
    if (pv.kind === 'pour') {
      if (pourDue && t) this.doPour(t);
      return;
    }
    if (!first) return;
    if (pv.kind === 'bucketFill') this.doBucketFill();
    else if (pv.kind === 'bucketPlace') this.doBucketPlace();
    else if (pv.kind === 'bucketHint') this.m4.farm?.noteHint('bucket', this.playerChest());
    else if (pv.kind === 'bucketNo' && t) this.m4.bucket?.no({ x: t.place.x, y: t.place.y, z: t.place.z });
    if (pv.kind === 'fill') this.doFill();
    else if (pv.kind === 'fillHint') this.m4.farm?.noteHint('fill', this.playerChest());
    else if (pv.kind === 'pet' && t) this.doPet(t);
    if (pv.kind === 'storage' && t) this.m4.storage?.open(t.block.x, t.block.y, t.block.z);
    else if (pv.kind === 'furnace' && t) this.m4.craft?.openFurnace(t.block.x, t.block.y, t.block.z);
    else if (pv.kind === 'armor' && pv.item) this.m4.armor?.tryEquip(pv.item);
    else if (pv.kind === 'seedHint' && t) this.m4.farm?.noteHint('till', center(t.block));
    else if (pv.kind === 'eat' && pv.item) this.doEat(pv.item);
  }

  private doTill(t: TargetInfo): void {
    const farm = this.m4.farm!;
    const { x, y, z } = t.block;
    const need = this.inventory.held() ? 1 : Math.max(1, farm.settings().farmHandTillPresses);
    if (!this.tillBlock || !sameBlock(this.tillBlock, t.block) || this.tickCount - this.tillLast >= farm.settings().farmHandTillResetTicks) {
      this.tillBlock = { ...t.block };
      this.tillCount = 0;
    }
    this.tillLast = this.tickCount;
    this.tillCount++;
    this.m4.tools?.pushSwing('dig');
    if (this.tillCount >= need) {
      farm.till(x, y, z);
      if (this.inventory.held()?.item === 'kuwa') {
        const n = this.m4.w2?.toolWear.kuwa.till ?? 0;
        if (n > 0) this.inventory.wearHeld?.(n);
      }
      this.tillBlock = null;
      this.tillCount = 0;
    } else farm.noteTillPress(x, y, z, this.tillCount);
  }

  private doPlant(t: TargetInfo, item: ItemId | null): void {
    const kind = item ? seedKindOfItem(item) : null;
    if (!kind || !this.m4.farm) return;
    if (this.m4.farm.plant(t.block.x, t.block.y, t.block.z, kind)) {
      this.inventory.consumeHeld();
      this.m4.tools?.pushSwing('place');
    }
  }

  private playerChest(): Vec3 {
    const p = this.player().position;
    return { x: p.x, y: p.y + 1, z: p.z };
  }

  /** 4a くむ（押した瞬間 だけ）。みず を 通った いちばん 手前 の マス を わたす */
  private doFill(): void {
    const cell = this.waterRay.waterCell;
    if (!cell || !this.m4.water) return;
    this.m4.water.fill(this.inventory.selected(), { x: cell.x, y: cell.y, z: cell.z });
    this.m4.tools?.pushSwing('place');
  }

  /** 4d くむ（押した瞬間 だけ）。水の マスは そのまま */
  private doBucketFill(): void {
    const cell = this.waterRay.waterCell;
    if (!cell || !this.m4.bucket) return;
    this.m4.bucket.fill(this.inventory.selected(), { x: cell.x, y: cell.y, z: cell.z });
    this.m4.tools?.pushSwing('place');
  }

  /** 4e おく（押した瞬間 だけ）。ブロックを 置くのと 同じ マスに water を 1 マス */
  private doBucketPlace(): void {
    const spot = this.bucketSpotCell();
    if (!spot || !this.m4.bucket) return;
    if (!this.world.setBlock(spot.x, spot.y, spot.z, 'water')) return;
    this.m4.bucket.placed(this.inventory.selected(), spot);
    this.m4.tools?.pushSwing('place');
  }

  /** 4b まく（押した瞬間 と 30 ステップ ごと）。向き = 見ている 向き の 水平 ベクトル */
  private doPour(t: TargetInfo): void {
    if (!this.m4.water) return;
    this.m4.water.pour(this.inventory.selected(), { x: t.block.x, y: t.block.y, z: t.block.z }, { dx: this.dir.x, dz: this.dir.z });
    this.m4.tools?.pushSwing('place');
  }

  /** 5 なでる（押した瞬間 だけ） */
  private doPet(t: TargetInfo): void {
    const farm = this.m4.farm;
    const pet = this.m4.pet;
    const ck = cropKindOfBlock(t.id);
    if (!farm || !pet || !ck) return;
    const { x, y, z } = t.block;
    const info = farm.crop(x, y, z);
    if (!info) return;
    const result = pet.pet(x, y, z, { ...info, wild: ck.wild });
    if (!result) return;
    this.m4.emitFarm?.({ type: 'pet', tick: this.m4.nowTick?.() ?? this.tickCount, x, y, z, result });
    this.m4.tools?.pushSwing('place');
  }

  private doEat(item: ItemId): void {
    const farm = this.m4.farm;
    const v = this.m4.vitals;
    if (!farm || !v) return;
    const p = this.player().position;
    const at = { x: p.x, y: p.y + 1, z: p.z };
    if (v.hp() >= v.maxHp()) {
      farm.noteHint('full', at);
      return;
    }
    const got = v.heal(farm.eatHeal(item));
    this.inventory.consumeHeld();
    this.m4.tools?.pushSwing('place');
    farm.noteEat(item, got, at);
  }

  /**
   * 今、右クリックしたら何が起きるか（何も起きないなら null）。実行（updatePlace）と同じ判定。
   * 遊べない間（画面が開いている・やられている）は null。
   */
  previewRightClick(repeat = false): RightClickPreview | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    const st = this.m4.storage;
    const craft = this.m4.craft;
    const armor = this.m4.armor;
    return previewRightClick({
      target: this.tgt,
      held: this.inventory.held()?.item ?? null,
      isTansu: (x, y, z) => st?.isTansu(x, y, z) ?? false,
      isFurnace: (x, y, z) => craft?.isFurnace(x, y, z) ?? false,
      canEquip: (item) => armor?.canEquip(item) ?? false,
      water: () => this.waterPreview(repeat),
      bucket: () => this.bucketPreview(repeat),
      petSpot: () => this.petSpot(),
      canPlace: () => this.placeSpot() !== null,
      canTill: () => this.tillSpot(),
      canPlant: () => this.plantSpot(),
      isSeedHintSpot: () => this.seedHintSpot(),
      isVeg: (item) => !!this.m4.farm && !!this.m4.vitals && vegKindOfItem(item) !== null,
    });
  }

  /** 4a〜4c: じょうろ を 持っているとき だけ、みず を 通る 線 を しらべて A の 口 に 聞く */
  private waterPreview(repeat: boolean): 'fill' | 'pour' | 'fillHint' | null {
    const w = this.m4.water;
    const held = this.inventory.held();
    if (!w || !held || (held.item !== 'watering_can' && held.item !== 'long_watering_can')) return null;
    return w.canPreview(held, this.waterRayNow(), repeat);
  }

  /** 4d〜4g: バケツ を 持っているとき だけ。じょうろ と 同じ ねらいの 線で 水を 通るか 見る */
  private bucketPreview(repeat: boolean): BucketPreview | null {
    const b = this.m4.bucket;
    const held = this.inventory.held();
    if (!b || !held || (held.item !== 'bucket' && held.item !== 'water_bucket')) return null;
    const ray = this.waterRayNow();
    const spot = held.item === 'water_bucket' && !ray.throughWater ? this.bucketSpotCell() : null;
    return b.preview(held, ray, this.tgt !== null, spot, repeat);
  }

  /** `farm.bucketSpot()`: 今の ねらいで 4e が 水を 置く マス（置けない・水を ねらう ときは null） */
  bucketSpot(): Vec3 | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    if (this.inventory.held()?.item !== 'water_bucket' || this.waterRayNow().throughWater) return null;
    return this.bucketSpotCell();
  }

  /** 水を 置ける マス（ぜんぶ 満たす: air・体と 重ならない・妖怪の箱で ない・ねらった ブロックが 作物で ない） */
  private bucketSpotCell(): Vec3 | null {
    const t = this.tgt;
    if (!t || cropKindOfBlock(t.id)) return null;
    const { x, y, z } = t.place;
    if (this.world.getBlock(x, y, z) !== 'air') return null;
    if (this.overlapsBody(x, y, z)) return null;
    if (this.gate?.placeBlocked(x, y, z)) return null;
    return { x, y, z };
  }

  private waterRayNow(): WaterRay {
    const p = this.player();
    const d = lookDirection(p.yawDeg, p.pitchDeg, this.dir);
    const o = this.origin(p, this.originScratch);
    return computeWaterRay(
      (x, y, z) => this.world.getBlock(x, y, z),
      o.x,
      o.y,
      o.z,
      d.x,
      d.y,
      d.z,
      this.reachOrigin ? this.config.reach + 1.1 : this.config.reach,
      this.tgt,
      this.waterRay,
    );
  }

  /** 5: 作物・やせいの やさい を ねらっている（防具・じょうろ 以外 なんでも）。その やさい の 絵 を 返す */
  private petSpot(): ItemId | null {
    const t = this.tgt;
    const farm = this.m4.farm;
    if (!t || !farm || !this.m4.pet) return null;
    const ck = cropKindOfBlock(t.id);
    if (!ck) return null;
    const h = this.inventory.held()?.item;
    if (h === 'watering_can' || h === 'long_watering_can' || h === 'bucket' || h === 'water_bucket') return null;
    if (!farm.crop(t.block.x, t.block.y, t.block.z)) return null;
    return ck.kind;
  }

  /** くわ か すで で、上が くうき の くさ・つち を ねらっている */
  private tillSpot(): boolean {
    const t = this.tgt;
    if (!t || !this.m4.farm || (t.id !== 'grass' && t.id !== 'dirt')) return false;
    const h = this.inventory.held()?.item ?? null;
    if (h !== null && h !== 'kuwa') return false;
    return this.world.getBlock(t.block.x, t.block.y + 1, t.block.z) === 'air';
  }

  /** たね を持って、上が くうき の はたけ を ねらっている */
  private plantSpot(): boolean {
    const t = this.tgt;
    const h = this.inventory.held()?.item;
    if (!t || !h || !this.m4.farm || seedKindOfItem(h) === null) return false;
    if (t.id !== 'farmland' && t.id !== 'farmland_wet') return false;
    return this.world.getBlock(t.block.x, t.block.y + 1, t.block.z) === 'air';
  }

  private seedHintSpot(): boolean {
    const t = this.tgt;
    const h = this.inventory.held()?.item;
    return !!t && !!h && !!this.m4.farm && seedKindOfItem(h) !== null && (t.id === 'grass' || t.id === 'dirt');
  }

  // ---------------------------------------------------------------- WEAPON-3: 近接の 攻撃の 向き

  private listCache: YokaiInfo[] = [];
  private listCacheTick = -1;
  private inUpdate = false;

  /** 妖怪の 一覧。1 ステップに 1 回だけ 作る（歩数が 変わったときだけ 取り直す） */
  private yokaiList(): YokaiInfo[] {
    if (!this.m4.yokai) return [];
    // update() の中だけ キャッシュ(1 ステップ 1 回)。外から 呼ばれたときは 毎回 取り直す
    if (!this.inUpdate) return this.m4.yokai().list();
    if (this.listCacheTick !== this.tickCount) {
      this.listCache = this.m4.yokai().list();
      this.listCacheTick = this.tickCount;
    }
    return this.listCache;
  }

  private targetCenter(list: YokaiInfo[], id: number): Vec3 | null {
    for (const y of list) if (y.id === id) return { ...centerOfYokai(y, this.targetScratch) };
    return null;
  }

  /** 体の点 B: P の 真上（肩の高さ）。右へは ずらさない */
  private bodyPoint(p: PlayerState, out: Vec3): Vec3 {
    if (this.bodyOrigin) {
      this.bodyOrigin(p, out);
      out.x = p.position.x;
      out.z = p.position.z;
      return out;
    }
    out.x = p.position.x;
    out.y = p.position.y + 1.4;
    out.z = p.position.z;
    return out;
  }

  /** 今の 持ち物の 近接の なかま（弓は bow） */
  private holdKind(): AttackHold {
    if (this.m4.tools?.current().kind === 'bow') return 'bow';
    return isBladeItem(this.inventory.held()?.item) ? 'blade' : 'punch';
  }

  /** 向きの決まり（§4.4）。つなぎが そろっていなければ null（今までの 線で 決める） */
  private buildDecision(p: PlayerState, d: Vec3, o: Vec3, tgt: TargetInfo | null, list: YokaiInfo[] | null): AttackDecision | null {
    const w2 = this.m4.w2;
    if (!w2 || !this.m4.yokai || !this.gate || !list) return null;
    const hold = this.holdKind();
    if (hold === 'blade' && !this.m4.blade) return null;
    const a = this.actions;
    const aimYokai = this.gate.aimedYokai?.(o, d, tgt?.distance ?? null) ?? null;
    const block: 'block' | 'crop' | null = tgt ? (this.m4.farm && cropKindOfBlock(tgt.id) ? 'crop' : 'block') : null;
    const before = tgt ? this.m4.yokai().raycast(o, d, tgt.distance) : null;
    const yokaiBeforeBlock = before !== null && before.distance < tgt!.distance;
    // WEAPON-6: 次に 始まる わざ・何段目か（きらめく カタナだけ。ほかは かまえの わざ）
    const nextBlade = hold === 'blade' ? this.m4.blade!.nextStart?.() : undefined;
    return decideAttack({
      settings: w2,
      hold,
      item: this.inventory.held()?.item ?? null,
      tech: nextBlade?.tech ?? (hold === 'blade' ? TECH_OF_STANCE[this.m4.blade!.state().stance] : 'thrust'),
      step: nextBlade?.step,
      punchReach: this.m4.tools?.punchParams?.().reach ?? 3.5,
      yawDeg: p.yawDeg,
      facingDeg: p.facingDeg,
      keys: {
        forward: a.isHeld('moveForward'),
        back: a.isHeld('moveBack'),
        right: a.isHeld('moveRight'),
        left: a.isHeld('moveLeft'),
      },
      position: p.position,
      body: this.bodyPoint(p, this.bodyScratch),
      yokai: list,
      world: this.world,
      aim: { yokaiId: aimYokai, block, yokaiBeforeBlock },
    });
  }

  /** 今 決め直した 向きの決まり（遊べない間・弓・つなぎがない間は null） */
  private freshDecision(): AttackDecision | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    if (!this.m4.w2 || !this.m4.yokai || this.m4.tools?.current().kind === 'bow') return null;
    const p = this.player();
    const d = lookDirection(p.yawDeg, p.pitchDeg, this.pvDir);
    const o = this.origin(p, this.pvOrigin);
    return this.buildDecision(p, d, o, this.aimBlock(p, o, d), this.yokaiList());
  }

  /** `attack.preview()`（§4.8）: 今 左クリックしたら どうなるか */
  attackPreview(): { use: 'attack' | 'dig' | 'harvest' | 'whiff' | 'none'; rule: 1 | 2 | 3 | 4 | null; dirDeg: number | null; targetId: number | null } {
    const dec = this.freshDecision();
    if (!dec) return { use: 'none', rule: null, dirDeg: null, targetId: null };
    return { use: dec.use, rule: dec.rule, dirDeg: dec.dirDeg, targetId: dec.targetId };
  }

  /** `attack.last()`（§4.8）: さいごに 始めた 攻撃。まだなければ null */
  attackLast(): AttackLast | null {
    return this.lastAttack ? { ...this.lastAttack } : null;
  }

  /** 刀の わざ・パンチの 間は 攻撃の向き u。そうでなければ null（キャラの向きを u に 固定する） */
  attackFaceDeg(): number | null {
    const mv = this.m4.blade?.state().move;
    if (mv) return mv.dirDeg;
    return this.gate?.punchDirDeg?.() ?? null;
  }

  /** 今、左クリックしたら 何をするか（たたく・ほる・や を うつ）。出すヒントの薄い行用（妖怪が手前なら 'hit'） */
  previewLeftClick(): LeftClickKind | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    const tool = this.m4.tools?.current();
    if (tool?.kind === 'bow') return 'shoot';
    const t = this.tgt;
    if (this.aimedYokaiId() !== null) return 'hit';
    if (!t) return null;
    // ＋マークの線で ブロックより手前に 妖怪 → ほらない（#34）ので 案内も 出さない
    if (this.freshDecision()?.use === 'whiff') return null;
    if (this.m4.farm && cropKindOfBlock(t.id)) return 'harvest';
    return 'steps' in digSteps(this.config, t.id, tool?.level) ? 'dig' : null;
  }

  /** ねらっている（手前の・とどく距離内の）妖怪の id。たたく ヒントとふちどりが同じ判定を使う。遊べない間は null */
  aimedYokaiId(): number | null {
    if (!this.gate?.aimedYokai || !this.lock.playInputEnabled() || this.gate.blocksInput()) return null;
    // WEAPON-3: 刀・パンチの 持ち物では、毎ステップ「今 左クリックしたら 攻撃する 妖怪」（§4.4 の (1)・(2)）
    const dec = this.freshDecision();
    if (dec) return dec.use === 'attack' ? dec.targetId : null;
    const p = this.player();
    const eye = this.origin(p, this.yokaiOriginScratch);
    return this.gate.aimedYokai(eye, lookDirection(p.yawDeg, p.pitchDeg, this.dir), this.tgt?.distance ?? null);
  }

  /** 置く場所とブロック（置けないなら null）。tryPlace とヒントが同じ判定を使う */
  private placeSpot(): { x: number; y: number; z: number; block: BlockId } | null {
    const t = this.tgt;
    const held = this.inventory.held();
    if (!t || !held) return null;
    const block = itemType(held.item)?.placeBlock;
    if (!block) return null;
    const { x, y, z } = t.place;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== 'air' && cur !== 'water') return null; // 世界の外・ほかのブロック
    if (block === 'torch') {
      // たいまつ: 固くない（体と重なっても置ける）。下か横に固いブロックが要る
      if (!this.torchSupported(x, y, z)) return null;
    } else if (this.overlapsBody(x, y, z)) return null;
    if (this.gate?.placeBlocked(x, y, z)) return null; // 妖怪の箱の所には置けない
    return { x, y, z, block };
  }

  /**
   * たんす をねらって `toggleInventory`（E）: たんす の形で開く（M6 §2.9 (2)）。
   * ScreenController より先に呼ぶこと（画面は ScreenController が開くので、ここでは触らない）。ねらっていなければ false
   */
  tryOpenAimedStorage(): boolean {
    const st = this.m4.storage;
    const t = this.tgt;
    if (!st || !t || !this.lock.playInputEnabled() || !st.isTansu(t.block.x, t.block.y, t.block.z)) return false;
    return st.open(t.block.x, t.block.y, t.block.z, { screenOpens: true });
  }

  private tryPlace(): void {
    const spot = this.placeSpot();
    if (!spot) return;
    const { x, y, z, block } = spot;
    if (!this.world.setBlock(x, y, z, block)) return;
    this.inventory.consumeHeld();
    if (block === 'tansu') this.m4.storage?.placed(x, y, z, this.player().yawDeg);
    this.m4.tools?.pushSwing('place');
    this.emit({ type: 'place', tick: this.tickCount, block: { x, y, z }, id: block });
  }

  private torchSupported(x: number, y: number, z: number): boolean {
    const w = this.world;
    return (
      w.isSolid(x, y - 1, z) || w.isSolid(x - 1, y, z) || w.isSolid(x + 1, y, z) || w.isSolid(x, y, z - 1) || w.isSolid(x, y, z + 1)
    );
  }

  private overlapsBody(bx: number, by: number, bz: number): boolean {
    const p = this.player().position;
    const h = BODY_W / 2;
    return (
      bx < p.x + h &&
      bx + 1 > p.x - h &&
      by < p.y + BODY_H &&
      by + 1 > p.y &&
      bz < p.z + h &&
      bz + 1 > p.z - h
    );
  }

  private emit(e: DigEvent): void {
    this.drainQueue.push(e);
    this.hookQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
  }
}

const TORCH_NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function center(b: Vec3): Vec3 {
  return { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 };
}

function sameBlock(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
