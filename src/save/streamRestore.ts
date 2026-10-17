import type { BlockId, ChunkColumn } from '../contracts';
import { blockIndexOf } from '../world/blocks/blockTypes';
import { colKey } from '../world/stream/ring';
import { SAVE_VERSION } from './SaveManager';
import { NO_SAVE, readPending, removePendingOf, validMeta, type RestoreOptions, type RestoredSave } from './restore';

/**
 * 起動の読みこみ（VOX-D D1）。IndexedDB から読むのは meta と「ある列のキーの一覧」だけ。列の中身は、その列がいるときに 1 列ずつ読む（columnIO）。
 * pagehide の保険（PENDING_KEY）のマスは、列ごとに分けて持っておき、その列を読みこんだときに当てる（K6）。
 */

/** 保険の 1 列ぶん */
export interface PendingColumn {
  cx: number;
  cz: number;
  /** [x, y, z, ブロック] */
  cells: Array<[number, number, number, BlockId]>;
}

export interface StreamRestore extends RestoredSave {
  /** 保存にある列（colKey） */
  keys: Set<number>;
  /** 保険にあるマスを持つ列（colKey → 中身） */
  pending: Map<number, PendingColumn>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const emptyStreamRestore = (base: RestoredSave = NO_SAVE): StreamRestore => ({ ...base, keys: new Set(), pending: new Map() });

export async function openStoredKeys(o: Pick<RestoreOptions, 'db' | 'store' | 'seed' | 'saveId' | 'reset' | 'signal'>): Promise<StreamRestore> {
  const { db, store, seed, saveId } = o;
  if (!db || !store) return emptyStreamRestore();
  try {
    if (o.reset) {
      await db.clear(saveId);
      removePendingOf(store, saveId);
      return emptyStreamRestore();
    }
    const all = await db.readKeys(saveId);
    if (o.signal?.aborted) return emptyStreamRestore();
    const m = all.meta as { v?: unknown; seed?: unknown } | null;
    // 新しい版・ほかのシードの meta は さわらない（古いビルドで 新しい保存を こわさない）
    if (isObj(m) && ((typeof m.v === 'number' && m.v > SAVE_VERSION) || (m.v === SAVE_VERSION && m.seed !== seed))) {
      return emptyStreamRestore({ ...NO_SAVE, readOnly: true });
    }
    const out = emptyStreamRestore();
    if (validMeta(all.meta, seed)) out.meta = all.meta;
    // meta がこわれていても 列は 読める（meta は 初期値から作りなおす）
    for (const k of all.keys) out.keys.add(colKey(k.cx, k.cz));
    out.columns = out.keys.size;
    const pending = readPending(store, saveId, seed);
    if (pending) {
      const c = pending.cells;
      const ids = pending.ids;
      for (let k = 0; k < c.length; k += 4) {
        const b = c[k + 3];
        if (Number.isInteger(c[k]) && Number.isInteger(c[k + 1]) && Number.isInteger(c[k + 2]) && Number.isInteger(b) && b >= 0 && b < ids.length && blockIndexOf(ids[b]) >= 0) {
          const cx = c[k] >> 4;
          const cz = c[k + 2] >> 4;
          const key = colKey(cx, cz);
          let col = out.pending.get(key);
          if (col === undefined) out.pending.set(key, (col = { cx, cz, cells: [] }));
          col.cells.push([c[k], c[k + 1], c[k + 2], ids[b] as BlockId]);
        }
      }
      out.meta = pending.meta;
      out.fromPending = true;
    }
    return out;
  } catch {
    return emptyStreamRestore(); // 読めなかった: 新しい世界で始める（こわれた保存は次の保存で上書き）
  }
}

/** 保険のマスを 世界に当てる（その列を読みこんだ直後）。当てた列は「さわった」になる */
export function applyPendingColumn(world: { setBlock(x: number, y: number, z: number, id: BlockId): boolean }, p: PendingColumn): void {
  for (const [x, y, z, id] of p.cells) world.setBlock(x, y, z, id);
}

export type { ChunkColumn };
