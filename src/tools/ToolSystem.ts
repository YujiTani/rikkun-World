import type {
  Inventory,
  ItemId,
  PlayerState,
  SwingAnim,
  ToolInfo,
  ToolKind,
  ToolSystem,
  Vec3,
  VoxelWorld,
  YokaiWorld,
} from '../contracts';
import { raycastBlocks } from '../dig/raycast';
import { STEPS_PER_SECOND, createToolConfig, type ToolConfig } from './config';

const MAX_QUEUE = 256;

/** すで・ほかのもの の基本の値（dig / combat の設定を参照する。設定を変えるとここにも効く） */
export interface ToolBase {
  dig: { handPower: number; handLevel: number };
  combat: { punchDamage: number; punchReach: number; punchTicks: number };
}

export type ArrowEvent =
  | { type: 'arrowShot'; tick: number; id: number; position: Vec3; dir: Vec3 }
  | { type: 'arrowHit'; tick: number; id: number; yokaiId: number; position: Vec3 }
  | { type: 'arrowEnd'; tick: number; id: number; position: Vec3; traveled: number; reason: 'block' | 'range' | 'outside' }
  | { type: 'noArrow'; tick: number };

export interface ArrowView {
  id: number;
  position: Vec3;
  dir: Vec3;
  traveled: number;
}

export interface ToolDeps {
  inventory: Inventory;
  world: VoxelWorld;
  player: () => PlayerState;
  /** 妖怪（作る順番の都合で関数。なければ や は妖怪に当たらない） */
  yokai?: () => YokaiWorld | null;
  base: ToolBase;
  config?: ToolConfig;
}

interface Arrow {
  id: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  traveled: number;
}

const BLADES: ReadonlySet<string> = new Set(['bokuto', 'katana', 'naginata', 'crystal_katana']);

/** 手に持っているものの働き（M4 §2.4〜§2.6・§4.3）。`DigSystem` が毎ステップ step() を呼ぶ */
export class ToolSystemImpl implements ToolSystem {
  readonly config: ToolConfig;
  private tickCount = 0;
  /** current() が返す入れ物（毎回作らない。次に current() を呼ぶまで有効） */
  private readonly info: ToolInfo = { item: null, kind: 'hand', power: 1, level: 0, damage: 1, reach: 3, ticks: 30 };
  private swings: { anim: SwingAnim; tick: number }[] = [];

  // なぎなた
  private naginataNext: 'thrust' | 'sweep' = 'thrust';
  private naginataFreeAt = -Infinity;

  // ゆみ
  /** 引きはじめから数えたステップ（0 = ひいていない） */
  private bowTick = 0;
  /** この引きは や が無くて「カチン」だった（飛ばさない） */
  private noArrowCycle = false;
  private arrowList: Arrow[] = [];
  private nextArrowId = 1;
  private drainQueue: ArrowEvent[] = [];
  private hookQueue: ArrowEvent[] = [];

  constructor(private readonly d: ToolDeps) {
    this.config = d.config ?? createToolConfig();
  }

  // ---------------------------------------------------------- 持っているもの

  current(): ToolInfo {
    const c = this.config;
    const b = this.d.base;
    const item = this.d.inventory.held()?.item ?? null;
    const t = this.info;
    t.item = item;
    t.kind = kindOf(item, c);
    t.power = (item && c.toolPower[item]) || b.dig.handPower;
    t.level = item && c.toolLevel[item] !== undefined ? c.toolLevel[item]! : b.dig.handLevel;
    t.damage = (item && c.weaponDamage[item]) || b.combat.punchDamage;
    t.reach = (item && c.weaponReach[item]) || b.combat.punchReach;
    t.ticks = (item && c.weaponTicks[item]) || b.combat.punchTicks;
    if (t.kind === 'bow') {
      t.power = b.dig.handPower;
      t.level = b.dig.handLevel;
      t.damage = c.arrowDamage;
      t.reach = c.arrowRange;
      t.ticks = c.bowDrawTicks;
    }
    return t;
  }

  /** パンチの値（PlayerCombat が始めるときに読む） */
  punchParams(): { damage: number; reach: number; ticks: number } {
    const t = this.current();
    return { damage: t.damage, reach: t.reach, ticks: t.ticks };
  }

  /** パンチを始めた（PlayerCombat から）。持っている武器の振りを出す */
  onPunchStart(): void {
    this.swingWeapon();
  }

  // ---------------------------------------------------------- うでの動き

  drainSwings(): { anim: SwingAnim; tick: number }[] {
    const out = this.swings;
    this.swings = [];
    return out;
  }

  pushSwing(anim: SwingAnim): void {
    this.swings.push({ anim, tick: this.tickCount });
    if (this.swings.length > MAX_QUEUE) this.swings.shift();
  }

  /** 持っているものでたたく・ふる動き（かたな=切る、なぎなた=つく/はらう、ほか=パンチ）を出して返す */
  swingWeapon(): SwingAnim {
    const t = this.current();
    let anim: SwingAnim = 'punch';
    if (t.item === 'naginata') {
      // 60 ステップふらなかったら次は「つく」から
      if (this.tickCount - this.naginataFreeAt >= this.config.naginataComboReset) this.naginataNext = 'thrust';
      anim = this.naginataNext;
      this.naginataNext = anim === 'thrust' ? 'sweep' : 'thrust';
      this.naginataFreeAt = this.tickCount + t.ticks;
    } else if (t.kind === 'blade') {
      anim = 'slash';
    }
    this.pushSwing(anim);
    return anim;
  }

  /** 何もない所を振った。武器なら武器の振り、ほかは空振り */
  swingWhiff(): void {
    if (this.current().kind === 'blade') this.swingWeapon();
    else this.pushSwing('whiff');
  }

  // ---------------------------------------------------------- 毎ステップ

  /**
   * 1 ステップ進める。primary: 押している（ゆみの引きはじめ）。eye・dir: 目の位置と向き（長さ 1）
   * ゆみ以外を持っているあいだは引かない。飛んでいる や は持ち物に関係なく進める
   */
  step(primary: boolean, eye: Vec3, dir: Vec3): void {
    this.stepBow(primary, eye, dir);
    this.stepArrows();
    this.tickCount++;
  }

  private stepBow(primary: boolean, eye: Vec3, dir: Vec3): void {
    const c = this.config;
    if (this.current().kind !== 'bow') {
      this.bowTick = 0;
      return;
    }
    if (this.bowTick > 0) {
      this.bowTick++;
      if (this.bowTick > c.bowInterval) this.bowTick = 0;
    }
    if (this.bowTick === 0 && primary) {
      this.bowTick = 1;
      if (this.d.inventory.count('ya') <= 0) {
        // 引きはじめに や が無い: カチン（次の引きはじめまでの間かくは同じ）
        this.noArrowCycle = true;
        this.emit({ type: 'noArrow', tick: this.tickCount });
        return;
      }
      this.noArrowCycle = false;
      this.pushSwing('draw');
    }
    if (this.bowTick === c.bowDrawTicks && !this.noArrowCycle) this.shoot(eye, dir);
  }

  private shoot(eye: Vec3, dir: Vec3): void {
    if (this.d.inventory.remove('ya', 1) < 1) {
      this.emit({ type: 'noArrow', tick: this.tickCount });
      return;
    }
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const a: Arrow = {
      id: this.nextArrowId++,
      x: eye.x,
      y: eye.y,
      z: eye.z,
      dx: dir.x / len,
      dy: dir.y / len,
      dz: dir.z / len,
      traveled: 0,
    };
    this.arrowList.push(a);
    this.pushSwing('release');
    this.emit({
      type: 'arrowShot',
      tick: this.tickCount,
      id: a.id,
      position: { x: a.x, y: a.y, z: a.z },
      dir: { x: a.dx, y: a.dy, z: a.dz },
    });
  }

  private stepArrows(): void {
    const list = this.arrowList;
    if (list.length === 0) return;
    const c = this.config;
    const stepLen = c.arrowSpeed / STEPS_PER_SECOND;
    const yokai = this.d.yokai?.() ?? null;
    const size = this.d.world.size;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const L = Math.min(stepLen, c.arrowRange - a.traveled);
      const blk = raycastBlocks(this.d.world, a.x, a.y, a.z, a.dx, a.dy, a.dz, L);
      const yh = yokai ? yokai.raycast({ x: a.x, y: a.y, z: a.z }, { x: a.dx, y: a.dy, z: a.dz }, L) : null;
      let alive = true;
      if (yh && (!blk || yh.distance < blk.distance)) {
        a.traveled += yh.distance;
        const pos = { x: a.x + a.dx * yh.distance, y: a.y + a.dy * yh.distance, z: a.z + a.dz * yh.distance };
        yokai!.damage(yh.id, c.arrowDamage, { ...this.d.player().position });
        this.emit({ type: 'arrowHit', tick: this.tickCount, id: a.id, yokaiId: yh.id, position: pos });
        alive = false;
      } else if (blk) {
        a.traveled += blk.distance;
        this.endArrow(a, 'block', blk.distance);
        alive = false;
      } else {
        a.x += a.dx * L;
        a.y += a.dy * L;
        a.z += a.dz * L;
        a.traveled += L;
        if (a.x < 0 || a.y < 0 || a.z < 0 || a.x >= size.x || a.y >= size.y || a.z >= size.z) {
          this.endArrow(a, 'outside', 0);
          alive = false;
        } else if (a.traveled >= c.arrowRange - 1e-9) {
          this.endArrow(a, 'range', 0);
          alive = false;
        }
      }
      if (alive) list[w++] = a;
    }
    list.length = w;
  }

  private endArrow(a: Arrow, reason: 'block' | 'range' | 'outside', advance: number): void {
    this.emit({
      type: 'arrowEnd',
      tick: this.tickCount,
      id: a.id,
      position: { x: a.x + a.dx * advance, y: a.y + a.dy * advance, z: a.z + a.dz * advance },
      traveled: a.traveled,
      reason,
    });
  }

  // ---------------------------------------------------------- 窓口用

  /** 飛んでいる や（コピー） */
  arrows(): ArrowView[] {
    return this.arrowList.map((a) => ({
      id: a.id,
      position: { x: a.x, y: a.y, z: a.z },
      dir: { x: a.dx, y: a.dy, z: a.dz },
      traveled: a.traveled,
    }));
  }

  /** 画面と音用（呼ぶと空） */
  drainArrowEvents(): ArrowEvent[] {
    const out = this.drainQueue;
    this.drainQueue = [];
    return out;
  }

  /** テストの窓口用（呼ぶと空。画面側の列とは別） */
  takeHookEvents(): ArrowEvent[] {
    const out = this.hookQueue;
    this.hookQueue = [];
    return out;
  }

  private emit(e: ArrowEvent): void {
    this.drainQueue.push(e);
    this.hookQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
  }
}

function kindOf(item: ItemId | null, c: ToolConfig): ToolKind {
  if (item === null) return 'hand';
  if (item === 'yumi') return 'bow';
  if (BLADES.has(item) || c.weaponDamage[item] !== undefined) return 'blade';
  if (c.toolPower[item] !== undefined || item.endsWith('_pickaxe')) return 'pickaxe';
  return 'other';
}
