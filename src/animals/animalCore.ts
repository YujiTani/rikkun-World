/**
 * にわとり の しくみ が 共有 する 状態（ents・小屋・こたつ・乱数 など）と、どこ でも 使う 小さな 道具（find・push・make など）。
 * 係ごとの 関数（`animalMove` など）は 必要な 分 だけ の `Pick<AnimalCore, ...>` を 受け取る。
 */
import { type AnimalDeps, type AnimalEvent, type AnimalHintKind, type AnimalState, type AnimalView, createLiveSettings, type ItemId, type KitInfo, type LiveSettings, type Vec3 } from '../contracts';
import { createRng, type Rng } from '../world/gen/random';
import { BugNet, EGG_SALT } from './lottery';
import type { AnimalWorld } from './terrain';
import { inInterior } from './coop';
import type { AnimalManagerOptions, Coop, Ent, Kit, LockKind } from './animalTypes';
import { BREED_SALT, EVENT_CAP, GOLD_SALT, NATSUKI_HINT_GAP, NO_FIGHT, RNG_SALT, STOP_KINDS, STOP_STEP, TAU } from './animalConsts';

export class AnimalCore {
  readonly settings: LiveSettings;
  readonly world: AnimalWorld;
  readonly d: AnimalDeps;
  readonly getPlayer: () => { position: Vec3 };
  readonly rng: Rng;
  readonly ents: Ent[] = [];
  queue: AnimalEvent[] = [];
  nextId = 1;

  /** なかま に なった 数（止まる 距離 の 順番） */
  friendSeq = 0;

  /** なかま に なった 順 の 番号（たたかう 子 を えらぶ） */
  joinSeq = 0;

  /** この ステップ の たたかう 子 の id（`update` の はじめ に きめる） */
  fighterIds: number[] = NO_FIGHT;

  readonly oneFighter: number[] = [0];
  readonly fightCands: { id: number; joinNo: number }[] = [];
  spawnTimer = 0;
  hint: AnimalHintKind | null = null;
  targetId: number | null = null;

  /** 合図 natsukiWait を 最後 に 出した ステップ（600 に 1 回 まで） */
  waitHintAt = -NATSUKI_HINT_GAP;

  /** たまご の くじ（あみ・妖怪 と べつ の 流れ） */
  readonly eggRng: Rng;

  readonly net: BugNet;
  tick = 0;

  /** とれた むし が 持ち物 に 入る まで の のこり update 回数 */
  catches: number[] = [];

  carriedId: number | null = null;

  /** やせい を 長おし した とき の carryWild を 1 回 の 押し で 1 回 に する */
  wildAnnounced = false;

  /** 深い 所 で だっこ した ことが ある（`carriedBefore` が 無い とき の かわり） */
  everCarried = false;

  readonly view: AnimalView = {
    id: 0, x: 0, y: 0, z: 0, yaw: 0, headYaw: 0, state: 'idle', stateTicks: 0, friend: false, hearts: 0, targeted: false,
    follow: 0, fullLeft: 0, carried: false, fluttering: false,
  };
  kitList: Kit[] = [];
  coopList: Coop[] = [];
  nextCoopId = 1;
  readonly breedState = { machoMiss: 0 };
  readonly breedRng: Rng;
  readonly goldRng: Rng;
  lastDay: number | null = null;

  /** 大人 に なった ことが ある（`grewBefore` が 無い とき の かわり。保存 しない） */
  everGrew = false;

  /** かえった ことが ある（`hatchedBefore` が 無い とき の かわり。保存 しない） */
  everHatched = false;

  /** 小屋 の「こわせない」合図 を 最後 に 出した ステップ（押し つづけ の 出し直し 用） */
  lockHintAt = -1000;

  night = false;

  /** 直前 の putDown が 失敗 して、自分 の 合図 を 出した か */
  putWhy: AnimalHintKind | null = null;

  coopCheckT = 0;
  readonly kitScratch: KitInfo & { hatchT: number } = { x: 0, y: 0, z: 0, egg: null, left: 0, wobble: 0, hatchT: 0, eggs: [] };

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

  /** なかま の 数（小屋 の 子 は 数えない。小屋 ごと に 6 わ） */
  friendCount(): number {
    let n = 0;
    for (const e of this.ents) if (e.friend && e.home === null) n++;
    return n;
  }

  nextStopOff(): number {
    return (this.friendSeq++ % STOP_KINDS) * STOP_STEP;
  }

  /** 入る なら 持ち物 へ（入らなければ 足もと に 落とさず false）。`tryAddItem` が なければ `addItem` */
  tryAdd(item: ItemId): boolean {
    return this.d.tryAddItem ? this.d.tryAddItem(item) : this.d.addItem(item);
  }

  coopById(id: number): Coop | undefined {
    for (const c of this.coopList) if (c.id === id) return c;
    return undefined;
  }

  /** 小屋 の 子 の 数（`except` は 数えない = 自分 が 戻る 時） */
  kidCount(id: number, except?: Ent): number {
    let n = 0;
    for (const e of this.ents) if (e.home === id && e !== except) n++;
    return n;
  }

  /** その 位置 が ある 小屋 の 中 3×3（足 の 高さ も 合う）なら その 小屋 */
  coopAtSpot(p: Vec3, margin = 0): Coop | undefined {
    for (const c of this.coopList) if (inInterior(c, p.x, p.z, margin) && p.y > c.y - 1.5 && p.y < c.y + 2) return c;
    return undefined;
  }

  dropGold(at: Vec3): void {
    if (this.d.dropItem) this.d.dropItem(at, 'kin_tamago');
    else this.d.dropEgg(at);
  }

  make(x: number, y: number, z: number, friend: boolean, hearts: 0 | 1 | 2, follow: number): Ent {
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

  find(id: number): Ent | undefined {
    for (const e of this.ents) if (e.id === id) return e;
    return undefined;
  }

  push(ev: AnimalEvent): void {
    this.queue.push(ev);
    if (this.queue.length > EVENT_CAP) this.queue.splice(0, this.queue.length - EVENT_CAP);
  }

  hintOut(h: AnimalHintKind): void {
    this.hint = h;
    this.push({ type: 'hint', hint: h });
  }

  setLock(e: Ent, kind: LockKind, ticks: number): void {
    e.lock = ticks;
    e.lockKind = kind;
    this.setState(e, this.lockState(e));
  }

  setState(e: Ent, st: AnimalState): void {
    if (e.state !== st) {
      e.state = st;
      e.stateTicks = 0;
    }
  }

  lockState(e: Ent): AnimalState {
    if (e.lockKind === 'appear') return 'appear';
    if (e.egg && e.lock <= 30) return 'lay';
    return e.lockKind;
  }

  readonly markOut: { bang: { x: number; y: number; z: number; age: number } | null; target: number | null } = { bang: null, target: null };
  readonly bangBuf = { x: 0, y: 0, z: 0, age: 0 };
}
