import type {
  BowEvent,
  BowSystem,
  Inventory,
  ItemId,
  PlayerState,
  SwingAnim,
  ToolInfo,
  ToolKind,
  ToolSystem,
  Vec3,
  VoxelWorld,
  W2Settings,
  YokaiWorld,
} from '../contracts';
import { createW2Settings } from '../contracts';
import { createBowSystem } from './bow/BowSystem';
import { createToolConfig, type ToolConfig } from './config';

const MAX_QUEUE = 256;

/** すで・ほかのもの の基本の値（dig / combat の設定を参照する。設定を変えるとここにも効く） */
export interface ToolBase {
  dig: { handPower: number; handLevel: number };
  combat: { punchDamage: number; punchReach: number; punchTicks: number };
}

/** や の 出来事（WEAPON-2: `BowEvent` と 同じ） */
export type ArrowEvent = BowEvent;

/** 飛んでいる や の 見た目用（`dir` = 速度の 向き〈長さ 1〉、`traveled` = 飛んでからの ステップ） */
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
  /** WEAPON-2 の 設定の 入れ物（同じ オブジェクトを 読む。なければ 自分で 作る） */
  settings?: W2Settings;
  /** や を 1 本 うった とき。なければ `inventory.wearHeld(toolWear.bow.shot)` */
  onBowShot?: () => void;
}

const BLADES: ReadonlySet<string> = new Set(['bokuto', 'katana', 'naginata', 'crystal_katana', 'raijin_ken', 'fujin_ken', 'niji_tachi']);

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

  // ゆみ（WEAPON-2: `src/tools/bow/`）
  readonly settings: W2Settings;
  private readonly bowSys: BowSystem;
  private prevPrimary = false;
  private readonly bowCtx = {
    item: null as ItemId | null,
    pressed: false,
    held: false,
    eye: { x: 0, y: 0, z: 0 },
    dir: { x: 0, y: 0, z: 1 },
    position: { x: 0, y: 0, z: 0 },
    active: true,
  };
  private hookQueue: BowEvent[] = [];
  private readonly arrowViews = new Map<number, ArrowView>();

  constructor(private readonly d: ToolDeps) {
    this.config = d.config ?? createToolConfig();
    this.settings = d.settings ?? createW2Settings();
    this.bowSys = createBowSystem({
      world: d.world,
      yokai: () => d.yokai?.() ?? NO_YOKAI,
      settings: this.settings,
      inventory: d.inventory,
      onShot: () => {
        if (d.onBowShot) d.onBowShot();
        else d.inventory.wearHeld?.(this.settings.toolWear.bow.shot);
      },
      tick: () => this.tickCount,
      onEvent: (e) => {
        if (e.type === 'drawStart') this.pushSwing('draw');
        else if (e.type === 'arrowShot') this.pushSwing('release');
        this.hookQueue.push(e);
        if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
      },
    });
  }

  /** WEAPON-2: ゆみ と や */
  bow(): BowSystem {
    return this.bowSys;
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
      // 段 3 の 値（reach は 段 3・45° の 目安 v²/g）
      const s = this.settings;
      t.damage = s.bowDamage[2];
      t.reach = Math.round((s.bowSpeed[2] * s.bowSpeed[2]) / s.arrowGravity);
      t.ticks = s.bowStageTicks[2];
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
   * 1 ステップ進める。primary: 押している（ゆみを ひく）。eye・dir: 目の位置と向き（長さ 1）
   * ゆみ以外を持っているあいだは引かない。飛んでいる や は持ち物に関係なく進める
   */
  step(primary: boolean, eye: Vec3, dir: Vec3): void {
    const c = this.bowCtx;
    c.item = this.current().kind === 'bow' ? (this.d.inventory.held()?.item ?? null) : null;
    c.pressed = primary && !this.prevPrimary;
    c.held = primary;
    c.eye.x = eye.x;
    c.eye.y = eye.y;
    c.eye.z = eye.z;
    c.dir.x = dir.x;
    c.dir.y = dir.y;
    c.dir.z = dir.z;
    const pos = this.d.player().position;
    c.position.x = pos.x;
    c.position.y = pos.y;
    c.position.z = pos.z;
    this.prevPrimary = primary;
    this.bowSys.update(c);
    this.tickCount++;
  }

  // ---------------------------------------------------------- 窓口用

  /** 飛んでいる や（見た目用。毎ステップ 同じ 入れ物を 書きかえる） */
  arrows(): ArrowView[] {
    const src = this.bowSys.arrows();
    const out: ArrowView[] = [];
    const seen = this.arrowViews;
    for (const a of src) {
      let v = seen.get(a.id);
      if (!v) {
        v = { id: a.id, position: a.position, dir: { x: 0, y: 0, z: 1 }, traveled: 0 };
        seen.set(a.id, v);
      }
      const len = Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) || 1;
      v.dir.x = a.velocity.x / len;
      v.dir.y = a.velocity.y / len;
      v.dir.z = a.velocity.z / len;
      v.traveled = a.age;
      out.push(v);
    }
    if (seen.size > src.length) {
      for (const id of seen.keys()) if (!src.some((a) => a.id === id)) seen.delete(id);
    }
    return out;
  }

  /** 画面と音用（呼ぶと空） */
  drainArrowEvents(): ArrowEvent[] {
    return this.bowSys.drainEvents();
  }

  /** テストの窓口用（呼ぶと空。画面側の列とは別） */
  takeHookEvents(): ArrowEvent[] {
    const out = this.hookQueue;
    this.hookQueue = [];
    return out;
  }
}

/** 妖怪が まだ ない とき の 空の 世界（や は 妖怪に 当たらない） */
const NO_YOKAI = {
  list: () => [],
  raycast: () => null,
  damage: () => {},
  occupies: () => false,
  drainEvents: () => [],
} as unknown as YokaiWorld;

function kindOf(item: ItemId | null, c: ToolConfig): ToolKind {
  if (item === null) return 'hand';
  if (item === 'yumi') return 'bow';
  if (BLADES.has(item) || c.weaponDamage[item] !== undefined) return 'blade';
  // おの・つるはし は 「ほる道具」。くわ は toolPower を 持つが たがやす 道具なので 今までどおり 'other'
  if (item.endsWith('_pickaxe') || item.endsWith('_axe')) return 'pickaxe';
  if (c.toolPower[item] !== undefined && item !== 'kuwa') return 'pickaxe';
  return 'other';
}
