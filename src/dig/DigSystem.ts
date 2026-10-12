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
} from '../contracts';
import type { Action, ActionState } from '../input/actions';
import { itemType } from '../inventory/items';
import { BODY_H, BODY_W, createDigConfig, type DigConfig } from './config';
import { createRng, randInt, type Rng } from '../world/gen/random';
import type { PunchGate } from '../combat/PlayerCombat';
import { lookDirection, raycastBlocks } from './raycast';

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
  armor?: Pick<ArmorSystem, 'tryEquip'>;
  /** ほって持ち物に入った（拾ったログ用。A の窓口につなぐ） */
  onPickup?: (item: ItemId, count: number) => void;
  /** 支えをなくした たいまつ を地面に落とす（なければ 持ち物へ直接入れる） */
  scatterItem?: (pos: Vec3, item: ItemId, count: number) => void;
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
    if (enabled) {
      for (let i = 0; i < 9; i++) if (this.actions.wasPressed(HOTBAR_ACTIONS[i])) this.inventory.select(i);
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
    this.world.setBlock(x, y, z, 'air');
    this.dropUnsupportedTorches(x, y, z);
    const fixed = craft?.fixedDrop(t.id) ?? null;
    const max = Math.max(1, this.config.dropMax[this.config.rarity[t.id] ?? 'common'] ?? 1);
    const n = fixed !== null ? fixed : randInt(this.rng, 1, max);
    const got = n - this.inventory.add(t.id, n);
    if (got > 0) this.m4.onPickup?.(t.id, got);
    if (wasFurnace) craft!.furnaceBroken(x, y, z);
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

  private updatePlace(secondary: boolean): void {
    if (!secondary) {
      this.secondaryTicks = 0;
      return;
    }
    const every = this.config.placeRepeatTicks;
    const first = this.secondaryTicks === 0;
    const due = this.secondaryTicks % every === 0;
    this.secondaryTicks++;
    // かまど > 防具 > 置く（かまど・防具は押した瞬間だけ）
    if (first && this.tryFurnace()) return;
    if (first && this.tryArmor()) return;
    if (due) this.tryPlace();
  }

  private tryFurnace(): boolean {
    const craft = this.m4.craft;
    const t = this.tgt;
    if (!craft || !t || !craft.isFurnace(t.block.x, t.block.y, t.block.z)) return false;
    craft.openFurnace(t.block.x, t.block.y, t.block.z);
    return true;
  }

  private tryArmor(): boolean {
    const held = this.inventory.held();
    if (!held || !this.m4.armor) return false;
    return this.m4.armor.tryEquip(held.item);
  }

  private tryPlace(): void {
    const t = this.tgt;
    const held = this.inventory.held();
    if (!t || !held) return;
    const block = itemType(held.item)?.placeBlock;
    if (!block) return;
    const { x, y, z } = t.place;
    const cur = this.world.getBlock(x, y, z);
    if (cur !== 'air' && cur !== 'water') return; // 世界の外・ほかのブロック
    if (block === 'torch') {
      // たいまつ: 固くない（体と重なっても置ける）。下か横に固いブロックが要る
      if (!this.torchSupported(x, y, z)) return;
    } else if (this.overlapsBody(x, y, z)) return;
    if (this.gate?.placeBlocked(x, y, z)) return; // 妖怪の箱の所には置けない
    if (!this.world.setBlock(x, y, z, block)) return;
    this.inventory.consumeHeld();
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

function sameBlock(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
