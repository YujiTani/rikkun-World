import type { BlockId, ChunkColumn } from '../contracts';
import { BLOCK_TYPES, blockIdFromIndex } from '../world/blocks/blockTypes';
import { SAVE_GEN, SAVE_VERSION, saveDims, saveKey, type KeyValueStore, type SaveWorld } from './SaveManager';
import { NewerFormatError, unpackColumn, type PersistBackend, type StoredMeta } from './backend';

/** pagehide の保険（同期で localStorage に小さく書く）。VOX-plan §7 */
export const PENDING_KEY = 'rikkun-world-pending';
/** 保存を IndexedDB に移した（または リセットした）しるし。これがあると 古い localStorage の保存は もう読まない */
export const migratedKey = (saveId: string): string => `rikkun-world-migrated-${saveId}`;
/** 保険に入れるマスの数の上限。これを超えたら ふつうの保存をする */
export const PENDING_MAX_CELLS = 20000;

/** 世界のうち、読みこみに使う窓口 */
export interface RestoreWorld extends SaveWorld {
  loadColumn(column: ChunkColumn): void;
  requeueSaveDirty(cols: readonly { cx: number; cz: number }[]): void;
  resetSaveTracking(): void;
}

export interface RestoredSave {
  /** 保存の meta（なければ null = 新しい世界）。古い localStorage の保存から移したときも この形 */
  meta: StoredMeta | null;
  /** 古い localStorage の保存を 今 IndexedDB に移す（最初の保存で書き、しるしを付ける） */
  legacy: { changed: Set<number> } | null;
  /** pagehide の保険から戻した（最初の保存で書く） */
  fromPending: boolean;
  /** 保存が今のゲームより新しい版 / 読めない: さわらず、この遊びでは 保存しない */
  readOnly?: boolean;
  /** 読みこんだ列の数 / こわれていて 生成に戻した列の数 */
  columns: number;
  corrupt: number;
}

export const NO_SAVE: RestoredSave = { meta: null, legacy: null, fromPending: false, columns: 0, corrupt: 0 };

export interface RestoreOptions {
  world: RestoreWorld;
  db: PersistBackend | null;
  /** localStorage（null = ?nosave=1） */
  store: KeyValueStore | null;
  seed: number;
  saveId: string;
  /** ?reset=1: IndexedDB の保存を消して 新しい世界から */
  reset: boolean;
  /** 時間切れで 手を引くしるし（立ったら 世界を変えない） */
  signal?: { aborted: boolean };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** meta が今の形（版・シード）か。版が新しすぎるものは使わない */
export function validMeta(m: unknown, seed: number): m is StoredMeta {
  return isObj(m) && m.v === SAVE_VERSION && m.seed === seed;
}

/** 古い localStorage の保存（blocks に 島との差分）を 検査して世界に当てる。使えなければ null */
export function applyLegacySave(world: SaveWorld, store: KeyValueStore, seed: number): { meta: StoredMeta; changed: Set<number> } | null {
  let raw: string | null;
  try {
    raw = store.getItem(saveKey(seed));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!isObj(data) || data.version !== 1 || data.seed !== seed || data.gen !== SAVE_GEN) return null;
    const { x: sx, y: sy, z: sz } = saveDims(world);
    const dim = data.size;
    if (!Array.isArray(dim) || dim.length !== 3 || dim[0] !== sx || dim[1] !== sy || dim[2] !== sz) return null;
    const blocks = data.blocks;
    if (!Array.isArray(blocks) || blocks.length % 2 !== 0) return null;
    const total = sx * sy * sz;
    for (let k = 0; k < blocks.length; k += 2) {
      const i = blocks[k];
      const v = blocks[k + 1];
      if (!Number.isInteger(i) || i < 0 || i >= total) return null;
      if (!Number.isInteger(v) || v < 0 || v >= BLOCK_TYPES.length) return null;
    }
    const changed = new Set<number>();
    for (let k = 0; k < blocks.length; k += 2) {
      const i = blocks[k] as number;
      world.setBlock(i % sx, Math.floor(i / (sx * sz)), Math.floor(i / sx) % sz, blockIdFromIndex(blocks[k + 1] as number) as BlockId);
      changed.add(i);
    }
    const meta: StoredMeta = { ...data, v: SAVE_VERSION };
    delete meta.version;
    delete meta.size;
    delete meta.blocks;
    return { meta, changed };
  } catch {
    return null;
  }
}

/** pagehide の保険を読む（自分のセーブのものだけ）。使えなければ null */
function readPending(store: KeyValueStore, saveId: string, seed: number): { cells: number[]; meta: StoredMeta } | null {
  try {
    const raw = store.getItem(PENDING_KEY);
    if (raw === null) return null;
    const p = JSON.parse(raw) as { saveId?: unknown; cells?: unknown; meta?: unknown };
    if (!isObj(p) || p.saveId !== saveId || !Array.isArray(p.cells) || p.cells.length % 4 !== 0 || !validMeta(p.meta, seed)) return null;
    return { cells: p.cells as number[], meta: p.meta };
  } catch {
    return null;
  }
}

/**
 * 起動のとき、レンダラーを作る前に呼ぶ。保存した列を世界に入れ（ない列は 生成のまま）、
 * 保険（pending）があれば当て、IndexedDB に何もなければ 古い localStorage の保存を 1 回だけ移す。
 * 戻り値の meta は SaveManager.load() が 持ち物などに戻すのに使う。
 */
export async function restoreStoredWorld(o: RestoreOptions): Promise<RestoredSave> {
  const { world, db, store, seed, saveId } = o;
  if (!db || !store) return NO_SAVE;
  try {
    if (o.reset) {
      await db.clear(saveId);
      store.removeItem(PENDING_KEY);
      store.setItem(migratedKey(saveId), '1'); // 古い保存を 読みなおさない（リセットのあと 島がまた古い作品に戻らないように）
      return NO_SAVE;
    }
    const all = await db.readAll(saveId);
    if (o.signal?.aborted) return NO_SAVE;
    let meta: StoredMeta | null = null;
    let columns = 0;
    let corrupt = 0;
    const m = all.meta as { v?: unknown; seed?: unknown } | null;
    // 新しい版・ほかのシードの meta は さわらない（古いビルドで 新しい保存を こわさない）
    if (isObj(m) && ((typeof m.v === 'number' && m.v > SAVE_VERSION) || (m.v === SAVE_VERSION && m.seed !== seed))) {
      return { ...NO_SAVE, readOnly: true };
    }
    if (validMeta(all.meta, seed)) meta = all.meta;
    // meta がこわれていても 列は 読む（meta は 初期値から作りなおす）
    if (meta !== null || all.chunks.length > 0) {
      const nSections = Math.ceil(world.size.y / 16);
      let newer = false;
      const results = await Promise.all(
        all.chunks.map(async (rec) => {
          try {
            return await unpackColumn(rec, nSections);
          } catch (e) {
            if (e instanceof NewerFormatError) newer = true;
            return rec;
          }
        }),
      );
      if (o.signal?.aborted) return NO_SAVE;
      if (newer) return { ...NO_SAVE, readOnly: true };
      const bad: { cx: number; cz: number }[] = [];
      for (const r of results) {
        if ('sections' in r) {
          world.loadColumn(r);
          columns++;
        } else {
          corrupt++;
          if (Number.isInteger(r.cx) && Number.isInteger(r.cz)) bad.push({ cx: r.cx, cz: r.cz });
        }
      }
      world.resetSaveTracking(); // 読んだだけ。生成に戻した列は 生成した形で 次の保存で 上書きする
      world.requeueSaveDirty(bad);
    }
    let fromPending = false;
    const pending = readPending(store, saveId, seed);
    if (pending) {
      const c = pending.cells;
      for (let k = 0; k < c.length; k += 4) {
        const b = c[k + 3];
        if (Number.isInteger(c[k]) && Number.isInteger(c[k + 1]) && Number.isInteger(c[k + 2]) && Number.isInteger(b) && b >= 0 && b < BLOCK_TYPES.length) {
          world.setBlock(c[k], c[k + 1], c[k + 2], blockIdFromIndex(b) as BlockId);
        }
      }
      meta = pending.meta;
      fromPending = true;
    }
    let legacy: RestoredSave['legacy'] = null;
    if (meta === null && columns === 0 && all.meta === null && store.getItem(migratedKey(saveId)) === null) {
      const old = applyLegacySave(world, store, seed);
      if (old) {
        meta = old.meta;
        legacy = { changed: old.changed };
      }
    }
    return { meta, legacy, fromPending, columns, corrupt };
  } catch {
    return NO_SAVE; // 読めなかった: 新しい世界で始める（こわれた保存は次の保存で上書き）
  }
}
