import { slab } from '../animals/animalMath';
import type { Vec3 } from '../contracts';
import { Architect, ARCHITECT_HIT } from './architect';
import { ARCHITECT_WORK } from './build/tuning';
import { standY, type HouseWorld } from './ground';
import { firstCandidates, landColumn, regionHasArchitect, regionIndex, spotCandidates, type Column } from './placement';
import type { HouseRecord } from './talk';

/**
 * 建築士さんの 一覧（HOUSE-1A。docs/design/HOUSE-1.md §2.2・§6.1）。DOM・three なし。
 *  - 最初の 1 人（id 'first'）: スタートから 横 6〜10 マス。決まったら `record.first` に 書く（セーブに のこる）。
 *  - ほかの 建築士さん（id 'r<区画 x>_<区画 z>'）: 192×192 の 区画ごとに 0 か 1 人。どちらも 位置は (シード, 座標) だけで 決まる。
 *  - 読みこんだ 世界の そばに いる 間だけ 一覧に 載る（列が はずれたり 遠く なると きえ、近づくと 同じ 場所に また 出る）。
 *  - 体力は ない。妖怪の 一覧には 入れない（ねらわれない）。右クリックで 話しかける 相手の 当たり判定 `rayHit` を 持つ。
 */

/** この きょり（マス）より 近い 区画の 建築士さんを 出す。読みこみの 輪（128 マス）に 合わせる */
const LOAD_RADIUS = 128;
/** この きょり より 遠く なったら 一覧から はずす */
const UNLOAD_RADIUS = 150;
/** 一覧の 見直しを する 間かく（ステップ）と、動いた きょり（これ以上 動いたら すぐ 見直す。テレポート・やり直し） */
const REFRESH_EVERY = 20;
const REFRESH_MOVE = 8;
/** 木・置いた ブロックで 立てない とき、まわり この 半径の 列から 立てる 所を さがす */
const NUDGE = 2;
/** 建築で うつる 先が ふさがって いる とき、立てる 所を さがす 半径（列） */
const WORK_NUDGE = 4;

/** 街の こやの 建築士さんの id（TOWN-1 1B-2。るすの 間は 一覧から はずれる） */
export const HUT_ID = 'daiku';

/** 街の こや（作業台の 前。足もと・向き yaw 0 ＝ 北）。away ＝ なおしに 出て いる（るす） */
export interface HutSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  away(): boolean;
}

export interface ArchitectInfo {
  id: string;
  /** 足もと */
  x: number;
  y: number;
  z: number;
  first: boolean;
  /** 建築中（HOUSE-1C PR-2。戸の 前で とんかちを ふっている） */
  busy: boolean;
}

export interface ArchitectManagerDeps {
  seed: number;
  world: HouseWorld;
  /** 始まりの 場所（世界の 座標。床の まん中）。向き yawDeg は スタートの 画面の 向き（0 = 北） */
  spawn: () => { x: number; z: number; yawDeg: number };
  record: HouseRecord;
  /** プレイヤーの 足もと */
  player: () => Vec3;
  /** 地形だけで 見た「水でない 地面」（テストで 差しかえる。ふだんは `landColumn`） */
  isLand?: (x: number, z: number) => boolean;
  /** 街の こや（街が ない 世界は null か 省く） */
  hut?: () => HutSpot | null;
}

/** 建築で 場所を うつされた 建築士さん（id ごと）。spot ＝ 作業の 場所（戸の 前の 列）、origin ＝ もとの 場所（わかった とき）、phase ＝ 建築中 / 完成して もとへ もどる 待ち */
interface WorkSpot {
  spot: Column;
  origin: Column | null;
  phase: 'build' | 'return';
}

export class ArchitectManager {
  private readonly list_: Architect[] = [];
  private readonly work = new Map<string, WorkSpot>();
  private readonly byId = new Map<string, Architect>();
  /** 区画ごとの 候補（地形で 水でない 列だけ。順番は 置き方の 関数の まま）。1 回 計算したら 使いまわす */
  private readonly regionLand = new Map<string, Column[]>();
  /** 区画ごとに 決まった 場所（null = その 区画は 0 人）。決まるまで 無い */
  private readonly regionSpot = new Map<string, Column | null>();
  private readonly isLand: (x: number, z: number) => boolean;
  /** るすで 一覧から はずして いる こやの 建築士さん（帰ったら また 載せる） */
  private parked: Architect | null = null;
  private since = REFRESH_EVERY;
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(private readonly d: ArchitectManagerDeps) {
    this.isLand = d.isLand ?? ((x, z) => landColumn(d.seed, x, z));
  }

  /** 読みこまれて いる 建築士さん（描く 係・窓口が 読む） */
  all(): readonly Architect[] {
    this.syncHut();
    return this.list_;
  }

  get(id: string): Architect | undefined {
    this.syncHut();
    return this.byId.get(id);
  }

  /** 窓口 `architects()` の 形 */
  list(): ArchitectInfo[] {
    this.syncHut(); // 帰った その 瞬間から 一覧に のる（建築士さんの 動きの ステップと 同じ フレームで 読まれても ずれない）
    return this.list_.map((a) => ({ id: a.id, x: a.x, y: a.y, z: a.z, first: a.first, busy: a.busy }));
  }

  /** 1 ステップ（時間が すすんで いる 間だけ 呼ぶ） */
  update(): void {
    const p = this.d.player();
    if (++this.since >= REFRESH_EVERY || Math.hypot(p.x - this.lastX, p.z - this.lastZ) >= REFRESH_MOVE) this.refresh(p);
    for (const a of this.list_) a.update(this.d.world, p);
    this.settleWork(p);
    this.syncHut();
  }

  /**
   * こやの 建築士さん: るすの 間は 一覧・当たりから はずし、帰った その ステップに 同じ 人を もどす（毎ステップ 数える だけ）。
   * 帰った とき 一覧に 載って いなければ（見直しの 前に はずれて いた など）その ステップで 出す（帰ったら すぐ 話せる）
   */
  private syncHut(): void {
    const hut = this.d.hut?.() ?? null;
    if (!hut) return;
    const away = hut.away();
    const a = this.byId.get(HUT_ID);
    if (away && a) {
      this.list_.splice(this.list_.indexOf(a), 1);
      this.byId.delete(HUT_ID);
      this.parked = a;
    } else if (!away && !a) {
      if (this.parked) {
        this.list_.push(this.parked);
        this.byId.set(HUT_ID, this.parked);
        this.parked = null;
      } else this.loadHut(this.d.player());
    }
  }

  /** 建築を 始める: 建築士さん id を 作業の 場所 spot（戸の 前の 列）へ うつす。ふさがって いたら 近い 立てる 所。うつった 足もとを 返す（その 建築士さんが 読みこまれて いなければ null。読みこまれた とき うつる） */
  assignBuild(id: string, spot: Column, origin: Column | null): Vec3 | null {
    const a = this.byId.get(id);
    const prev = this.work.get(id);
    const home = prev?.origin ?? origin ?? (a ? { x: Math.floor(a.homeX), z: Math.floor(a.homeZ) } : null);
    const w: WorkSpot = { spot, origin: home, phase: 'build' };
    this.work.set(id, w);
    return a ? this.applyWork(a, w) : null;
  }

  /** 完成: とんかちを やめて ばんざい。プレイヤーが 32 マス 以上 はなれたら もとの 場所へ もどる */
  finishBuild(id: string): void {
    const w = this.work.get(id);
    if (w) w.phase = 'return';
    const a = this.byId.get(id);
    if (a) {
      a.setBusy(false);
      a.startCheer();
    }
  }

  /** 作業の 場所へ うつして、建築中なら とんかちを ふらせる */
  private applyWork(a: Architect, w: WorkSpot): Vec3 | null {
    const s = this.nearStand(w.spot, WORK_NUDGE);
    if (s) a.relocate(s.col.x + 0.5, s.y, s.col.z + 0.5);
    a.setBusy(w.phase === 'build');
    return s ? { x: s.col.x + 0.5, y: s.y, z: s.col.z + 0.5 } : null;
  }

  /** 完成して 待って いる 建築士さんを、プレイヤーが 32 マス 以上 はなれたら もとの 場所へ もどす（読みこまれて いなければ 作業の 記録だけ 消す。次に 出る とき もとの 場所） */
  private settleWork(p: Vec3): void {
    for (const [id, w] of this.work) {
      if (w.phase !== 'return') continue;
      const a = this.byId.get(id);
      if (a && Math.hypot(a.x - p.x, a.z - p.z) < ARCHITECT_WORK.returnDistance) continue;
      if (a && w.origin) {
        const s = this.nearStand(w.origin, WORK_NUDGE);
        if (s) a.relocate(s.col.x + 0.5, s.y, s.col.z + 0.5);
      }
      this.work.delete(id);
    }
  }

  /**
   * 列 (x, z) の ブロックが かわった（置いた・ほった。`watchBlocks` が 世界から 知らせる）。
   * 足もとに かかる 建築士さんだけ 次の ステップで 足もとを しらべなおす（立って いる 間は 世界を 読まない）
   */
  blockChanged(x: number, z: number): void {
    for (const a of this.list_) a.groundChanged(x, z);
  }

  /** 箱（2 つの 角の 列。fill など。小数でも、角の 順は どちらでも よい）の 中が かわった */
  blocksChanged(x0: number, z0: number, x1: number, z1: number): void {
    const ax = Math.floor(Math.min(x0, x1));
    const az = Math.floor(Math.min(z0, z1));
    const bx = Math.floor(Math.max(x0, x1));
    const bz = Math.floor(Math.max(z0, z1));
    for (const a of this.list_) a.groundChanged(ax, az, bx, bz);
  }

  /** 見直しを 今すぐ（テスト・やり直し用）。一覧に 載せる・はずす */
  refresh(p: Vec3 = this.d.player()): void {
    this.since = 0;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.unload(p);
    this.loadFirst(p);
    this.loadHut(p);
    this.loadRegions(p);
  }

  /** こやの 建築士さん: 読みこんだ 街の こやの 作業台の 前に 1 人（るすの 間は 出さない） */
  private loadHut(p: Vec3): void {
    const hut = this.d.hut?.() ?? null;
    if (!hut || hut.away() || this.byId.has(HUT_ID) || this.parked) return;
    const col: Column = { x: Math.floor(hut.x), z: Math.floor(hut.z) };
    if (!this.d.world.isLoaded(col.x, col.z) || Math.hypot(hut.x - p.x, hut.z - p.z) > LOAD_RADIUS) return;
    // 足もとは こやの ゆか（hut.y）。地面を 上から しらべる standY は 屋根の 上を 返すので 使わない
    this.add(HUT_ID, false, col, hut.y, hut.yaw);
  }

  /** 話しかけられた: その場で 止まって こちらを 向き、うなずく。いない・もう 話している なら false */
  beginTalk(id: string, from: Vec3): boolean {
    const a = this.byId.get(id);
    if (!a || a.state === 'talk') return false;
    a.beginTalk(from.x, from.z);
    return true;
  }

  endTalk(id: string): void {
    this.byId.get(id)?.endTalk();
  }

  /** たたかれた（体力は ない。おっとっとだけ） */
  hit(id: string, from: Vec3): void {
    this.byId.get(id)?.hit(from.x, from.z);
  }

  /** 目から (dir) の 線が、reach マス いないで 当たる いちばん 近い 建築士さん（話しかける 相手）。distance は 目から */
  rayHit(origin: Vec3, dir: Vec3, reach: number): { id: string; distance: number } | null {
    this.syncHut();
    let bestId = '';
    let bestT = Infinity;
    const { hw, h } = ARCHITECT_HIT;
    for (const a of this.list_) {
      const tx = slab(origin.x, dir.x, a.x - hw, a.x + hw, 0, reach);
      if (tx === null) continue;
      const ty = slab(origin.y, dir.y, a.y, a.y + h, tx[0], tx[1]);
      if (ty === null) continue;
      const tz = slab(origin.z, dir.z, a.z - hw, a.z + hw, ty[0], ty[1]);
      if (tz === null) continue;
      if (tz[0] <= reach && tz[0] < bestT) {
        bestT = tz[0];
        bestId = a.id;
      }
    }
    return bestId === '' ? null : { id: bestId, distance: bestT };
  }

  // ------------------------------------------------------------ 出す・はずす

  private add(id: string, first: boolean, col: Column, y: number, stay?: number): void {
    const a = new Architect({ id, first, x: col.x + 0.5, y, z: col.z + 0.5, seed: this.d.seed, ...(stay !== undefined ? { stay } : {}) });
    this.list_.push(a);
    this.byId.set(id, a);
    // 建築で 場所を うつされて いた 建築士さんが 読みこまれた: 作業の 場所へ（もとの 場所は ここ）
    const w = this.work.get(id);
    if (w) {
      w.origin ??= { x: col.x, z: col.z };
      this.applyWork(a, w);
    }
  }

  /** 列が 読みこみから はずれた・遠く なった 建築士さんは 一覧から はずす（また 近づけば 同じ 場所に 出る） */
  private unload(p: Vec3): void {
    for (let i = this.list_.length - 1; i >= 0; i--) {
      const a = this.list_[i]!;
      const far = Math.hypot(a.x - p.x, a.z - p.z) > UNLOAD_RADIUS;
      if (far || !this.d.world.isLoaded(Math.floor(a.x), Math.floor(a.z))) {
        this.list_.splice(i, 1);
        this.byId.delete(a.id);
      }
    }
  }

  private loadFirst(p: Vec3): void {
    if (this.byId.has('first')) return;
    const rec = this.d.record;
    const sp = this.d.spawn();
    if (!rec.first) {
      const start: Column = { x: Math.floor(sp.x), z: Math.floor(sp.z) };
      const pick = this.pickFirst(start, sp.yawDeg);
      if (!pick) return; // 候補の 列が まだ 読みこまれて いない（そろったら 決める）
      rec.first = { x: pick.col.x, z: pick.col.z };
    }
    const col = rec.first;
    if (!this.d.world.isLoaded(col.x, col.z) || Math.hypot(col.x + 0.5 - p.x, col.z + 0.5 - p.z) > LOAD_RADIUS) return;
    const spot = this.nearStand(col);
    if (spot) this.add('first', true, spot.col, spot.y);
  }

  /** 最初の 1 人: 置き方の 関数が 並べた 候補を 先頭から 見て、水でなく 実際に 立てる 最初の 列。立てるか 分からない（列が 読みこまれて いない）候補が 先に あれば null で 待つ */
  private pickFirst(start: Column, facingDeg: number): { col: Column; y: number } | null {
    for (const c of firstCandidates(this.d.seed, start, facingDeg)) {
      if (!this.isLand(c.x, c.z)) continue;
      if (!this.d.world.isLoaded(c.x, c.z)) return null;
      const y = standY(this.d.world, c.x, c.z);
      if (y !== null) return { col: c, y };
    }
    return null;
  }

  /** (col) に 立てれば その 列。木・置いた ブロックで 立てない ときは まわり NUDGE 列以内の 近い 列（読みこみ前は null） */
  private nearStand(col: Column, radius = NUDGE): { col: Column; y: number } | null {
    const w = this.d.world;
    for (let r = 0; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = col.x + dx;
          const z = col.z + dz;
          const y = standY(w, x, z);
          if (y !== null) return { col: { x, z }, y };
        }
      }
    }
    return null;
  }

  private loadRegions(p: Vec3): void {
    const sp = this.d.spawn();
    const start: Column = { x: Math.floor(sp.x), z: Math.floor(sp.z) };
    const r0x = regionIndex(p.x - LOAD_RADIUS);
    const r1x = regionIndex(p.x + LOAD_RADIUS);
    const r0z = regionIndex(p.z - LOAD_RADIUS);
    const r1z = regionIndex(p.z + LOAD_RADIUS);
    for (let rz = r0z; rz <= r1z; rz++) {
      for (let rx = r0x; rx <= r1x; rx++) {
        if (!regionHasArchitect(this.d.seed, rx, rz, start)) continue;
        const id = `r${rx}_${rz}`;
        if (this.byId.has(id)) continue;
        const spot = this.regionSpotOf(rx, rz);
        if (!spot) continue;
        if (Math.hypot(spot.x + 0.5 - p.x, spot.z + 0.5 - p.z) > LOAD_RADIUS || !this.d.world.isLoaded(spot.x, spot.z)) continue;
        const stand = this.nearStand(spot);
        if (stand) this.add(id, false, stand.col, stand.y);
      }
    }
  }

  /**
   * 区画の 建築士さんの 場所。地形で 水でない 候補を 順に 見て、読みこまれて いて 立てる 最初の 列。
   * 先の 候補が まだ 読みこまれて いないと きは null（決まったら 覚える。どの 順で 読みこんでも 同じ 場所に なる）
   */
  private regionSpotOf(rx: number, rz: number): Column | null {
    const key = `${rx},${rz}`;
    const known = this.regionSpot.get(key);
    if (known !== undefined) return known;
    let land = this.regionLand.get(key);
    if (!land) {
      land = spotCandidates(this.d.seed, rx, rz).filter((c) => this.isLand(c.x, c.z));
      this.regionLand.set(key, land);
    }
    for (const c of land) {
      if (!this.d.world.isLoaded(c.x, c.z)) return null; // この 候補が 立てるか 分からない: 待つ
      if (standY(this.d.world, c.x, c.z) !== null) {
        this.regionSpot.set(key, c);
        return c;
      }
    }
    this.regionSpot.set(key, null); // 立てる 候補が 1 つも ない（その 区画は 0 人）
    return null;
  }
}
