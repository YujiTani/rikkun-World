import type { BlockId, ChunkColumn } from '../contracts';
import { blockIndexOf } from '../world/blocks/blockTypes';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { SAVE_VERSION, type KeyValueStore, type SaveWorld } from './SaveManager';
import { NewerFormatError, unpackColumn, type PersistBackend, type StoredMeta } from './backend';

/** pagehide の保険（同期で localStorage に小さく書く）。VOX-plan §7 */
export const PENDING_KEY = 'rikkun-world-pending';
/** 保険に入れるマスの数の上限。これを超えたら ふつうの保存をする */
export const PENDING_MAX_CELLS = 20000;

/** 世界のうち、読みこみに使う窓口 */
export interface RestoreWorld extends SaveWorld {
  loadColumn(column: ChunkColumn): void;
  requeueSaveDirty(cols: readonly { cx: number; cz: number }[]): void;
  resetSaveTracking(): void;
}

export interface RestoredSave {
  /** 保存の meta（なければ null = 新しい世界） */
  meta: StoredMeta | null;
  /** pagehide の保険から戻した（最初の保存で書く） */
  fromPending: boolean;
  /** 保存が今のゲームより新しい版 / 読めない: さわらず、この遊びでは 保存しない */
  readOnly?: boolean;
  /** 読みこんだ列の数 / こわれていて 生成に戻した列の数 */
  columns: number;
  corrupt: number;
}

export const NO_SAVE: RestoredSave = { meta: null, fromPending: false, columns: 0, corrupt: 0 };

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

/** 自分のセーブの保険だけ消す（ほかのセーブのものは さわらない） */
export function removePendingOf(store: KeyValueStore, saveId: string): void {
  try {
    const raw = store.getItem(PENDING_KEY);
    if (raw === null) return;
    const p = JSON.parse(raw) as { saveId?: unknown };
    if (isObj(p) && p.saveId === saveId) store.removeItem(PENDING_KEY);
  } catch {
    /* 何もしない */
  }
}

/** pagehide の保険を読む（自分のセーブのものだけ）。使えなければ null */
function readPending(store: KeyValueStore, saveId: string, seed: number): { cells: number[]; ids: readonly string[]; meta: StoredMeta } | null {
  try {
    const raw = store.getItem(PENDING_KEY);
    if (raw === null) return null;
    const p = JSON.parse(raw) as { saveId?: unknown; ids?: unknown; cells?: unknown; meta?: unknown };
    if (!isObj(p) || p.saveId !== saveId || !Array.isArray(p.cells) || p.cells.length % 4 !== 0 || !validMeta(p.meta, seed)) return null;
    // ids つき = 書いたときの id の一覧。ids なし（SAVE-30 より前のビルド）= 凍らせた BLOCK_IDS_V1
    if (p.ids !== undefined && (!Array.isArray(p.ids) || !p.ids.every((x) => typeof x === 'string'))) return null;
    return { cells: p.cells as number[], ids: (p.ids as string[] | undefined) ?? BLOCK_IDS_V1, meta: p.meta };
  } catch {
    return null;
  }
}

/**
 * 起動のとき、レンダラーを作る前に呼ぶ。保存した列を世界に入れ（ない列は 生成のまま）、
 * 保険（pending）があれば当てる。古い localStorage の保存（rikkun-world-save-v1-*）と 前の世界の IndexedDB（main）は VOX-B から読まない・消さない。
 * 戻り値の meta は SaveManager.load() が 持ち物などに戻すのに使う。
 */
export async function restoreStoredWorld(o: RestoreOptions): Promise<RestoredSave> {
  const { world, db, store, seed, saveId } = o;
  if (!db || !store) return NO_SAVE;
  try {
    if (o.reset) {
      await db.clear(saveId);
      removePendingOf(store, saveId); // 前の世界（main）の保険は 消さない
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
      const ids = pending.ids;
      for (let k = 0; k < c.length; k += 4) {
        const b = c[k + 3];
        // 番号は ids の番号。知らない id（ゲームから消えたブロック）のマスは飛ばす
        if (Number.isInteger(c[k]) && Number.isInteger(c[k + 1]) && Number.isInteger(c[k + 2]) && Number.isInteger(b) && b >= 0 && b < ids.length && blockIndexOf(ids[b]) >= 0) {
          world.setBlock(c[k], c[k + 1], c[k + 2], ids[b] as BlockId);
        }
      }
      meta = pending.meta;
      fromPending = true;
    }
    return { meta, fromPending, columns, corrupt };
  } catch {
    return NO_SAVE; // 読めなかった: 新しい世界で始める（こわれた保存は次の保存で上書き）
  }
}
