import type {
  CombatEvent,
  Inventory,
  ItemStack,
  PlayerCombat,
  PlayerState,
  SpawnPoint,
  Vec3,
  VoxelWorld,
  YokaiKind,
  YokaiWorld,
} from '../contracts';
import { DropField, type DropView } from '../drops';
import { createRng, type Rng } from '../world/gen/random';
import {
  BODY_HALF,
  BODY_HEIGHT,
  KNOCKBACK_TICKS,
  createCombatConfig,
  type CombatConfig,
} from './config';

const MAX_QUEUE = 256;

/** 落ちたアイテム 1 つ（マス 1 つ分。slots は 1 つだけ） */
export type DropBag = DropView;

/** `DigSystem` が `primary` の入口で呼ぶ窓口（M3 §2.6） */
export interface PunchGate {
  /** やられているあいだ true（遊びの入力を無視する） */
  blocksInput(): boolean;
  /**
   * 毎ステップ呼ぶ。パンチを進める。このステップが「パンチ」なら true（ほらない）。
   * blockDistance: 線がブロックにふれる距離（なければ null）
   */
  primaryStep(primary: boolean, eye: Vec3, dir: Vec3, blockDistance: number | null): boolean;
  /** そのマスに妖怪の当たりの箱があるか（ブロックを置けない） */
  placeBlocked(x: number, y: number, z: number): boolean;
}

/** 持っている武器のパンチの値（M4。`ToolSystemImpl` が合う。なければ config の値） */
export interface PunchTool {
  punchParams(): { damage: number; reach: number; ticks: number };
  /** パンチを始めた（人形の振り用） */
  onPunchStart(): void;
}

export interface CombatPlayerPort {
  get(): PlayerState;
  set(v: { position?: Vec3; velocity?: Vec3; yawDeg?: number; pitchDeg?: number }): void;
}

export interface CombatDeps {
  world: VoxelWorld;
  player: CombatPlayerPort;
  inventory: Inventory;
  /** 妖怪（担当 B）。作る順番の都合で、あとから渡せるように関数にする */
  yokai: () => YokaiWorld;
  /** スタート地点（そのとき計算し直す） */
  spawn: () => SpawnPoint;
  /** 持っている武器の強さ・距離・当たるまで（M4） */
  tool?: PunchTool;
  /** もちもの画面が開いていれば閉じる */
  closeInventory?: () => void;
  /** やられたとき・ふくろを拾ったとき・ふくろが消えたとき 保存してほしい */
  requestSave?: () => void;
  config?: CombatConfig;
  /** 落とすマスをきめる乱数（シード付き） */
  rng?: Rng;
  /** 落ちたアイテムの置き場（妖怪のドロップと共通）。なければ自分で作る */
  drops?: DropField;
}

export interface CombatHookState {
  hp: number;
  maxHp: number;
  dead: boolean;
  invincibleTicks: number;
  punching: boolean;
  punchTick: number;
  lastDamageTick: number;
}

/** 体の箱が固いブロックと重ならないか */
function bodyFree(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const eps = 1e-4;
  const x0 = Math.floor(x - BODY_HALF + eps);
  const x1 = Math.floor(x + BODY_HALF - eps);
  const z0 = Math.floor(z - BODY_HALF + eps);
  const z1 = Math.floor(z + BODY_HALF - eps);
  const y0 = Math.floor(y + eps);
  const y1 = Math.floor(y + BODY_HEIGHT - eps);
  for (let yy = y0; yy <= y1; yy++)
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (world.isSolid(xx, yy, zz)) return false;
  return true;
}

/** プレイヤーの戦い・体力・やられる（M3 §2.6〜§2.8・§4.5・§4.6） */
export class PlayerCombatImpl implements PlayerCombat, PunchGate {
  readonly config: CombatConfig;
  private readonly rng: Rng;
  private tickCount = 0;

  private hpNow: number;
  private isDead = false;
  private deadTicks = 0;
  private deathPos: Vec3 = { x: 0, y: 0, z: 0 };
  private invincible = 0;
  private sinceDamage = 0;
  private lastDamageTick = -1;
  private kbTicks = 0;
  private kbX = 0;
  private kbZ = 0;

  private punchTickNow = 0;
  /** いまのパンチを始めたときの値（途中で持ちかえても そのまま） */
  private pDamage = 1;
  private pReach = 3;
  private pTicks = 30;

  readonly drops: DropField;

  private drainQueue: CombatEvent[] = [];
  private hookQueue: CombatEvent[] = [];

  constructor(private readonly d: CombatDeps) {
    this.config = d.config ?? createCombatConfig();
    this.rng = d.rng ?? createRng(31337);
    this.hpNow = this.config.playerMaxHp;
    this.drops =
      d.drops ??
      new DropField({
        world: d.world,
        inventory: d.inventory,
        player: () => d.player.get().position,
        rng: this.rng,
        ticks: this.config.dropBagTicks,
        pickupRadius: this.config.pickupRadius,
        requestSave: d.requestSave,
      });
  }

  // ---------------------------------------------------------- PlayerCombat

  hp(): number {
    return this.hpNow;
  }
  maxHp(): number {
    return this.config.playerMaxHp;
  }
  dead(): boolean {
    return this.isDead;
  }
  invincibleTicks(): number {
    return this.invincible;
  }

  damage(amount: number, by: YokaiKind, from: Vec3): boolean {
    return this.hurt(amount, by, from);
  }

  drainEvents(): CombatEvent[] {
    const out = this.drainQueue;
    this.drainQueue = [];
    return out;
  }

  // ---------------------------------------------------------- テストの窓口用

  takeHookEvents(): CombatEvent[] {
    const out = this.hookQueue;
    this.hookQueue = [];
    return out;
  }

  hookState(): CombatHookState {
    return {
      hp: this.hpNow,
      maxHp: this.config.playerMaxHp,
      dead: this.isDead,
      invincibleTicks: this.invincible,
      punching: this.punchTickNow > 0,
      punchTick: this.punchTickNow,
      lastDamageTick: this.lastDamageTick,
    };
  }

  /** 体力を n にする（0 ならそのステップでやられる） */
  setHp(n: number): void {
    if (this.isDead) return;
    const v = Math.max(0, Math.min(this.config.playerMaxHp, Math.round(n)));
    this.hpNow = v;
    this.sinceDamage = 0;
    this.lastDamageTick = this.tickCount;
    if (v <= 0) this.die();
  }

  /** n のダメージを受けたのと同じ（むてき・回復の待ちも同じ。押されはしない・playerHit は出さない） */
  debugDamage(n: number): boolean {
    return this.hurt(n, null, null);
  }

  bags(): DropBag[] {
    return this.drops.list();
  }

  // ---------------------------------------------------------- パンチ（DigSystem から）

  blocksInput(): boolean {
    return this.isDead;
  }

  placeBlocked(x: number, y: number, z: number): boolean {
    return this.d.yokai().occupies(x, y, z);
  }

  primaryStep(primary: boolean, eye: Vec3, dir: Vec3, blockDistance: number | null): boolean {
    if (this.isDead) {
      this.punchTickNow = 0;
      return false;
    }
    const cfg = this.config;
    if (this.punchTickNow > 0) {
      this.punchTickNow++;
      if (this.punchTickNow >= this.pTicks) {
        this.punchTickNow = 0;
        this.resolvePunch(eye, dir, blockDistance);
      }
      return true;
    }
    if (!primary) return false;
    // とどく距離内で いちばん手前が妖怪ならパンチ（遠い妖怪は無視。ブロックはふつうにほれる）
    const tp = this.d.tool?.punchParams();
    const reach = tp ? tp.reach : cfg.punchReach;
    const maxD = blockDistance === null ? reach : Math.min(blockDistance, reach);
    const hit = this.d.yokai().raycast(eye, dir, maxD);
    if (!hit || (blockDistance !== null && hit.distance >= blockDistance)) return false;
    this.pDamage = tp ? tp.damage : cfg.punchDamage;
    this.pReach = reach;
    this.pTicks = tp ? tp.ticks : cfg.punchTicks;
    this.punchTickNow = 1;
    this.emit({ type: 'punchStart', tick: this.tickCount });
    this.d.tool?.onPunchStart();
    if (this.pTicks <= 1) {
      this.punchTickNow = 0;
      this.resolvePunch(eye, dir, blockDistance);
    }
    return true;
  }

  private resolvePunch(eye: Vec3, dir: Vec3, blockDistance: number | null): void {
    const maxD = blockDistance === null ? this.pReach : Math.min(blockDistance, this.pReach);
    const yw = this.d.yokai();
    const hit = yw.raycast(eye, dir, maxD);
    if (hit && hit.distance <= this.pReach && (blockDistance === null || hit.distance < blockDistance)) {
      this.emit({ type: 'punchHit', tick: this.tickCount, yokaiId: hit.id });
      yw.damage(hit.id, this.pDamage, { ...this.d.player.get().position });
    } else {
      this.emit({ type: 'punchMiss', tick: this.tickCount });
    }
  }

  // ---------------------------------------------------------- 毎ステップ

  /** 1 ステップ進める（プレイヤーの更新のあとで呼ぶ） */
  update(): void {
    const cfg = this.config;
    if (this.invincible > 0) this.invincible--;

    if (this.isDead) {
      this.deadTicks++;
      if (this.deadTicks >= cfg.respawnDelayTicks) {
        this.respawn();
      } else {
        // やられた画面のあいだは その場でころんと動かない
        this.d.player.set({ position: { ...this.deathPos }, velocity: { x: 0, y: 0, z: 0 } });
      }
    } else {
      // 押される
      if (this.kbTicks > 0) {
        this.kbTicks--;
        this.shove(this.kbX, this.kbZ);
      }
      // 自然回復
      this.sinceDamage++;
      if (
        this.hpNow < cfg.playerMaxHp &&
        this.sinceDamage >= cfg.regenDelayTicks + cfg.regenIntervalTicks &&
        (this.sinceDamage - cfg.regenDelayTicks) % cfg.regenIntervalTicks === 0
      ) {
        this.hpNow = Math.min(cfg.playerMaxHp, this.hpNow + 1);
        this.emit({ type: 'regen', tick: this.tickCount, hp: this.hpNow });
      }
    }

    for (const id of this.drops.update(!this.isDead)) this.emit({ type: 'pickup', tick: this.tickCount, bagId: id });
    this.tickCount++;
  }

  // ---------------------------------------------------------- ダメージ・やられる・復活

  private hurt(amount: number, by: YokaiKind | null, from: Vec3 | null): boolean {
    if (this.isDead || this.invincible > 0 || !(amount > 0)) return false;
    const cfg = this.config;
    this.hpNow = Math.max(0, this.hpNow - amount);
    this.invincible = cfg.hurtInvincibleTicks;
    this.sinceDamage = 0;
    this.lastDamageTick = this.tickCount;
    if (by !== null) this.emit({ type: 'playerHit', tick: this.tickCount, by, amount });
    if (from) {
      const st = this.d.player.get();
      let dx = st.position.x - from.x;
      let dz = st.position.z - from.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) {
        // 真上・真下: プレイヤーの向きと反対へ
        const yaw = (st.yawDeg * Math.PI) / 180;
        dx = -Math.sin(yaw);
        dz = Math.cos(yaw);
      } else {
        dx /= len;
        dz /= len;
      }
      this.kbTicks = KNOCKBACK_TICKS;
      this.kbX = (dx * cfg.knockback) / KNOCKBACK_TICKS;
      this.kbZ = (dz * cfg.knockback) / KNOCKBACK_TICKS;
    }
    if (this.hpNow <= 0) this.die();
    return true;
  }

  private shove(dx: number, dz: number): void {
    const p = this.d.player.get().position;
    let x = p.x;
    let z = p.z;
    if (bodyFree(this.d.world, x + dx, p.y, z)) x += dx;
    if (bodyFree(this.d.world, x, p.y, z + dz)) z += dz;
    if (x !== p.x || z !== p.z) this.d.player.set({ position: { x, y: p.y, z } });
  }

  private die(): void {
    this.isDead = true;
    this.deadTicks = 0;
    this.hpNow = 0;
    this.punchTickNow = 0;
    this.kbTicks = 0;
    this.d.closeInventory?.();
    this.d.inventory.returnCursor();
    const pos = this.d.player.get().position;
    this.deathPos = { x: pos.x, y: pos.y, z: pos.z };

    // 持ち物を落とす（えらんでいるマス以外。マスごとに dropChance）
    const inv = this.d.inventory;
    const sel = inv.selected();
    const dropped: number[] = [];
    const stacks: ItemStack[] = [];
    const slots = inv.slots();
    for (let i = 0; i < inv.size; i++) {
      const s = slots[i];
      if (i === sel || !s) continue;
      if (this.rng() < this.config.dropChance) {
        dropped.push(i);
        stacks.push({ item: s.item, count: s.count });
      }
    }
    for (const i of dropped) inv.setSlot(i, null);
    // マスごとに 1 つの「落ちたアイテム」にして、まわりにばらまく
    this.drops.scatter(this.deathPos, stacks, { kind: 'death' });
    this.emit({ type: 'death', tick: this.tickCount, dropped });
    this.d.requestSave?.();
  }

  private respawn(): void {
    const s = this.d.spawn();
    this.d.player.set({
      position: { x: s.x, y: s.y, z: s.z },
      velocity: { x: 0, y: 0, z: 0 },
      yawDeg: s.yawDeg,
      pitchDeg: s.pitchDeg,
    });
    this.isDead = false;
    this.deadTicks = 0;
    this.hpNow = this.config.playerMaxHp;
    this.invincible = this.config.respawnInvincibleTicks;
    this.sinceDamage = 0;
    this.emit({ type: 'respawn', tick: this.tickCount });
  }

  /** 保存用（M3 §2.10）。アイテムごと */
  serializeBags() {
    return this.drops.serialize();
  }

  /** 読みこみ用。おかしい分・古い形は捨てる */
  deserializeBags(data: unknown): void {
    this.drops.deserialize(data);
  }

  private emit(e: CombatEvent): void {
    this.drainQueue.push(e);
    this.hookQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
  }
}
