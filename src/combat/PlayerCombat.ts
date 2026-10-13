import type {
  ArmorSlot,
  CombatEvent,
  DamageKind,
  Inventory,
  ItemId,
  ItemStack,
  PlayerCombat,
  PlayerState,
  SpawnPoint,
  Vec3,
  VoxelWorld,
  W2Settings,
  YokaiKind,
  YokaiWorld,
} from '../contracts';
import { createW2Settings } from '../contracts';
import { isBladeItem } from '../tools/blade';
import { DropField, type DropView } from '../drops';
import { createRng, type Rng } from '../world/gen/random';
import {
  BODY_HALF,
  BODY_HEIGHT,
  KNOCKBACK_TICKS,
  fallDamage,
  createCombatConfig,
  type CombatConfig,
} from './config';

const MAX_QUEUE = 256;

/** 防具の窓口（M4。`ArmorSystemImpl` が合う） */
export interface CombatArmorPort {
  /** 妖怪の攻撃を受けた。カットする量（体力の単位）を返す */
  cut(kind?: DamageKind): number;
  equipped(slot: ArmorSlot): ItemId | null;
  /** そうびのマスを空にして中身を返す */
  take(slot: ArmorSlot): ItemId | null;
  resetHits(): void;
}

/** `playerHit` に `blocked`（防具でふせいだ）を足した形。contracts の型より広い */
export type PlayerHitEvent = Extract<CombatEvent, { type: 'playerHit' }> & { blocked?: boolean };

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
  /** 左クリックしたら 妖怪をたたくか（とどく距離内で いちばん手前が妖怪。ヒント用。primaryStep と同じ判定） */
  aimsYokai?(eye: Vec3, dir: Vec3, blockDistance: number | null): boolean;
  /** 同じ判定で、ねらっている妖怪の id（いなければ null。ふちどり用） */
  aimedYokai?(eye: Vec3, dir: Vec3, blockDistance: number | null): number | null;
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
  /** M4: 防具（ふせぐ・やられたとき落とす） */
  armor?: CombatArmorPort;
  /** WEAPON-2: 設定の入れ物（刀の 照準の 距離・たいきゅうの へりかた）。なければ 初期値 */
  settings?: W2Settings;
  /** M4: 拾って入った（自分で作る DropField 用。拾ったログ） */
  onPickup?: (item: ItemId, count: number) => void;
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
  /** 落ちているあいだの いちばん高かった y（地面・水にいるあいだは今の y） */
  private fallPeak = 0;
  private fallPrevY = 0;
  private lastFallDamage = 0;

  private punchTickNow = 0;
  /** いまのパンチを始めたときの値（途中で持ちかえても そのまま） */
  private pDamage = 1;
  private pReach = 3;
  private pTicks = 30;
  /** いまのパンチを始めたときに 持っていた もの（たいきゅうを へらす 先の 見分け用） */
  private pItem: ItemId | null = null;
  private readonly w2: W2Settings;

  readonly drops: DropField;

  private drainQueue: CombatEvent[] = [];
  private hookQueue: CombatEvent[] = [];

  constructor(private readonly d: CombatDeps) {
    this.config = d.config ?? createCombatConfig();
    this.rng = d.rng ?? createRng(31337);
    this.w2 = d.settings ?? createW2Settings();
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
        onPickup: d.onPickup,
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

  damage(amount: number, by: YokaiKind, from: Vec3, kind: DamageKind = 'normal'): boolean {
    return this.hurt(amount, by, from, false, kind);
  }

  /** M7: 体力を もどす（食べもの）。最大をこえない。やられている間は 0。実際に もどった量を返す */
  heal(amount: number): number {
    if (this.isDead || !(amount > 0)) return 0;
    const before = this.hpNow;
    this.hpNow = Math.min(this.config.playerMaxHp, this.hpNow + amount);
    return this.hpNow - before;
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

  /** ハートを全部回復する（レベルアップ）。やられているあいだは何もしない */
  healFull(): void {
    if (this.isDead) return;
    this.hpNow = this.config.playerMaxHp;
    this.emit({ type: 'regen', tick: this.tickCount, hp: this.hpNow });
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

  /** n のダメージを受けたのと同じ（むてき・回復の待ちも同じ。押されはしない）。by を渡すと その妖怪の攻撃として防具を通り、playerHit も出る */
  debugDamage(n: number, by: YokaiKind | null = null): boolean {
    return this.hurt(n, by, null);
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

  aimsYokai(eye: Vec3, dir: Vec3, blockDistance: number | null): boolean {
    return this.aimedYokai(eye, dir, blockDistance) !== null;
  }

  aimedYokai(eye: Vec3, dir: Vec3, blockDistance: number | null): number | null {
    if (this.isDead) return null;
    const tp = this.d.tool?.punchParams();
    // 刀は わざの ふりわけ用に 照準の 線 4.5（WEAPON-2 §2.1 の 6）
    const reach = this.holdingBlade() ? this.w2.bladeAimReach : tp ? tp.reach : this.config.punchReach;
    const maxD = blockDistance === null ? reach : Math.min(blockDistance, reach);
    const hit = this.d.yokai().raycast(eye, dir, maxD);
    return hit && (blockDistance === null || hit.distance < blockDistance) ? hit.id : null;
  }

  primaryStep(primary: boolean, eye: Vec3, dir: Vec3, blockDistance: number | null): boolean {
    if (this.isDead) {
      this.punchTickNow = 0;
      return false;
    }
    const cfg = this.config;
    // 刀を 持っているときは 今の パンチを 使わない（わざは BladeSystem。ふりわけは つなぎ込み）
    if (this.holdingBlade()) {
      this.punchTickNow = 0;
      return false;
    }
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
    this.pItem = this.d.inventory.held()?.item ?? null;
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
      this.wearForPunch();
    } else {
      this.emit({ type: 'punchMiss', tick: this.tickCount });
    }
  }

  private holdingBlade(): boolean {
    return isBladeItem(this.d.inventory.held()?.item);
  }

  /** パンチが 当たった: 先に 効かせた あとで、持っている 道具の たいきゅうを へらす（WEAPON-2 §4.6 (3)） */
  private wearForPunch(): void {
    const it = this.pItem;
    if (!it || this.d.inventory.held()?.item !== it) return;
    const w = this.w2.toolWear;
    let n = 0;
    if (it === 'wood_pickaxe' || it === 'stone_pickaxe' || it === 'iron_pickaxe') n = w.pickaxe.hit;
    else if (it === 'naginata') n = w.blade.hit;
    else if (it === 'kuwa') n = w.kuwa.hit;
    if (n > 0) this.d.inventory.wearHeld?.(n);
  }

  // ---------------------------------------------------------- 毎ステップ

  /** 1 ステップ進める（プレイヤーの更新のあとで呼ぶ） */
  update(): void {
    const cfg = this.config;
    if (this.invincible > 0) this.invincible--;

    if (this.isDead) {
      this.fallPeak = this.d.player.get().position.y;
      this.fallPrevY = this.fallPeak;
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
      this.fallTick();
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

  // ---------------------------------------------------------- 落下ダメージ

  /** 最後に受けた落下ダメージ（テスト用） */
  lastFall(): number {
    return this.lastFallDamage;
  }

  /** 落ちた高さを見て、地面に着いたらダメージ。みず・ジャンプの着地は 0。ノックバックなし・防具でも減らない */
  private fallTick(): void {
    const st = this.d.player.get();
    const y = st.position.y;
    // 1 ステップで大きく動いたら置き直し（復活・テレポート）。落ちる速さは 1 ステップ 0.5 まで
    if (Math.abs(y - this.fallPrevY) > 1.5) this.fallPeak = y;
    this.fallPrevY = y;
    if (st.inWater) {
      this.fallPeak = y;
      return;
    }
    if (!st.onGround) {
      if (y > this.fallPeak) this.fallPeak = y;
      return;
    }
    const h = this.fallPeak - y;
    this.fallPeak = y;
    const dmg = fallDamage(h, this.config.safeFallHeight, this.config.fallDamagePerBlock);
    if (dmg > 0) {
      const before = this.hpNow;
      if (this.hurt(dmg, null, null, true, 'fall')) {
        this.lastFallDamage = before - this.hpNow;
        this.emit({ type: 'fallHurt', tick: this.tickCount, amount: before - this.hpNow });
      }
    }
  }

  // ---------------------------------------------------------- ダメージ・やられる・復活

  private hurt(amount: number, by: YokaiKind | null, from: Vec3 | null, ignoreInvincible = false, kind: DamageKind = 'normal'): boolean {
    if (this.isDead || (this.invincible > 0 && !ignoreInvincible) || !(amount > 0)) return false;
    const cfg = this.config;
    // 防具でふせぐ（M4 §2.7）: 妖怪の攻撃だけ。ふせいだ回も むてき・押されるは ふつうどおり
    // 受けるダメージ = max(体力 1〈ハート半分〉, 元 − カット)。カットが 1 以上ならカキン（blocked）
    const cutBy = by !== null || kind === 'fall' ? (this.d.armor?.cut(kind) ?? 0) : 0;
    const blocked = cutBy >= 1;
    // normal / ball は へらしても最低 1。fall は 0 まで へる（0 ならダメージなし）
    const taken = blocked ? Math.max(kind === 'fall' ? 0 : 1, amount - cutBy) : amount;
    if (!(taken > 0)) return false;
    this.hpNow = Math.max(0, this.hpNow - taken);
    this.sinceDamage = 0;
    this.lastDamageTick = this.tickCount;
    this.invincible = cfg.hurtInvincibleTicks;
    if (by !== null) {
      const ev: PlayerHitEvent = { type: 'playerHit', tick: this.tickCount, by, amount: taken };
      if (blocked) ev.blocked = true;
      this.emit(ev);
    }
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
      if (cfg.knockbackUp > 0 && st.velocity.y < cfg.knockbackUp) this.d.player.set({ velocity: { x: st.velocity.x, y: cfg.knockbackUp, z: st.velocity.z } });
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
    // そうびのマスも 1 マスずつ同じ確率で（M4 §2.7）
    const armor = this.d.armor;
    if (armor) {
      for (const slot of ['head', 'body', 'arms', 'legs'] as const) {
        const it = armor.equipped(slot);
        if (it && this.rng() < this.config.dropChance) {
          armor.take(slot);
          stacks.push({ item: it, count: 1 });
        }
      }
    }
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
    this.d.armor?.resetHits();
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
