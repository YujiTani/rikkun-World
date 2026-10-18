import type {
  AnimalApi,
  AnimalDeps,
  AnimalEvent,
  AnimalHintKind,
  AnimalInfo,
  AnimalSpawnOpts,
  AnimalState,
  AnimalView,
  ItemId,
  ItemStack,
  LiveSettings,
  Vec3,
  VoxelWorld,
} from '../contracts';
import { createLiveSettings } from '../contracts';
import { createRng, type Rng } from '../world/gen/random';
import { bodyInWall } from '../world/wall';
import { BODY, bodyFree, columnTop, supportTop, surfaceY, type AnimalWorld } from './terrain';

const DT = 1 / 60;
const TAU = Math.PI * 2;
/** 妖怪 とは べつ の 乱数 の 流れ（シード に まぜる 数） */
const RNG_SALT = 0x11fe0001;
const VEGGIES: ReadonlySet<string> = new Set(['onion', 'tomato', 'pumpkin', 'eggplant']);
const FRIEND_MIN_GAP = 0.5;
const APPEAR_TICKS = 30;
const EVENT_CAP = 512;
const FALL_G = 25;

type LockKind = 'appear' | 'eat' | 'pet' | 'cheer';

interface Ent {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  headYaw: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  eggDay: number | null;
  state: AnimalState;
  stateTicks: number;
  look: boolean;
  inWater: boolean;
  vy: number;
  /** うごき の ロック（のこり ステップ）と 種類 */
  lock: number;
  lockKind: LockKind;
  /** ロック の おわりに たまご を おとす（ロック の 後半 30 は 'lay'） */
  egg: boolean;
  /** ロック の おわりに なかま に なる（3 つ目 の やさい） */
  becomeFriend: boolean;
  walking: boolean;
  walkLeft: number;
  restLeft: number;
  walkYaw: number;
  blocked: number;
  following: boolean;
  bestDist: number;
  stuck: number;
  warpWait: number;
}

export interface AnimalManagerOptions {
  world: VoxelWorld | AnimalWorld;
  deps: AnimalDeps;
  /** 足もと の 中央 */
  getPlayer: () => { position: Vec3 };
}

const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const round2 = (n: number) => Math.round(n * 100) / 100;

function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 0 = 北(-Z)・時計まわり（妖怪 と 同じ） */
const yawTo = (dx: number, dz: number) => Math.atan2(dx, -dz);

/**
 * LIVE-1 A: にわとり の しくみ（出る・うろうろ・見る・ついてくる・ワープ・なかよし・たまご・保存）。
 * 見た目・音・ふりわけ は 持たない。`AnimalApi`（rayHit・preview・feed・pet・forEachVisible）と `SaveExtra` を 実装。
 */
export class AnimalManager implements AnimalApi {
  readonly settings: LiveSettings;
  private readonly world: AnimalWorld;
  private readonly d: AnimalDeps;
  private readonly getPlayer: () => { position: Vec3 };
  private readonly rng: Rng;
  private readonly ents: Ent[] = [];
  private queue: AnimalEvent[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private hint: AnimalHintKind | null = null;
  private targetId: number | null = null;
  private readonly view: AnimalView = {
    id: 0, x: 0, y: 0, z: 0, yaw: 0, headYaw: 0, state: 'idle', stateTicks: 0, friend: false, hearts: 0, targeted: false,
  };

  constructor(o: AnimalManagerOptions) {
    this.world = o.world;
    this.d = o.deps;
    this.settings = o.deps.settings ?? createLiveSettings();
    this.getPlayer = o.getPlayer;
    this.rng = createRng((o.deps.seed ^ RNG_SALT) >>> 0);
  }

  // ------------------------------------------------------------ 窓口(テスト・つなぎ込み)

  spawn(x: number, y: number, z: number, opts: AnimalSpawnOpts = {}): number | null {
    const friend = opts.friend === true;
    if (friend && this.friendCount() >= this.settings.animalFriendMax) return null;
    const e = this.make(x, y, z, friend, friend ? 0 : (opts.hearts ?? 0), opts.eggDay ?? null);
    this.ents.push(e);
    this.push({ type: 'spawn', id: e.id, x, y, z });
    return e.id;
  }

  list(): AnimalInfo[] {
    const p = this.getPlayer().position;
    return this.ents.map((e) => ({
      id: e.id,
      kind: 'chicken' as const,
      x: e.x,
      y: e.y,
      z: e.z,
      yaw: e.yaw,
      friend: e.friend,
      hearts: e.hearts,
      eggDay: e.eggDay,
      state: e.state,
      lookingAtPlayer: this.lookingAt(e, p),
      inWater: e.inWater,
    }));
  }

  clear(): void {
    this.ents.length = 0;
    this.targetId = null;
  }

  count(): number {
    return this.ents.length;
  }

  friendCount(): number {
    let n = 0;
    for (const e of this.ents) if (e.friend) n++;
    return n;
  }

  /** 前 に 呼んでから の 出来事（呼ぶと 空） */
  events(): AnimalEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  lastHint(): AnimalHintKind | null {
    return this.hint;
  }

  /** 今 ねらわれている にわとり（しるし を 出す。つなぎ込みが 毎ステップ 入れる） */
  setTargeted(id: number | null): void {
    this.targetId = id;
  }

  /** 出す の を 1 回 ためす（§2.1）。出た id か null */
  trySpawn(): number | null {
    const s = this.settings;
    if (this.d.phase() !== 'day') return null;
    const p = this.getPlayer().position;
    let wild = 0;
    for (const e of this.ents) if (!e.friend && dist2d(e.x, e.z, p.x, p.z) <= s.animalRemoveDist) wild++;
    if (wild >= s.animalWildMax) return null;
    for (let i = 0; i < 20; i++) {
      const ang = this.rng() * TAU;
      const r = s.animalSpawnMinDist + this.rng() * (s.animalSpawnMaxDist - s.animalSpawnMinDist);
      const ix = Math.floor(p.x + Math.cos(ang) * r);
      const iz = Math.floor(p.z + Math.sin(ang) * r);
      const cx = ix + 0.5;
      const cz = iz + 0.5;
      const dd = dist2d(cx, cz, p.x, p.z);
      if (dd < s.animalSpawnMinDist || dd > s.animalSpawnMaxDist) continue;
      if (!this.world.isLoaded(ix, iz) || !bodyInWall(cx, cz, BODY.radius, 1)) continue;
      const k = this.d.countryAt(this.d.seed, cx, cz).kind;
      if (k !== 'harappa' && k !== 'hana') continue;
      const sy = surfaceY(this.world, ix, iz);
      if (sy === null || this.world.getBlock(ix, sy, iz) !== 'grass') continue;
      if (this.clear2(ix, sy + 1, iz) === false) continue;
      const e = this.make(cx, sy + 1, cz, false, 0, null);
      e.lock = APPEAR_TICKS;
      e.lockKind = 'appear';
      e.state = 'appear';
      this.ents.push(e);
      this.push({ type: 'spawn', id: e.id, x: cx, y: sy + 1, z: cz });
      return e.id;
    }
    return null;
  }

  // ------------------------------------------------------------ AnimalApi

  rayHit(origin: Vec3, dir: Vec3, maxDist: number): { id: number; distance: number } | null {
    let best: { id: number; distance: number } | null = null;
    const hw = 0.4;
    for (const e of this.ents) {
      if (e.state === 'appear') continue;
      let t0 = 0;
      let t1 = maxDist;
      const lo = [e.x - hw, e.y, e.z - hw];
      const hi = [e.x + hw, e.y + 1.0, e.z + hw];
      const o = [origin.x, origin.y, origin.z];
      const dv = [dir.x, dir.y, dir.z];
      let ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        if (Math.abs(dv[a]!) < 1e-9) {
          if (o[a]! < lo[a]! || o[a]! > hi[a]!) ok = false;
        } else {
          let ta = (lo[a]! - o[a]!) / dv[a]!;
          let tb = (hi[a]! - o[a]!) / dv[a]!;
          if (ta > tb) [ta, tb] = [tb, ta];
          if (ta > t0) t0 = ta;
          if (tb < t1) t1 = tb;
          if (t0 > t1) ok = false;
        }
      }
      if (ok && t0 <= maxDist && (best === null || t0 < best.distance)) best = { id: e.id, distance: t0 };
    }
    return best;
  }

  preview(id: number, held: ItemStack | null): 'feed' | 'animalPet' | null {
    const e = this.find(id);
    if (!e || e.lock > 0) return null;
    if (held && VEGGIES.has(held.item)) {
      if (e.friend && !this.eggDue(e)) return 'animalPet';
      return 'feed';
    }
    return 'animalPet';
  }

  feed(id: number, item: ItemId): 'ate' | 'pet' | 'full' | null {
    const e = this.find(id);
    if (!e || e.lock > 0 || !VEGGIES.has(item)) return null;
    const s = this.settings;
    if (e.friend) {
      if (!this.eggDue(e)) {
        this.petFriend(e);
        return 'pet';
      }
      this.push({ type: 'feed', id, item, hearts: 0, friend: true });
      this.startEgg(e, 'eat');
      return 'ate';
    }
    if (e.hearts >= 2) {
      if (this.friendCount() >= s.animalFriendMax) {
        this.hintOut('friendFull');
        return 'full';
      }
      e.becomeFriend = true;
      this.push({ type: 'feed', id, item, hearts: 3, friend: false });
    } else {
      e.hearts = (e.hearts + 1) as 1 | 2;
      this.push({ type: 'feed', id, item, hearts: e.hearts, friend: false });
    }
    this.setLock(e, 'eat', s.animalReactTicks);
    return 'ate';
  }

  pet(id: number): 'wild' | 'friend' | null {
    const e = this.find(id);
    if (!e || e.lock > 0) return null;
    if (!e.friend) {
      this.push({ type: 'pet', id, friend: false });
      this.hintOut('feedHint');
      this.setLock(e, 'pet', this.settings.animalReactTicks);
      return 'wild';
    }
    this.petFriend(e);
    return 'friend';
  }

  forEachVisible(fn: (v: AnimalView) => void): void {
    const v = this.view;
    for (const e of this.ents) {
      v.id = e.id;
      v.x = e.x;
      v.y = e.y;
      v.z = e.z;
      v.yaw = e.yaw;
      v.headYaw = e.headYaw;
      v.state = e.state;
      v.stateTicks = e.stateTicks;
      v.friend = e.friend;
      v.hearts = e.hearts;
      v.targeted = e.id === this.targetId;
      fn(v);
    }
  }

  // ------------------------------------------------------------ 保存(SaveExtra)

  serialize(): { v: 1; friends: { x: number; y: number; z: number; yaw: number; eggDay: number | null }[] } {
    const friends: { x: number; y: number; z: number; yaw: number; eggDay: number | null }[] = [];
    for (const e of this.ents) {
      if (!e.friend) continue;
      friends.push({ x: round2(e.x), y: round2(e.y), z: round2(e.z), yaw: round2(e.yaw), eggDay: e.eggDay });
    }
    return { v: 1, friends };
  }

  deserialize(data: unknown): void {
    this.clear();
    const rows = (data as { friends?: unknown } | null | undefined)?.friends;
    if (typeof data !== 'object' || data === null || !Array.isArray(rows)) return;
    const today = this.d.day();
    for (const r of rows) {
      if (this.friendCount() >= this.settings.animalFriendMax) break;
      if (typeof r !== 'object' || r === null) continue;
      const o = r as Record<string, unknown>;
      const x = o.x;
      const y = o.y;
      const z = o.z;
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const yaw = typeof o.yaw === 'number' && Number.isFinite(o.yaw) ? o.yaw : 0;
      let eggDay: number | null = typeof o.eggDay === 'number' && Number.isInteger(o.eggDay) ? o.eggDay : null;
      if (eggDay !== null && eggDay > today) eggDay = today;
      const e = this.make(x, y, z, true, 0, eggDay);
      e.yaw = yaw;
      e.headYaw = yaw;
      this.ents.push(e);
    }
  }

  // ------------------------------------------------------------ 1 ステップ

  update(): void {
    const s = this.settings;
    if (s.animalAutoSpawn) {
      this.spawnTimer++;
      if (this.spawnTimer >= s.animalSpawnInterval) {
        this.spawnTimer = 0;
        this.trySpawn();
      }
    }
    const p = this.getPlayer().position;
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i]!;
      if (!this.step(e, p)) this.ents.splice(i, 1);
    }
    // かさならない: すわっている なかま を はなす
    for (const e of this.ents) if (e.friend && !e.following && e.lock === 0) this.separate(e);
  }

  // ------------------------------------------------------------ 内部

  private make(x: number, y: number, z: number, friend: boolean, hearts: 0 | 1 | 2, eggDay: number | null): Ent {
    const yaw = this.rng() * TAU - Math.PI;
    return {
      id: this.nextId++,
      x,
      y,
      z,
      yaw,
      headYaw: yaw,
      friend,
      hearts,
      eggDay,
      state: friend ? 'idle' : 'rest',
      stateTicks: 0,
      look: false,
      inWater: false,
      vy: 0,
      lock: 0,
      lockKind: 'eat',
      egg: false,
      becomeFriend: false,
      walking: false,
      walkLeft: 0,
      restLeft: 20 + Math.floor(this.rng() * 40),
      walkYaw: yaw,
      blocked: 0,
      following: false,
      bestDist: Infinity,
      stuck: 0,
      warpWait: 0,
    };
  }

  private find(id: number): Ent | undefined {
    for (const e of this.ents) if (e.id === id) return e;
    return undefined;
  }

  private push(ev: AnimalEvent): void {
    this.queue.push(ev);
    if (this.queue.length > EVENT_CAP) this.queue.splice(0, this.queue.length - EVENT_CAP);
  }

  private hintOut(h: AnimalHintKind): void {
    this.hint = h;
    this.push({ type: 'hint', hint: h });
  }

  private setLock(e: Ent, kind: LockKind, ticks: number): void {
    e.lock = ticks;
    e.lockKind = kind;
    this.setState(e, this.lockState(e));
  }

  private setState(e: Ent, st: AnimalState): void {
    if (e.state !== st) {
      e.state = st;
      e.stateTicks = 0;
    }
  }

  private lockState(e: Ent): AnimalState {
    if (e.lockKind === 'appear') return 'appear';
    if (e.egg && e.lock <= 30) return 'lay';
    return e.lockKind;
  }

  private eggDue(e: Ent): boolean {
    return e.eggDay === null || e.eggDay < this.d.day();
  }

  private petFriend(e: Ent): void {
    this.push({ type: 'pet', id: e.id, friend: true });
    if (this.eggDue(e)) {
      this.startEgg(e, 'pet');
    } else {
      this.hintOut('eggLater');
      this.setLock(e, 'pet', this.settings.animalReactTicks);
    }
  }

  private startEgg(e: Ent, kind: 'eat' | 'pet'): void {
    e.eggDay = this.d.day();
    e.egg = true;
    this.setLock(e, kind, this.settings.animalEggDelay);
  }

  private lookingAt(e: Ent, p: Vec3): boolean {
    if (e.lock > 0 || e.state === 'appear') return false;
    return (e.friend ? e.state === 'idle' : e.look) && dist2d(e.x, e.z, p.x, p.z) <= this.settings.animalLookDist;
  }

  /** (ix, y, iz) に 立てる(上 2 マス くうき・みず でない) */
  private clear2(ix: number, y: number, iz: number): boolean {
    const w = this.world;
    for (let k = 0; k < 2; k++) {
      if (w.isSolid(ix, y + k, iz) || w.getBlock(ix, y + k, iz) === 'water') return false;
    }
    return true;
  }

  /** 1 ステップ ぶん。消えた なら false */
  private step(e: Ent, p: Vec3): boolean {
    const s = this.settings;
    e.stateTicks++;
    const d = dist2d(e.x, e.z, p.x, p.z);

    if (!e.friend) {
      if (d > s.animalRemoveDist) return this.remove(e, 'far');
      if (e.y < -10) return this.remove(e, 'void');
    }
    const loaded = this.world.isLoaded(Math.floor(e.x), Math.floor(e.z));
    if (!loaded) {
      if (e.friend) this.friendWarpChecks(e, p, d, true);
      return true;
    }
    // うまった
    if (this.world.isSolid(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z))) {
      if (!this.unbury(e)) {
        if (!e.friend) return this.remove(e, 'buried');
        if (this.warp(e, p)) return true;
        e.warpWait = 60;
      }
    }
    if (e.friend && this.friendWarpChecks(e, p, d, false)) return true;

    if (e.lock > 0) {
      e.lock--;
      if (e.lock === 0) this.finishLock(e);
      else this.setState(e, this.lockState(e));
    }
    if (e.lock === 0) this.behave(e, p, d);

    this.settle(e);
    this.turn(e, p, d);
    return true;
  }

  private remove(e: Ent, reason: 'far' | 'void' | 'buried'): false {
    this.push({ type: 'remove', id: e.id, reason });
    return false;
  }

  private finishLock(e: Ent): void {
    if (e.egg) {
      e.egg = false;
      this.d.dropEgg({ x: e.x, y: e.y + 0.3, z: e.z });
      this.push({ type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z });
    }
    if (e.becomeFriend && this.friendCount() < this.settings.animalFriendMax) {
      e.becomeFriend = false;
      e.friend = true;
      e.hearts = 0;
      e.eggDay = null;
      e.following = false;
      const count = this.friendCount();
      const first = count === 1;
      this.push({ type: 'friend', id: e.id, first, count });
      this.setLock(e, 'cheer', first ? 40 : 20);
      return;
    }
    e.becomeFriend = false;
    this.setState(e, e.friend ? 'idle' : 'rest');
  }

  private behave(e: Ent, p: Vec3, d: number): void {
    const s = this.settings;
    if (e.friend) {
      this.follow(e, p, d);
      return;
    }
    // やせい
    e.look = d <= s.animalLookDist;
    if (e.look) {
      this.setState(e, 'look');
      return;
    }
    if (e.walking) {
      this.setState(e, 'wander');
      const ok = angleDiff(e.yaw, e.walkYaw) < 0.8 && angleDiff(e.yaw, e.walkYaw) > -0.8;
      if (ok) {
        const v = s.animalWanderSpeed * DT;
        if (!this.tryMove(e, Math.sin(e.walkYaw) * v, -Math.cos(e.walkYaw) * v, BODY.wanderDrop, false)) {
          e.walkYaw = this.rng() * TAU - Math.PI;
          if (++e.blocked >= 3) this.startRest(e);
        } else {
          e.blocked = 0;
        }
      }
      if (--e.walkLeft <= 0) this.startRest(e);
    } else {
      this.setState(e, 'rest');
      if (--e.restLeft <= 0) {
        e.walking = true;
        e.walkLeft = 120 + Math.floor(this.rng() * 181);
        e.walkYaw = this.rng() * TAU - Math.PI;
        e.blocked = 0;
      }
    }
  }

  private startRest(e: Ent): void {
    e.walking = false;
    e.restLeft = 120 + Math.floor(this.rng() * 121);
    e.blocked = 0;
  }

  private follow(e: Ent, p: Vec3, d: number): void {
    const s = this.settings;
    if (!e.following && d > s.animalFollowStart) {
      e.following = true;
      e.bestDist = d;
      e.stuck = 0;
    } else if (e.following && d <= s.animalFollowStop) {
      e.following = false;
    }
    if (!e.following) {
      this.setState(e, 'idle');
      e.bestDist = Infinity;
      e.stuck = 0;
      return;
    }
    this.setState(e, 'follow');
    if (d < e.bestDist - 0.5) {
      e.bestDist = d;
      e.stuck = 0;
    } else if (d > s.animalFollowStart) {
      e.stuck++;
    }
    const base = yawTo(p.x - e.x, p.z - e.z);
    let v = s.animalFollowSpeed * DT * (e.inWater ? 0.5 : 1);
    v = Math.min(v, Math.max(0, d - 0.05));
    e.walkYaw = base;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = base + off;
      if (this.tryMove(e, Math.sin(a) * v, -Math.cos(a) * v, this.world.size.y, true)) return;
    }
  }

  /** ワープ の 条件(§2.6)。ワープ した なら true */
  private friendWarpChecks(e: Ent, p: Vec3, d: number, frozen: boolean): boolean {
    const s = this.settings;
    if (e.warpWait > 0) e.warpWait--;
    if (e.lockKind === 'appear' && e.lock > 0) return false;
    const far = d > s.animalWarpDist || Math.abs(e.y - p.y) > 6 || e.y < -10;
    const stuck = !frozen && e.following && e.stuck >= s.animalStuckTicks;
    if (!far && !stuck) return false;
    if (e.warpWait > 0) return false;
    if (this.warp(e, p)) return true;
    e.warpWait = 60;
    return false;
  }

  private warp(e: Ent, p: Vec3): boolean {
    const w = this.world;
    const others = this.ents.filter((o) => o !== e && o.friend);
    for (let i = 0; i < 40; i++) {
      const ang = this.rng() * TAU;
      const r = 2 + this.rng();
      const x = p.x + Math.cos(ang) * r;
      const z = p.z + Math.sin(ang) * r;
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      if (!w.isLoaded(ix, iz) || !bodyInWall(x, z, BODY.radius, 0.5)) continue;
      if (i < 30 && others.some((o) => dist2d(o.x, o.z, x, z) < FRIEND_MIN_GAP + 0.05)) continue;
      const base = Math.floor(p.y + 1e-6);
      for (const dy of [0, -1, 1]) {
        const t = base + dy;
        if (t < 1 || t >= w.size.y - 1) continue;
        if (!w.isSolid(ix, t - 1, iz) || w.isSolid(ix, t, iz) || w.isSolid(ix, t + 1, iz)) continue;
        if (!bodyFree(w, x, z, t)) continue;
        const from = { x: e.x, y: e.y, z: e.z };
        e.x = x;
        e.y = t;
        e.z = z;
        e.vy = 0;
        e.following = false;
        e.stuck = 0;
        e.bestDist = Infinity;
        e.warpWait = 0;
        this.push({ type: 'warp', id: e.id, from, to: { x: e.x, y: e.y, z: e.z } });
        return true;
      }
    }
    return false;
  }

  private unbury(e: Ent): boolean {
    const ix = Math.floor(e.x);
    const iz = Math.floor(e.z);
    const y0 = Math.floor(e.y + 0.4);
    for (let dy = 1; dy <= 3; dy++) {
      if (!this.world.isSolid(ix, y0 + dy, iz) && !this.world.isSolid(ix, y0 + dy + 1, iz) && y0 + dy + 1 < this.world.size.y) {
        e.y = y0 + dy;
        e.vy = 0;
        return true;
      }
    }
    return false;
  }

  /** 横 に うごく。だめ なら false(うごかない) */
  private tryMove(e: Ent, dx: number, dz: number, maxDrop: number, allowWater: boolean): boolean {
    const w = this.world;
    const nx = e.x + dx;
    const nz = e.z + dz;
    const ix = Math.floor(nx);
    const iz = Math.floor(nz);
    if (!bodyInWall(nx, nz, BODY.radius, 0.5) || !w.isLoaded(ix, iz)) return false;
    const top = supportTop(w, nx, nz, e.y, maxDrop);
    if (top === null) return false;
    if (top - e.y > BODY.stepUp + 1e-6) return false;
    if (!bodyFree(w, nx, nz, top)) return false;
    if (!allowWater) {
      const tc = columnTop(w, ix, iz, Math.floor(e.y + BODY.stepUp + 1e-6) - 1, BODY.stepUp + maxDrop + 1);
      if (tc !== null && w.getBlock(ix, tc, iz) === 'water') return false;
    }
    e.x = nx;
    e.z = nz;
    return true;
  }

  /** 足もと を 地面 に あわせる(落ちる・のぼる・みず に うく) */
  private settle(e: Ent): void {
    const w = this.world;
    const ix = Math.floor(e.x);
    const iz = Math.floor(e.z);
    let cy = Math.floor(e.y + 0.3);
    if (w.getBlock(ix, cy, iz) === 'water') {
      while (w.getBlock(ix, cy + 1, iz) === 'water') cy++;
      const target = cy + 1 - 0.45;
      e.y += Math.max(-0.08, Math.min(0.08, target - e.y));
      e.vy = 0;
      e.inWater = true;
      return;
    }
    e.inWater = false;
    const top = supportTop(w, e.x, e.z, e.y, w.size.y);
    if (top === null || e.y > top + 1e-4) {
      e.vy -= FALL_G * DT;
      e.y += e.vy * DT;
      if (top !== null && e.y <= top) {
        e.y = top;
        e.vy = 0;
      }
    } else {
      e.vy = 0;
      e.y = Math.min(top, e.y + 0.2);
    }
  }

  private turn(e: Ent, p: Vec3, d: number): void {
    let want = e.yaw;
    const toP = yawTo(p.x - e.x, p.z - e.z);
    if (e.lock === 0) {
      if (!e.friend) want = e.look ? toP : e.walking ? e.walkYaw : e.yaw;
      else if (e.following) want = e.walkYaw;
      else if (d <= this.settings.animalLookDist && d > 0.3) want = toP;
    }
    const dy = angleDiff(e.yaw, want);
    e.yaw += Math.max(-0.25, Math.min(0.25, dy));
    const headWant = d <= this.settings.animalLookDist && d > 0.3 ? toP : e.yaw;
    e.headYaw += Math.max(-0.2, Math.min(0.2, angleDiff(e.headYaw, headWant)));
  }

  private separate(e: Ent): void {
    for (const o of this.ents) {
      if (o === e || !o.friend) continue;
      let dx = e.x - o.x;
      let dz = e.z - o.z;
      let dd = Math.hypot(dx, dz);
      if (dd >= FRIEND_MIN_GAP + 0.04) continue;
      if (dd < 1e-6) {
        const a = e.id * 2.399;
        dx = Math.cos(a);
        dz = Math.sin(a);
        dd = 1;
      }
      const push = Math.min(0.05, FRIEND_MIN_GAP + 0.05 - Math.hypot(e.x - o.x, e.z - o.z) || 0.05);
      const ux = dx / dd;
      const uz = dz / dd;
      for (const off of [0, 0.8, -0.8, 1.6, -1.6]) {
        const c = Math.cos(off);
        const sn = Math.sin(off);
        if (this.tryMove(e, (ux * c - uz * sn) * push, (ux * sn + uz * c) * push, this.world.size.y, true)) break;
      }
    }
  }
}

export function createAnimalManager(o: AnimalManagerOptions): AnimalManager {
  return new AnimalManager(o);
}
