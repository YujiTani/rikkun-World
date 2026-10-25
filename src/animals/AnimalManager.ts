import { isBigKotatsu, kotatsuAnchorOf } from '../world/blocks/kotatsu';
import type {
  AnimalApi,
  AnimalBirdSave,
  AnimalDeps,
  AnimalEvent,
  FightCues,
  MachoGiveUpReason,
  AnimalHintKind,
  AnimalInfo,
  AnimalSaveV4,
  AnimalSpawnOpts,
  NatsukiView,
  CoopBreakResult,
  CoopInfo,
  CoopPlacePreview,
  CoopPlaceResult,
  KitEgg,
  KitIcon,
  KitInfo,
  KitUseResult,
  SwingResult,
  ThrowAim,
  ThrowSpot,
  AnimalState,
  AnimalView,
  ItemId,
  ItemStack,
  LiveSettings,
  Vec3,
} from '../contracts';
import { createLiveSettings } from '../contracts';
import { createRng, type Rng } from '../world/gen/random';
import { BugNet, EGG_SALT, rollPity } from './lottery';
import { bodyInWall } from '../world/wall';
import { BODY, bodyFree, columnTop, supportTop, surfaceY, type AnimalWorld } from './terrain';
import { COOP_HALF, COOP_HEIGHT, COOP_SHIFTS, DIR_VEC, coopFits, coopsOverlap, gateCell, inFootprint, inInterior, type CoopDir } from './coop';
import { meatEligible } from './meat';
import { rollGold } from './gold';
import { rollBreed } from './hatch';
import { aimBox, bodySize } from './size';
import { parseAnimalSave, type ParsedBird } from './saveV3';
import { FIGHT, inReach, isUpperPunch, pickFighters, punchDamage, punchPlan, resolveCue } from './fight';

import type { LockKind, KitEggRow, Kit, Coop, Ent, AnimalManagerOptions } from './animalTypes';
import { DT, TAU, RNG_SALT, FRIEND_MIN_GAP, STOP_STEP, STOP_KINDS, APPEAR_TICKS, EVENT_CAP, FALL_G, HEART_REMOVE_DIST, HOME_RADIUS, FULL_REACT_TICKS, PUT_DOWN_TICKS, BUG_CATCH_UPDATES, FLUTTER_MIN_VY, THROW_LIFT_TICKS, THROW_HAND_Y, THROW_LAND_Y, THROW_APEX_UP, THROW_BASE_TICKS, THROW_TICKS_PER_M, THROW_THROUGH, THROW_FRONT, THROW_SCAN_DOWN, THROW_SOFT_DIST, GLIDE_STEP, POP_TICKS, HATCH_TICKS, KIT_HATCH_GAP, KIT_ICON_DIST, HATCH_MACHO_TICKS, GROW_TICKS, ROLL_TICKS, ROLL_MIN_DROP, COOP_CHECK_EVERY, KID_MARGIN, FRIEND_FULL_REPEAT, SPOT_RETRY, BREED_SALT, GOLD_SALT, NATSUKI_HINT_GAP, BLOCK_NUKUNUKU, MEAT_WALK, MEAT_DOOR_FROM, MEAT_DOOR_TICKS, MEAT_SAY_AT, MEAT_SAY_FADE, MEAT_NEST_DIST, NO_FIGHT, ZERO_KNOCK } from './animalConsts';
import { slab, FOLLOW_OFFS, SEP_OFFS, inFootprintAny, dist2d, round2, angleDiff, yawTo } from './animalMath';

export type { AnimalManagerOptions } from './animalTypes';
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
  /** なかま に なった 順 の 番号（たたかう 子 を えらぶ） */
  private joinSeq = 0;
  /** この ステップ の たたかう 子 の id（`update` の はじめ に きめる） */
  private fighterIds: number[] = NO_FIGHT;
  private readonly oneFighter: number[] = [0];
  private readonly fightCands: { id: number; joinNo: number }[] = [];
  private spawnTimer = 0;
  private hint: AnimalHintKind | null = null;
  private targetId: number | null = null;
  /** 合図 natsukiWait を 最後 に 出した ステップ（600 に 1 回 まで） */
  private waitHintAt = -NATSUKI_HINT_GAP;
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
  // ---- LIVE-2
  private kitList: Kit[] = [];
  private coopList: Coop[] = [];
  private nextCoopId = 1;
  private readonly breedState = { machoMiss: 0 };
  private readonly breedRng: Rng;
  private readonly goldRng: Rng;
  private lastDay: number | null = null;
  /** 大人 に なった ことが ある（`grewBefore` が 無い とき の かわり。保存 しない） */
  private everGrew = false;
  /** かえった ことが ある（`hatchedBefore` が 無い とき の かわり。保存 しない） */
  private everHatched = false;
  /** 小屋 の「こわせない」合図 を 最後 に 出した ステップ（押し つづけ の 出し直し 用） */
  private lockHintAt = -1000;
  private night = false;
  /** 直前 の putDown が 失敗 して、自分 の 合図 を 出した か */
  private putWhy: AnimalHintKind | null = null;
  private coopCheckT = 0;
  private readonly kitScratch: KitInfo & { hatchT: number } = { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, hatchT: 0, eggs: [] };

  constructor(o: AnimalManagerOptions) {
    this.world = o.world;
    this.d = o.deps;
    this.settings = o.deps.settings ?? createLiveSettings();
    this.getPlayer = o.getPlayer;
    this.rng = createRng((o.deps.seed ^ RNG_SALT) >>> 0);
    this.eggRng = createRng((o.deps.seed ^ EGG_SALT) >>> 0);
    this.breedRng = createRng((o.deps.seed ^ BREED_SALT) >>> 0);
    this.goldRng = createRng((o.deps.seed ^ GOLD_SALT) >>> 0);
    this.net = new BugNet(o.deps.seed);
  }

  // ------------------------------------------------------------ 窓口(テスト・つなぎ込み)

  spawn(x: number, y: number, z: number, opts: AnimalSpawnOpts = {}): number | null {
    // 小屋 の 子 として 置く（`home`）: 小屋 が 無い・6 わ いる → null
    let coop: Coop | undefined;
    if (opts.home !== undefined && opts.home !== null) {
      coop = this.coopById(opts.home);
      if (!coop || this.kidCount(coop.id) >= this.settings.coopMax) return null;
    }
    const friend = opts.friend === true || coop !== undefined;
    if (friend && !coop && this.friendCount() >= this.settings.animalFriendMax) return null;
    const max = this.settings.animalFollowTicks;
    const follow = friend && !coop ? Math.max(0, Math.min(max, Math.round(opts.follow ?? max))) : 0;
    const e = this.make(x, y, z, friend, friend ? 0 : (opts.hearts ?? 0), follow);
    e.fullLeft = Math.max(0, Math.round(opts.fullLeft ?? 0));
    e.stage = opts.stage === 'chick' ? 'chick' : 'adult';
    e.breed = opts.breed === 'macho' ? 'macho' : 'normal';
    e.raised = opts.raised === true;
    e.bugs = Math.max(0, Math.round(opts.bugs ?? 0));
    e.goldMiss = Math.max(0, Math.round(opts.goldMiss ?? 0));
    e.grow = Math.max(0, Math.round(opts.grow ?? 0));
    if (e.friend && e.stage === 'adult') {
      const s = this.settings;
      e.natsuki = Math.max(0, Math.min(s.natsukiMax, Math.round(opts.natsuki ?? 0)));
      e.natsukiBugWait = Math.max(0, Math.min(s.natsukiBugWaitTicks, Math.round(opts.natsukiBugWait ?? 0)));
      e.natsukiPetWait = Math.max(0, Math.min(s.natsukiPetWaitTicks, Math.round(opts.natsukiPetWait ?? 0)));
      e.natsukiDecayLeft = Math.max(1, Math.min(s.natsukiDecayTicks, Math.round(opts.natsukiDecayLeft ?? s.natsukiDecayTicks)));
    }
    if (coop) this.makeKid(e, coop);
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
      stage: e.stage,
      breed: e.breed,
      home: e.home,
      raised: e.raised,
      bugs: e.bugs,
      goldMiss: e.goldMiss,
      grow: e.grow,
      size: bodySize(e.stage, e.breed),
      target: e.target,
      hits: e.hits,
      natsuki: e.natsuki,
      natsukiBugWait: e.natsukiBugWait,
      natsukiPetWait: e.natsukiPetWait,
      natsukiDecayLeft: e.natsukiDecayLeft,
    }));
  }

  clear(): void {
    this.friendSeq = 0;
    this.joinSeq = 0;
    this.fighterIds = NO_FIGHT;
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

  /** なかま の 数（小屋 の 子 は 数えない。小屋 ごと に 6 わ） */
  friendCount(): number {
    let n = 0;
    for (const e of this.ents) if (e.friend && e.home === null) n++;
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
    if (!e || e.carried || e.meat || this.carriedId !== null) return null;
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
    this.putWhy = null;
    if (!w.isLoaded(ix, iz) || iy < 0 || iy >= w.size.y) return false;
    if (!bodyFree(w, spot.x, spot.z, spot.y)) return false;
    // 小屋 の 中 に おろす → 小屋 の 子（6 わ なら おろさない）。小屋 の 子 を 外 に おろす → なかま（8 わ なら おろさない）
    const into = this.coopAtSpot(spot);
    if (into) {
      if (this.kidCount(into.id, e) >= this.settings.coopMax) {
        this.hintOut('coopFull');
        this.putWhy = 'coopFull';
        return false;
      }
    } else if (e.home !== null && this.friendCount() >= this.settings.animalFriendMax) {
      this.hintOut('friendFull');
      this.putWhy = 'friendFull';
      return false;
    }
    e.carried = false;
    e.liftLeft = 0;
    e.putLeft = 0;
    e.plan = null;
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
    if (into) {
      if (e.home !== into.id) this.joinCoop(e, into);
    } else if (e.home !== null) {
      e.home = null;
      e.follow = 0;
    }
    this.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
    this.setLock(e, 'putDown', PUT_DOWN_TICKS);
    return true;
  }

  /** 直前 の `putDown` が 失敗 した わけ（`coopFull`・`friendFull`）。A が その 合図 を 出して いる。ほか は null（C は null の とき だけ `cantPutHere`） */
  putDownWhy(): AnimalHintKind | null {
    return this.putWhy;
  }

  /** やられた とき: だっこ中 を その場に おろす（地面 の 検査 は しない。出来事 putDown は 出す） */
  dropCarried(spot: Vec3): void {
    if (this.putDown(spot)) return;
    const e = this.carriedId === null ? undefined : this.find(this.carriedId);
    if (!e) return;
    e.carried = false;
    e.liftLeft = 0;
    e.putLeft = 0;
    e.plan = null;
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

  // ------------------------------------------------------------ LIVE-2.1: なげる（§2.2）

  private carriedEnt(): Ent | undefined {
    return this.carriedId === null ? undefined : this.find(this.carriedId);
  }

  /** 立てる マス（上 が 固く ない・下 が 固い・体 が ぶつからない） */
  private standable(ix: number, y: number, iz: number): boolean {
    const w = this.world;
    if (!w.isLoaded(ix, iz) || y < 1 || y >= w.size.y - 1) return false;
    return !w.isSolid(ix, y, iz) && !w.isSolid(ix, y + 1, iz) && w.isSolid(ix, y - 1, iz) && bodyFree(w, ix + 0.5, iz + 0.5, y);
  }

  /**
   * ねらった の が とりごや の さく・もん なら、線 を 通して その 先 の 床（さく に 入って から 4 マス 以内）の 上 の 空き マス を 返す。
   * 無ければ null（今まで どおり さく の 上 へ よせる）。左クリック の 照準 は かわらない（さく に 当たる）
   */
  private throughFence(aim: ThrowAim): Vec3 | null {
    const d = aim.dir3;
    if (!d || (aim.hitId !== 'toriya_fence' && aim.hitId !== 'toriya_gate')) return null;
    const w = this.world;
    const isFence = (id: string) => id === 'toriya_fence' || id === 'toriya_gate';
    let enter = -1;
    let prev: Vec3 | null = null;
    for (let t = 0; t <= 16; t += 0.05) {
      const ix = Math.floor(aim.eye.x + d.x * t);
      const iy = Math.floor(aim.eye.y + d.y * t);
      const iz = Math.floor(aim.eye.z + d.z * t);
      if (!w.isLoaded(ix, iz) || iy < 0 || iy >= w.size.y) return null;
      const id = String(w.getBlock(ix, iy, iz));
      if (isFence(id)) {
        if (enter < 0) enter = t;
        continue;
      }
      if (enter < 0) continue;
      if (t - enter > THROW_THROUGH) return null;
      if (w.isSolid(ix, iy, iz)) return prev && !(prev.x === ix && prev.y === iy && prev.z === iz) ? prev : null;
      prev = { x: ix, y: iy, z: iz };
    }
    return null;
  }

  /** 着地点 の 答え。`pt` = テスト 用（足もと の 点 を そのまま 使う） */
  private planThrow(e: Ent, aim: ThrowAim | null, pt?: Vec3): ThrowSpot {
    const w = this.world;
    const p = this.getPlayer().position;
    const range = this.settings.throwRange;
    const bad = (x: number, y: number, z: number, why: AnimalHintKind | null = 'cantPutHere'): ThrowSpot => ({ x, y, z, ok: false, home: null, toss: true, why });
    let x: number;
    let y: number;
    let z: number;
    if (pt) {
      x = pt.x;
      y = pt.y;
      z = pt.z;
      if (!w.isLoaded(Math.floor(x), Math.floor(z)) || w.isSolid(Math.floor(x), Math.floor(y + 1e-6), Math.floor(z))) return bad(x, y, z);
    } else if (aim && aim.place) {
      const through = this.throughFence(aim);
      const pl = through ?? aim.place;
      const cx = pl.x + 0.5;
      const cz = pl.z + 0.5;
      const dd = dist2d(p.x, p.z, cx, cz);
      if (dd <= range) {
        x = cx;
        y = pl.y;
        z = cz;
      } else {
        // とおい: プレイヤー → その マス の 向き で range の 所 の 列。同じ 高さ ±1 で 立てる マス
        const ix = Math.floor(p.x + ((cx - p.x) / dd) * range);
        const iz = Math.floor(p.z + ((cz - p.z) / dd) * range);
        let found: number | null = null;
        for (const dy of [0, 1, -1]) {
          if (this.standable(ix, pl.y + dy, iz)) {
            found = pl.y + dy;
            break;
          }
        }
        if (found === null) return bad(ix + 0.5, pl.y, iz + 0.5);
        x = ix + 0.5;
        y = found;
        z = iz + 0.5;
      }
    } else if (aim) {
      // 何も ねらわない: 前 3 マス の 列。目 の 高さ から 下 へ 見て はじめ に 立てる マス
      const ix = Math.floor(p.x + aim.dirX * THROW_FRONT);
      const iz = Math.floor(p.z + aim.dirZ * THROW_FRONT);
      x = ix + 0.5;
      z = iz + 0.5;
      if (!w.isLoaded(ix, iz)) return bad(x, p.y, z);
      const y0 = Math.floor(aim.eye.y);
      if (w.isSolid(ix, y0, iz)) return bad(x, y0, z);
      y = aim.eye.y - THROW_SCAN_DOWN;
      for (let n = 0; n <= THROW_SCAN_DOWN; n++) {
        if (w.isSolid(ix, y0 - n - 1, iz)) {
          y = y0 - n;
          break;
        }
      }
    } else {
      return bad(p.x, p.y, p.z);
    }
    if (y < 0 || y >= w.size.y || !w.isLoaded(Math.floor(x), Math.floor(z))) return bad(x, y, z);
    if (!bodyFree(w, x, z, y)) return bad(x, y, z);
    const spot = { x, y, z };
    const into = this.coopAtSpot(spot);
    if (into && this.kidCount(into.id, e) >= this.settings.coopMax) return { x, y, z, ok: false, home: into.id, toss: true, why: 'coopFull' };
    if (!into && e.home !== null && this.friendCount() >= this.settings.animalFriendMax) return { x, y, z, ok: false, home: null, toss: true, why: 'friendFull' };
    const toss = pt ? true : dist2d(p.x, p.z, x, z) >= THROW_SOFT_DIST;
    return { x, y, z, ok: true, home: into ? into.id : null, toss, why: null };
  }

  /** だっこ 中 の 着地点（照準 の 下 の 語・丸）。だっこ して いなければ null */
  throwSpot(aim: ThrowAim): ThrowSpot | null {
    const e = this.carriedEnt();
    return e ? this.planThrow(e, aim) : null;
  }

  /** 右クリック（だっこ 中）: なげる（d＜1 は 20 ステップ で そっと おろす）。なげられない 所 は 合図 を 出して false */
  startThrow(aim: ThrowAim): boolean {
    const e = this.carriedEnt();
    if (!e || e.liftLeft > 0 || e.putLeft > 0) return false;
    return this.beginThrow(e, this.planThrow(e, aim));
  }

  /** テスト 用: その 足もと の 点 へ なげる */
  throwTo(x: number, y: number, z: number): boolean {
    const e = this.carriedEnt();
    if (!e || e.liftLeft > 0 || e.putLeft > 0) return false;
    return this.beginThrow(e, this.planThrow(e, null, { x, y, z }));
  }

  private beginThrow(e: Ent, sp: ThrowSpot): boolean {
    this.putWhy = null;
    if (!sp.ok) {
      this.putWhy = sp.why;
      this.hintOut(sp.why ?? 'cantPutHere');
      return false;
    }
    e.plan = sp;
    if (sp.toss) e.liftLeft = THROW_LIFT_TICKS;
    else e.putLeft = PUT_DOWN_TICKS;
    return true;
  }

  /** そっと おろす の おわり（20 ステップ） */
  private finishSoftPut(e: Ent): void {
    const plan = e.plan;
    e.plan = null;
    if (!plan) return;
    if (!this.putDown({ x: plan.x, y: plan.y, z: plan.z })) {
      const why = this.putWhy ?? 'cantPutHere';
      if (this.putWhy === null) this.hintOut(why);
    }
  }

  /** 手 から はなれる（もちあげ 10 ステップ の おわり） */
  private releaseThrow(e: Ent, p: Vec3): void {
    const plan = e.plan!;
    e.plan = null;
    e.carried = false;
    this.carriedId = null;
    e.following = false;
    e.walking = false;
    e.stuck = 0;
    e.bestDist = Infinity;
    e.warpWait = 0;
    e.fluttering = false;
    e.vy = 0;
    e.x = p.x;
    e.y = p.y;
    e.z = p.z;
    const sy = p.y + THROW_HAND_Y;
    const py = plan.y + THROW_LAND_Y;
    const T = Math.max(1, Math.round(THROW_BASE_TICKS + THROW_TICKS_PER_M * dist2d(p.x, p.z, plan.x, plan.z)));
    const delta = py - sy;
    const h = Math.max(sy, py) + THROW_APEX_UP - sy;
    const c = 2 * h - delta + 2 * Math.sqrt(Math.max(0, h * (h - delta)));
    e.flight = { sx: p.x, sy, sz: p.z, tx: plan.x, ty: plan.y, tz: plan.z, c, py, T, k: 0, phase: 'arc' };
    this.setState(e, 'thrown');
    this.push({ type: 'toss', id: e.id, to: { x: plan.x, y: plan.y, z: plan.z } });
    if (bodyFree(this.world, p.x, p.z, sy)) e.y = sy;
    else this.bonk(e);
  }

  /** とちゅう で 当たった: 1 つ 前 の 位置 に もどし、その 場 から まっすぐ パタパタ で おりる */
  private bonk(e: Ent): void {
    const f = e.flight!;
    f.phase = 'fall';
    e.vy = 0;
    e.airFrom = e.y;
    this.push({ type: 'bonk', id: e.id, x: e.x, y: e.y, z: e.z });
  }

  /** とんで いる 1 ステップ。着地 したら false を 返さず 内部 で 小屋 の 子 など を きめる */
  private flightStep(e: Ent, p: Vec3): void {
    const f = e.flight!;
    e.stateTicks++;
    e.fluttering = false;
    if (f.phase === 'arc') {
      f.k++;
      const u = Math.min(1, f.k / f.T);
      const nx = f.sx + (f.tx - f.sx) * u;
      const nz = f.sz + (f.tz - f.sz) * u;
      const ny = f.sy + (f.py - f.sy) * u + f.c * u * (1 - u);
      if (!this.world.isLoaded(Math.floor(nx), Math.floor(nz)) || !bodyFree(this.world, nx, nz, ny)) {
        this.bonk(e);
        return;
      }
      e.x = nx;
      e.y = ny;
      e.z = nz;
      e.vy = 0;
      if (f.k >= f.T) {
        f.phase = 'fall';
        e.airFrom = e.y;
      }
      return;
    }
    // 着地する 列 が まだ 読まれて いない: その場 で とまって まつ（読まれたら つづき。落ち続けて ワープ しない）
    if (!this.world.isLoaded(Math.floor(e.x), Math.floor(e.z))) return;
    if (e.y < -10) {
      // 下 に 地面 が 無い: プレイヤー の そば へ もどす
      e.flight = null;
      e.airFrom = -1;
      this.warp(e, p);
      this.setState(e, 'idle');
      return;
    }
    this.settle(e);
    if (e.vy === 0 && !e.fluttering && e.airFrom < 0) this.landThrown(e, p);
  }

  /** 着地: 出来事 putDown。さく の 上 なら 中 へ よせる。そうでなければ その 場 の 小屋 の きまり */
  private landThrown(e: Ent, p: Vec3): void {
    e.flight = null;
    e.homeX = e.x;
    e.homeZ = e.z;
    e.restLeft = 20 + Math.floor(this.rng() * 40);
    this.push({ type: 'putDown', id: e.id, x: e.x, y: e.y, z: e.z });
    const w = this.world;
    const under = String(w.getBlock(Math.floor(e.x), Math.round(e.y) - 1, Math.floor(e.z)));
    if (under.startsWith('toriya_')) {
      const g = this.glideTarget(e, p);
      if (g) {
        e.glide = g;
        this.setState(e, 'idle');
        return;
      }
    }
    this.finishLanding(e);
  }

  /** さく・もん・ねぐら の 上 に 着いた: 小屋 の 中 3×3 の いちばん 近い あき マス（6 わ なら 外 の プレイヤー がわ の 地面） */
  private glideTarget(e: Ent, p: Vec3): { x: number; z: number } | null {
    const w = this.world;
    let coop: Coop | undefined;
    for (const c of this.coopList) if (inFootprint(c, e.x, e.z)) coop = c;
    if (!coop) return null;
    const c = coop;
    const cells: [number, number][] = [];
    const full = this.kidCount(c.id, e) >= this.settings.coopMax;
    for (let a = -3; a <= 3; a++) {
      for (let b = -3; b <= 3; b++) {
        const inner = Math.abs(a) <= 1 && Math.abs(b) <= 1;
        const ring = Math.max(Math.abs(a), Math.abs(b)) === 3;
        if (full ? !ring : !inner) continue;
        const ix = c.x + a;
        const iz = c.z + b;
        if (!w.isLoaded(ix, iz) || w.isSolid(ix, c.y, iz) || w.isSolid(ix, c.y + 1, iz) || !w.isSolid(ix, c.y - 1, iz)) continue;
        cells.push([ix, iz]);
      }
    }
    if (cells.length === 0) return null;
    const ref = full ? p : e;
    let best = cells[0]!;
    let bd = Infinity;
    for (const [ix, iz] of cells) {
      const d = (ix + 0.5 - ref.x) ** 2 + (iz + 0.5 - ref.z) ** 2;
      if (d < bd) {
        bd = d;
        best = [ix, iz];
      }
    }
    return { x: best[0] + 0.5, z: best[1] + 0.5 };
  }

  /** よせる 1 ステップ（0.5 マス / 12 ステップ） */
  private glideStep(e: Ent): void {
    const g = e.glide!;
    e.stateTicks++;
    if (!this.world.isLoaded(Math.floor(g.x), Math.floor(g.z))) return;
    const dx = g.x - e.x;
    const dz = g.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d <= GLIDE_STEP) {
      e.x = g.x;
      e.z = g.z;
      e.glide = null;
      this.settle(e);
      this.finishLanding(e);
      return;
    }
    e.x += (dx / d) * GLIDE_STEP;
    e.z += (dz / d) * GLIDE_STEP;
    e.yaw += Math.max(-0.25, Math.min(0.25, angleDiff(e.yaw, yawTo(dx, dz))));
    this.settle(e);
  }

  /** 着いた 所 で 小屋 の 子 か なかま か を きめる（中 3×3 → 小屋 の 子・外 → なかま） */
  private finishLanding(e: Ent): void {
    const into = this.coopAtSpot(e);
    if (into && this.kidCount(into.id, e) < this.settings.coopMax) {
      if (e.home !== into.id) {
        this.joinCoop(e, into);
        this.setLock(e, 'cheer', 20);
        return;
      }
    } else if (e.home !== null && !(into && e.home === into.id)) {
      e.home = null;
      e.follow = 0;
    }
    this.setLock(e, 'putDown', PUT_DOWN_TICKS);
  }

  /** 小屋 の 子 に なった しゅんかん の 大きな しるし の 段（いちばん あたらしい 子。1 → 40 ステップ で 0） */
  homePop(): number {
    let v = 0;
    for (const e of this.ents) if (e.popAge >= 0 && e.popAge < POP_TICKS) v = Math.max(v, 1 - e.popAge / POP_TICKS);
    return v;
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
      if (inFootprintAny(this.coopList, cx, cz)) continue;
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
    for (const e of this.ents) {
      if (e.state === 'appear' || e.carried || e.flight || e.meat) continue;
      const box = aimBox(e.stage, e.breed);
      const hw = box.hw;
      const t = slab(origin.x, dir.x, e.x - hw, e.x + hw, 0, maxDist);
      if (t === null) continue;
      const ty = slab(origin.y, dir.y, e.y, e.y + box.h, t[0], t[1]);
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

  /** GOLD-1: なつき度 を もつ 子（なかま の 大人。ふつう・マッチョ どちら も。小屋 の 子 も） */
  private hasNatsuki(e: Ent): boolean {
    return e.friend && e.stage === 'adult';
  }

  preview(id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null {
    const e = this.find(id);
    if (!e || e.carried || e.meat) return null;
    // まち中 の むし は ロック中 でも「まってね」を 返す（feed と おなじ）
    if (e.lock > 0 && held && held.item === 'harapan_mimizu' && this.hasNatsuki(e) && e.state !== 'sleep') return 'feed';
    if (e.lock > 0) return held && held.item === 'mushi' && e.state !== 'sleep' && this.hasNatsuki(e) && e.natsukiBugWait > 0 ? 'animalFull' : null;
    const nat = this.hasNatsuki(e);
    if (held && held.item === 'mushi') {
      if (e.state === 'sleep') return 'animalPet';
      // GOLD-1: なかま の 大人 は むし の まち中 は あげられない（まってね）。おなかいっぱい（600）は まち の ほう が 長い ので 目立たない
      if (nat && e.natsukiBugWait > 0) return 'animalFull';
      return e.fullLeft > 0 ? 'animalFull' : 'feed';
    }
    // はらぱんみみず: なかま の 大人（ねて いない）に あげる。ほか は なでる の まま（右クリック で 合図 だけ 出す）
    if (held && held.item === 'harapan_mimizu') return nat && e.state !== 'sleep' ? 'feed' : 'animalPet';
    if (nat && e.natsukiPetWait > 0 && e.state !== 'sleep') return 'animalFull';
    return 'animalPet';
  }

  /** 合図 natsukiWait は 600 ステップ に 1 回 まで。出来事 natsukiWait と こっち を 見て くび を かしげる は 毎回 */
  private waitReact(e: Ent, which: 'bug' | 'pet'): void {
    this.push({ type: 'natsukiWait', id: e.id, which });
    if (this.tick - this.waitHintAt >= NATSUKI_HINT_GAP) {
      this.waitHintAt = this.tick;
      this.hintOut('natsukiWait');
    }
    this.setLock(e, 'full', FULL_REACT_TICKS);
  }

  /** なつき度 を ふやす（上限 natsukiMax）。70 以下 → 71 以上 に なったら 出来事 natsukiGold */
  private addNatsuki(e: Ent, n: number): void {
    const s = this.settings;
    const before = e.natsuki;
    e.natsuki = Math.max(0, Math.min(s.natsukiMax, before + n));
    if (before <= s.natsukiGoldMin && e.natsuki > s.natsukiGoldMin) this.push({ type: 'natsukiGold', id: e.id });
  }

  feed(id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | 'sleep' | 'wait' | 'harapan' | 'harapanNo' | null {
    const e = this.find(id);
    if (!e || e.carried || e.meat) return null;
    // まち中 の 合図 は 動きの 最中（ロック中）でも 返す（くび を かしげる は つづけて 出さない）
    if (e.lock > 0 && item === 'mushi' && e.state !== 'sleep' && this.hasNatsuki(e) && e.natsukiBugWait > 0) {
      this.push({ type: 'natsukiWait', id: e.id, which: 'bug' });
      if (this.tick - this.waitHintAt >= NATSUKI_HINT_GAP) {
        this.waitHintAt = this.tick;
        this.hintOut('natsukiWait');
      }
      return 'wait';
    }
    // はらぱんみみず は 前 の 動き の 最中 でも あげられる（なかま の 大人 だけ）
    if (e.lock > 0 && !(item === 'harapan_mimizu' && this.hasNatsuki(e))) return null;
    if (item === 'harapan_mimizu') return this.feedHarapan(e);
    if (item !== 'mushi') return null;
    const s = this.settings;
    // ねて いる 子: たべない（むし は へらない）。あさ に あげよう（§2.7）
    if (e.state === 'sleep') {
      this.hintOut('sleepHint');
      return 'sleep';
    }
    // GOLD-1 §4.4: まち中 は あげられない（むし は のこる・くじ も bugs も ふえない）
    if (this.hasNatsuki(e) && e.natsukiBugWait > 0) {
      this.waitReact(e, 'bug');
      return 'wait';
    }
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
    e.bugs++;
    if (e.friend) {
      // ついてくる 時間 が まんたん に もどる（とまって いた なかま も また ついてくる）。小屋 の 子 は ついてこない
      if (e.home === null) {
        e.follow = s.animalFollowTicks;
        e.walking = false;
        e.stuck = 0;
      }
      this.push({ type: 'feed', id, item, hearts: 0, friend: true });
      if (this.hasNatsuki(e)) {
        this.addNatsuki(e, s.natsukiBug);
        e.natsukiBugWait = s.natsukiBugWaitTicks;
      }
      // ひよこ は たまご を うまない（§2.2）
      const roll = e.stage === 'chick' ? { hit: false, misses: e.eggMiss } : rollPity(this.eggRng, s.animalEggChance, s.animalEggPity, e.eggMiss);
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

  /** はらぱんみみず（§4.6）: なかま の 大人 に あげる と なかよし 100。ほか は へらさない（合図） */
  private feedHarapan(e: Ent): 'harapan' | 'harapanNo' {
    if (e.state === 'sleep') {
      this.hintOut('sleepHint');
      return 'harapanNo';
    }
    if (!this.hasNatsuki(e)) {
      // やせい は 今 の「なでる」の 返し（見る・くび を かしげる）。ひよこ は じっと
      if (!e.friend) {
        this.push({ type: 'pet', id: e.id, friend: false });
        this.setLock(e, 'pet', this.settings.animalReactTicks);
      }
      this.hintOut('harapanFriend');
      return 'harapanNo';
    }
    if (e.natsuki >= this.settings.natsukiMax) {
      this.hintOut('harapanFull');
      this.setLock(e, 'full', FULL_REACT_TICKS);
      return 'harapanNo';
    }
    this.addNatsuki(e, this.settings.natsukiMax);
    this.push({ type: 'harapanFeed', id: e.id });
    // お祝い: 金 の たまご を うんだ ときの「2 回 ジャンプ」（LIVE-2 §2.8）を 使い回す
    this.setLock(e, 'cheer', 40);
    return 'harapan';
  }

  /** パネル の 状態（§3.2・§6）。なかま の 大人 だけ shown（だっこ 中 は 出ない） */
  natsukiView(id: number): NatsukiView | null {
    const e = this.find(id);
    if (!e) return null;
    const s = this.settings;
    const shown = this.hasNatsuki(e) && !e.carried && e.flight === null;
    const bw = Math.max(1, s.natsukiBugWaitTicks);
    const pw = Math.max(1, s.natsukiPetWaitTicks);
    return {
      shown,
      hearts: Math.min(10, Math.floor((e.natsuki * 10) / Math.max(1, s.natsukiMax))),
      gold: e.natsuki > s.natsukiGoldMin,
      bugReady: e.natsukiBugWait <= 0,
      petReady: e.natsukiPetWait <= 0,
      bugFill: e.natsukiBugWait <= 0 ? 1 : 1 - Math.min(1, e.natsukiBugWait / bw),
      petFill: e.natsukiPetWait <= 0 ? 1 : 1 - Math.min(1, e.natsukiPetWait / pw),
    };
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

  pet(id: number): 'wild' | 'friend' | 'wait' | null {
    const e = this.find(id);
    if (!e || e.lock > 0 || e.carried || e.meat) return null;
    if (!e.friend) {
      this.push({ type: 'pet', id, friend: false });
      this.hintOut('feedHint');
      this.setLock(e, 'pet', this.settings.animalReactTicks);
      return 'wild';
    }
    if (this.hasNatsuki(e)) {
      // GOLD-1 §4.4: なでる の まち中 は なでられない（ねて いる 子 も おなじ）
      if (e.natsukiPetWait > 0) {
        this.waitReact(e, 'pet');
        return 'wait';
      }
      this.addNatsuki(e, this.settings.natsukiPet);
      e.natsukiPetWait = this.settings.natsukiPetWaitTicks;
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
      v.follow = e.home !== null ? 0 : e.follow;
      v.fullLeft = e.fullLeft;
      v.carried = e.carried;
      v.fluttering = e.fluttering;
      v.stage = e.stage;
      v.breed = e.breed;
      v.home = e.home;
      v.homeFill = e.home === null && e.enterT > 0 ? Math.min(1, e.enterT / Math.max(1, this.settings.coopEnterTicks)) : undefined;
      v.hatchT = e.lock > 0 && e.lockKind === 'hatch' ? 1 - e.lock / Math.max(1, e.lockTotal) : undefined;
      v.growT = e.lock > 0 && e.lockKind === 'grow' ? 1 - e.lock / Math.max(1, e.lockTotal) : undefined;
      v.rollT = e.rollLeft > 0 ? 1 - e.rollLeft / ROLL_TICKS : undefined;
      v.homePop = e.popAge >= 0 && e.popAge < POP_TICKS ? 1 - e.popAge / POP_TICKS : 0;
      v.liftT = e.liftLeft > 0 ? 1 - e.liftLeft / THROW_LIFT_TICKS : undefined;
      v.thrown = e.flight !== null;
      v.fight = e.fs !== 'none' ? true : undefined;
      v.bang = e.bangLeft > 0 ? true : undefined;
      v.target = e.target ?? undefined;
      if (e.meat) this.meatDraw(e, v);
      fn(v);
    }
  }

  // ------------------------------------------------------------ LIVE-2: こたつ・とりごや（窓口 の 形 は contracts の `AnimalApi`）

  /** 小屋 を 置く（ゲーム の 置く と 同じ 判定。ねらった 所 が だめ なら まわり 8 か所）。x・z は 5×5 の まん中、y は いちばん 下 の 空気 の 高さ */
  placeCoop(x: number, y: number, z: number, dir: CoopDir = 0): CoopPlaceResult {
    if (!this.d.placeCoopBlocks) return 'noRoom';
    if (this.coopList.length >= this.settings.coopCountMax) {
      this.hintOut('coopMax');
      return 'max';
    }
    const at = this.findCoopSpot(x, y, z);
    if (!at || !this.d.placeCoopBlocks(at.x, y, at.z, dir)) {
      this.hintOut('coopNoRoom');
      return 'noRoom';
    }
    const c: Coop = { id: this.nextCoopId++, x: at.x, y, z: at.z, dir, egg: 0, gold: 0, meat: null };
    this.coopList.push(c);
    return c.id;
  }

  previewCoop(x: number, y: number, z: number, dir: CoopDir = 0): CoopPlacePreview {
    const at = this.d.placeCoopBlocks && this.coopList.length < this.settings.coopCountMax ? this.findCoopSpot(x, y, z) : null;
    return at ? { x: at.x, y, z: at.z, dir, ok: true } : { x, y, z, dir, ok: false };
  }

  /** その マス が こたつ の 3 マス の どれか なら 本体 の マス。ほか は そのまま */
  private kitAnchor(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const a = kotatsuAnchorOf(String(this.world.getBlock(ix, iy, iz)), ix, iz);
    return { x: a.x, y: iy, z: a.z };
  }

  /** 本体 の まわり に 3 マス が そろって いれば 2、古い 1 マス こたつ なら 1 */
  private kitSize(k: { x: number; y: number; z: number }): 1 | 2 {
    return isBigKotatsu((x, y, z) => String(this.world.getBlock(x, y, z)), k.x, k.y, k.z) ? 2 : 1;
  }

  kits(): KitInfo[] {
    return this.kitList.map((k) => this.kitInfo(k, { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, eggs: [] }, true));
  }

  coops(): CoopInfo[] {
    return this.coopList.map((c) => this.coopInfo(c));
  }

  /** その マス の こたつ（たまご が 入って いる もの だけ） */
  kitAt(x: number, y: number, z: number): KitInfo | null {
    const a = this.kitAnchor(x, y, z);
    const k = this.kitList.find((o) => o.x === a.x && o.y === a.y && o.z === a.z);
    return k ? this.kitInfo(k, { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, eggs: [] }, true) : null;
  }

  /** その ブロック を 持つ 小屋（まわり の わ。さく・もん・ねぐら・すばこ） */
  coopAt(x: number, y: number, z: number): CoopInfo | null {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    for (const c of this.coopList) {
      const dx = Math.abs(ix - c.x);
      const dz = Math.abs(iz - c.z);
      if (dx > COOP_HALF || dz > COOP_HALF || (dx !== COOP_HALF && dz !== COOP_HALF)) continue;
      if (iy < c.y || iy >= c.y + COOP_HEIGHT) continue;
      return this.coopInfo(c);
    }
    return null;
  }

  /**
   * 右クリック: こたつ を ねらった（LIVE-2 §2.1・LIVE-2.1 §2.4）。`held` = 持って いる もの。
   * 入れた → 'put'（C が 1 つ へらす）。その こたつ が 3 こ → 'full'（kitFull）・たまご じゃ ない 物 → 'wait'（入って いる）／'needEgg'（から）・
   * あたためる たまご が 世界 ぜんぶ で 6 こ → 'max'（kitMax）。どれ も 合図 は ここ で 出す。
   * 置ける 物 を 持って いる とき の「となり に 置く」は C が 決めて、この 口 は 呼ばない。
   */
  useKit(x: number, y: number, z: number, held: ItemId | null): KitUseResult {
    // こたつ 2×2: 4 マス の どれ を ねらって も 本体（北西 の マス）の こたつ 1 台 として あつかう
    const { x: ix, y: iy, z: iz } = this.kitAnchor(x, y, z);
    const egg: KitEgg | null = held === 'egg' ? 'egg' : held === 'kin_tamago' ? 'gold' : null;
    const kit = this.kitList.find((k) => k.x === ix && k.y === iy && k.z === iz);
    if (kit && !egg) {
      this.hintOut('kitWait');
      return 'wait';
    }
    if (!egg || String(this.world.getBlock(ix, iy, iz)) !== BLOCK_NUKUNUKU) {
      this.hintOut('kitNeedEgg');
      return 'needEgg';
    }
    if (kit && kit.eggs.length >= this.settings.kitEggMax) {
      this.hintOut('kitFull');
      return 'full';
    }
    if (this.kitEggCount() >= this.settings.kitActiveMax) {
      this.hintOut('kitMax');
      return 'max';
    }
    const total = Math.max(1, Math.round(this.settings.kitHatchTicks));
    const row: KitEggRow = { egg, left: total, total };
    if (kit) kit.eggs.push(row);
    else this.kitList.push({ x: ix, y: iy, z: iz, eggs: [row], chick: 0, hatch: null, gap: 0, fullWait: 0, retry: 0 });
    return 'put';
  }

  /** 世界 ぜんぶ で あたため 中 の たまご の 数 */
  private kitEggCount(): number {
    let n = 0;
    for (const k of this.kitList) n += k.eggs.length;
    return n;
  }

  /**
   * 天板 の 上 の たまご の 3 わく（LIVE-2.1 §3.2・AC12）。プレイヤー 水平 8 以内 の こたつ（たまご が 入って いる）と、
   * たまご を 持って ねらって いる こたつ（から でも 3 わく とも null）。
   */
  kitIcons(aimed: { x: number; y: number; z: number } | null, holdingEgg: boolean): KitIcon[] {
    const out: KitIcon[] = [];
    const p = this.getPlayer().position;
    const a = aimed && holdingEgg ? this.kitAnchor(aimed.x, aimed.y, aimed.z) : null;
    const row = (k: Kit | null, x: number, y: number, z: number): KitIcon => {
      const slots: KitIcon['slots'] = [];
      for (let i = 0; i < this.settings.kitEggMax; i++) {
        const r = k?.eggs[i];
        slots.push(r ? { egg: r.egg, fill: r === k?.hatch ? 1 : Math.max(0, Math.min(1, 1 - r.left / Math.max(1, r.total))), wobble: this.eggWobble(r) } : { egg: null, fill: 0, wobble: 0 });
      }
      return { x, y, z, slots };
    };
    let aimedDone = false;
    for (const k of this.kitList) {
      const isAimed = !!a && a.x === k.x && a.y === k.y && a.z === k.z;
      const half = (k.size ?? 1) / 2;
      if (isAimed) aimedDone = true;
      if (!isAimed && dist2d(k.x + half, k.z + half, p.x, p.z) > KIT_ICON_DIST) continue;
      out.push(row(k, k.x, k.y, k.z));
    }
    if (a && !aimedDone && String(this.world.getBlock(a.x, a.y, a.z)) === BLOCK_NUKUNUKU) out.push(row(null, a.x, a.y, a.z));
    return out;
  }

  /** 入る なら 持ち物 へ（入らなければ 足もと に 落とさず false）。`tryAddItem` が なければ `addItem` */
  private tryAdd(item: ItemId): boolean {
    return this.d.tryAddItem ? this.d.tryAddItem(item) : this.d.addItem(item);
  }

  /** 右クリック: 小屋 の すばこ の たまご を ぜんぶ 持ち物 へ（入らない 分 は のこる）。あつめた 数 */
  collectCoop(coopId: number): { egg: number; gold: number } {
    const c = this.coopById(coopId);
    if (!c) return { egg: 0, gold: 0 };
    let egg = 0;
    let gold = 0;
    while (c.gold > 0 && this.tryAdd('kin_tamago')) {
      c.gold--;
      gold++;
    }
    while (c.egg > 0 && this.tryAdd('egg')) {
      c.egg--;
      egg++;
    }
    if (egg + gold > 0) this.push({ type: 'coopCollect', egg, gold });
    return { egg, gold };
  }

  /** 左クリック を 押した: 中 に 子 が いれば 'locked'（押した ステップ だけ 合図 と 出来事。だっこ 中 の 子 も 数える） */
  breakCoop(coopId: number, firstPress: boolean): CoopBreakResult {
    const c = this.coopById(coopId);
    if (!c || this.kidCount(c.id) === 0) return 'ok';
    if (firstPress) {
      this.hintOut('coopNotEmpty');
      this.lockHintAt = this.tick;
      this.push({ type: 'coopLocked', coop: c.id });
    } else if (this.tick - this.lockHintAt >= 100) {
      // 押し つづけて いる あいだ は 合図 の チップ が 消えない よう 100 ステップ ごと に 出し直す（出来事 coopLocked は 出さない）
      this.hintOut('coopNotEmpty');
      this.lockHintAt = this.tick;
    }
    return 'locked';
  }

  /** 小屋 を 消す（子 0 の とき だけ。いれば false）。すばこ の たまご を おとし、ブロック は `removeCoopBlocks` で ぜんぶ 消す */
  removeCoop(coopId: number): boolean {
    const i = this.coopList.findIndex((c) => c.id === coopId);
    if (i < 0) return false;
    const c = this.coopList[i]!;
    if (this.kidCount(c.id) > 0) return false;
    this.coopList.splice(i, 1);
    const at = { x: c.x + 0.5, y: c.y + 0.3, z: c.z + 0.5 };
    // toriya 1 は C が 持ち物 に わたす。すばこ の たまご は ここ で おとす
    for (let n = 0; n < c.egg; n++) {
      if (this.d.dropItem) this.d.dropItem(at, 'egg');
      else this.d.dropEgg(at);
    }
    for (let n = 0; n < c.gold; n++) this.dropGold(at);
    this.d.removeCoopBlocks?.(c.x, c.y, c.z, c.dir);
    return true;
  }

  /** ひよこ から 数えて 種類 の くじ の はずれ 数（保存 される）。`n` を 渡す と 設定 */
  machoMiss(n?: number): number {
    if (n !== undefined && Number.isFinite(n)) this.breedState.machoMiss = Math.max(0, Math.round(n));
    return this.breedState.machoMiss;
  }

  /** B が 描く: こたつ（たまご が 入って いる もの）。`hatchT` = かえる 動き の 進み 0〜1（動き 中 で ない とき 0）。同じ 行 を 使いまわす */
  forEachKit(fn: (k: KitInfo & { hatchT: number }) => void): void {
    const r = this.kitScratch;
    for (const k of this.kitList) {
      this.kitInfo(k, r, false);
      r.size = this.kitSize(k);
      const c = k.chick !== 0 ? this.find(k.chick) : undefined;
      r.hatchT = c && c.lock > 0 && c.lockKind === 'hatch' ? 1 - c.lock / Math.max(1, c.lockTotal) : 0;
      fn(r);
    }
  }

  /** B が 描く: 小屋（すばこ の 数 と 子 の 数） */
  forEachCoop(fn: (c: CoopInfo) => void): void {
    for (const c of this.coopList) fn(this.coopInfo(c));
  }

  // ------------------------------------------------------------ LIVE-3: えらべる 子・いただきます（docs/design/LIVE-3.md §2.1・§2.4）

  /** その 小屋 の えらべる 子 の id（§2.1）: `meatEligible` で、だっこ 中・演出 中・とんで いる 子 は のぞく */
  meatList(coopId: number): number[] {
    const out: number[] = [];
    for (const e of this.ents) if (e.home === coopId && this.canMeat(e)) out.push(e.id);
    return out;
  }

  private canMeat(e: Ent): boolean {
    return meatEligible(e) && !e.carried && !e.meat && !e.flight && !e.glide;
  }

  /**
   * いただきます を はじめる（メニュー の 「いただきます」と 同じ）。えらべない 子 は `notEligible`（演出 中 の 小屋 でも 先 に 見る）、
   * その 小屋 で すでに 演出 中 なら `busy`
   */
  meat(coopId: number, id: number): { ok: boolean; reason: null | 'notEligible' | 'busy' } {
    const c = this.coopById(coopId);
    const e = this.find(id);
    if (!c || !e || e.home !== c.id || !this.canMeat(e)) return { ok: false, reason: 'notEligible' };
    if (c.meat) return { ok: false, reason: 'busy' };
    c.meat = { id: e.id, t: 0, sx: e.x, sz: e.z };
    e.meat = true;
    e.lock = 0;
    e.egg = false;
    e.walking = false;
    e.following = false;
    e.look = false;
    this.setState(e, 'meat');
    this.push({ type: 'meatStart', id: e.id, coop: c.id });
    return { ok: true, reason: null };
  }

  /** ねぐら の 中 の 場所（小屋 の まん中 から もん の 反対 がわ） */
  private nestSpot(c: Coop): { x: number; z: number } {
    const [fx, fz] = DIR_VEC[c.dir]!;
    return { x: c.x + 0.5 - fx * MEAT_NEST_DIST, z: c.z + 0.5 - fz * MEAT_NEST_DIST };
  }

  /** とびら の ようす（演出 の ステップ `t` から）。60 まで あいて いる・60〜80 おりる・80〜(meatTicks−20) しまって いる・そのあと あがる */
  private doorOf(c: Coop): { door: 'open' | 'closed' | 'moving'; t: number } {
    const job = c.meat;
    if (!job) return { door: 'open', t: 0 };
    const t = job.t;
    const give = this.settings.meatTicks - MEAT_DOOR_TICKS;
    if (t <= MEAT_DOOR_FROM) return { door: 'open', t: 0 };
    if (t < MEAT_DOOR_FROM + MEAT_DOOR_TICKS) return { door: 'moving', t: (t - MEAT_DOOR_FROM) / MEAT_DOOR_TICKS };
    if (t < give) return { door: 'closed', t: 1 };
    if (t < this.settings.meatTicks) return { door: 'moving', t: 1 - (t - give) / MEAT_DOOR_TICKS };
    return { door: 'open', t: 0 };
  }

  /** 演出 の 一言 の ふわっと 度（0〜1。出て いなければ null）。複数 の 小屋 なら いちばん 濃い もの */
  meatSay(): number | null {
    let best: number | null = null;
    const give = this.settings.meatTicks - MEAT_DOOR_TICKS;
    for (const c of this.coopList) {
      const job = c.meat;
      if (!job || job.t < MEAT_SAY_AT) continue;
      const t = job.t;
      const a = t < MEAT_SAY_AT + MEAT_SAY_FADE ? (t - MEAT_SAY_AT) / MEAT_SAY_FADE : t < give ? 1 : 1 - (t - give) / MEAT_SAY_FADE;
      const v = Math.max(0, Math.min(1, a));
      if (best === null || v > best) best = v;
    }
    return best;
  }

  /** 保存 の 前: 演出 中 の 子 を その場 で おわらせる（にく は 持ち物 か 足もと。読み直し に 演出 の 続き は 出ない） */
  finishMeat(): void {
    for (const c of this.coopList) if (c.meat) this.finishJob(c);
  }

  /** 毎ステップ（子 の 前）: 時計 を すすめ、とびら・一言・にく の とき を 出す */
  private meatTick(c: Coop): void {
    const job = c.meat!;
    const give = this.settings.meatTicks - MEAT_DOOR_TICKS;
    const e = this.find(job.id);
    // 読みこまない 所 に なった・子 が いなく なった（にく が 入る 前）: その場 で おわらせる
    if (job.t < give && (!e || !this.world.isLoaded(Math.floor(c.x), Math.floor(c.z)))) {
      this.finishJob(c);
      return;
    }
    job.t++;
    const t = job.t;
    if (t === MEAT_DOOR_FROM + MEAT_DOOR_TICKS) this.push({ type: 'meatDoor', coop: c.id, closed: true });
    if (t === MEAT_SAY_AT && e) this.push({ type: 'meatSay', id: e.id, coop: c.id });
    if (t === give && e) this.giveMeat(c, e);
    if (t >= this.settings.meatTicks) {
      this.push({ type: 'meatDoor', coop: c.id, closed: false });
      c.meat = null;
    }
  }

  /** 演出 を いま おわらせる（子 は いなく なり、にく が 入る。とびら は ひらく） */
  private finishJob(c: Coop): void {
    const job = c.meat;
    if (!job) return;
    const e = this.find(job.id);
    c.meat = null;
    if (e) this.giveMeat(c, e);
  }

  /** 子 を 消して、にく を 持ち物 へ（入らない 分 は プレイヤー の 足もと に おとしもの） */
  private giveMeat(c: Coop, e: Ent): void {
    const n = Math.max(0, Math.round(this.settings.meatPerBird));
    let dropped = 0;
    const p = this.getPlayer().position;
    for (let i = 0; i < n; i++) {
      if (this.tryAdd('momo_nama')) continue;
      dropped++;
      const at = { x: p.x, y: p.y + 0.5, z: p.z };
      if (this.d.dropItem) this.d.dropItem(at, 'momo_nama');
      else this.d.addItem('momo_nama');
    }
    const i = this.ents.indexOf(e);
    if (i >= 0) this.ents.splice(i, 1);
    if (this.targetId === e.id) this.targetId = null;
    this.push({ type: 'meat', id: e.id, coop: c.id, count: n, dropped });
  }

  /** 演出 中 の 子 の 1 ステップ: ねぐら の 中 へ とことこ 歩き、そのあと は ねぐら の 中 で じっと */
  private meatBird(e: Ent): void {
    const c = e.home === null ? undefined : this.coopById(e.home);
    const job = c?.meat;
    if (!c || !job || job.id !== e.id) {
      e.meat = false;
      this.setState(e, 'rest');
      return;
    }
    this.setState(e, 'meat');
    const to = this.nestSpot(c);
    const k = Math.min(1, job.t / (MEAT_WALK - 5));
    const nx = job.sx + (to.x - job.sx) * k;
    const nz = job.sz + (to.z - job.sz) * k;
    if (k < 1) {
      const dx = nx - e.x;
      const dz = nz - e.z;
      if (Math.hypot(dx, dz) > 1e-4) {
        e.yaw = yawTo(dx, dz);
        e.headYaw = e.yaw;
      }
    }
    e.x = nx;
    e.z = nz;
    e.y = c.y;
    e.vy = 0;
  }

  /** 描く 側 に わたす 場所: ねぐら に 着く ころ、ねぐら の ゆか（とびら の うしろ）へ そっと のぼる */
  private meatDraw(e: Ent, v: AnimalView): void {
    const c = e.home === null ? undefined : this.coopById(e.home);
    const job = c?.meat;
    if (!c || !job) return;
    const k = Math.max(0, Math.min(1, (job.t - (MEAT_WALK - 15)) / 15));
    const [fx, fz] = DIR_VEC[c.dir]!;
    v.x = e.x - fx * 0.7 * k;
    v.z = e.z - fz * 0.7 * k;
    v.y = e.y + 0.9 * k;
  }

  // ------------------------------------------------------------ 保存(SaveExtra)

  /**
   * 保存（LIVE-2.1 §4.3・v 4）。だっこ 中 は プレイヤー の 足もと の 位置 が そのまま 入る。なげて いる とちゅう は 着地点 に いる もの と して 書く
   * （小屋 の 中 なら 小屋 の 子）。かえる 動き 中 の ひよこ は こたつ に 戻して 入れる（読み直す と また かえる）
   */
  serialize(): AnimalSaveV4 {
    const where = (e: Ent): { x: number; y: number; z: number; home: number | null } => {
      if (e.flight) {
        const f = e.flight;
        const into = this.coopAtSpot({ x: f.tx, y: f.ty, z: f.tz });
        return { x: f.tx, y: f.ty, z: f.tz, home: into && this.kidCount(into.id, e) < this.settings.coopMax ? into.id : null };
      }
      if (e.glide) {
        const into = this.coopAtSpot({ x: e.glide.x, y: e.y, z: e.glide.z });
        return { x: e.glide.x, y: e.y, z: e.glide.z, home: into ? into.id : null };
      }
      return { x: e.x, y: e.y, z: e.z, home: e.home };
    };
    // 保存 の 大きさ（4,000 文字 以下）の ため、0・false の 項目 は 書かない（読む とき は 無ければ 0・false）
    const bird = (e: Ent, at: { x: number; y: number; z: number; home: number | null }): AnimalBirdSave => {
      const b: AnimalBirdSave = {
        x: round2(at.x),
        y: round2(at.y),
        z: round2(at.z),
        yaw: round2(e.yaw),
        follow: at.home !== null ? 0 : Math.round(e.follow),
        stage: e.stage,
        breed: e.breed,
      };
      if (e.raised) b.raised = true;
      if (e.bugs > 0) b.bugs = e.bugs;
      if (e.goldMiss > 0) b.goldMiss = e.goldMiss;
      if (e.grow > 0) b.grow = e.grow;
      if (e.natsuki > 0) b.natsuki = e.natsuki;
      if (e.natsukiBugWait > 0) b.natsukiBugWait = e.natsukiBugWait;
      if (e.natsukiPetWait > 0) b.natsukiPetWait = e.natsukiPetWait;
      // へる まで の のこり は なつき度 が 0 なら 意味 が ない ので 書かない（読む とき は まんたん）
      if (e.natsuki > 0 && e.natsukiDecayLeft !== this.settings.natsukiDecayTicks) b.natsukiDecayLeft = e.natsukiDecayLeft;
      return b;
    };
    const friends: AnimalBirdSave[] = [];
    const kidsOf = new Map<number, AnimalBirdSave[]>();
    for (const e of this.ents) {
      if (!e.friend) continue;
      const at = where(e);
      if (at.home !== null) {
        const list = kidsOf.get(at.home) ?? [];
        list.push(bird(e, at));
        kidsOf.set(at.home, list);
        continue;
      }
      if (e.lock > 0 && e.lockKind === 'hatch') continue;
      friends.push(bird(e, at));
    }
    const coops = this.coopList.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      z: c.z,
      dir: c.dir,
      kids: kidsOf.get(c.id) ?? [],
      nest: { egg: c.egg, gold: c.gold },
    }));
    const kits = this.kitList.map((k) => ({ x: k.x, y: k.y, z: k.z, eggs: k.eggs.map((r) => ({ egg: r.egg, left: r === k.hatch ? 0 : r.left })) }));
    return { v: 4, friends, coops, kits, machoMiss: this.breedState.machoMiss };
  }

  /** 読みこみ。版 1（`eggDay` つき・`follow` なし）→ 版 2 → 版 3 の 順 に 直す（台帳 G8） */
  deserialize(data: unknown): void {
    this.clear();
    this.resetLive();
    const s = this.settings;
    const p = parseAnimalSave(data, {
      followMax: s.animalFollowTicks,
      friendMax: s.animalFriendMax,
      coopMax: s.coopMax,
      coopCountMax: s.coopCountMax,
      kitMax: s.kitActiveMax,
      kitEggMax: s.kitEggMax,
      natsukiMax: s.natsukiMax,
      bugWaitMax: s.natsukiBugWaitTicks,
      petWaitMax: s.natsukiPetWaitTicks,
      decayMax: s.natsukiDecayTicks,
    });
    if (!p) return;
    for (const b of p.friends) {
      const e = this.make(b.x, b.y, b.z, true, 0, b.follow);
      this.applyBird(e, b);
      this.ents.push(e);
    }
    for (const r of p.coops) {
      let id = r.id;
      if (id === null || id < 1 || this.coopList.some((c) => c.id === id)) id = Math.max(this.nextCoopId, ...this.coopList.map((c) => c.id + 1));
      const c: Coop = { id, x: r.x, y: r.y, z: r.z, dir: r.dir, egg: r.egg, gold: r.gold, meat: null };
      if (c.egg + c.gold > s.coopNestMax) {
        c.gold = Math.min(c.gold, s.coopNestMax);
        c.egg = Math.max(0, s.coopNestMax - c.gold);
      }
      this.coopList.push(c);
      this.nextCoopId = Math.max(this.nextCoopId, id + 1);
      for (const b of r.kids) {
        const inside = inInterior(c, b.x, b.z, 0);
        const e = this.make(inside ? b.x : c.x + 0.5, inside ? b.y : c.y, inside ? b.z : c.z + 0.5, true, 0, 0);
        this.applyBird(e, b);
        this.makeKid(e, c);
        this.ents.push(e);
      }
    }
    for (const k of p.kits) {
      // こたつ の ブロック が 無い 行 は すてる（読みこんで いない 所 は あとで 見る）
      if (this.world.isLoaded(k.x, k.z) && String(this.world.getBlock(k.x, k.y, k.z)) !== BLOCK_NUKUNUKU) continue;
      const total = Math.max(1, Math.round(s.kitHatchTicks));
      const eggs = k.eggs.map((r) => ({ egg: r.egg, left: r.left, total: Math.max(total, r.left) }));
      this.kitList.push({ x: k.x, y: k.y, z: k.z, eggs, chick: 0, hatch: null, gap: 0, fullWait: 0, retry: 0 });
    }
    this.breedState.machoMiss = p.machoMiss;
  }

  private applyBird(e: Ent, b: ParsedBird): void {
    e.yaw = b.yaw;
    e.headYaw = b.yaw;
    e.stage = b.stage;
    e.breed = b.breed;
    e.raised = b.raised;
    e.bugs = b.bugs;
    e.goldMiss = b.goldMiss;
    e.grow = b.grow;
    e.natsuki = b.natsuki;
    e.natsukiBugWait = b.natsukiBugWait;
    e.natsukiPetWait = b.natsukiPetWait;
    e.natsukiDecayLeft = b.natsukiDecayLeft;
  }

  /** 小屋・こたつ・くじ を ぜんぶ 空 に する（読みこみ の まえ） */
  private resetLive(): void {
    this.kitList = [];
    this.coopList = [];
    this.nextCoopId = 1;
    this.breedState.machoMiss = 0;
    this.lastDay = null;
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
    this.night = this.d.phase() === 'night';
    this.fighterIds = this.pickFightersNow();
    this.checkMorning();
    for (const c of this.coopList) if (c.meat) this.meatTick(c);
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i]!;
      if (e.friend && e.stage === 'adult') this.natsukiTick(e);
      if (!this.step(e, p)) this.ents.splice(i, 1);
    }
    // かさならない: すわっている なかま を はなす（小屋 の 子 は 中 3×3 だけ なので はなさない）
    for (const e of this.ents) if (e.friend && e.home === null && !e.following && !e.carried && !e.flight && !e.glide && e.lock === 0 && e.fs === 'none') this.separate(e, p);
    if (this.kitList.length > 0) this.updateKits(p);
    if (this.coopList.length > 0 && ++this.coopCheckT >= COOP_CHECK_EVERY) {
      this.coopCheckT = 0;
      this.checkCoopBlocks();
    }
  }

  /** GOLD-1: なつき度 の 時間（まち が へる・10 分 ごと に へる）。はなれて いても・ねて いても 世界 の 時計 で すすむ。へる が 先 */
  private natsukiTick(e: Ent): void {
    const s = this.settings;
    // なつき度 0 の 間 は へる もの が 無い ので 時計 は 止める（はじめて 上がった とき から 数える）
    if (e.natsuki > 0 && --e.natsukiDecayLeft <= 0) {
      e.natsuki = Math.max(0, e.natsuki - s.natsukiDecay);
      e.natsukiDecayLeft = s.natsukiDecayTicks;
    }
    if (e.natsukiBugWait > 0 && --e.natsukiBugWait === 0 && e.id === this.targetId) this.push({ type: 'natsukiReady', id: e.id, which: 'bug' });
    if (e.natsukiPetWait > 0 && --e.natsukiPetWait === 0 && e.id === this.targetId) this.push({ type: 'natsukiReady', id: e.id, which: 'pet' });
  }

  // ------------------------------------------------------------ 内部 (LIVE-2)

  private coopById(id: number): Coop | undefined {
    for (const c of this.coopList) if (c.id === id) return c;
    return undefined;
  }

  /** 小屋 の 子 の 数（`except` は 数えない = 自分 が 戻る 時） */
  private kidCount(id: number, except?: Ent): number {
    let n = 0;
    for (const e of this.ents) if (e.home === id && e !== except) n++;
    return n;
  }

  /** その 位置 が ある 小屋 の 中 3×3（足 の 高さ も 合う）なら その 小屋 */
  private coopAtSpot(p: Vec3, margin = 0): Coop | undefined {
    for (const c of this.coopList) if (inInterior(c, p.x, p.z, margin) && p.y > c.y - 1.5 && p.y < c.y + 2) return c;
    return undefined;
  }

  private coopInfo(c: Coop): CoopInfo {
    const kids: number[] = [];
    for (const e of this.ents) if (e.home === c.id) kids.push(e.id);
    const door = this.doorOf(c);
    return {
      id: c.id,
      x: c.x,
      y: c.y,
      z: c.z,
      dir: c.dir,
      gate: gateCell(c.x, c.z, c.dir),
      kids,
      nest: { egg: c.egg, gold: c.gold },
      door: door.door,
      doorT: door.t,
      meatBusy: c.meat ? c.meat.id : null,
    };
  }

  /** のこり 2/3 以上 = じっと・1/3 以上 = ときどき・それ より 少ない = よく ゆれる（LIVE-2 §2.1。LIVE-2.1: たまご ごと） */
  private eggWobble(r: KitEggRow | undefined): 0 | 1 | 2 {
    if (!r) return 0;
    return r.left * 3 >= r.total * 2 ? 0 : r.left * 3 >= r.total ? 1 : 2;
  }

  /** `deep` = たまご の 行 を 新しく 作って 入れる（窓口 用）。しない とき は 使いまわす 入れもの に 書く（描く 側 用） */
  private kitInfo(k: Kit, out: KitInfo, deep: boolean): KitInfo {
    out.x = k.x;
    out.y = k.y;
    out.z = k.z;
    const first = k.eggs[0];
    out.egg = first ? first.egg : null;
    out.left = first ? first.left : 0;
    out.wobble = this.eggWobble(first);
    if (deep) {
      out.size = this.kitSize(k);
      out.eggs = k.eggs.map((r) => ({ egg: r.egg, left: r.left, wobble: this.eggWobble(r) }));
    } else {
      const list = out.eggs ?? (out.eggs = []);
      list.length = k.eggs.length;
      for (let i = 0; i < k.eggs.length; i++) {
        const r = k.eggs[i]!;
        const q = list[i];
        if (q) {
          q.egg = r.egg;
          q.left = r.left;
          q.wobble = this.eggWobble(r);
        } else list[i] = { egg: r.egg, left: r.left, wobble: this.eggWobble(r) };
      }
    }
    return out;
  }

  /** ねらった 所 → まわり 8 か所 の 順 に ためして、入る 5×5×4 の まん中（他の 小屋 と かさならない） */
  private findCoopSpot(x: number, y: number, z: number): { x: number; z: number } | null {
    for (const [sx, sz] of COOP_SHIFTS) {
      const cx = x + sx;
      const cz = z + sz;
      if (!coopFits(this.world, cx, y, cz)) continue;
      const at = { x: cx, y, z: cz };
      if (this.coopList.some((c) => coopsOverlap(c, at))) continue;
      return { x: cx, z: cz };
    }
    return null;
  }

  /** 小屋 の 子 に する（`announce` = 出来事 `home` を 出す） */
  private joinCoop(e: Ent, c: Coop, announce = true): void {
    e.home = c.id;
    e.follow = 0;
    e.following = false;
    e.walking = false;
    e.stuck = 0;
    e.bestDist = Infinity;
    e.warpWait = 0;
    e.enterT = 0;
    e.homeX = c.x + 0.5;
    e.homeZ = c.z + 0.5;
    e.restLeft = 20 + Math.floor(this.rng() * 40);
    if (announce) {
      e.popAge = 0;
      this.push({ type: 'home', id: e.id, coop: c.id });
    }
  }

  private makeKid(e: Ent, c: Coop): void {
    this.joinCoop(e, c, false);
  }

  private dropGold(at: Vec3): void {
    if (this.d.dropItem) this.d.dropItem(at, 'kin_tamago');
    else this.d.dropEgg(at);
  }

  /** あさ（`day()` が ふえた 時）: 小屋 の ひよこ の そだつ 日 ＋1（上限 chickGrowDays） */
  private checkMorning(): void {
    const day = this.d.day();
    if (this.lastDay === null || day < this.lastDay) {
      this.lastDay = day;
      return;
    }
    if (day === this.lastDay) return;
    const n = day - this.lastDay;
    this.lastDay = day;
    const max = this.settings.chickGrowDays;
    for (const e of this.ents) if (e.home !== null && e.stage === 'chick') e.grow = Math.min(max, e.grow + n);
  }

  /** 小屋 の 子 の ひよこ が 大人 に なれる か（あさ 2 回 むかえた・プレイヤー が 小屋 から 近い） */
  private growCheck(e: Ent, p: Vec3): void {
    if (e.home === null || e.stage !== 'chick' || e.grow < this.settings.chickGrowDays) return;
    const c = this.coopById(e.home);
    if (!c) return;
    const s = this.settings;
    if (dist2d(c.x + 0.5, c.z + 0.5, p.x, p.z) > s.kitHatchDist || Math.abs(p.y - c.y) > 8) return;
    this.push({ type: 'growStart', id: e.id });
    e.lockTotal = GROW_TICKS;
    this.setLock(e, 'grow', GROW_TICKS);
  }

  /** 小屋 の 中 3×3 に ついてきて 入った なかま: coopEnterTicks で 小屋 の 子 */
  private enterCheck(e: Ent): void {
    if (e.home !== null || !e.friend || e.carried || e.follow <= 0 || this.coopList.length === 0) {
      e.enterT = 0;
      return;
    }
    const c = this.coopAtSpot(e);
    if (!c || this.kidCount(c.id) >= this.settings.coopMax) {
      e.enterT = 0;
      return;
    }
    if (++e.enterT < this.settings.coopEnterTicks) return;
    this.joinCoop(e, c);
    this.setLock(e, 'cheer', 20);
  }

  /** 夜: 小屋 の 子 は 中 で すわって ねる */
  private sleep(e: Ent): void {
    e.walking = false;
    e.look = false;
    e.following = false;
    this.setState(e, 'sleep');
  }

  /** 小屋 の 子 が 外 に 出て いたら 中 の まん中 へ（落とされた・ブロック が 動いた とき） */
  private kidKeepInside(e: Ent): void {
    const c = e.home === null ? undefined : this.coopById(e.home);
    if (!c) {
      // 小屋 が 無く なった: なかま に もどる
      e.home = null;
      e.follow = 0;
      return;
    }
    if (inInterior(c, e.x, e.z, 0)) return;
    e.x = c.x + 0.5;
    e.z = c.z + 0.5;
    e.y = c.y;
    e.vy = 0;
    e.walking = false;
    e.homeX = e.x;
    e.homeZ = e.z;
  }

  /** 金 かどうか きめて、小屋 の すばこ か 足もと に たまご を 出す（§2.6・§2.8） */
  private layEgg(e: Ent): void {
    const roll = rollGold(this.goldRng, { raised: e.raised, bugs: e.bugs, goldMiss: e.goldMiss, natsuki: e.natsuki, breed: e.breed }, this.settings);
    e.goldMiss = roll.goldMiss;
    const gold = roll.gold;
    const coop = e.home === null ? undefined : this.coopById(e.home);
    if (coop && coop.egg + coop.gold < this.settings.coopNestMax) {
      if (gold) coop.gold++;
      else coop.egg++;
      this.push(gold ? { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, gold: true, coop: coop.id } : { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, coop: coop.id });
      return;
    }
    const at = { x: e.x, y: e.y + 0.3, z: e.z };
    if (gold) this.dropGold(at);
    else this.d.dropEgg(at);
    this.push(gold ? { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z, gold: true } : { type: 'egg', id: e.id, x: e.x, y: e.y, z: e.z });
  }

  /** 毎ステップ の こたつ（LIVE-2 §2.1・LIVE-2.1 §2.4）。時間 は 世界 の 時計 で たまご ごと に すすむ（はなれて いても） */
  private updateKits(p: Vec3): void {
    const s = this.settings;
    for (let i = this.kitList.length - 1; i >= 0; i--) {
      const k = this.kitList[i]!;
      for (const r of k.eggs) if (r.left > 0) r.left--;
      if (k.chick !== 0) {
        // かえる 動き 中: おわったら（ひよこ の ロック が とけた）その たまご は なくなり、20 ステップ あけて 次
        const c = this.find(k.chick);
        if (!c) {
          k.chick = 0;
          k.hatch = null;
        } else if (c.lock === 0 || c.lockKind !== 'hatch') {
          const at = k.hatch ? k.eggs.indexOf(k.hatch) : -1;
          if (at >= 0) k.eggs.splice(at, 1);
          k.chick = 0;
          k.hatch = null;
          k.gap = KIT_HATCH_GAP;
          if (k.eggs.length === 0) this.kitList.splice(i, 1);
          continue;
        } else continue;
      }
      // こたつ を こわした: たまご は 種類 ごと に もどる（あたため は 0）
      if (this.world.isLoaded(k.x, k.z) && String(this.world.getBlock(k.x, k.y, k.z)) !== BLOCK_NUKUNUKU) {
        this.kitList.splice(i, 1);
        const half = (k.size ?? 1) / 2;
        const at = { x: k.x + half, y: k.y + 0.5, z: k.z + half };
        for (const r of k.eggs) {
          if (r.egg === 'gold') this.dropGold(at);
          else this.d.dropEgg(at);
        }
        continue;
      }
      k.size = this.kitSize(k);
      if (k.gap > 0 && --k.gap > 0) continue;
      const ready = k.eggs.find((r) => r.left <= 0);
      if (!ready) continue;
      // あたため おわり: 近く に いて、なかま が 8 わ より 少ない とき に かえる
      if (dist2d(k.x + 0.5, k.z + 0.5, p.x, p.z) > s.kitHatchDist || Math.abs(p.y - k.y) > 8) {
        k.fullWait = 0;
        continue;
      }
      if (this.friendCount() >= s.animalFriendMax) {
        if (k.fullWait <= 0) {
          this.hintOut('friendFull');
          k.fullWait = FRIEND_FULL_REPEAT;
        } else k.fullWait--;
        continue;
      }
      k.fullWait = 0;
      if (k.retry > 0) {
        k.retry--;
        continue;
      }
      this.startHatch(k, ready, p);
    }
  }

  private startHatch(k: Kit, row: KitEggRow, p: Vec3): void {
    const spot = this.findHatchSpot(k, p);
    if (!spot) {
      k.retry = SPOT_RETRY;
      return;
    }
    const breed = rollBreed(row.egg, this.settings, this.breedState, this.breedRng);
    const e = this.make(spot.x, spot.y, spot.z, true, 0, this.settings.animalFollowTicks);
    e.stage = 'chick';
    e.breed = breed;
    e.fromGold = row.egg === 'gold';
    const ticks = breed === 'macho' ? HATCH_MACHO_TICKS : HATCH_TICKS;
    e.lockTotal = ticks;
    e.lock = ticks;
    e.lockKind = 'hatch';
    e.state = 'hatch';
    this.ents.push(e);
    k.chick = e.id;
    k.hatch = row;
    this.push({ type: 'hatchStart', x: k.x, y: k.y, z: k.z });
  }

  /** こたつ の まわり の 地面（プレイヤー に 近い 方 から）。無ければ こたつ の 上。それ も だめ なら null */
  private findHatchSpot(k: Kit, p: Vec3): Vec3 | null {
    const w = this.world;
    const n = this.kitSize(k);
    const sides: [number, number][] = [];
    for (let i = 0; i < n; i++) sides.push([-1, i], [n, i], [i, -1], [i, n]);
    const dd = (a: [number, number]) => (k.x + a[0] + 0.5 - p.x) ** 2 + (k.z + a[1] + 0.5 - p.z) ** 2;
    sides.sort((a, b) => dd(a) - dd(b));
    for (const [dx, dz] of sides) {
      const ix = k.x + dx;
      const iz = k.z + dz;
      if (!w.isLoaded(ix, iz)) continue;
      if (!w.isSolid(ix, k.y - 1, iz) || w.isSolid(ix, k.y, iz) || w.isSolid(ix, k.y + 1, iz)) continue;
      if (w.getBlock(ix, k.y, iz) === 'water') continue;
      if (inFootprintAny(this.coopList, ix + 0.5, iz + 0.5)) continue;
      return { x: ix + 0.5, y: k.y, z: iz + 0.5 };
    }
    if (!w.isSolid(k.x, k.y + 1, k.z) && !w.isSolid(k.x, k.y + 2, k.z)) return { x: k.x + 0.5, y: k.y + 1, z: k.z + 0.5 };
    return null;
  }

  /** 小屋 の ブロック が 世界 から 消えて いたら（ほかの しかた で こわれた）小屋 の きろく を すてる。子 は なかま に もどる */
  private checkCoopBlocks(): void {
    for (let i = this.coopList.length - 1; i >= 0; i--) {
      const c = this.coopList[i]!;
      if (!this.world.isLoaded(c.x, c.z) || this.coopHasBlocks(c)) continue;
      this.coopList.splice(i, 1);
      for (const e of this.ents) {
        if (e.home !== c.id) continue;
        e.home = null;
        e.follow = 0;
        e.homeX = e.x;
        e.homeZ = e.z;
      }
    }
  }

  private coopHasBlocks(c: Coop): boolean {
    const w = this.world;
    for (let a = -COOP_HALF; a <= COOP_HALF; a++) {
      for (let b = -COOP_HALF; b <= COOP_HALF; b++) {
        if (Math.abs(a) !== COOP_HALF && Math.abs(b) !== COOP_HALF) continue;
        for (let dy = 0; dy < 3; dy++) if (String(w.getBlock(c.x + a, c.y + dy, c.z + b)).startsWith('toriya_')) return true;
      }
    }
    return false;
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
      stage: 'adult',
      breed: 'normal',
      home: null,
      raised: false,
      bugs: 0,
      goldMiss: 0,
      grow: 0,
      enterT: 0,
      lockTotal: 0,
      fromGold: false,
      rollLeft: 0,
      airFrom: -1,
      liftLeft: 0,
      putLeft: 0,
      plan: null,
      flight: null,
      glide: null,
      popAge: -1,
      natsuki: 0,
      natsukiBugWait: 0,
      natsukiPetWait: 0,
      natsukiDecayLeft: this.settings.natsukiDecayTicks,
      meat: false,
      joinNo: friend ? ++this.joinSeq : 0,
      target: null,
      hits: 0,
      fs: 'none',
      ft: 0,
      upper: false,
      punchAt: 0,
      punchLen: 0,
      forgetLeft: 0,
      bangLeft: 0,
      flexLeft: 0,
      cheerX: 0,
      cheerZ: 0,
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

  /**
   * 小屋 の きまり（§2.3）: 小屋 の 子 は 中 3×3 から 出ない。やせい・ついてくる 時間 が 0 の なかま は 5×5 に 外 から 入らない
   * （もん を 通れる の は ついてくる なかま と プレイヤー だけ）。
   */
  private coopAllows(e: Ent, nx: number, nz: number): boolean {
    if (e.home !== null) {
      const c = this.coopById(e.home);
      return !c || inInterior(c, nx, nz, KID_MARGIN);
    }
    if (e.friend && e.follow > 0) return true;
    for (const c of this.coopList) if (inFootprint(c, nx, nz) && !inFootprint(c, e.x, e.z)) return false;
    return true;
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
    if (e.bangLeft > 0) e.bangLeft--;
    // LIVE-4: たたかえる 子 で なく なった（だっこ・なげ・いただきます・パタパタ・順番 など）→ ねらい を やめる
    if (e.fs !== 'none' && !this.fighterIds.includes(e.id)) this.fightStop(e, 'stop');
    e.stateTicks++;
    if (e.fullLeft > 0) e.fullLeft--;
    if (e.popAge >= 0 && e.popAge < POP_TICKS) e.popAge++;
    if (e.meat) {
      this.meatBird(e);
      return true;
    }
    if (e.carried) {
      // だっこ 中: プレイヤー の 足もと に いる。follow は へらない
      e.x = p.x;
      e.y = p.y;
      e.z = p.z;
      e.vy = 0;
      e.fluttering = false;
      e.inWater = false;
      e.enterT = 0;
      e.airFrom = -1;
      this.setState(e, 'carried');
      // LIVE-2.1: もちあげ 10 ステップ で 手 から はなれる／そっと おろす 20 ステップ
      if (e.liftLeft > 0 && --e.liftLeft === 0) this.releaseThrow(e, p);
      else if (e.putLeft > 0 && --e.putLeft === 0) this.finishSoftPut(e);
      return true;
    }
    if (e.flight) {
      this.flightStep(e, p);
      return true;
    }
    if (e.glide) {
      this.glideStep(e);
      return true;
    }
    if (e.rollLeft > 0) e.rollLeft--;
    const d = dist2d(e.x, e.z, p.x, p.z);

    if (!e.friend) {
      if (d > (e.hearts >= 1 ? Math.max(s.animalRemoveDist, HEART_REMOVE_DIST) : s.animalRemoveDist)) return this.remove(e, 'far');
      if (e.y < -10) return this.remove(e, 'void');
    }
    const loaded = this.world.isLoaded(Math.floor(e.x), Math.floor(e.z));
    if (!loaded) {
      if (e.friend && e.home === null) this.friendWarpChecks(e, p, d, true);
      return true;
    }
    // うまった
    if (this.world.isSolid(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z))) {
      if (!this.unbury(e)) {
        if (e.home !== null) this.kidRespawn(e, p);
        else if (!e.friend) return this.remove(e, 'buried');
        else if (this.warp(e, p)) return true;
        else e.warpWait = 60;
      }
    }
    // かえる 動き の あいだ は ついてくる 時間 を へらさず、ワープ も しない（かえった とき まんたん）
    const hatching = e.lock > 0 && e.lockKind === 'hatch';
    if (e.home !== null) this.kidKeepInside(e);
    else if (e.friend && !hatching && this.friendWarpChecks(e, p, d, false)) return true;
    if (e.friend && e.follow > 0 && !hatching && --e.follow === 0) this.endFollow(e);

    if (e.lock > 0) {
      e.lock--;
      if (e.lock === 0) this.finishLock(e);
      else this.setState(e, this.lockState(e));
    }
    if (e.lock === 0) {
      if (e.home !== null && this.night) this.sleep(e);
      else if (e.fs !== 'none') this.fightStep(e, p, d);
      else this.behave(e, p, d);
    }
    if (e.home !== null) {
      if (e.lock === 0) this.growCheck(e, p);
    } else if (e.friend) this.enterCheck(e);

    if (!e.walking) this.unstraddle(e);
    this.settle(e);
    this.turn(e, p, d);
    return true;
  }

  /** ついてくる 時間 が 0 に なった（§2.7）: その場 に とまり、そこ を 中心 に のんびり */
  private endFollow(e: Ent): void {
    if (e.fs !== 'none') this.fightStop(e, 'stop');
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
      this.layEgg(e);
    }
    if (kind === 'hatch') {
      // かえった: すぐ なかま・ついてくる 時間 まんたん（§2.1）
      e.follow = this.settings.animalFollowTicks;
      const firstHatch = this.d.hatchedBefore ? !this.d.hatchedBefore() : !this.everHatched;
      this.everHatched = true;
      this.push({ type: 'hatch', id: e.id, breed: e.breed, gold: e.fromGold, first: firstHatch });
    } else if (kind === 'grow') {
      const first = this.d.grewBefore ? !this.d.grewBefore() : !this.everGrew;
      this.everGrew = true;
      e.stage = 'adult';
      e.raised = true;
      e.grow = 0;
      e.natsuki = 0;
      e.natsukiBugWait = 0;
      e.natsukiPetWait = 0;
      e.natsukiDecayLeft = this.settings.natsukiDecayTicks;
      this.push({ type: 'grow', id: e.id, first, breed: e.breed });
    }
    if (e.becomeFriend && this.friendCount() < this.settings.animalFriendMax) {
      e.becomeFriend = false;
      e.friend = true;
      e.joinNo = ++this.joinSeq;
      e.stopOff = this.nextStopOff();
      e.hearts = 0;
      e.eggMiss = 0;
      e.natsuki = 0;
      e.natsukiBugWait = 0;
      e.natsukiPetWait = 0;
      e.natsukiDecayLeft = this.settings.natsukiDecayTicks;
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
    if (kind === 'cheer' && e.home === null) {
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
    if (this.coopList.length > 0 && !this.coopAllows(e, nx, nz)) return false;
    const top = supportTop(w, nx, nz, e.y, maxDrop);
    if (top === null) return false;
    if (top - e.y > BODY.stepUp + 1e-6) return false;
    // さく（高さ 1）には のぼらない: ついてくる なかま も もん から 入る（§2.3）
    if (this.coopList.length > 0 && top - e.y > 0.5 && w.getBlock(ix, Math.round(top) - 1, iz) === 'toriya_fence') return false;
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
      e.airFrom = -1;
      return;
    }
    e.inWater = false;
    const top = supportTop(w, e.x, e.z, e.y, w.size.y);
    if (top === null || e.y > top + 1e-4) {
      // 空中: パタパタ して ゆっくり 落ちる（下向き の 速さ は animalFlutterFallSpeed まで。ひよこ は chickFlutterFallSpeed。§2.9）
      if (e.airFrom < 0) e.airFrom = e.y;
      e.vy -= FALL_G * DT;
      const cap = e.stage === 'chick' ? this.settings.chickFlutterFallSpeed : this.settings.animalFlutterFallSpeed;
      if (e.vy < -cap) e.vy = -cap;
      e.y += e.vy * DT;
      if (top !== null && e.y <= top) {
        e.y = top;
        e.vy = 0;
        e.fluttering = false;
        this.landed(e, top);
      } else {
        e.fluttering = e.vy <= -FLUTTER_MIN_VY;
      }
    } else {
      e.vy = 0;
      e.fluttering = false;
      e.y = Math.min(top, e.y + 0.2);
      e.airFrom = -1;
    }
  }

  /** 着地: ひよこ が 高い 所 から おりた ときは コロン（前 に ころがって 起きる。§2.9） */
  private landed(e: Ent, top: number): void {
    const from = e.airFrom;
    e.airFrom = -1;
    if (e.stage !== 'chick' || from - top < ROLL_MIN_DROP) return;
    e.rollLeft = ROLL_TICKS;
    this.push({ type: 'roll', id: e.id });
  }

  /** 小屋 の 子 が うまった: 中 の あいた マス へ。無ければ プレイヤー の そば で なかま に もどる（8 わ を こえて も ゆるす） */
  private kidRespawn(e: Ent, p: Vec3): void {
    const c = e.home === null ? undefined : this.coopById(e.home);
    if (c) {
      const w = this.world;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        const ix = c.x + dx;
        const iz = c.z + dz;
        if (w.isSolid(ix, c.y, iz) || w.isSolid(ix, c.y + 1, iz) || !w.isSolid(ix, c.y - 1, iz)) continue;
        e.x = ix + 0.5;
        e.y = c.y;
        e.z = iz + 0.5;
        e.vy = 0;
        return;
      }
    }
    e.home = null;
    e.follow = 0;
    e.x = p.x;
    e.y = p.y;
    e.z = p.z;
    e.vy = 0;
    e.homeX = e.x;
    e.homeZ = e.z;
  }

  // ------------------------------------------------------------ LIVE-4: マッチョ と いっしょ に たたかう（docs/design/LIVE-4.md 版 2.1）

  /** たたかえる マッチョ か（§2.1。ひよこ・ふつう の にわとり・とりごや の 子・だっこ／なげ／パタパタ／いただきます 中 は 入らない） */
  private canFight(e: Ent): boolean {
    return e.friend && e.home === null && e.stage === 'adult' && e.breed === 'macho' && e.follow > 0 && !e.carried && !e.flight && !e.glide && !e.meat && !(e.fluttering && e.airFrom - e.y > FIGHT.flutterDrop);
  }

  /** たたかう 子 の id（なかま に なった 順 に `machoFighters` わ まで）。毎 ステップ の はじめ に 1 回 */
  private pickFightersNow(): number[] {
    if (this.d.fight?.playerDead?.()) return NO_FIGHT; // りっくん が たおれた: たたかいを やめる（'stop'）
    const max = this.settings.machoFighters;
    if (max === 1) {
      // 1 わ だけ: 並べかえ せず に いちばん 早い 子（joinNo、同じ なら id）を さがす
      let best: Ent | null = null;
      for (const e of this.ents) {
        if (e.joinNo > 0 && this.canFight(e) && (best === null || e.joinNo < best.joinNo || (e.joinNo === best.joinNo && e.id < best.id))) best = e;
      }
      if (best === null) return NO_FIGHT;
      this.oneFighter[0] = best.id;
      return this.oneFighter;
    }
    const c = this.fightCands;
    c.length = 0;
    for (const e of this.ents) if (e.joinNo > 0 && this.canFight(e)) c.push({ id: e.id, joinNo: e.joinNo });
    return c.length === 0 ? NO_FIGHT : pickFighters(c, this.settings.machoFighters);
  }

  /** 窓口: いま たたかえる マッチョ の id（その場 で 数え直す。だっこ した 次 の 子 も すぐ 見える） */
  fighters(): number[] {
    const ids = this.pickFightersNow();
    return ids === NO_FIGHT ? [] : [...ids];
  }

  /**
   * 「きっかけ」を 渡す（§2.2）。りっくん が 体力 を へらした 妖怪（`hit`）・りっくん の 体力 を へらした 妖怪（`hurt`）。
   * 12 マス（`machoLeash`）より とおい 妖怪・もう いない 妖怪 は 数えない。たたかう 子 だけ が その ステップ に ねらう
   */
  fightCue(c: FightCues): void {
    const port = this.d.fight;
    if (!port || (c.hit.length === 0 && c.hurt.length === 0)) return;
    const ids = this.fighters();
    if (ids.length === 0) return;
    const p = this.getPlayer().position;
    const leash = this.settings.machoLeash;
    const ok = (id: number): boolean => {
      const y = port.yokai(id);
      return y !== null && y.state === 'alive' && dist2d(y.x, y.z, p.x, p.z) <= leash;
    };
    const cue = resolveCue(c.hit.filter(ok), c.hurt.filter(ok));
    if (!cue) return;
    for (const id of ids) {
      const e = this.find(id);
      if (!e) continue;
      e.forgetLeft = this.settings.machoForget;
      if (e.target === cue.yokai) continue;
      e.target = cue.yokai;
      e.hits = 0;
      e.fs = 'run';
      e.ft = -1;
      e.flexLeft = 0;
      e.bangLeft = FIGHT.bangTicks;
      this.push({ type: 'machoTarget', id, yokai: cue.yokai, cause: cue.cause });
    }
  }

  private readonly markOut: { bang: { x: number; y: number; z: number; age: number } | null; target: number | null } = { bang: null, target: null };
  private readonly bangBuf = { x: 0, y: 0, z: 0, age: 0 };

  /** 画面 の しるし 用: 「！」 を 出す マッチョ の 足もと と 経過、ねらわれて いる 妖怪 の id（同時 に 1 つ まで） */
  fightMarks(): { bang: { x: number; y: number; z: number; age: number } | null; target: number | null } {
    const o = this.markOut;
    o.bang = null;
    o.target = null;
    for (const e of this.ents) {
      if (e.bangLeft > 0 && o.bang === null) {
        const b = this.bangBuf;
        b.x = e.x;
        b.y = e.y;
        b.z = e.z;
        b.age = FIGHT.bangTicks - e.bangLeft;
        o.bang = b;
      }
      if (e.target !== null && o.target === null) o.target = e.target;
    }
    return o;
  }

  /** ねらい を やめる（かちポーズ は 別）。ふつう の ついてくる に もどる */
  private fightStop(e: Ent, reason: MachoGiveUpReason): void {
    if (e.target !== null) this.push({ type: 'machoGiveUp', id: e.id, reason });
    e.target = null;
    e.hits = 0;
    e.fs = 'none';
    e.ft = 0;
    e.flexLeft = 0;
    e.forgetLeft = 0;
  }

  /** たおれた: かちポーズ（30 ステップ）。マッチョ の パンチ で たおした なら `ko` */
  private fightDefeat(e: Ent, ko: boolean): void {
    if (ko && e.target !== null) this.push({ type: 'machoKO', id: e.id, yokai: e.target });
    this.fightStop(e, 'defeat');
    e.fs = 'flex';
    e.flexLeft = FIGHT.flexTicks;
    e.ft = 0;
    this.setState(e, 'flex');
    this.push({ type: 'machoFlex', id: e.id });
  }

  /** ねらい の ある あいだ の 1 ステップ（`fs` が 'none' でない とき の `behave` の かわり） */
  private fightStep(e: Ent, p: Vec3, d: number): void {
    const port = this.d.fight;
    if (!port) {
      this.fightStop(e, 'stop');
      this.behave(e, p, d);
      return;
    }
    if (e.fs === 'flex') {
      e.ft++;
      if (--e.flexLeft > 0) {
        this.setState(e, 'flex');
        return;
      }
      e.fs = 'none';
      this.behave(e, p, d);
      return;
    }
    const t = e.target === null ? null : port.yokai(e.target);
    let why: MachoGiveUpReason | null = null;
    if (t === null || t.state === 'leaving') why = 'gone';
    else if (t.state === 'dying') {
      this.fightDefeat(e, false);
      return;
    } else if (dist2d(t.x, t.z, p.x, p.z) > FIGHT.farDist) why = 'far';
    else if (--e.forgetLeft <= 0) why = 'forget';
    if (why !== null || t === null) {
      this.fightStop(e, why ?? 'gone');
      this.behave(e, p, d);
      return;
    }
    e.walkYaw = yawTo(t.x - e.x, t.z - e.z);
    if (e.fs === 'punch') this.punchStep(e, t, p);
    else if (e.fs === 'cheer') this.cheerStep(e, t, p, d);
    else this.runStep(e, t);
  }

  private reachOf(e: Ent, t: { x: number; y: number; z: number; radius: number }, slack = 0): boolean {
    return inReach(dist2d(e.x, e.z, t.x, t.z), t.y - e.y, t.radius, this.settings.machoReach, slack);
  }

  /** はしる。とどいたら パンチ。180 ステップ とどかなければ おうえん */
  private runStep(e: Ent, t: { x: number; y: number; z: number; radius: number }): void {
    const s = this.settings;
    e.ft++;
    this.setState(e, 'run');
    if (!this.reachOf(e, t)) {
      const dh = dist2d(e.x, e.z, t.x, t.z);
      // 横 に とどく のに 高さ が たりない（ちょうちん など）ときは その場 に 止まる
      const v = Math.min(s.machoRunSpeed * DT, Math.max(0, dh - Math.max(0, t.radius + s.machoReach - 0.05)));
      if (v > 0) {
        for (const off of FOLLOW_OFFS) {
          const a = e.walkYaw + off;
          if (this.tryMove(e, Math.sin(a) * v, -Math.cos(a) * v, BODY.wanderDrop, false)) break;
        }
      }
    }
    if (this.reachOf(e, t) && !(t as { sliding?: boolean }).sliding) {
      this.beginPunch(e);
      return;
    }
    if (e.ft >= FIGHT.cheerAfter) {
      e.fs = 'cheer';
      e.ft = 0;
      e.cheerX = t.x;
      e.cheerZ = t.z;
      this.setState(e, 'cheer');
    }
  }

  /** パンチ を はじめる（刀 の 突き の ため〈startup〉＋ 1 で 当たる。ながさ は 突き と 同じ）。きりあげ は 3 回 に 1 回 */
  private beginPunch(e: Ent): void {
    const plan = punchPlan(this.d.fight!.blade().thrust);
    e.upper = isUpperPunch(e.hits);
    e.punchAt = plan.hitAt;
    e.punchLen = plan.total;
    e.fs = 'punch';
    e.ft = 0;
    this.setState(e, e.upper ? 'upper' : 'punch');
    e.stateTicks = 0;
  }

  private punchStep(e: Ent, t: { x: number; y: number; z: number; radius: number; height: number }, _p: Vec3): void {
    e.ft++;
    if (e.ft >= e.punchLen) {
      // つぎ の パンチ（まだ とどく なら すぐ、とどかなければ また はしる）
      e.fs = 'run';
      e.ft = -1;
      this.runStep(e, t);
      return;
    }
    this.setState(e, e.upper ? 'upper' : 'punch');
    e.stateTicks = e.ft;
    if (e.ft === e.punchAt) this.punchHit(e, t);
  }

  /** 当たる コマ: まだ とどいて いれば 妖怪 の 体力 を へらす（刀 の 切り上げ と 同じ 口。押す・うかす も）。からぶり は 何も しない */
  private punchHit(e: Ent, t: { x: number; y: number; z: number; radius: number; height: number }): void {
    const port = this.d.fight!;
    if (e.target === null || !this.reachOf(e, t, FIGHT.hitSlack)) return;
    const b = port.blade();
    const amount = punchDamage(this.settings.machoAtk, e.upper, b.kiriageMul);
    const knock = e.upper ? { dist: b.kiriageKnock[0], up: b.kiriageKnock[1] } : ZERO_KNOCK;
    const dealt = port.hit(e.target, amount, { x: e.x, y: e.y, z: e.z }, knock);
    if (!(dealt > 0)) return;
    e.hits++;
    this.push({ type: 'machoPunch', id: e.id, yokai: e.target, hit: true, upper: e.upper, damage: dealt, x: t.x, y: t.y + t.height * 0.6, z: t.z });
    const after = port.yokai(e.target);
    if (after === null || after.state === 'dying') this.fightDefeat(e, true);
  }

  /** おうえん: プレイヤー の そば で 力こぶ。ねらい は のこす。妖怪 が とどく 所 に 来たら また たたく */
  private cheerStep(e: Ent, t: { x: number; y: number; z: number; radius: number }, p: Vec3, d: number): void {
    e.ft++;
    if (this.reachOf(e, t) && !(t as { sliding?: boolean }).sliding) {
      this.beginPunch(e);
      return;
    }
    if (dist2d(t.x, t.z, e.cheerX, e.cheerZ) > 3) {
      e.fs = 'run';
      e.ft = -1;
      this.runStep(e, t);
      return;
    }
    if (d > this.settings.animalFollowStart) this.follow(e, p, d);
    else this.setState(e, 'cheer');
  }

  private turn(e: Ent, p: Vec3, d: number): void {
    let want = e.yaw;
    const toP = yawTo(p.x - e.x, p.z - e.z);
    if (e.lock === 0) {
      if (e.fs === 'run' || e.fs === 'punch') want = e.walkYaw; // LIVE-4: 妖怪 の ほう を むく
      else if (e.fs !== 'none') want = d > 0.3 ? toP : e.yaw; // おうえん・かちポーズ は きみ の ほう
      else if (!e.friend || e.follow <= 0) want = e.look ? toP : e.walking ? e.walkYaw : e.yaw;
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

