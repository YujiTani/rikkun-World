import type {
  AnimalApi,
  AnimalDeps,
  AnimalEvent,
  AnimalHintKind,
  AnimalInfo,
  AnimalSpawnOpts,
  SwingResult,
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
import { BugNet, EGG_SALT, rollPity } from './lottery';
import { bodyInWall } from '../world/wall';
import { BODY, bodyFree, columnTop, supportTop, surfaceY, type AnimalWorld } from './terrain';

const DT = 1 / 60;
const TAU = Math.PI * 2;
/** 妖怪 とは べつ の 乱数 の 流れ（シード に まぜる 数） */
const RNG_SALT = 0x11fe0001;
/** なかま どうし の 中心 の 最小 すき間（PO 2026-10-18: 0.5 → 0.8。重なって 1 わ しか 見えない ため） */
const FRIEND_MIN_GAP = 0.8;
/** 止まる 距離 の ばらつき（なかま に なった 順 で 0・0.5・1.0 を くり返す） */
const STOP_STEP = 0.5;
const STOP_KINDS = 3;
const APPEAR_TICKS = 30;
const EVENT_CAP = 512;
const FALL_G = 25;
/** ハート 1 以上 の やせい が 消える 距離（§2.1。台帳 G4） */
const HEART_REMOVE_DIST = 96;
/** ついてくる 時間 が 0 の なかま が はなれない はんい（§2.7） */
const HOME_RADIUS = 6;
/** おなかいっぱい の 動き（§3.5） */
const FULL_REACT_TICKS = 20;
/** おろす 動き（§3.5） */
const PUT_DOWN_TICKS = 20;
/** あみ で とれた むし が 持ち物 に 入る まで。ふった ステップ を 1 と 数えて 30 ステップ 目（ふった あと の update は 29 回） */
const BUG_CATCH_UPDATES = 29;
/** パタパタ と みなす 下向き の 速さ（マス/秒） */
const FLUTTER_MIN_VY = 0.3;

type LockKind = 'appear' | 'eat' | 'pet' | 'cheer' | 'full' | 'putDown';

interface Ent {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  headYaw: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  state: AnimalState;
  stateTicks: number;
  look: boolean;
  inWater: boolean;
  /** 上下 の 速さ（マス/秒。下 が 負） */
  vy: number;
  /** ついてくる 残り ステップ（なかま） */
  follow: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft: number;
  carried: boolean;
  fluttering: boolean;
  /** たまご の くじ の「つづけて うまなかった 数」（保存 しない） */
  eggMiss: number;
  /** ついてくる 時間 が 0 の とき の まん中（うろうろ の はんい） */
  homeX: number;
  homeZ: number;
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
  /** 止まる 距離 に 足す 分（なかま の 順番 で 決まる） */
  stopOff: number;
}

export interface AnimalManagerOptions {
  world: VoxelWorld | AnimalWorld;
  deps: AnimalDeps;
  /** 足もと の 中央 */
  getPlayer: () => { position: Vec3 };
}

const SLAB: [number, number] = [0, 0];
/** 1 つの 軸 の 区間 [t0,t1] を 箱 [lo,hi] で せばめる。当たらなければ null（返す 配列は 使いまわし） */
function slab(o: number, d: number, lo: number, hi: number, t0: number, t1: number): [number, number] | null {
  if (Math.abs(d) < 1e-9) {
    if (o < lo || o > hi) return null;
  } else {
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) {
      const x = ta;
      ta = tb;
      tb = x;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  SLAB[0] = t0;
  SLAB[1] = t1;
  return SLAB;
}
const FOLLOW_OFFS: readonly number[] = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
const SEP_OFFS: readonly number[] = [0, 0.8, -0.8, 1.6, -1.6];

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
  /** なかま に なった 数（止まる 距離 の 順番） */
  private friendSeq = 0;
  private spawnTimer = 0;
  private hint: AnimalHintKind | null = null;
  private targetId: number | null = null;
  /** たまご の くじ（あみ・妖怪 と べつ の 流れ） */
  private readonly eggRng: Rng;
  private readonly net: BugNet;
  private tick = 0;
  /** とれた むし が 持ち物 に 入る まで の のこり update 回数 */
  private catches: number[] = [];
  private carriedId: number | null = null;
  /** やせい を 長おし した とき の carryWild を 1 回 の 押し で 1 回 に する */
  private wildAnnounced = false;
  /** 深い 所 で だっこ した ことが ある（`carriedBefore` が 無い とき の かわり） */
  private everCarried = false;
  private readonly view: AnimalView = {
    id: 0, x: 0, y: 0, z: 0, yaw: 0, headYaw: 0, state: 'idle', stateTicks: 0, friend: false, hearts: 0, targeted: false,
    follow: 0, fullLeft: 0, carried: false, fluttering: false,
  };

  constructor(o: AnimalManagerOptions) {
    this.world = o.world;
    this.d = o.deps;
    this.settings = o.deps.settings ?? createLiveSettings();
    this.getPlayer = o.getPlayer;
    this.rng = createRng((o.deps.seed ^ RNG_SALT) >>> 0);
    this.eggRng = createRng((o.deps.seed ^ EGG_SALT) >>> 0);
    this.net = new BugNet(o.deps.seed);
  }

  // ------------------------------------------------------------ 窓口(テスト・つなぎ込み)

  spawn(x: number, y: number, z: number, opts: AnimalSpawnOpts = {}): number | null {
    const friend = opts.friend === true;
    if (friend && this.friendCount() >= this.settings.animalFriendMax) return null;
    const max = this.settings.animalFollowTicks;
    const follow = friend ? Math.max(0, Math.min(max, Math.round(opts.follow ?? max))) : 0;
    const e = this.make(x, y, z, friend, friend ? 0 : (opts.hearts ?? 0), follow);
    e.fullLeft = Math.max(0, Math.round(opts.fullLeft ?? 0));
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
      state: e.state,
      lookingAtPlayer: this.lookingAt(e, p),
      inWater: e.inWater,
      follow: e.follow,
      fullLeft: e.fullLeft,
      carried: e.carried,
      fluttering: e.fluttering,
      vy: e.vy,
    }));
  }

  clear(): void {
    this.friendSeq = 0;
    this.ents.length = 0;
    this.targetId = null;
    this.carriedId = null;
    this.catches.length = 0;
    this.wildAnnounced = false;
    this.net.reset();
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

  // ------------------------------------------------------------ 版 3.2: あみ・だっこ

  /** あみ を ふる（§2.4）。とれる か は ふった ステップ に きまり、むし は 30 ステップ 目 に 持ち物 へ */
  swingNet(block: Vec3): SwingResult {
    const r = this.net.swing(block, this.tick, this.settings);
    this.push({ type: 'swing', x: block.x, y: block.y, z: block.z, caught: r.caught, reason: r.reason });
    if (r.caught) this.catches.push(BUG_CATCH_UPDATES);
    return r;
  }

  /** 右クリック の 押しつづけ（§2.8）。`heldTicks` = 押してから の ステップ 数 */
  carryHold(id: number, heldTicks: number): 'lifted' | 'wait' | 'wild' | null {
    const e = this.find(id);
    if (!e || e.carried || this.carriedId !== null) return null;
    const hold = this.settings.carryHoldTicks;
    if (!e.friend) {
      if (heldTicks < hold) {
        this.wildAnnounced = false;
        return 'wait';
      }
      if (this.wildAnnounced) return null;
      this.wildAnnounced = true;
      return 'wild';
    }
    if (heldTicks < hold || e.lock > 0) return 'wait';
    const p = this.getPlayer().position;
    e.carried = true;
    e.following = false;
    e.walking = false;
    e.stuck = 0;
    e.fluttering = false;
    e.vy = 0;
    e.x = p.x;
    e.y = p.y;
    e.z = p.z;
    this.carriedId = id;
    this.everCarried = true;
    this.setState(e, 'carried');
    this.push({ type: 'carry', id });
    return 'lifted';
  }

  /** おろす（§2.8）。`spot` = 足もと の 位置。固い マス・読みこんで いない 所 は false */
  putDown(spot: Vec3): boolean {
    const e = this.carriedId === null ? undefined : this.find(this.carriedId);
    if (!e) return false;
    const w = this.world;
    const ix = Math.floor(spot.x);
    const iz = Math.floor(spot.z);
    const iy = Math.floor(spot.y + 1e-6);
    if (!w.isLoaded(ix, iz) || iy < 0 || iy >= w.size.y) return false;
    if (!bodyFree(w, spot.x, spot.z, spot.y)) return false;
    e.carried = false;
    this.carriedId = null;
    e.x = spot.x;
    e.y = spot.y;
    e.z = spot.z;
    e.vy = 0;
    e.following = false;
    e.walking = false;
    e.stuck = 0;
    e.bestDist = Infinity;
    e.warpWait = 0;
    e.homeX = e.x;
    e.homeZ = e.z;
    e.restLeft = 20 + Math.floor(this.rng() * 40);
    this.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
    this.setLock(e, 'putDown', PUT_DOWN_TICKS);
    return true;
  }

  /** やられた とき: だっこ中 を その場に おろす（地面 の 検査 は しない。出来事 putDown は 出す） */
  dropCarried(spot: Vec3): void {
    if (this.putDown(spot)) return;
    const e = this.carriedId === null ? undefined : this.find(this.carriedId);
    if (!e) return;
    e.carried = false;
    this.carriedId = null;
    e.x = spot.x;
    e.y = spot.y;
    e.z = spot.z;
    e.vy = 0;
    e.following = false;
    e.walking = false;
    e.homeX = e.x;
    e.homeZ = e.z;
    this.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
    this.setLock(e, 'putDown', PUT_DOWN_TICKS);
  }

  carrying(): number | null {
    return this.carriedId;
  }

  /** おなかいっぱい か（照準 の 下 の `まってね`） */
  isFull(id: number): boolean {
    const e = this.find(id);
    return !!e && e.fullLeft > 0;
  }

  isFriend(id: number): boolean {
    return !!this.find(id)?.friend;
  }

  /** つなぎ込み から の 合図（あみ の ヒント など）。出来事 と lastHint に 出す */
  emitHint(h: AnimalHintKind): void {
    this.hintOut(h);
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
      const e = this.make(cx, sy + 1, cz, false, 0, 0);
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
    let bestId = -1;
    let bestT = Infinity;
    const hw = 0.4;
    for (const e of this.ents) {
      if (e.state === 'appear' || e.carried) continue;
      const t = slab(origin.x, dir.x, e.x - hw, e.x + hw, 0, maxDist);
      if (t === null) continue;
      const ty = slab(origin.y, dir.y, e.y, e.y + 1.0, t[0], t[1]);
      if (ty === null) continue;
      const tz = slab(origin.z, dir.z, e.z - hw, e.z + hw, ty[0], ty[1]);
      if (tz === null) continue;
      if (tz[0] <= maxDist && tz[0] < bestT) {
        bestT = tz[0];
        bestId = e.id;
      }
    }
    if (bestId < 0) return null;
    return { id: bestId, distance: bestT };
  }

  preview(id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null {
    const e = this.find(id);
    if (!e || e.lock > 0 || e.carried) return null;
    if (held && held.item === 'mushi') return e.fullLeft > 0 ? 'animalFull' : 'feed';
    return 'animalPet';
  }

  feed(id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | null {
    const e = this.find(id);
    if (!e || e.lock > 0 || e.carried || item !== 'mushi') return null;
    const s = this.settings;
    if (e.fullLeft > 0) {
      this.push({ type: 'full', id });
      this.setLock(e, 'full', FULL_REACT_TICKS);
      return 'full';
    }
    if (!e.friend && e.hearts >= 2 && this.friendCount() + this.pendingFriends() >= s.animalFriendMax) {
      this.hintOut('friendFull');
      return 'friendFull';
    }
    e.fullLeft = s.animalFullTicks;
    if (e.friend) {
      // ついてくる 時間 が まんたん に もどる（とまって いた なかま も また ついてくる）
      e.follow = s.animalFollowTicks;
      e.walking = false;
      e.stuck = 0;
      this.push({ type: 'feed', id, item, hearts: 0, friend: true });
      const roll = rollPity(this.eggRng, s.animalEggChance, s.animalEggPity, e.eggMiss);
      e.eggMiss = roll.misses;
      if (roll.hit) {
        e.egg = true;
        this.setLock(e, 'eat', s.animalEggDelay);
      } else {
        this.setLock(e, 'eat', s.animalReactTicks);
      }
      return 'ate';
    }
    if (e.hearts >= 2) {
      e.becomeFriend = true;
      this.push({ type: 'feed', id, item, hearts: 3, friend: false });
    } else {
      e.hearts = (e.hearts + 1) as 1 | 2;
      this.push({ type: 'feed', id, item, hearts: e.hearts, friend: false });
    }
    this.setLock(e, 'eat', s.animalReactTicks);
    return 'ate';
  }

  private nextStopOff(): number {
    return (this.friendSeq++ % STOP_KINDS) * STOP_STEP;
  }

  /** 3 つ目 の やさい を たべて ロック中 の（まもなく なかま に なる）数 */
  private pendingFriends(): number {
    let n = 0;
    for (const e of this.ents) if (e.becomeFriend) n++;
    return n;
  }

  pet(id: number): 'wild' | 'friend' | null {
    const e = this.find(id);
    if (!e || e.lock > 0 || e.carried) return null;
    if (!e.friend) {
      this.push({ type: 'pet', id, friend: false });
      this.hintOut('feedHint');
      this.setLock(e, 'pet', this.settings.animalReactTicks);
      return 'wild';
    }
    this.push({ type: 'pet', id, friend: true });
    this.setLock(e, 'pet', this.settings.animalReactTicks);
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
      v.follow = e.follow;
      v.fullLeft = e.fullLeft;
      v.carried = e.carried;
      v.fluttering = e.fluttering;
      fn(v);
    }
  }

  // ------------------------------------------------------------ 保存(SaveExtra)

  /** 保存（§4.4）。だっこ 中 は プレイヤー の 足もと の 位置 が そのまま 入る */
  serialize(): { v: 2; friends: { x: number; y: number; z: number; yaw: number; follow: number }[] } {
    const friends: { x: number; y: number; z: number; yaw: number; follow: number }[] = [];
    for (const e of this.ents) {
      if (!e.friend) continue;
      friends.push({ x: round2(e.x), y: round2(e.y), z: round2(e.z), yaw: round2(e.yaw), follow: Math.round(e.follow) });
    }
    return { v: 2, friends };
  }

  /** 読みこみ。版 1（`eggDay` つき・`follow` なし）も 読む: `follow` は まんたん、`eggDay` は すてる */
  deserialize(data: unknown): void {
    this.clear();
    const rows = (data as { friends?: unknown } | null | undefined)?.friends;
    if (typeof data !== 'object' || data === null || !Array.isArray(rows)) return;
    const max = this.settings.animalFollowTicks;
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
      const follow = typeof o.follow === 'number' && Number.isFinite(o.follow) ? Math.max(0, Math.min(max, Math.round(o.follow))) : max;
      const e = this.make(x, y, z, true, 0, follow);
      e.yaw = yaw;
      e.headYaw = yaw;
      this.ents.push(e);
    }
  }

  // ------------------------------------------------------------ 1 ステップ

  update(): void {
    const s = this.settings;
    this.tick++;
    for (let i = this.catches.length - 1; i >= 0; i--) {
      if (--this.catches[i]! > 0) continue;
      this.catches.splice(i, 1);
      this.push({ type: 'bugCatch', toInventory: this.d.addItem('mushi') });
    }
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
    for (const e of this.ents) if (e.friend && !e.following && !e.carried && e.lock === 0) this.separate(e, p);
  }

  // ------------------------------------------------------------ 内部

  private make(x: number, y: number, z: number, friend: boolean, hearts: 0 | 1 | 2, follow: number): Ent {
    const stopOff = friend ? this.nextStopOff() : 0;
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
      state: friend && follow > 0 ? 'idle' : 'rest',
      stateTicks: 0,
      look: false,
      inWater: false,
      vy: 0,
      follow,
      fullLeft: 0,
      carried: false,
      fluttering: false,
      eggMiss: 0,
      homeX: x,
      homeZ: z,
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
      stopOff,
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

  private lookingAt(e: Ent, p: Vec3): boolean {
    if (e.lock > 0 || e.state === 'appear') return false;
    return (e.friend && e.follow > 0 ? e.state === 'idle' : e.look) && dist2d(e.x, e.z, p.x, p.z) <= this.settings.animalLookDist;
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
    if (e.fullLeft > 0) e.fullLeft--;
    if (e.carried) {
      // だっこ 中: プレイヤー の 足もと に いる。follow は へらない
      e.x = p.x;
      e.y = p.y;
      e.z = p.z;
      e.vy = 0;
      e.fluttering = false;
      e.inWater = false;
      this.setState(e, 'carried');
      return true;
    }
    const d = dist2d(e.x, e.z, p.x, p.z);

    if (!e.friend) {
      if (d > (e.hearts >= 1 ? Math.max(s.animalRemoveDist, HEART_REMOVE_DIST) : s.animalRemoveDist)) return this.remove(e, 'far');
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
    if (e.friend && e.follow > 0 && --e.follow === 0) this.endFollow(e);

    if (e.lock > 0) {
      e.lock--;
      if (e.lock === 0) this.finishLock(e);
      else this.setState(e, this.lockState(e));
    }
    if (e.lock === 0) this.behave(e, p, d);

    if (!e.walking) this.unstraddle(e);
    this.settle(e);
    this.turn(e, p, d);
    return true;
  }

  /** ついてくる 時間 が 0 に なった（§2.7）: その場 に とまり、そこ を 中心 に のんびり */
  private endFollow(e: Ent): void {
    e.following = false;
    e.bestDist = Infinity;
    e.stuck = 0;
    e.warpWait = 0;
    e.homeX = e.x;
    e.homeZ = e.z;
    e.walking = false;
    e.restLeft = 20 + Math.floor(this.rng() * 40);
    if (e.lock === 0) this.setState(e, 'rest');
    this.push({ type: 'followEnd', id: e.id });
  }

  private remove(e: Ent, reason: 'far' | 'void' | 'buried'): false {
    this.push({ type: 'remove', id: e.id, reason });
    return false;
  }

  private finishLock(e: Ent): void {
    const kind = e.lockKind;
    if (e.egg) {
      e.egg = false;
      this.d.dropEgg({ x: e.x, y: e.y + 0.3, z: e.z });
      this.push({ type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z });
    }
    if (e.becomeFriend && this.friendCount() < this.settings.animalFriendMax) {
      e.becomeFriend = false;
      e.friend = true;
      e.stopOff = this.nextStopOff();
      e.hearts = 0;
      e.eggMiss = 0;
      e.follow = this.settings.animalFollowTicks;
      e.following = false;
      const count = this.friendCount();
      const first = count === 1;
      this.push({ type: 'friend', id: e.id, first, count });
      this.setLock(e, 'cheer', first ? 40 : 20);
      return;
    }
    e.becomeFriend = false;
    this.setState(e, this.restState(e));
    // お祝い が おわった: まだ だっこ を して いない なら ながおし の ヒント（§2.6）
    if (kind === 'cheer') {
      const done = this.d.carriedBefore ? this.d.carriedBefore() : this.everCarried;
      if (!done) this.push({ type: 'carryHint' });
    }
  }

  private restState(e: Ent): AnimalState {
    return e.friend && e.follow > 0 ? 'idle' : 'rest';
  }

  private behave(e: Ent, p: Vec3, d: number): void {
    const s = this.settings;
    if (e.friend && e.follow > 0) {
      this.follow(e, p, d);
      return;
    }
    // やせい（と ついてくる 時間 が 0 の なかま: とまった 所 から 6 マス 以内）
    e.look = d <= s.animalLookDist;
    if (e.look) {
      this.setState(e, 'look');
      return;
    }
    if (e.walking) {
      this.setState(e, 'wander');
      if (e.friend && dist2d(e.x, e.z, e.homeX, e.homeZ) > HOME_RADIUS - 0.5) e.walkYaw = yawTo(e.homeX - e.x, e.homeZ - e.z);
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
    } else if (e.following && d <= s.animalFollowStop + e.stopOff) {
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
    for (const off of FOLLOW_OFFS) {
      const a = base + off;
      if (this.tryMove(e, Math.sin(a) * v, -Math.cos(a) * v, this.world.size.y, true)) return;
    }
  }

  /** ワープ の 条件(§2.6)。ワープ した なら true */
  private friendWarpChecks(e: Ent, p: Vec3, d: number, frozen: boolean): boolean {
    const s = this.settings;
    if (e.warpWait > 0) e.warpWait--;
    if (e.lockKind === 'appear' && e.lock > 0) return false;
    // ついてくる 時間 が 0 の なかま は とおく に いても ワープ しない（世界 の 下 だけ）
    const chasing = e.follow > 0;
    const far = chasing ? d > s.animalWarpDist || Math.abs(e.y - p.y) > 6 || e.y < -10 : e.y < -10;
    const stuck = chasing && !frozen && e.following && e.stuck >= s.animalStuckTicks;
    if (!far && !stuck) return false;
    if (e.warpWait > 0) return false;
    if (this.warp(e, p)) return true;
    e.warpWait = 60;
    return false;
  }

  private warp(e: Ent, p: Vec3): boolean {
    const w = this.world;
    const others = this.ents.filter((o) => o !== e && o.friend && !o.carried);
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
        e.fluttering = false;
        e.following = false;
        e.stuck = 0;
        e.bestDist = Infinity;
        e.warpWait = 0;
        e.homeX = e.x;
        e.homeZ = e.z;
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

  /** 段の ふち に またがって 止まった とき、体の まんなか を 高い 方へ そっと よせる（足もとが くうき に ならない ように） */
  private unstraddle(e: Ent): void {
    const w = this.world;
    const ix = Math.floor(e.x);
    const iz = Math.floor(e.z);
    const startY = Math.floor(e.y + BODY.stepUp + 1e-6) - 1;
    const c = columnTop(w, ix, iz, startY, BODY.stepUp + 3);
    if (c === null || e.y - c < 0.5) return;
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const t = columnTop(w, ix + ox, iz + oz, startY, BODY.stepUp + 3);
      if (t !== null && t >= e.y - 1e-6) {
        this.tryMove(e, ox * 0.04, oz * 0.04, 3, false);
        return;
      }
    }
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
      e.fluttering = false;
      e.inWater = true;
      return;
    }
    e.inWater = false;
    const top = supportTop(w, e.x, e.z, e.y, w.size.y);
    if (top === null || e.y > top + 1e-4) {
      // 空中: パタパタ して ゆっくり 落ちる（下向き の 速さ は animalFlutterFallSpeed まで。§2.9）
      e.vy -= FALL_G * DT;
      const cap = this.settings.animalFlutterFallSpeed;
      if (e.vy < -cap) e.vy = -cap;
      e.y += e.vy * DT;
      if (top !== null && e.y <= top) {
        e.y = top;
        e.vy = 0;
        e.fluttering = false;
      } else {
        e.fluttering = e.vy <= -FLUTTER_MIN_VY;
      }
    } else {
      e.vy = 0;
      e.fluttering = false;
      e.y = Math.min(top, e.y + 0.2);
    }
  }

  private turn(e: Ent, p: Vec3, d: number): void {
    let want = e.yaw;
    const toP = yawTo(p.x - e.x, p.z - e.z);
    if (e.lock === 0) {
      if (!e.friend || e.follow <= 0) want = e.look ? toP : e.walking ? e.walkYaw : e.yaw;
      else if (e.following) want = e.walkYaw;
      else if (d <= this.settings.animalLookDist && d > 0.3) want = toP;
    }
    const dy = angleDiff(e.yaw, want);
    e.yaw += Math.max(-0.25, Math.min(0.25, dy));
    const headWant = d <= this.settings.animalLookDist && d > 0.3 ? toP : e.yaw;
    e.headYaw += Math.max(-0.2, Math.min(0.2, angleDiff(e.headYaw, headWant)));
  }

  private separate(e: Ent, p: Vec3): void {
    // 押されて プレイヤー に ぶつからない ように: 止まる 距離 より 内側 へは 押さない
    const keep = Math.min(dist2d(e.x, e.z, p.x, p.z), this.settings.animalFollowStop + e.stopOff);
    for (const o of this.ents) {
      if (o === e || !o.friend || o.carried) continue;
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
      for (const off of SEP_OFFS) {
        const c = Math.cos(off);
        const sn = Math.sin(off);
        const mx = (ux * c - uz * sn) * push;
        const mz = (ux * sn + uz * c) * push;
        if (dist2d(e.x + mx, e.z + mz, p.x, p.z) < keep - 1e-6) continue;
        if (this.tryMove(e, mx, mz, this.world.size.y, true)) break;
      }
    }
  }
}

export function createAnimalManager(o: AnimalManagerOptions): AnimalManager {
  return new AnimalManager(o);
}
