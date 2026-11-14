import { blockIndexOf, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { boundsOf, byBottom, cellKey, columnKey, partition, type Cell, type RepairCell } from './townRepairGroups';
import { findSpot, type Spot } from './townRepairMove';
import { deserializeRepairs, serializeRepairs } from './townRepairSave';
import { TOWN } from './townTuning';

export type { RepairCell } from './townRepairGroups';

/**
 * TOWN-1 1.4 §2.16・§4.5d: 妖怪の わざで かわった 街の マスの 記録と、朝の もどし。
 * - かわった マスを 日つきで おぼえる（`note`）。
 * - 朝（day が ふえた とき）: まとまりごとに 半分（切り上げ・下から）→ つぎの 朝に のこり ぜんぶ。人が そばに いる 間は まつ（つぎの 朝まで）。
 * - もどす はやさ: 1 まとまり 2 ステップに 1 マス・世界 8 マス／ステップ（すぐ もどす とき は 上限なし）。
 * - プレイヤーが ほれる・置ける 所（記録の マスと ふち）の 答えと 記録（`canDig`・`dug`・`canPlace`・`placed`）。
 * 世界・時間・人・妖怪は 小さな 口（TownRepairDeps）で 受ける。描画・Three.js は 知らない。
 */

/** いまの 人（遊んで いる 人だけ。足もとの 位置） */
export interface RepairPlayer {
  who: 1 | 2;
  x: number;
  y: number;
  z: number;
}

export interface TownRepairDeps {
  world: {
    /** 読みこんで いない・高さの 外は 'outside' */
    getBlock(x: number, y: number, z: number): string;
    setBlock(x: number, y: number, z: number, id: string): boolean;
    isLoaded(x: number, z: number): boolean;
    isSolid(x: number, y: number, z: number): boolean;
  };
  /** その マスの 設計・生成の 中身（街を 作った ときの ブロック） */
  plan(x: number, y: number, z: number): string;
  /** 妖怪の わざでも かわらない マスか（TownPlan.keeps） */
  keeps(x: number, y: number, z: number): boolean;
  /** 街の はんいの 中か（高さは 問わない） */
  inTown(x: number, z: number): boolean;
  /** いまの 日（`time.day()`） */
  day(): number;
  /** 遊んで いる 人 ぜんいん（1P・2P。使いまわしの 配列で よい） */
  players(): readonly RepairPlayer[];
  /** 体が ブロックの マスと 重なるか（体の 大きさは 持ち主が きめる） */
  overlaps(p: RepairPlayer, x: number, y: number, z: number): boolean;
  /** 人を そっと 移す（体力・向きは そのまま） */
  movePlayer(who: 1 | 2, x: number, y: number, z: number): void;
  /** 妖怪・動物・落ちて いる アイテムが その マスと 重なって いるか */
  occupied(x: number, y: number, z: number): boolean;
  /** その マスに 重なる 妖怪・動物・アイテムを spot へ 移す */
  evict(x: number, y: number, z: number, spot: Spot): void;
  /** 置いた 物を 置いた 人の もちものへ（いっぱいなら 足もとに 落とす・2P が いなければ 1P へ） */
  giveBack(item: string, who: 1 | 2): void;
  /** 立てる 所が 見つからない ときの 移す 先（ふんすいの 前） */
  fallback(): Spot;
}

/** 朝に きまった もどす 係 1 つ（まとまり 1 つ ぶん） */
interface Active {
  /** 下から 順（y が 小さい 順）の もどす マス。もどした・ほった・また かえた 物は あとで とばす */
  queue: Cell[];
  head: number;
  /** まとまり ぜんぶの 四角（まつ はんいの もと） */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** true ＝ 人が そばに いる 間 まつ（d+1 の 朝の 分）。false ＝ またない（d+2 の 朝 から） */
  waitable: boolean;
  /** つぎに もどして よい ステップ */
  next: number;
}

const GAP = TOWN.repair.groupGapSteps;

export class TownRepairs {
  private readonly cells = new Map<number, Cell>();
  private active: Active[] = [];
  /** 前の ステップの 日。null ＝ まだ 見て いない（ロードの あと 1 ステップめ） */
  private lastDay: number | null = null;
  private t = 0;
  /** もどす ことに きまったが、列を 読みこんで いなくて まって いる マスの ある 列 */
  private readonly waitingCols = new Set<number>();
  /** 仕事の 量の 目安（ユニットテストが 数える。時間では 決めない） */
  readonly stats = { morningWork: 0, stepWork: 0 };

  constructor(private readonly d: TownRepairDeps) {}

  size(): number {
    return this.cells.size;
  }

  // ---------------------------------------------------------------- 記録

  /** 妖怪の わざで マスが かわった（こわれた・石が 置かれた・水が ながれこんだ）。街の はんいの 外・keeps は 記録しない */
  note(x: number, y: number, z: number): boolean {
    if (!this.d.inTown(x, z) || this.d.keeps(x, y, z)) return false;
    const k = cellKey(x, y, z);
    const c = this.cells.get(k);
    const day = this.d.day();
    if (c === undefined) this.cells.set(k, { x, y, z, day, due: false, byPlayer: false, placed: null });
    else {
      c.day = day; // もう 1 回 かわったら 日を 新しい 日に する（その マスだけ 2 日 やりなおし）
      c.due = false;
      c.byPlayer = false;
      c.placed = null;
    }
    return true;
  }

  /**
   * 水が かわった マス（量が へった・ふえた・ながれこんだ）。記録が ある（こわれた 所が ある）あいだ、設計と ちがう なら 記録する。
   * もどす ときは 設計の 中身に もどる（街の 外には 出さない）
   */
  noteLiquid(x: number, y: number, z: number): boolean {
    if (this.cells.size === 0 || !this.d.inTown(x, z) || this.d.keeps(x, y, z)) return false; // 設計の 列を 作る 前に 見る（外の 水で むだに 作らない）
    if (this.cells.has(cellKey(x, y, z))) return true; // もう 記録に ある: 日を 新しくしない（流れが 続いても もどりが おくれない）
    if (this.d.world.getBlock(x, y, z) === this.d.plan(x, y, z)) return false;
    return this.note(x, y, z);
  }

  /** テストの 準備: 妖怪の わざと 同じ 口で マスを かえて 記録する。かえた 数 */
  damage(list: readonly { x: number; y: number; z: number }[], to: 'air' | 'stone' = 'air'): number {
    let n = 0;
    for (const c of list) {
      if (!this.d.inTown(c.x, c.z) || this.d.keeps(c.x, c.y, c.z)) continue;
      if (!this.d.world.setBlock(c.x, c.y, c.z, to)) continue;
      this.note(c.x, c.y, c.z);
      n++;
    }
    return n;
  }

  isRecorded(x: number, y: number, z: number): boolean {
    return this.cells.has(cellKey(x, y, z));
  }

  // ---------------------------------------------------------------- プレイヤーの ほる・置く

  /** ふち: 記録の マスに 面で となりあう（プレイヤーの 印の マスは 数えない）街の ブロック。keeps は ふちに ならない */
  private isEdge(x: number, y: number, z: number): boolean {
    if (!this.d.inTown(x, z) || this.d.keeps(x, y, z)) return false;
    for (const [dx, dy, dz] of FACES) {
      const c = this.cells.get(cellKey(x + dx, y + dy, z + dz));
      if (c !== undefined && !c.byPlayer) return true;
    }
    return false;
  }

  /** プレイヤーが ほれる か（記録の マスと ふち。keeps は ほれない） */
  canDig(x: number, y: number, z: number): boolean {
    if (this.d.keeps(x, y, z)) return false;
    return this.cells.has(cellKey(x, y, z)) || this.isEdge(x, y, z);
  }

  /** プレイヤーが 置けるか（記録の マス。keeps は 置けない） */
  canPlace(x: number, y: number, z: number): boolean {
    return !this.d.keeps(x, y, z) && this.cells.has(cellKey(x, y, z));
  }

  /**
   * プレイヤーが ほる（こわす 前に よぶ）。ふちなら 記録に 入れる（プレイヤーの 印・今日の 日）。
   * 答え: true ＝ アイテムに ならない（街の ブロック）。false ＝ ふつうに もちものへ（自分で 置いた 物・街の 外）
   */
  dug(x: number, y: number, z: number): boolean {
    if (!this.d.inTown(x, z) || this.d.keeps(x, y, z)) return false;
    const c = this.cells.get(cellKey(x, y, z));
    if (c !== undefined) {
      if (c.placed === null) return true;
      c.placed = null; // 自分で 置いた 物は ふつうに もちものへ
      return false;
    }
    if (!this.isEdge(x, y, z)) return false;
    this.cells.set(cellKey(x, y, z), { x, y, z, day: this.d.day(), due: false, byPlayer: true, placed: null });
    return true;
  }

  /** プレイヤーが 置いた（置いた あとに よぶ）。記録の マスなら 置いた 物と 人を おぼえる（もどる 朝に かえす） */
  placed(x: number, y: number, z: number, item: string, who: 1 | 2): void {
    const c = this.cells.get(cellKey(x, y, z));
    if (c !== undefined) c.placed = { item, p: who };
  }

  // ---------------------------------------------------------------- 朝

  /** 固定ステップごとに 1 回（時間が 進んだ あと） */
  step(): void {
    this.t++;
    const day = this.d.day();
    if (this.lastDay === null) {
      this.lastDay = day;
      this.afterLoad(day);
    } else if (day !== this.lastDay) {
      this.lastDay = day;
      this.morning(day);
    }
    if (this.cells.size === 0) {
      this.active.length = 0;
      return;
    }
    this.pace();
  }

  /** ロード・起動の あと 1 ステップめ: もう 2 日 たって いる マスは すぐ ぜんぶ もどす（またない） */
  private afterLoad(day: number): void {
    const late: Cell[] = [];
    for (const c of this.cells.values()) if (day - c.day >= 2) late.push(c);
    this.restoreNow(late);
  }

  /** 朝: 前の 朝の のこりを すぐ もどし、2 日 たった マスと 1 日 たった マスの 半分を 「もどす」と きめる */
  private morning(day: number): void {
    const stale: Cell[] = [];
    const old: Cell[] = [];
    const fresh: Cell[] = [];
    for (const c of this.cells.values()) {
      this.stats.morningWork++;
      if (c.due) stale.push(c);
      else if (day - c.day >= 2) old.push(c);
      else if (day - c.day === 1) fresh.push(c);
    }
    this.restoreNow(stale);
    this.active = this.active.filter((g) => this.skipDone(g));
    const work = { n: 0 };
    for (const g of partition(old, work)) this.schedule(g, g.length, false);
    for (const g of partition(fresh, work)) this.schedule(g, Math.ceil(g.length / 2), true);
    this.stats.morningWork += work.n;
  }

  /** まとまり g の 下から n こを 「もどす」に する */
  private schedule(g: Cell[], n: number, waitable: boolean): void {
    const b = boundsOf(g);
    const sorted = g.slice().sort(byBottom);
    const queue = sorted.slice(0, n);
    for (const c of queue) c.due = true;
    this.stats.morningWork += queue.length;
    this.active.push({ queue, head: 0, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, waitable, next: this.t });
  }

  /** この ステップの もどし（1 まとまり 2 ステップに 1 マス・世界 8 マス まで） */
  private pace(): void {
    const gs = this.active;
    if (gs.length === 0) return;
    let budget = TOWN.repair.worldPerStep;
    let out = 0;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i]!;
      this.stats.stepWork++;
      if (!this.skipDone(g)) continue; // おわった まとまりは はずす
      gs[out++] = g;
      if (budget <= 0 || g.next > this.t) continue;
      if (g.waitable) {
        this.stats.stepWork += this.d.players().length;
        if (this.near(g)) continue;
      }
      const c = this.takeNext(g);
      if (c === null) continue;
      this.restore(c, !g.waitable);
      g.next = this.t + GAP;
      budget--;
      this.stats.stepWork++;
    }
    gs.length = out;
  }

  /** 先頭の もう 要らない マス（もどした・ほった・また かえた）を とばす。まだ 仕事が あれば true */
  private skipDone(g: Active): boolean {
    while (g.head < g.queue.length && !this.pending(g.queue[g.head]!)) g.head++;
    return g.head < g.queue.length;
  }

  private pending(c: Cell): boolean {
    return c.due && this.cells.get(cellKey(c.x, c.y, c.z)) === c;
  }

  /** 先頭から 数マス の 中で いま もどして よい マス（読みこんで いる・重なる 妖怪・動物が いない）。なければ null */
  private takeNext(g: Active): Cell | null {
    let looked = 0;
    for (let i = g.head; i < g.queue.length && looked < TOWN.repair.scanAhead; i++) {
      const c = g.queue[i]!;
      if (!this.pending(c)) continue;
      looked++;
      this.stats.stepWork++;
      if (!this.d.world.isLoaded(c.x, c.z)) {
        this.waitingCols.add(columnKey(c.x >> 4, c.z >> 4));
        continue;
      }
      if (g.waitable && this.d.occupied(c.x, c.y, c.z)) continue; // あとまわし（はなれたら もどす）
      return c;
    }
    return null;
  }

  /** まとまりの 四角 ＋ 2 マスの 中に 人が いるか */
  private near(g: Active): boolean {
    const m = TOWN.repair.waitMargin;
    for (const p of this.d.players()) {
      if (p.x >= g.minX - m && p.x < g.maxX + 1 + m && p.z >= g.minZ - m && p.z < g.maxZ + 1 + m) return true;
    }
    return false;
  }

  /** またずに もどす（ロード・朝の 1 ステップめの のこり・読みこんだ 列）: 下から 上限なし。読みこんで いない マスは 列が できるまで まつ */
  private restoreNow(list: Cell[]): void {
    if (list.length === 0) return;
    list.sort(byBottom);
    for (const c of list) {
      if (!this.d.world.isLoaded(c.x, c.z)) {
        c.due = true;
        this.waitingCols.add(columnKey(c.x >> 4, c.z >> 4));
        continue;
      }
      this.restore(c, true);
    }
  }

  /** 列を 読みこんだ: まって いた マスを すぐ もどす（つぎに 見た とき もう その 日の ようす。§2.16 の 6） */
  onColumnLoaded(cx: number, cz: number): void {
    if (!this.waitingCols.delete(columnKey(cx, cz))) return;
    const list: Cell[] = [];
    for (const c of this.cells.values()) if (c.due && c.x >> 4 === cx && c.z >> 4 === cz) list.push(c);
    this.restoreNow(list);
  }

  // ---------------------------------------------------------------- 1 マスを もどす

  /** c を 設計の 中身に もどす。重なる 体は 先に 移す（force: 人も 妖怪も 動物も 移す。そうでなければ 人は いない はず） */
  private restore(c: Cell, force: boolean): void {
    const id = this.d.plan(c.x, c.y, c.z);
    const solid = BLOCK_TYPES[blockIndexOf(id)]?.solid ?? false;
    if (solid) {
      for (const p of this.d.players()) {
        if (!this.d.overlaps(p, c.x, c.y, c.z)) continue;
        const s = this.spotFor(p.x, p.y, p.z);
        this.d.movePlayer(p.who, s.x, s.y, s.z);
      }
      if (force && this.d.occupied(c.x, c.y, c.z)) this.d.evict(c.x, c.y, c.z, this.spotFor(c.x + 0.5, c.y, c.z + 0.5));
    }
    this.d.world.setBlock(c.x, c.y, c.z, id);
    this.cells.delete(cellKey(c.x, c.y, c.z));
    if (c.placed !== null) this.d.giveBack(c.placed.item, c.placed.p);
  }

  private spotFor(bx: number, by: number, bz: number): Spot {
    const w = this.d.world;
    return (
      findSpot(
        { isSolid: (x, y, z) => w.isSolid(x, y, z), isAir: (x, y, z) => w.getBlock(x, y, z) === 'air', inRecord: (x, y, z) => this.cells.has(cellKey(x, y, z)) },
        bx,
        by,
        bz,
      ) ?? this.d.fallback()
    );
  }

  // ---------------------------------------------------------------- 見せる・保存

  /** `town.repairs()`（保存と 同じ 中身の マスと、まとまり） */
  repairs(): { cells: RepairCell[]; groups: { day: number; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; left: number; waiting: boolean }[] } {
    const cells: RepairCell[] = [];
    for (const c of this.cells.values()) cells.push(viewOf(c));
    const day = this.d.day();
    const groups = partition([...this.cells.values()], { n: 0 }).map((g) => {
      const b = boundsOf(g);
      const m = TOWN.repair.waitMargin;
      const due = g.some((c) => c.due && day - c.day === 1);
      const near = this.d.players().some((p) => p.x >= b.min.x - m && p.x < b.max.x + 1 + m && p.z >= b.min.z - m && p.z < b.max.z + 1 + m);
      return { day: g[0]!.day, min: b.min, max: b.max, left: g.length, waiting: due && near };
    });
    return { cells, groups };
  }

  serialize(): unknown {
    return serializeRepairs(this.cells.values());
  }

  /** 読む。こわれた 中身・古い セーブ（記録 なし）は 0 こ。日の かぞえ・もどす 順・まつ は 保存しない（ロード後の 1 ステップめに 日を 見て きめる） */
  deserialize(data: unknown): void {
    this.cells.clear();
    this.active = [];
    this.waitingCols.clear();
    this.lastDay = null;
    for (const c of deserializeRepairs(data)) this.cells.set(cellKey(c.x, c.y, c.z), c);
  }
}

const FACES: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function viewOf(c: Cell): RepairCell {
  const v: RepairCell = { x: c.x, y: c.y, z: c.z, day: c.day };
  if (c.byPlayer) v.byPlayer = true;
  if (c.placed !== null) v.placed = { item: c.placed.item, p: c.placed.p };
  return v;
}
