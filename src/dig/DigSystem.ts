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
} from '../contracts';
import type { Action, ActionState } from '../input/actions';
import { cropKindOfBlock, seedKindOfItem, vegKindOfItem } from '../contracts';
import { itemType } from '../inventory/items';
import { BODY_H, BODY_W, FARM_BREAK_DROP, createDigConfig, type DigConfig } from './config';
import { createRng, randInt, type Rng } from '../world/gen/random';
import type { PunchGate } from '../combat/PlayerCombat';
import { lookDirection, raycastBlocks } from './raycast';
import { previewRightClick, type LeftClickKind, type RightClickPreview } from './rightClick';

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
  /** このステップはパンチ（ほらない） */
  private punching = false;
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
  private tillLast = -Infinity;
  /** まだ の作物を ゆらした ブロック（押しつづけで くりかえさない） */
  private unripeBlock: Vec3 | null = null;

  private drainQueue: DigEvent[] = [];
  private hookQueue: DigEvent[] = [];
  private readonly dir = { x: 0, y: 0, z: 0 };

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
    const cfg = this.config;
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
    this.tgt = raycastBlocks(
      this.world,
      p.position.x,
      p.position.y + this.eyeHeight(),
      p.position.z,
      d.x,
      d.y,
      d.z,
      cfg.reach,
    );

    // 同じステップのうちに押してはなす短いタップも拾う（wasPressed）
    const primaryRaw = enabled && (this.actions.isHeld('primary') || this.actions.wasPressed('primary'));
    const secondary = enabled && (this.actions.isHeld('secondary') || this.actions.wasPressed('secondary'));
    const tools = this.m4.tools;
    const eye = { x: p.position.x, y: p.position.y + this.eyeHeight(), z: p.position.z };
    const bow = tools?.current().kind === 'bow';
    // ゆみ を持っているあいだは ほる・たたく をしない（や は tools が飛ばす）
    const primary = primaryRaw && !bow;
    tools?.step(primaryRaw, eye, d);
    this.punching = this.gate ? this.gate.primaryStep(primary, eye, d, this.tgt?.distance ?? null) : false;
    this.updateWhiff(primary, secondary);
    this.updateDig(primary);
    this.prevPrimary = primary;
    this.prevSecondary = secondary;
    this.updatePlace(secondary);
    this.tickCount++;
  }

  /** 何もねらっていない（ブロックも妖怪もない）ときのクリックで腕を振る。押した瞬間と、押しっぱなしの 0.5 秒ごと */
  private updateWhiff(primary: boolean, secondary: boolean): void {
    if (!primary) this.whiffHold = -1;
    else if (!this.punching && !this.tgt) {
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

    if (this.punching) {
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
      // 強さ ÷ すでの強さ だけ進む（すでの何ステップ分で数える。持ちかえてもそのまま続く）
      this.mem += tool ? tool.power / cfg.handPower : 1;
      if (this.mem >= r.steps - 1e-9) {
        this.mem = r.steps;
        this.ready = true;
        this.emit({ type: 'ready', tick: this.tickCount, block: { ...t.block }, id: t.id });
      }
      return;
    }
    this.decay();
  }

  /** はなしている間、ほった量が少しずつもどる（digDecayRate） */
  private decay(): void {
    if (!this.memBlock) return;
    // MAX になったら減らない（こわれるか、別のブロックをほり始めるまで MAX のまま）
    if (this.ready) return;
    const tool = this.m4.tools?.current();
    this.mem -= this.config.digDecayRate * (tool ? tool.power / this.config.handPower : 1);
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
    const n = fixed !== null ? fixed : randInt(this.rng, 1, max);
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
    this.clearMem();
    this.active = false;
    this.cooldown = this.config.digCooldown;
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
    this.secondaryTicks++;
    // たんす > かまど > 防具 > 置く（たんす・かまど・防具は押した瞬間だけ）。ヒントと同じ previewRightClick で決める
    const pv = this.previewRightClick();
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
      if (due && t) this.doTill(t);
      return;
    }
    if (pv.kind === 'plant') {
      if (due && t) this.doPlant(t, pv.item);
      return;
    }
    if (!first) return;
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
  previewRightClick(): RightClickPreview | null {
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
      canPlace: () => this.placeSpot() !== null,
      canTill: () => this.tillSpot(),
      canPlant: () => this.plantSpot(),
      isSeedHintSpot: () => this.seedHintSpot(),
      isVeg: (item) => !!this.m4.farm && !!this.m4.vitals && vegKindOfItem(item) !== null,
    });
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

  /** 今、左クリックしたら 何をするか（たたく・ほる・や を うつ）。出すヒントの薄い行用（妖怪が手前なら 'hit'） */
  previewLeftClick(): LeftClickKind | null {
    if (!this.lock.playInputEnabled() || this.gate?.blocksInput()) return null;
    const tool = this.m4.tools?.current();
    if (tool?.kind === 'bow') return 'shoot';
    const t = this.tgt;
    if (this.aimedYokaiId() !== null) return 'hit';
    if (!t) return null;
    if (this.m4.farm && cropKindOfBlock(t.id)) return 'harvest';
    return 'steps' in digSteps(this.config, t.id, tool?.level) ? 'dig' : null;
  }

  /** ねらっている（手前の・とどく距離内の）妖怪の id。たたく ヒントとふちどりが同じ判定を使う。遊べない間は null */
  aimedYokaiId(): number | null {
    if (!this.gate?.aimedYokai || !this.lock.playInputEnabled() || this.gate.blocksInput()) return null;
    const p = this.player();
    const eye = { x: p.position.x, y: p.position.y + this.eyeHeight(), z: p.position.z };
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
