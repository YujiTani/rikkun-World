// COOP-1 4c（docs/design/COOP-1.md §3.3「4c の しくみ」・§6・AC93）: 世界の かまどの 中身（じゅんばん・やいている とちゅう・待っている 物）。
// 1P の つくる・2P の つくる（CraftSystemImpl）が 同じ 物に 入れる。1 ステップに 1 回だけ `update()` で すすむ（2 倍速に ならない）。
// やけた 物は「入れた 人」の もちものへ（開いて いなくても）。2P が いない ときは 2 の 物も 1P へ。
import type { CraftEvent, Inventory, ItemId, ItemStack, Vec3, VoxelWorld } from '../contracts';
import { itemType } from '../inventory/items';
import { K_FURNACE, isFurnKind } from '../world/blocks/houseBlocks';
import { CRAFT_DEFAULTS, type CraftConfig } from './config';
import { BAKE_RECIPES } from './recipes';

/** 入れた 人（1P = 1・2P = 2） */
export type FurnaceWho = 1 | 2;

/** かまど の じゅんばん 1 こ（ねんりょうは押した時点で使ってある）。by = 入れた 人 */
export interface BakeEntry {
  recipe: string;
  fuel: ItemId;
  by: FurnaceWho;
}

/** 焼けたのに もちものに 入らず 待っている 物（入れた 人ごとに 分ける） */
interface DoneEntry {
  item: ItemId;
  count: number;
  by: FurnaceWho;
}

export interface FurnaceState {
  /** 先頭が いま焼いているもの */
  queue: BakeEntry[];
  /** 先頭を何ステップ焼いたか */
  progress: number;
  done: DoneEntry[];
}

export interface FurnaceView {
  burning: boolean;
  current: { id: string; progress: number } | null;
  queue: string[];
  done: ItemStack[];
}

/** かまど の火・けむり用の 1 こ分（`FurnaceFxEntry` と同じ形） */
export interface FurnaceFxEntryLike {
  x: number;
  y: number;
  z: number;
  burning: boolean;
  waiting: string | null;
}

export interface FurnaceWorldDeps {
  world: Pick<VoxelWorld, 'getBlock'>;
  /** やけた 物の 届け先（入れた 人の もちもの） */
  inventoryOf: (who: FurnaceWho) => Inventory;
  /** 2P が いるか。false の あいだは 入れた 人が 2 の 物も 1P へ（やけた 物も 待っている 物も。つぎの update から） */
  joined: () => boolean;
  /** やけた 物が 実際に 入った とき、受け取った 人と 入った 数だけ */
  onDelivered?: (who: FurnaceWho, item: ItemId, count: number, tick: number) => void;
  /** bakeTicks・bakeQueueMax は 1P と 同じ 表（渡した 物を そのまま 読む＝あとで 書きかえられても 効く） */
  config?: CraftConfig;
  requestSave?: () => void;
  /** 出来事に 付ける 時計（なければ 自分で 数える） */
  tick?: () => number;
  /** 渡すと 入れた 人に よらず やけた 物・出来事は いつも この 人へ（自分だけの かまど。by が 2 の 保存を 1 人で 読んでも 出来事が きえない） */
  fixedRecipient?: FurnaceWho;
}

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** 保存の `by`: 2 だけが 2P。ない・知らない 値は 1P */
const byOf = (v: unknown): FurnaceWho => (v === 2 ? 2 : 1);

export class FurnaceWorld {
  private readonly furnaces = new Map<string, { pos: Vec3; state: FurnaceState }>();
  private readonly sinks: Record<FurnaceWho, Array<(e: CraftEvent) => void>> = { 1: [], 2: [] };
  private readonly fxList: FurnaceFxEntryLike[] = [];
  private ticks = 0;

  constructor(private readonly d: FurnaceWorldDeps) {}

  private get config(): CraftConfig {
    return this.d.config ?? CRAFT_DEFAULTS;
  }

  /** いまの 時計（出来事の tick。受け取る 人の `notifyPickup` にも これを 渡して そろえる） */
  now(): number {
    return this.d.tick ? this.d.tick() : this.ticks;
  }

  /** 出来事（bakeStart・bakeDone）の 届け口。戻り値は 登録を やめる 関数 */
  listen(who: FurnaceWho, sink: (e: CraftEvent) => void): () => void {
    this.sinks[who].push(sink);
    return () => {
      const list = this.sinks[who];
      const i = list.indexOf(sink);
      if (i >= 0) list.splice(i, 1);
    };
  }

  /** やけた 物を 受け取る 人。2P が いなければ 2 の 物も 1P */
  private recipient(by: FurnaceWho): FurnaceWho {
    if (this.d.fixedRecipient) return this.d.fixedRecipient;
    return by === 2 && this.d.joined() ? 2 : 1;
  }

  private emit(to: FurnaceWho, e: CraftEvent): void {
    for (const s of this.sinks[to]) s(e);
  }

  isFurnace(x: number, y: number, z: number): boolean {
    return isFurnKind(this.d.world.getBlock(x, y, z), K_FURNACE);
  }

  /** かまど の中の様子。かまど でなければ null */
  view(x: number, y: number, z: number): FurnaceView | null {
    if (!this.isFurnace(x, y, z)) return null;
    const f = this.furnaces.get(keyOf(x, y, z))?.state;
    if (!f) return { burning: false, current: null, queue: [], done: [] };
    return {
      burning: f.queue.length > 0,
      current: f.queue.length > 0 ? { id: f.queue[0].recipe, progress: Math.min(1, f.progress / this.config.bakeTicks) } : null,
      queue: f.queue.map((q) => q.recipe),
      done: f.done.map((s) => ({ item: s.item, count: s.count })),
    };
  }

  /** 画面用: 焼いている かまど の位置の一覧 */
  positions(): Vec3[] {
    return [...this.furnaces.values()].map((e) => ({ ...e.pos }));
  }

  /** 毎ステップ呼べる: かまど の火・けむり用の一覧（同じ入れ物を使いまわす） */
  fxEntries(): readonly FurnaceFxEntryLike[] {
    const out = this.fxList;
    let n = 0;
    this.furnaces.forEach((e) => {
      const o = (out[n] ??= { x: 0, y: 0, z: 0, burning: false, waiting: null });
      o.x = e.pos.x;
      o.y = e.pos.y;
      o.z = e.pos.z;
      o.burning = e.state.queue.length > 0;
      o.waiting = e.state.done[0]?.item ?? null;
      n++;
    });
    out.length = n;
    return out;
  }

  /** そこの じゅんばんの 長さ（2 人で 1 つ） */
  queueLength(x: number, y: number, z: number): number {
    return this.furnaces.get(keyOf(x, y, z))?.state.queue.length ?? 0;
  }

  /** じゅんばんに 1 こ 入れる（上限の 確認は 呼ぶ 側）。先頭に なったら 焼きはじめ（bakeStart は 受け取る 人へ） */
  push(x: number, y: number, z: number, entry: BakeEntry): void {
    const f = this.stateAt(x, y, z);
    f.queue.push(entry);
    if (f.queue.length === 1) {
      f.progress = 0;
      this.emit(this.recipient(entry.by), { type: 'bakeStart', tick: this.now(), recipe: entry.recipe, fuel: entry.fuel, position: { x, y, z } });
    }
    this.d.requestSave?.();
  }

  /** かまどを こわした: 記録を 消して 中身（じゅんばん・待っている 物）を 返す。なければ null */
  remove(x: number, y: number, z: number): FurnaceState | null {
    const k = keyOf(x, y, z);
    const e = this.furnaces.get(k);
    if (!e) return null;
    this.furnaces.delete(k);
    return e.state;
  }

  /** 1 ステップ すすめる。**毎ステップ ちょうど 1 回**（2 つの つくる が それぞれ すすめない） */
  update(): void {
    for (const e of this.furnaces.values()) {
      const f = e.state;
      this.flushDone(f);
      if (f.queue.length > 0) {
        f.progress++;
        if (f.progress >= this.config.bakeTicks) this.finishHead(e.pos, f);
      }
    }
    this.ticks++;
  }

  /** 入れた 人の もちものへ。入らなかった 数を 返す */
  private deliver(who: FurnaceWho, item: ItemId, count: number): number {
    const left = this.d.inventoryOf(who).add(item, count);
    if (count - left > 0) this.d.onDelivered?.(who, item, count - left, this.now());
    return left;
  }

  private finishHead(pos: Vec3, f: FurnaceState): void {
    const head = f.queue.shift()!;
    f.progress = 0;
    const r = BAKE_RECIPES.find((b) => b.id === head.recipe);
    if (r) {
      const to = this.recipient(head.by);
      const left = this.deliver(to, r.output.item, r.output.count);
      if (left > 0) this.pushDone(f, r.output.item, left, head.by);
      this.emit(to, { type: 'bakeDone', tick: this.now(), recipe: r.id, item: r.output.item, count: r.output.count, position: { ...pos } });
    }
    const next = f.queue[0];
    if (next) {
      this.emit(this.recipient(next.by), { type: 'bakeStart', tick: this.now(), recipe: next.recipe, fuel: next.fuel, position: { ...pos } });
    }
    this.d.requestSave?.();
  }

  private pushDone(f: FurnaceState, item: ItemId, count: number, by: FurnaceWho): void {
    const same = f.done.find((s) => s.item === item && s.by === by);
    if (same) same.count += count;
    else f.done.push({ item, count, by });
  }

  private flushDone(f: FurnaceState): void {
    if (f.done.length === 0) return;
    for (const s of f.done) s.count = this.deliver(this.recipient(s.by), s.item, s.count);
    f.done = f.done.filter((s) => s.count > 0);
    this.d.requestSave?.();
  }

  private stateAt(x: number, y: number, z: number): FurnaceState {
    const k = keyOf(x, y, z);
    let e = this.furnaces.get(k);
    if (!e) {
      e = { pos: { x, y, z }, state: { queue: [], progress: 0, done: [] } };
      this.furnaces.set(k, e);
    }
    return e.state;
  }

  // ---------------------------------------------------------- 保存（`by` は 2P の 物だけ `by: 2`。ない 保存は 1P）

  serialize(): unknown {
    return [...this.furnaces.values()]
      .filter((e) => e.state.queue.length > 0 || e.state.done.length > 0)
      .map((e) => ({
        x: e.pos.x,
        y: e.pos.y,
        z: e.pos.z,
        queue: e.state.queue.map((q) => (q.by === 2 ? { recipe: q.recipe, fuel: q.fuel, by: 2 } : { recipe: q.recipe, fuel: q.fuel })),
        progress: e.state.progress,
        done: e.state.done.map((s) => (s.by === 2 ? { item: s.item, count: s.count, by: 2 } : { item: s.item, count: s.count })),
      }));
  }

  /** 読みこみ用。おかしい分は捨てる */
  deserialize(data: unknown): void {
    this.furnaces.clear();
    if (!Array.isArray(data)) return;
    for (const raw of data) {
      const r = raw as Record<string, unknown> | null;
      if (!r) continue;
      const x = Number(r.x);
      const y = Number(r.y);
      const z = Number(r.z);
      if (![x, y, z].every(Number.isInteger)) continue;
      const queue: BakeEntry[] = [];
      if (Array.isArray(r.queue)) {
        for (const q of r.queue.slice(0, this.config.bakeQueueMax)) {
          const qq = q as { recipe?: unknown; fuel?: unknown; by?: unknown };
          if (typeof qq?.recipe !== 'string' || typeof qq.fuel !== 'string') continue;
          if (!BAKE_RECIPES.some((b) => b.id === qq.recipe) || !itemType(qq.fuel)) continue;
          queue.push({ recipe: qq.recipe, fuel: qq.fuel as ItemId, by: byOf(qq.by) });
        }
      }
      const done: DoneEntry[] = [];
      if (Array.isArray(r.done)) {
        for (const s of r.done) {
          const ss = s as { item?: unknown; count?: unknown; by?: unknown };
          const t = typeof ss?.item === 'string' ? itemType(ss.item) : undefined;
          if (!t || typeof ss.count !== 'number' || !Number.isInteger(ss.count) || ss.count < 1) continue;
          done.push({ item: t.id, count: ss.count, by: byOf(ss.by) });
        }
      }
      const p = Number(r.progress);
      const progress = Number.isFinite(p) && p >= 0 ? Math.min(Math.floor(p), this.config.bakeTicks - 1) : 0;
      if (queue.length === 0 && done.length === 0) continue;
      this.furnaces.set(keyOf(x, y, z), { pos: { x, y, z }, state: { queue, progress, done } });
    }
  }
}
