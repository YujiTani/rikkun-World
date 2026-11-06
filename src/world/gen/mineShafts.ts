import { BLOCK_INDEX } from '../blocks/blockTypes';
import { keyOf, keyX, keyY, keyZ } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { planShaft, planShaftSteps, type PlanEnv, type ShaftPlan } from './mineShaftPlan';
import { LINK_TRIES, type StartLink } from './mineShaftSide';
import { geoFor, regionHit, regionLand, regionOf, regionSites, startSiteAt, startSites, type Geo, type Site } from './mineShaftSite';
import type { PathCell, Shaft, ShaftRoll } from './mineShaftTypes';
import { CaveWorld, type CaveHost, type HiroiTryRow, type PlacedCave } from './mineCaves';
import { CAVE_CONFIG, type CaveKind } from './mineCaveConfig';
import type { RoomColOps } from './mineCaveRoom';
import { colKey } from '../stream/ring';

/**
 * 坑道の 世界（MINE-1C。docs/design/MINE-1.md §4.5・§4.8・§6.1）。シード（と 古い 列の 一覧）から、はじまりの 坑道と 区画ごとの 坑道を 決める。
 * 計画は 区画ごとに 1 回 作って おぼえる。列を 作る ときは 列に かかる 計画の「置く 物」だけを 読む（ほかの 列の ブロックは 読まない。C10）。
 */

/** 古い 列の 一覧（colKey の 集まり。仕様 §4.8） */
export interface OldCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
}

/** 列に 置く 物。ring → air → put の 順に 1 マスずつ 置く */
export interface ColOps {
  /** かならず 固く する マス（もとが 固く なければ 石） */
  ring: Int32Array;
  air: Int32Array;
  put: Int32Array;
}

/** パック: block | y << 8 | lz << 17 | lx << 21 */
const pack = (block: number, y: number, lz: number, lx: number): number => block | (y << 8) | (lz << 17) | (lx << 21);

const CAVE_REGION = CAVE_CONFIG.region;
const AIR_BLOCK = BLOCK_INDEX.air;
const STONE_BLOCK = BLOCK_INDEX.stone;

function buildOps(plan: ShaftPlan): Map<number, ColOps> {
  const lists = new Map<number, { ring: number[]; air: number[]; put: number[] }>();
  const slot = (k: number): { ring: number[]; air: number[]; put: number[] } => {
    const ck = colKey(keyX(k) >> 4, keyZ(k) >> 4);
    let l = lists.get(ck);
    if (!l) lists.set(ck, (l = { ring: [], air: [], put: [] }));
    return l;
  };
  const p = (k: number, block: number): number => pack(block, keyY(k), keyZ(k) & 15, keyX(k) & 15);
  for (const k of plan.b.ring) slot(k).ring.push(p(k, STONE_BLOCK));
  for (const k of plan.b.air) slot(k).air.push(p(k, AIR_BLOCK));
  for (const [k, block] of plan.b.put) slot(k).put.push(p(k, block));
  const out = new Map<number, ColOps>();
  for (const [ck, l] of lists) out.set(ck, { ring: Int32Array.from(l.ring), air: Int32Array.from(l.air), put: Int32Array.from(l.put) });
  return out;
}

interface Planned {
  plan: ShaftPlan;
  ops: Map<number, ColOps> | null;
}

/** 坑道を 作るか（くらべ用の `?mine=0` で 切る。§4.9）。切ると どの 窓口も 坑道 なしと 答える */
let shaftsOn = true;
export function setShaftsOn(on: boolean): void {
  shaftsOn = on;
}

export class ShaftWorld implements CaveHost {
  readonly G: Geo;
  private caveWorld: CaveWorld | undefined;
  private startPlanned: Planned | null | undefined;
  private readonly regions = new Map<number, Planned | null>();
  constructor(
    readonly seed: number,
    readonly oldCols: OldCols | undefined,
    /** meta に 書いて あった はじまりの 坑道の 入口（あれば まず そこだけ 計画する。§4.8） */
    private readonly startHint?: { x: number; z: number } | null,
  ) {
    this.G = geoFor(seed);
  }

  isOld = (k: number): boolean => this.oldCols?.kodo.has(k) === true;

  isOldHeya = (k: number): boolean => this.oldCols?.heya.has(k) === true;

  private env(link: StartLink | null): PlanEnv {
    return { isOld: this.isOld, isOldHeya: this.isOldHeya, link, heya: true };
  }

  /** ほらあなの 種類（部屋）の 世界（MINE-1D）。坑道と 同じ シード・同じ 古い 列の 一覧 */
  get caves(): CaveWorld {
    return (this.caveWorld ??= new CaveWorld(this));
  }

  /** はじまりの 坑道の ほたるの ほらあな〔その 区画・層の 抽選の 部屋〕 */
  fixedRoom(rx: number, rz: number, layer: string): PlacedCave | null {
    const r = this.start()?.plan.rooms.find((q) => q.shaft === null);
    if (!r || r.layer !== layer) return null;
    return Math.floor(r.box.x0 / CAVE_REGION) === rx && Math.floor(r.box.z0 / CAVE_REGION) === rz ? r : null;
  }

  /** 箱（両はし ふくむ）の 中に 坑道の 道の マスが あるか */
  nearShaft(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    for (const s of this.shafts(x0, z0, x1, z1)) {
      const plan = this.planById(s.id);
      if (!plan) continue;
      for (const c of plan.path) if (c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1 && c.y >= y0 && c.y <= y1) return true;
      for (const r of plan.rooms) if (r.box.x0 <= x1 && r.box.x1 >= x0 && r.box.z0 <= z1 && r.box.z1 >= z0 && r.box.y0 <= y1 && r.box.y1 >= y0) return true;
    }
    return false;
  }

  /** 箱が 範囲に かかる 部屋ぜんぶ〔抽選の 部屋 ＋ 坑道の へや ＋ はじまりの ほたる〕 */
  allCaves(x0: number, z0: number, x1: number, z1: number): PlacedCave[] {
    const out = this.caves.caves(x0, z0, x1, z1);
    for (const s of this.shafts(x0, z0, x1, z1)) {
      for (const r of this.planById(s.id)?.rooms ?? []) if (r.shaft !== null && r.box.x0 <= x1 && r.box.x1 >= x0 && r.box.z0 <= z1 && r.box.z1 >= z0) out.push(r);
    }
    return out;
  }

  /** id から 部屋〔坑道の へや `<坑道の id>_h<n>` か 抽選の 部屋〕 */
  caveById(id: string): PlacedCave | null {
    const m = /^(r-?\d+_-?\d+)_h(\d+)$/.exec(id);
    if (!m) return this.caves.byId(id);
    return this.planById(m[1]!)?.rooms.find((r) => r.id === id) ?? null;
  }

  /** (x, y, z) は どの 部屋の 空気か */
  caveKindAt(x: number, y: number, z: number): CaveKind | null {
    for (const plan of this.plansNear(x >> 4, z >> 4)) for (const r of plan.rooms) if (r.shaft !== null && r.room.has(x, y, z)) return r.kind;
    return this.caves.kindAt(x, y, z);
  }

  /** 範囲の ひろい ほらあなの 計画を ためした 記録〔抽選の 部屋 ＋ 坑道の へや〕 */
  hiroiTries(x0: number, z0: number, x1: number, z1: number): HiroiTryRow[] {
    const out = this.caves.hiroiTries(x0, z0, x1, z1);
    for (const s of this.shafts(x0, z0, x1, z1)) for (const row of this.planById(s.id)?.tries ?? []) out.push({ ...row, work: { ...row.work } });
    return out;
  }

  /** 列に 部屋〔抽選・坑道の へや〕が かかるか */
  touchesRoom(cx: number, cz: number): boolean {
    if (!shaftsOn) return false;
    const ck = colKey(cx, cz);
    return this.caves.touches(cx, cz) || this.plansNear(cx, cz).some((p) => p.roomCols.has(ck));
  }

  /** 列に 置く 部屋の 物（`?mine=0` では 作らない） */
  caveOps(cx: number, cz: number): RoomColOps[] | null {
    if (this.caves.inScene) return this.caves.sceneColumn(cx, cz);
    if (!shaftsOn) return null;
    let out = this.caves.opsFor(cx, cz);
    const ck = colKey(cx, cz);
    for (const plan of this.plansNear(cx, cz)) {
      if (!plan.roomCols.has(ck)) continue;
      for (const r of plan.rooms) {
        if (r.shaft === null) continue;
        const o = r.room.ops.get(ck);
        if (o) (out ??= []).push(o);
      }
    }
    return out;
  }

  /** はじまりの 坑道。置ける 所が どこにも なければ null（坑道 なしで 世界は 作る。§5） */
  start(): Planned | null {
    if (!shaftsOn) return null;
    if (this.startPlanned === undefined) {
      this.startPlanned = this.planStart();
    }
    return this.startPlanned;
  }

  private planStart(): Planned | null {
    if (this.startHint === null) return null; // meta に「さがしたが 置けなかった」と ある
    // 場所と 試行は 1C の 順〔link なし〕で きめる。そのあと、なかほどの いちばん 上の 横穴 1 本だけ ほたるへ かえる
    const tryAt = (site: Site): Planned | null => {
      for (let a = 0; a < S.planTries; a++) {
        const plain = planShaft(this.G, site, 'start', true, this.env(null), a);
        if (!plain) continue;
        return this.linkUp(site, a, plain) ?? { plan: plain, ops: null };
      }
      return null;
    };
    const hint = this.startHint ? startSiteAt(this.G, this.startHint.x, this.startHint.z) : null;
    if (hint) {
      const hinted = tryAt(hint);
      if (hinted) return hinted;
    }
    for (const site of startSites(this.G)) {
      const p = tryAt(site);
      if (p) return p;
    }
    return null;
  }

  /** 1C の 計画 plain の ほかは そのままで、横穴 1 本を ほたるの ほらあなへ かえた 計画〔かえられなければ null〕 */
  private linkUp(site: Site, a: number, plain: ShaftPlan): Planned | null {
    if (plain.ref.target < 0) return null;
    const link = { ref: plain.ref, from: 0, used: -1 };
    while (link.from < LINK_TRIES) {
      link.used = -1;
      const plan = planShaft(this.G, site, 'start', true, this.env(link), a);
      if (plan) return { plan, ops: null };
      if (link.used < 0) return null; // へやの 形が どれも だめ
      link.from = link.used + 1; // 当たったが 1C の ほかの 横穴が ずれた → 次の 形から
    }
    return null;
  }

  private startBox(): { x0: number; z0: number; x1: number; z1: number } | null {
    return this.start()?.plan.shaft.box ?? null;
  }

  /** 区画 (rx, rz) に ほかの 坑道を おけない 理由が あるか（スタートの 区画・はじまりの 坑道の 箱と かさなる 区画） */
  private blocked(rx: number, rz: number): boolean {
    const sp = this.G.T.spawn();
    if (regionOf(sp.x) === rx && regionOf(sp.z) === rz) return true;
    const b = this.startBox();
    return b !== null && rx >= regionOf(b.x0) && rx <= regionOf(b.x1) && rz >= regionOf(b.z0) && rz <= regionOf(b.z1);
  }

  /**
   * 区画の 計画を 少しずつ すすめる 仕事（1 回 yield するごとに 短い 仕事を 1 つ した）。終わると Planned | null を 返す。
   * 入口の 候補さがし〔siteChunk こごと〕・計画 1 つ・置く 物の 作成〔buildOps〕の あいだで yield する。
   */
  private *regionJob(rx: number, rz: number): Generator<void, Planned | null> {
    if (!(regionHit(this.seed, rx, rz) && !this.blocked(rx, rz) && regionLand(this.G, rx, rz) >= S.minLand)) return null;
    let budget = S.plan.budget;
    for (const site of regionSites(this.G, rx, rz)) {
      if (site === null) {
        yield;
        continue;
      }
      for (let a = 0; a < S.planTries && budget-- > 0; a++) {
        const plan = yield* planShaftSteps(this.G, site, `r${rx}_${rz}`, false, this.env(null), a);
        if (plan) {
          yield;
          return { plan, ops: buildOps(plan) };
        }
        yield;
      }
      if (budget <= 0) break;
      yield;
    }
    return null;
  }

  private readonly jobs = new Map<number, Generator<void, Planned | null>>();

  private regionKey(rx: number, rz: number): number {
    return (rx + 100000) * 200003 + (rz + 100000);
  }

  private store(key: number, planned: Planned | null): Planned | null {
    if (this.regions.size >= S.plan.regionCap) {
      this.regions.clear();
      this.warmSig = Number.NaN; // 先読みの 一覧を 作りなおす
    }
    this.regions.set(key, planned);
    this.jobs.delete(key);
    return planned;
  }

  region(rx: number, rz: number): Planned | null {
    if (!shaftsOn) return null;
    const key = this.regionKey(rx, rz);
    const hit = this.regions.get(key);
    if (hit !== undefined) return hit;
    const job = this.jobs.get(key) ?? this.regionJob(rx, rz);
    let r = job.next();
    while (!r.done) r = job.next();
    return this.store(key, r.value);
  }

  private warmSig = Number.NaN;
  private warmKeys: number[] = [];
  private warmRx: number[] = [];
  private warmRz: number[] = [];
  private warmAt = 0;

  /**
   * 中心〔プレイヤー・2P・ワープ先など。いくつでも〕の まわりの 区画の 計画を、あいた 時間に ms 以内だけ すすめる
   * （列を 作る ときに 計画で ひっかからない ため。つなぎ込みが 毎ステップ 呼ぶ）。近い 区画から。
   * 中心の 区画が かわらない 間は 配列を 作らない。すべて 終わった ら すぐ 返る。
   */
  warm(centers: readonly { x: number; z: number }[], ms: number, reach: number = S.plan.warmReach): void {
    if (!shaftsOn) return;
    let sig = 0;
    for (const c of centers) sig = sig * 1000003 + regionOf(c.x) * 4001 + regionOf(c.z);
    if (sig !== this.warmSig) {
      this.warmSig = sig;
      this.rebuildWarm(centers, reach);
    }
    const t0 = performance.now();
    while (this.warmAt < this.warmKeys.length) {
      const key = this.warmKeys[this.warmAt]!;
      if (this.regions.has(key)) {
        this.warmAt++;
        continue;
      }
      let job = this.jobs.get(key);
      if (!job) this.jobs.set(key, (job = this.regionJob(this.warmRx[this.warmAt]!, this.warmRz[this.warmAt]!)));
      const r = job.next();
      if (r.done) {
        this.store(key, r.value);
        this.warmAt++;
      }
      if (performance.now() - t0 >= ms) return;
    }
    this.caves.warm(centers, ms - (performance.now() - t0), reach); // ほらあなの 種類の 部屋〔1D〕の 計画も
  }

  private rebuildWarm(centers: readonly { x: number; z: number }[], reach: number): void {
    const list: { rx: number; rz: number; key: number; d: number }[] = [];
    const seen = new Set<number>();
    for (const c of centers) {
      for (let rz = regionOf(c.z - reach); rz <= regionOf(c.z + reach); rz++) {
        for (let rx = regionOf(c.x - reach); rx <= regionOf(c.x + reach); rx++) {
          const key = this.regionKey(rx, rz);
          if (seen.has(key) || this.regions.has(key)) continue;
          seen.add(key);
          let d = Infinity;
          for (const q of centers) d = Math.min(d, Math.hypot((rx + 0.5) * S.region - q.x, (rz + 0.5) * S.region - q.z));
          list.push({ rx, rz, key, d });
        }
      }
    }
    list.sort((a, b) => a.d - b.d);
    this.warmKeys = list.map((e) => e.key);
    this.warmRx = list.map((e) => e.rx);
    this.warmRz = list.map((e) => e.rz);
    this.warmAt = 0;
    for (const k of this.jobs.keys()) if (!seen.has(k)) this.jobs.delete(k); // 範囲の 外に のこった 仕事は すてる
  }

  /** 区画の 抽選の 結果 */
  rolls(x0: number, z0: number, x1: number, z1: number): ShaftRoll[] {
    const out: ShaftRoll[] = [];
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const hit = regionHit(this.seed, rx, rz);
        out.push({ rx, rz, hit, land: regionLand(this.G, rx, rz), placed: hit && this.region(rx, rz) !== null });
      }
    }
    return out;
  }

  /** 箱が 範囲に かかる 坑道ぜんぶ（はじまりの 坑道 ＋ 区画の 坑道） */
  shafts(x0: number, z0: number, x1: number, z1: number): Shaft[] {
    const out: Shaft[] = [];
    const hit = (b: Shaft['box']): boolean => b.x0 <= x1 && b.x1 >= x0 && b.z0 <= z1 && b.z1 >= z0;
    const s = this.start()?.plan.shaft;
    if (s && hit(s.box)) out.push(s);
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const p = this.region(rx, rz);
        if (p && hit(p.plan.shaft.box)) out.push(p.plan.shaft);
      }
    }
    return out;
  }

  planById(id: string): ShaftPlan | null {
    if (id === 'start') return this.start()?.plan ?? null;
    const m = /^r(-?\d+)_(-?\d+)$/.exec(id);
    if (!m) return null;
    return this.region(Number(m[1]), Number(m[2]))?.plan ?? null;
  }

  path(id: string): PathCell[] {
    return this.planById(id)?.path.map((c) => ({ ...c })) ?? [];
  }

  /** 列に かかる 計画（箱を S.plan.reach 広げた 四角が 列に かかる もの） */
  plansNear(cx: number, cz: number): ShaftPlan[] {
    const x0 = cx * 16 - S.plan.reach;
    const z0 = cz * 16 - S.plan.reach;
    const x1 = cx * 16 + 15 + S.plan.reach;
    const z1 = cz * 16 + 15 + S.plan.reach;
    const out: ShaftPlan[] = [];
    const near = (b: Shaft['box']): boolean => b.x0 <= x1 && b.x1 >= x0 && b.z0 <= z1 && b.z1 >= z0;
    const s = this.start()?.plan;
    if (s && near(s.shaft.box)) out.push(s);
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const p = this.region(rx, rz);
        if (p && near(p.plan.shaft.box)) out.push(p.plan);
      }
    }
    return out;
  }

  /** 列 (cx, cz) に 置く 物。なければ null */
  opsFor(cx: number, cz: number): ColOps[] | null {
    const ck = colKey(cx, cz);
    let out: ColOps[] | null = null;
    for (const plan of this.plansNear(cx, cz)) {
      const st = this.start();
      const planned = st !== null && plan === st.plan ? st : this.region(regionOf(plan.shaft.box.x0), regionOf(plan.shaft.box.z0))!;
      planned.ops ??= buildOps(plan);
      const o = planned.ops.get(ck);
      if (o) (out ??= []).push(o);
    }
    return out;
  }

  /** 木・草花を おかない 四角（列に かかる 計画の もの） */
  zones(cx: number, cz: number): { trees: [number, number, number, number][]; plants: [number, number, number, number][] } | null {
    let trees: [number, number, number, number][] | null = null;
    let plants: [number, number, number, number][] | null = null;
    for (const plan of this.plansNear(cx, cz)) {
      if (plan.noTrees.length > 0) (trees ??= []).push(...plan.noTrees);
      if (plan.noPlants.length > 0) (plants ??= []).push(...plan.noPlants);
    }
    return trees || plants ? { trees: trees ?? [], plants: plants ?? [] } : null;
  }

  /** 列に 坑道が かかるか（古い 列の しらべ・鉱石の「ふつうの 列」の しらべ） */
  touches(cx: number, cz: number): boolean {
    const ck = colKey(cx, cz);
    return this.plansNear(cx, cz).some((p) => p.cols.has(ck));
  }

  /** 列 1 つで 見る 区画の 数 */
  regionCount(cx: number, cz: number): number {
    const xs = [cx * 16 - S.plan.reach, cx * 16 + 15 + S.plan.reach];
    const zs = [cz * 16 - S.plan.reach, cz * 16 + 15 + S.plan.reach];
    const set = new Set<number>();
    for (const x of xs) for (const z of zs) set.add(regionOf(x) * 100003 + regionOf(z));
    return set.size;
  }

  /** はじまりの 坑道の 入口 (x, z)（置けなければ null） */
  startEntrance(): { x: number; z: number } | null {
    const e = this.start()?.plan.shaft.entrance;
    return e ? { x: e.x, z: e.z } : null;
  }

  /**
   * (x, y, z) は いちばん 下の へやの 中か（実績「いちばん したに ついた」）。
   * 先読みずみの 区画だけを 見る〔同期で 計画しない。遊んで いる 間に ひっかからない〕。
   */
  inBottom(x: number, y: number, z: number): boolean {
    const inRoom = (s: Shaft | undefined): boolean => {
      const r = s?.room;
      return r !== undefined && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y <= r.y + S.room.height - 1;
    };
    if (!shaftsOn) return false;
    return inRoom(this.startPlanned?.plan.shaft) || inRoom(this.regions.get(this.regionKey(regionOf(x), regionOf(z)))?.plan.shaft);
  }

  /** (x, y, z) は 坑道の 空気か */
  inside(x: number, y: number, z: number): boolean {
    const k = keyOf(x, y, z);
    for (const plan of this.plansNear(x >> 4, z >> 4)) if (plan.b.air.has(k)) return true;
    return false;
  }
}

// ------------------------------------------------------------------ シードごとに おぼえる

const worlds = new Map<number, { plain: ShaftWorld; byOld: WeakMap<OldCols, ShaftWorld> }>();

/**
 * シードごとの 坑道の 世界。古い 列の 一覧を わたすと、その 一覧ごとに 1 つ〔一覧の 入れものが 同じ ならば 同じ 世界〕。
 * startHint は 最初に 作った ときだけ 使う。ゲームの 中では 世界ごとに 1 つ だけ 作って みんなに わたす〔実績・surface・窓口〕。
 */
export function shaftWorldFor(seed: number, oldCols?: OldCols, startHint?: { x: number; z: number } | null): ShaftWorld {
  let e = worlds.get(seed);
  if (!e) {
    if (worlds.size > 6) worlds.clear();
    e = { plain: new ShaftWorld(seed, undefined), byOld: new WeakMap() };
    worlds.set(seed, e);
  }
  if (!oldCols) return e.plain;
  let w = e.byOld.get(oldCols);
  if (!w) e.byOld.set(oldCols, (w = new ShaftWorld(seed, oldCols, startHint)));
  return w;
}

/** 古い 列の 一覧 なしの 世界 用。テストと つなぎ込み前 だけ〔ゲームの 中では wireBoot が 作った 世界を わたす〕 */
export function plainShaftWorld(seed: number): ShaftWorld {
  return shaftWorldFor(seed, undefined);
}
