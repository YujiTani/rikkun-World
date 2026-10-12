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
import { itemType } from '../inventory/items';
import { createRng, type Rng } from '../world/gen/random';
import {
  BAG_PICKUP_HEIGHT,
  BODY_HALF,
  BODY_HEIGHT,
  ITEM_FLOAT_SPEED,
  ITEM_GRAVITY,
  SCATTER_SPEED_MAX,
  SCATTER_SPEED_MIN,
  SCATTER_UP_MAX,
  SCATTER_UP_MIN,
  KNOCKBACK_TICKS,
  createCombatConfig,
  type CombatConfig,
} from './config';

const MAX_QUEUE = 256;
const MAX_BAGS = 400;
const DT = 1 / 60;

/** 落ちたアイテム 1 つ（マス 1 つ分。slots は 1 つだけ） */
export interface DropBag {
  id: number;
  position: Vec3;
  slots: ItemStack[];
  ticksLeft: number;
}

interface DropItem {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  resting: boolean;
  item: ItemStack;
  ticksLeft: number;
}

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
  /** もちもの画面が開いていれば閉じる */
  closeInventory?: () => void;
  /** やられたとき・ふくろを拾ったとき・ふくろが消えたとき 保存してほしい */
  requestSave?: () => void;
  config?: CombatConfig;
  /** 落とすマスをきめる乱数（シード付き） */
  rng?: Rng;
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

  private bagList: DropItem[] = [];
  private nextBagId = 1;

  private drainQueue: CombatEvent[] = [];
  private hookQueue: CombatEvent[] = [];

  constructor(private readonly d: CombatDeps) {
    this.config = d.config ?? createCombatConfig();
    this.rng = d.rng ?? createRng(31337);
    this.hpNow = this.config.playerMaxHp;
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
    return this.bagList.map((b) => ({
      id: b.id,
      position: { x: b.x, y: b.y, z: b.z },
      slots: [{ item: b.item.item, count: b.item.count }],
      ticksLeft: b.ticksLeft,
    }));
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
      if (this.punchTickNow >= cfg.punchTicks) {
        this.punchTickNow = 0;
        this.resolvePunch(eye, dir, blockDistance);
      }
      return true;
    }
    if (!primary) return false;
    // とどく距離内で いちばん手前が妖怪ならパンチ（遠い妖怪は無視。ブロックはふつうにほれる）
    const maxD = blockDistance === null ? cfg.punchReach : Math.min(blockDistance, cfg.punchReach);
    const hit = this.d.yokai().raycast(eye, dir, maxD);
    if (!hit || (blockDistance !== null && hit.distance >= blockDistance)) return false;
    this.punchTickNow = 1;
    this.emit({ type: 'punchStart', tick: this.tickCount });
    if (cfg.punchTicks <= 1) {
      this.punchTickNow = 0;
      this.resolvePunch(eye, dir, blockDistance);
    }
    return true;
  }

  private resolvePunch(eye: Vec3, dir: Vec3, blockDistance: number | null): void {
    const cfg = this.config;
    const maxD = blockDistance === null ? cfg.punchReach : Math.min(blockDistance, cfg.punchReach);
    const yw = this.d.yokai();
    const hit = yw.raycast(eye, dir, maxD);
    if (hit && hit.distance <= cfg.punchReach && (blockDistance === null || hit.distance < blockDistance)) {
      this.emit({ type: 'punchHit', tick: this.tickCount, yokaiId: hit.id });
      yw.damage(hit.id, cfg.punchDamage, { ...this.d.player.get().position });
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

    this.updateBags();
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
    for (const st of stacks) {
      const ang = this.rng() * Math.PI * 2;
      const sp = SCATTER_SPEED_MIN + this.rng() * (SCATTER_SPEED_MAX - SCATTER_SPEED_MIN);
      this.bagList.push({
        id: this.nextBagId++,
        x: this.deathPos.x,
        y: this.deathPos.y + 0.5,
        z: this.deathPos.z,
        vx: Math.cos(ang) * sp,
        vy: SCATTER_UP_MIN + this.rng() * (SCATTER_UP_MAX - SCATTER_UP_MIN),
        vz: Math.sin(ang) * sp,
        resting: false,
        item: st,
        ticksLeft: this.config.dropBagTicks,
      });
      if (this.bagList.length > MAX_BAGS) this.bagList.shift();
    }
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

  // ---------------------------------------------------------- 落ちたアイテム

  /** 水面の高さ（x,z の水の柱の、いちばん上の水の上の面） */
  private waterSurface(x: number, y: number, z: number): number {
    const w = this.d.world;
    let yy = y;
    while (yy < w.size.y && w.getBlock(x, yy, z) === 'water') yy++;
    return yy;
  }

  private stepItem(b: DropItem): void {
    const w = this.d.world;
    const fx = Math.floor(b.x);
    const fz = Math.floor(b.z);
    if (b.resting) {
      // 足もとが消えたら また落ちる（水にうかんでいるものは水がなくなったら）
      const below = w.getBlock(fx, Math.floor(b.y - 1e-3), fz);
      const supported = w.isSolid(fx, Math.floor(b.y - 1e-3), fz) || below === 'outside';
      const floating = below === 'water';
      if (supported || floating) return;
      b.resting = false;
    }
    const inWater = w.getBlock(fx, Math.floor(b.y), fz) === 'water';
    if (inWater) {
      // 水面までうかんで止まる
      const top = this.waterSurface(fx, Math.floor(b.y), fz);
      b.vx *= 0.9;
      b.vz *= 0.9;
      b.vy = 0;
      b.y = Math.min(top, b.y + ITEM_FLOAT_SPEED * DT);
      this.moveXZ(b, DT);
      if (b.y >= top) {
        b.y = top;
        b.vx = b.vz = 0;
        b.resting = true;
      }
      return;
    }
    b.vy -= ITEM_GRAVITY * DT;
    this.moveXZ(b, DT);
    const ny = b.y + b.vy * DT;
    const cx = Math.floor(b.x);
    const cz = Math.floor(b.z);
    if (b.vy <= 0 && w.isSolid(cx, Math.floor(ny), cz)) {
      b.y = Math.floor(ny) + 1;
      b.vx = b.vy = b.vz = 0;
      b.resting = true;
    } else if (b.vy > 0 && w.isSolid(cx, Math.floor(ny + 0.3), cz)) {
      b.vy = 0; // 天井
    } else {
      b.y = Math.max(0, ny);
      if (b.y <= 0) {
        b.vx = b.vy = b.vz = 0;
        b.resting = true;
      }
    }
  }

  /** 横に動く。固いブロックにぶつかったらその向きは止める */
  private moveXZ(b: DropItem, dt: number): void {
    const w = this.d.world;
    const nx = b.x + b.vx * dt;
    const nz = b.z + b.vz * dt;
    const fy = Math.floor(b.y + 0.2);
    if (w.isSolid(Math.floor(nx), fy, Math.floor(b.z))) b.vx = 0;
    else b.x = nx;
    if (w.isSolid(Math.floor(b.x), fy, Math.floor(nz))) b.vz = 0;
    else b.z = nz;
  }

  private updateBags(): void {
    if (this.bagList.length === 0) return;
    const p = this.d.player.get().position;
    const r = this.config.pickupRadius;
    let changed = false;
    for (const b of this.bagList) {
      b.ticksLeft--;
      if (b.ticksLeft <= 0) {
        changed = true;
        continue;
      }
      this.stepItem(b);
      if (this.isDead) continue;
      if (Math.hypot(p.x - b.x, p.z - b.z) <= r && Math.abs(p.y - b.y) <= BAG_PICKUP_HEIGHT) {
        const left = this.d.inventory.add(b.item.item, b.item.count);
        if (left !== b.item.count) {
          b.item = { item: b.item.item, count: left };
          this.emit({ type: 'pickup', tick: this.tickCount, bagId: b.id });
          changed = true;
        }
      }
    }
    const before = this.bagList.length;
    this.bagList = this.bagList.filter((b) => b.ticksLeft > 0 && b.item.count > 0);
    if (changed || this.bagList.length !== before) this.d.requestSave?.();
  }

  /** 保存用（M3 §2.10）。アイテムごと */
  serializeBags(): Array<{ x: number; y: number; z: number; item: string; count: number; ticksLeft: number }> {
    return this.bagList.map((b) => ({
      x: b.x,
      y: b.y,
      z: b.z,
      item: b.item.item,
      count: b.item.count,
      ticksLeft: b.ticksLeft,
    }));
  }

  /** 読みこみ用。おかしい分・古い形（ふくろ）は捨てる（こわれた保存でも遊べる） */
  deserializeBags(data: unknown): void {
    const out: DropItem[] = [];
    if (Array.isArray(data)) {
      for (const raw of data.slice(0, MAX_BAGS)) {
        const r = raw as Record<string, unknown> | null;
        if (!r || typeof r.item !== 'string') continue;
        const x = Number(r.x);
        const y = Number(r.y);
        const z = Number(r.z);
        const t = Number(r.ticksLeft);
        if (![x, y, z, t].every(Number.isFinite) || t < 1) continue;
        const ty = itemType(r.item);
        const c = r.count;
        if (!ty || typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > ty.maxStack) continue;
        out.push({
          id: this.nextBagId++,
          x,
          y,
          z,
          vx: 0,
          vy: 0,
          vz: 0,
          resting: false,
          item: { item: ty.id, count: c },
          ticksLeft: Math.min(Math.floor(t), this.config.dropBagTicks),
        });
      }
    }
    this.bagList = out;
  }

  private emit(e: CombatEvent): void {
    this.drainQueue.push(e);
    this.hookQueue.push(e);
    if (this.drainQueue.length > MAX_QUEUE) this.drainQueue.shift();
    if (this.hookQueue.length > MAX_QUEUE) this.hookQueue.shift();
  }
}
