import type { BlockId, ChunkColumn, Inventory, PlayerState, ScreenSettings, SpawnPoint, Vec3 } from '../contracts';
import { packColumn, SAVE_ID, type PersistBackend, type StoredChunk, type StoredMeta } from './backend';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { encodeSections } from './chunkCodec';
import { colKey } from '../world/stream/ring';
import { bodyInWall } from '../world/wall';
import type { StrengthLevel } from '../yokai/stats';
import { NO_SAVE, PENDING_KEY, PENDING_MAX_CELLS, removePendingOf, type RestoredSave } from './restore';

/** localStorage と同じ形（テストでは偽物を渡す） */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 保存と読みこみに必要な世界の窓口（ChunkedVoxelWorld がそのまま合う） */
export interface SaveWorld {
  readonly size: { readonly y: number };
  loadedBounds(): { x0: number; z0: number; x1: number; z1: number };
  isLoaded(x: number, z: number): boolean;
  /** ブロックの番号（BLOCK_TYPES の順）。範囲外は -1 */
  getIndex(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  isSolid(x: number, y: number, z: number): boolean;
}

/** 保存に使う世界の窓口: さわった列（VOX-F）と、変えたマスの記録 */
export interface SaveTracking {
  saveDirtyCount(): number;
  takeSaveDirty(): ChunkColumn[];
  requeueSaveDirty(cols: readonly { cx: number; cz: number }[]): void;
  markAllSaveDirty(): void;
  changeLogEnd(): number;
  changeLogStart(): number;
  changeLogCount(): number;
  changeLogCells(): readonly number[];
  dropChangeLogTo(end: number): void;
  changeLogOverflowed(): boolean;
}

/** プレイヤーの位置と向きの出し入れ（PlayerController と CameraRig をつなぐ） */
export interface SavePlayer {
  get(): PlayerState;
  set(v: { position: Vec3; velocity: Vec3; yawDeg: number; pitchDeg: number }): void;
}

/** おとしもの ぶくろの出し入れ（M3 §2.10）。ticksLeft 以外が変わったときだけ「変わった」と数える */
export interface SaveBags {
  serialize(): Array<{ ticksLeft: number } & Record<string, unknown>>;
  deserialize(data: unknown): void;
}

/** M4: かまど・そうびの出し入れ */
export interface SaveExtra {
  serialize(): unknown;
  deserialize(data: unknown): void;
  /** LIVE-3: 保存 の 材料 を 集める 前 に 呼ぶ（いただきます の 演出 中 の 子 を その場 で おわらせて、にく を 持ち物 へ 入れる） */
  prepare?(): void;
}

/** M7: 農業 */
export type SaveFarm = SaveExtra;

/** 1 日の時刻の出し入れ（TimeOfDayImpl が合う） */
export interface SaveClock {
  dayTick(): number;
  day(): number;
  set(dayTick: number): void;
  setDay(day: number): void;
}

export interface SaveDeps {
  world: SaveWorld & SaveTracking;
  seed: number;
  /** セーブの名前（IndexedDB のキー。既定のシードは 'vox-main'） */
  saveId?: string;
  /** IndexedDB（かメモリ版）。null = 保存しない */
  db: PersistBackend | null;
  /** localStorage（pagehide の保険・古い保存の読み出し）。null = ?nosave=1 で 保存しない */
  store: KeyValueStore | null;
  /** 起動のとき restoreStoredWorld が返したもの（なければ 新しい世界） */
  restored?: RestoredSave;
  inventory: Inventory;
  player: SavePlayer;
  spawn: () => SpawnPoint;
  /** 今までに更新した回数 */
  tick: () => number;
  settings: Pick<ScreenSettings, 'saveIntervalTicks'>;
  /** M3: おとしもの ぶくろ。なければ保存しない */
  bags?: SaveBags;
  /** M4: かまど の じゅんばん・焼いている途中・待っている焼けたもの */
  furnaces?: SaveExtra;
  /** M4: 着ている防具 */
  armor?: SaveExtra;
  /** M4 追加: 経験値とレベル */
  level?: SaveExtra;
  /** M6: 実績の記録・取ったもの・見せていない列 */
  achievements?: SaveExtra;
  /** M6: たんすの中身（ブロックの復元のあとに戻す） */
  storage?: SaveExtra;
  /** LIVE-1: にわとり（`v: 2` = `{ x, y, z, yaw, follow }`。`v: 1` も 読む。§4.4） */
  animals?: SaveExtra;
  /** WEAPON-7: 手に 入れた ことの ある レジェンダリー（`legendGot`）。前の 保存に ない ときは 空 */
  legend?: SaveExtra;
  /** M7: 作物・農業の乱数・「置きものを置いた」印。無い保存は 読んだあと 置きものを置く */
  farm?: SaveFarm;
  /** 時刻と何日目。なければ保存しない */
  clock?: SaveClock;
  /** START-1: この 世界の つよさ（meta の `strength` に 書く。なければ 書かない = 古い 保存と 同じ） */
  strength?: StrengthLevel;
  /** VOX-D: 列は stream が読みこむ。保険から戻したときの最初の保存は、保険を当てたあとに main が now() で始める（load では書かない） */
  streaming?: boolean;
  /** VOX-D: 列を書けたとき（キーの一覧に足す） */
  onWritten?: (cols: readonly { cx: number; cz: number }[]) => void;
  /** VOX-D: 保存にある列の数（キーの一覧） */
  storedChunks?: () => number;
}

export interface SaveInfo {
  /** セーブの名前（IndexedDB のキー。VOX-B から 'vox-main' / 'vox-seed-N'。前の世界の 'main' とは別） */
  saveId: string;
  enabled: boolean;
  lastSavedTick: number | null;
  /** 直近の保存で メインスレッドを使った時間（縮める前まで）。書き終わりは doneMs */
  lastMs: number;
  /** 直近の保存で 書いた列の数 */
  dirtyChunks: number;
  /** 直近の保存で 書いたバイト数（縮めた列 + meta の文字数） */
  bytes: number;
  /** 保存を始めてから 書き終わるまで */
  doneMs: number;
  /** 書き終わった回数 / 失敗した回数 */
  writes: number;
  failures: number;
  /** 保存にある列の数（キーの一覧。VOX-D） */
  storedChunks: number;
  /** 前の保存から さわった列（まだ書いていない） */
  pendingChunks: number;
  /** 古い localStorage の保存を 移した（VOX-B から いつも false。移すしくみは無い） */
  migrated: boolean;
  /** 保存を読んだとき: 保存した列の数・こわれて生成に戻した列の数 */
  loadedColumns: number;
  corruptColumns: number;
}

export const SAVE_VERSION = 1;
/** 地形の作り方の版。世界生成（src/world/gen）で地形が変わったら上げる。保存した列は そのまま読み、保存していない所だけ新しい生成。3 = VOX-B（無限の地形・高さ 352。前の世界（2）は読まない） */
export const SAVE_GEN = 3;

/** 体の箱（M1-02 §4.1）。置き直しの重なり判定用 */
const BODY = { halfWidth: 0.3, height: 1.8 } as const;
const EPS = 1e-4;

/** 古い保存の平らな番号に使う大きさ（原点から x・z の端まで） */
export function saveDims(world: SaveWorld): { x: number; y: number; z: number } {
  const b = world.loadedBounds();
  return { x: b.x1, y: world.size.y, z: b.z1 };
}

/** 体の箱が、ブロックと重なる・世界の横や下の外に出るなら false（上にはみ出すのは OK） */
export function isBodyPlaceable(world: SaveWorld, p: Vec3): boolean {
  if (![p.x, p.y, p.z].every(Number.isFinite)) return false;
  const x0 = Math.floor(p.x - BODY.halfWidth + EPS);
  const x1 = Math.floor(p.x + BODY.halfWidth - EPS);
  const z0 = Math.floor(p.z - BODY.halfWidth + EPS);
  const z1 = Math.floor(p.z + BODY.halfWidth - EPS);
  const y0 = Math.floor(p.y + EPS);
  const y1 = Math.floor(p.y + BODY.height - EPS);
  if (y0 < 0 || !world.isLoaded(x0, z0) || !world.isLoaded(x1, z1)) return false;
  if (!bodyInWall(p.x, p.z, BODY.halfWidth)) return false;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (world.isSolid(x, y, z)) return false;
  return true;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 自動セーブ（VOX-plan §7）。さわった列は 丸ごと縮めて IndexedDB に、持ち物・プレイヤーなどは meta に書く。
 * 子どもには何も見せない。失敗しても遊びは続ける。
 */
export class SaveManager {
  private lastKey: string | null = null;
  private lastCheckTick = 0;
  private lastTimeKey = '';
  private infoState: SaveInfo;
  private readonly saveId: string;
  /** 書く順番（前の保存が終わってから 次を書く） */
  private chain: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private suspended = false;
  /** 次の保存で 変わっていなくても書く（保険や古い保存から戻したとき） */
  private forceNext = false;
  /** 直近の保存が失敗した（そのあいだ 大きな変更の早め保存は しない。ふつうの間隔で やりなおす） */
  private lastFailed = false;
  private readonly restored: RestoredSave;
  /** いま書いている列（colKey）。stream は この列を 捨てない */
  private readonly writingKeys = new Set<number>();

  constructor(private readonly d: SaveDeps) {
    this.saveId = d.saveId ?? SAVE_ID;
    this.restored = d.restored ?? NO_SAVE;
    this.infoState = {
      saveId: this.saveId,
      enabled: d.store !== null && d.db !== null && !(d.restored?.readOnly ?? false),
      lastSavedTick: null,
      lastMs: 0,
      dirtyChunks: 0,
      bytes: 0,
      doneMs: 0,
      writes: 0,
      failures: 0,
      storedChunks: 0,
      pendingChunks: 0,
      migrated: false,
      loadedColumns: this.restored.columns,
      corruptColumns: this.restored.corrupt,
    };
  }

  info(): SaveInfo {
    return { ...this.infoState, pendingChunks: this.d.world.saveDirtyCount(), storedChunks: this.d.storedChunks?.() ?? 0 };
  }

  /** true のあいだは 保存しない（VOX-D: 新しい世界で 置きものを書くまで） */
  holdWrites = false;
  /** 保険から戻した起動で、保険のマスを 列に当てるまで（ready まで）書かない・保険も上書きしない */
  private pendingHold = false;

  /** 保険のマスを当て終わった（ready）。ここから書ける */
  releasePendingHold(): void {
    this.pendingHold = false;
  }

  private get on(): boolean {
    return this.d.store !== null && this.d.db !== null && !this.suspended && !this.restored.readOnly && !this.holdWrites && !this.pendingHold;
  }

  /** 起動のとき: 保存があれば 持ち物・プレイヤーなどを戻す（列は restoreStoredWorld が 世界に入れ済み）。戻したら true */
  load(): boolean {
    this.lastCheckTick = this.d.tick();
    const data = this.restored.meta;
    if (!this.on || data === null) return false;
    try {
      this.restoreAll(data);
      this.lastKey = this.makeMeta().key;
      this.lastTimeKey = this.timeKey();
      if (this.restored.fromPending) {
        this.forceNext = true;
        if (!this.d.streaming) void this.write(true);
        else this.pendingHold = true;
      }
      return true;
    } catch {
      return false; // こわれた保存は使わない（次の保存で上書き）
    }
  }

  private restoreAll(data: StoredMeta): void {
    try {
      this.d.inventory.deserialize(data.inventory);
    } catch {
      this.d.inventory.clear();
    }
    try {
      this.restorePlayer(data.player);
    } catch {
      const sp = this.d.spawn();
      this.d.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: sp.yawDeg, pitchDeg: sp.pitchDeg });
    }
    try {
      this.d.bags?.deserialize(data.bags);
    } catch {
      this.d.bags?.deserialize([]);
    }
    // M4: 古い保存（かまど・そうびが無い）もそのまま開ける
    try {
      this.d.furnaces?.deserialize(data.furnaces);
    } catch {
      this.d.furnaces?.deserialize([]);
    }
    try {
      this.d.armor?.deserialize(data.armor);
    } catch {
      this.d.armor?.deserialize(null);
    }
    try {
      this.d.level?.deserialize(data.level);
    } catch {
      this.d.level?.deserialize(null);
    }
    try {
      this.d.storage?.deserialize(data.storage);
    } catch {
      this.d.storage?.deserialize(null);
    }
    try {
      this.d.achievements?.deserialize(data.achievements);
    } catch {
      this.d.achievements?.deserialize(null);
    }
    try {
      this.d.farm?.deserialize(data.farm);
    } catch {
      // 新しい保存（farm のキーがある）でこわれたときは 置いた印を 残す。前の保存（キーなし）は null
      this.d.farm?.deserialize(data.farm === undefined || data.farm === null ? null : {});
    }
    this.restoreTime(data.time);
    try {
      this.d.legend?.deserialize(data.legend);
    } catch {
      this.d.legend?.deserialize(null);
    }
    try {
      this.d.animals?.deserialize(data.animals);
    } catch {
      this.d.animals?.deserialize(null);
    }
  }

  /** すぐ保存する。書き終わると解決する（失敗しても 解決する） */
  now(): Promise<void> {
    return this.write(true);
  }

  /** 前の保存から何か変わっていれば保存する（ロックが外れたとき・画面を閉じたとき・ページを閉じるとき） */
  saveIfChanged(): void {
    void this.write(false);
  }

  /** 毎ステップ呼ぶ。`currentTick` はこのステップが終わったあとの tick */
  update(currentTick: number): void {
    if (!this.on) return;
    const w = this.d.world;
    // 保険に入りきらないほど 変えたら、閉じる前に ふつうの保存をしておく
    const bigLog = w.changeLogCount() > PENDING_MAX_CELLS && this.inFlight === 0 && !this.lastFailed;
    if (currentTick - this.lastCheckTick < this.d.settings.saveIntervalTicks && !bigLog) return;
    this.lastCheckTick = currentTick;
    void this.write(false, false, false);
  }

  /** 今のセーブを消す（遊んでいる世界はそのまま。そのあとの保存で 今の世界を丸ごと書きなおす） */
  clear(): Promise<void> {
    const { store, db } = this.d;
    if (!store || !db) return Promise.resolve();
    try {
      removePendingOf(store, this.saveId);
    } catch {
      /* 何もしない */
    }
    this.lastKey = null;
    this.infoState.lastSavedTick = null;
    this.infoState.bytes = 0;
    this.infoState.dirtyChunks = 0;
    this.d.world.markAllSaveDirty();
    const p = this.chain.then(() => db.clear(this.saveId)).catch(() => {});
    this.chain = p;
    return p;
  }

  /** 保存をとめる（ファイルから読みこんで、ページを読みなおす前に呼ぶ） */
  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  /** 保存を書いている途中か（stream が「捨てる前の保存」を始めてよいかを見る） */
  saving(): boolean {
    return this.inFlight > 0;
  }

  /** この列を いま書いている最中か */
  writing(cx: number, cz: number): boolean {
    return this.writingKeys.has(colKey(cx, cz));
  }

  /** 保存を使うか（?nosave=1・IndexedDB なし・読むだけ では false） */
  isOn(): boolean {
    return this.on;
  }

  /** 捨てる前の保存を すぐ始める（600 ステップを待たない。書いている最中なら 終わってから 次の 1 回） */
  flushNow(): void {
    void this.write(false);
  }

  /** 書いている最中のものが 全部終わるまで待つ */
  idle(): Promise<void> {
    return this.chain;
  }

  /** ページを閉じる・かくれるときに保存する。戻り値で解除 */
  bindPageEvents(win: Window, doc: Document): () => void {
    const onHide = () => {
      void this.write(false, true);
      this.writePending();
    };
    const onVisibility = () => {
      if (doc.hidden) onHide();
    };
    win.addEventListener('pagehide', onHide);
    doc.addEventListener('visibilitychange', onVisibility);
    return () => {
      win.removeEventListener('pagehide', onHide);
      doc.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /**
   * pagehide の保険: まだ IndexedDB に書けていない変更（変えたマスの一覧 + meta）を、同期で localStorage に小さく置く。
   * 次の起動で当てて IndexedDB に書き、消す。入りきらないほど多いときは 置かない（ふつうの保存にたよる）。
   */
  private writePending(): void {
    const { store, world } = this.d;
    if (!this.on || !store) return;
    try {
      const n = world.changeLogCount();
      if (n === 0 && this.inFlight === 0) return;
      if (n > PENDING_MAX_CELLS || world.changeLogOverflowed()) return;
      const metaNow = this.makeMeta(true).meta;
      const c = this.d.clock;
      const meta: StoredMeta = { ...metaNow, ...(c ? { time: { day: c.day(), dayTick: c.dayTick() } } : {}), tick: this.d.tick() };
      store.setItem(PENDING_KEY, JSON.stringify({ saveId: this.saveId, ids: BLOCK_TYPES.map((t) => t.id), cells: world.changeLogCells(), meta }));
    } catch {
      /* 容量いっぱいなど: あきらめる */
    }
  }

  private timeKey(): string {
    const c = this.d.clock;
    return c ? `${c.day()}:${c.dayTick()}` : '';
  }

  /** 古い保存（time なし）や こわれた値は 昼の始まり */
  private restoreTime(raw: unknown): void {
    const c = this.d.clock;
    if (!c) return;
    const t = raw as { day?: unknown; dayTick?: unknown } | null | undefined;
    const day = Number(t?.day);
    const tick = Number(t?.dayTick);
    if (t && Number.isInteger(day) && day >= 0 && Number.isFinite(tick) && tick >= 0) {
      c.setDay(day);
      c.set(tick);
    } else {
      c.setDay(0);
      c.set(0);
    }
  }

  private restorePlayer(raw: unknown): void {
    const p = raw as Partial<Record<'x' | 'y' | 'z' | 'yaw' | 'pitch', unknown>>;
    const pos = { x: Number(p?.x), y: Number(p?.y), z: Number(p?.z) };
    const yaw = Number(p?.yaw);
    const pitch = Number(p?.pitch);
    const zero = { x: 0, y: 0, z: 0 };
    // 列が読みこまれていれば 重なりを見る。まだなら（VOX-D: stream が その位置を中心に 輪を作る）壁の中なら そのまま受けとる
    const loaded = [pos.x, pos.z].every(Number.isFinite) && this.d.world.isLoaded(pos.x, pos.z);
    const ok = p && Number.isFinite(pos.y) && (loaded ? isBodyPlaceable(this.d.world, pos) : [pos.x, pos.z].every(Number.isFinite) && bodyInWall(pos.x, pos.z, BODY.halfWidth) && pos.y >= 0);
    if (ok && Number.isFinite(yaw) && Number.isFinite(pitch)) {
      this.d.player.set({ position: pos, velocity: zero, yawDeg: yaw, pitchDeg: pitch });
    } else {
      const s = this.d.spawn();
      this.d.player.set({ position: { x: s.x, y: s.y, z: s.z }, velocity: zero, yawDeg: s.yawDeg, pitchDeg: s.pitchDeg });
    }
    // CHAR-1 第 5 版: 三人称だけ。古い保存の third は見ない
  }

  /**
   * meta（今の JSON の blocks 以外。time・tick なし）と、変わったか比べる文字。
   * 比べる文字には のこりステップを入れない（毎ステップ変わるため）。JSON.stringify は 1 回だけ。
   */
  /** `settle` = 保存 の 前 に 動き の とちゅう の もの を おわらせる（LIVE-3: いただきます）。時間 おきの 保存 や 比べる だけ の とき は false */
  private makeMeta(settle = false): { meta: StoredMeta; key: string } {
    if (settle) this.d.animals?.prepare?.();
    const st = this.d.player.get();
    const bagsFull = this.d.bags?.serialize() ?? [];
    const bagsKey = bagsFull.map((b) => ({ ...b, ticksLeft: 0 }));
    // 作物の ticks・じょうろ の のこり・ごきげん の のこり も 毎ステップ変わるので 比べるときは 0 にする
    const farmFull = this.d.farm?.serialize() ?? null;
    const farmKey = (() => {
      const f = farmFull as { crops?: unknown; watered?: unknown; happy?: unknown } | null;
      if (!f || !Array.isArray(f.crops)) return farmFull;
      const zeroLast = (a: unknown, n: number) => (Array.isArray(a) ? a.map((v, k) => (k % n === n - 1 ? 0 : v)) : a);
      return { ...f, crops: zeroLast(f.crops, 5), watered: zeroLast(f.watered, 4), happy: zeroLast(f.happy, 4) };
    })();
    const sp = this.d.spawn();
    const make = (bags: unknown, farm: unknown): StoredMeta => ({
      v: SAVE_VERSION,
      gen: SAVE_GEN,
      seed: this.d.seed,
      spawn: { x: sp.x, y: sp.y, z: sp.z },
      inventory: this.d.inventory.serialize(),
      player: {
        x: round(st.position.x),
        y: round(st.position.y),
        z: round(st.position.z),
        yaw: round(st.yawDeg),
        pitch: round(st.pitchDeg),
      },
      bags,
      furnaces: this.d.furnaces?.serialize() ?? [],
      armor: this.d.armor?.serialize() ?? null,
      level: this.d.level?.serialize() ?? null,
      storage: this.d.storage?.serialize() ?? null,
      achievements: this.d.achievements?.serialize() ?? null,
      animals: this.d.animals?.serialize() ?? null,
      legend: this.d.legend?.serialize() ?? null,
      farm,
      ...(this.d.strength ? { strength: this.d.strength } : {}),
    });
    // inventory などは 2 回 serialize しない: 比べる側の meta から 取りだす
    const keyObj = make(bagsKey, farmKey);
    const key = JSON.stringify(keyObj);
    const meta: StoredMeta = { ...keyObj, bags: bagsFull, farm: farmFull };
    return { meta, key };
  }

  /** 保存を始める。同期の部分（比べる・さわった列を縮める前のバイト列にする）はここ。書き終わると解決する */
  private write(force: boolean, flushTime = false, settle = true): Promise<void> {
    const db = this.d.db;
    if (!this.on || !db) return Promise.resolve();
    const t0 = performance.now();
    const w = this.d.world;
    this.lastCheckTick = this.d.tick(); // 「前の保存から 600 ステップ」の数え始め
    let taken: ChunkColumn[] = [];
    try {
      const { meta, key } = this.makeMeta(settle);
      const timeKey = this.timeKey();
      const dirty = w.saveDirtyCount();
      if (!force && !this.forceNext && dirty === 0 && key === this.lastKey && !(flushTime && timeKey !== this.lastTimeKey)) return Promise.resolve();
      this.forceNext = false;
      const tick = this.d.tick();
      const c = this.d.clock;
      if (c) meta.time = { day: c.day(), dayTick: c.dayTick() };
      meta.tick = tick;
      taken = w.takeSaveDirty();
      const takenKeys = taken.map((col) => colKey(col.cx, col.cz));
      for (const k of takenKeys) this.writingKeys.add(k);
      const raws = taken.map((col) => ({ cx: col.cx, cz: col.cz, h: col.sections.length, raw: encodeSections(col.sections) }));
      const logEnd = w.changeLogEnd();
      this.lastKey = key;
      this.lastTimeKey = timeKey;
      this.infoState.lastSavedTick = tick;
      this.infoState.dirtyChunks = taken.length;
      this.infoState.lastMs = performance.now() - t0;
      this.inFlight++;
      const run = async () => {
        try {
          const recs: StoredChunk[] = await Promise.all(raws.map((r) => packColumn(r.cx, r.cz, r.raw, SAVE_GEN, r.h)));
          await db.write(this.saveId, recs, meta);
          w.dropChangeLogTo(logEnd);
          let bytes = key.length;
          for (const r of recs) bytes += r.data.length;
          this.infoState.bytes = bytes;
          this.infoState.writes++;
          this.lastFailed = false;
          this.d.onWritten?.(taken);
          this.infoState.doneMs = performance.now() - t0;
          try {
            if (this.d.store) removePendingOf(this.d.store, this.saveId);
          } catch {
            /* 何もしない */
          }
        } catch {
          // 容量いっぱい・トランザクション失敗: 何も書けていない。列を「さわった」に戻して 次の保存で やりなおす
          w.requeueSaveDirty(taken);
          this.lastKey = null;
          this.infoState.failures++;
          this.lastFailed = true;
          this.infoState.doneMs = performance.now() - t0;
        } finally {
          this.inFlight--;
          for (const k of takenKeys) this.writingKeys.delete(k);
        }
      };
      const p = this.chain.then(run);
      this.chain = p;
      return p;
    } catch {
      // 縮める前に失敗: 列を戻して 遊び続ける。子どもには何も出さない
      for (const col of taken) this.writingKeys.delete(colKey(col.cx, col.cz));
      w.requeueSaveDirty(taken);
      this.lastKey = null;
      this.infoState.failures++;
      this.infoState.lastMs = performance.now() - t0;
      return Promise.resolve();
    }
  }
}

/** 住所の ?reset=1 / ?nosave=1 */
export function parseSaveOptions(search: string): { reset: boolean; nosave: boolean } {
  const q = new URLSearchParams(search);
  const on = (name: string) => {
    const v = q.get(name);
    return v !== null && v !== '0' && v !== 'false';
  };
  return { reset: on('reset'), nosave: on('nosave') };
}

/**
 * ?reset=1 で 本当に消すか。消すのは 開発サーバー（テスト）だけ。
 * 公開したゲームでは 何もしない（いたずらのリンクで りっくんの世界が 消えないように。#169）。
 */
export function shouldReset(reset: boolean, isDev: boolean): boolean {
  return reset && isDev;
}

/** 住所から reset を消した新しい住所（再読みこみでまた消えないように） */
export function stripResetParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('reset');
  return url.pathname + url.search + url.hash;
}
