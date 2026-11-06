import type { BlockId, ChunkColumn } from '../contracts';
import { blockIndexOf } from '../world/blocks/blockTypes';
import { colKey } from '../world/stream/ring';
import { shaftWorldFor } from '../world/gen/mineShafts';
import { KODO_GEN } from './gens';
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
  /** 古い 列の 一覧（colKey。MINE-1C §4.8）: 坑道（kodo）を かかない 列。開いた とき 決まり、増やさず 減らさない。部屋（heya）は 1D */
  oldCols: { kodo: Set<number>; heya: Set<number> };
  /** はじまりの 坑道の 入口 (x, z)（MINE-1C §4.8）。null ＝ さがしたが 置ける 所が なかった〔meta に 書いて 次から さがさない〕。キーが ない ＝ まだ さがして いない */
  shaftStart?: { x: number; z: number } | null;
  /** 保険にあるマスを持つ列（colKey → 中身） */
  pending: Map<number, PendingColumn>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const emptyStreamRestore = (base: RestoredSave = NO_SAVE): StreamRestore => ({ ...base, keys: new Set(), pending: new Map(), oldCols: { kodo: new Set(), heya: new Set() } });

/** はじまりの 坑道を 計画して 入口を 返す（置けなければ なし）。世界は 一覧ごとに 1 つ 作って、あとで ゲームが 同じ ものを 使う */
function startOf(seed: number, oldCols: { kodo: Set<number>; heya: Set<number> }, hint?: { x: number; z: number } | null): { x: number; z: number } | null {
  return shaftWorldFor(seed, oldCols, hint).startEntrance();
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

/**
 * 古い 列の 一覧を 決める。meta に 一覧が あれば それ。なくて meta の 版が KODO_GEN 以上なら 空〔新しい 世界〕。
 * 版が それより 古い・meta が ない・こわれて いる ときは 保存の 列 ぜんぶ。
 */
function oldColsOf(meta: Record<string, unknown> | null, keys: ReadonlySet<number>): { kodo: Set<number>; heya: Set<number> } {
  const list = meta?.oldCols;
  if (isObj(list) && Array.isArray(list.kodo)) return { kodo: new Set(ints(list.kodo)), heya: new Set(ints(list.heya)) };
  const gen = meta?.gen;
  if (typeof gen === 'number' && Number.isInteger(gen) && gen >= KODO_GEN) return { kodo: new Set(), heya: new Set() };
  return { kodo: new Set(keys), heya: new Set() };
}

/** meta に 書いて あった はじまりの 坑道の 入口（形が おかしければ なし） */
function shaftStartOf(meta: Record<string, unknown> | null): { x: number; z: number } | null | undefined {
  const s = meta?.shaftStart;
  if (s === null) return null;
  return isObj(s) && Number.isInteger(s.x) && Number.isInteger(s.z) ? { x: s.x as number, z: s.z as number } : undefined;
}

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
    out.oldCols = oldColsOf(out.meta, out.keys);
    // はじまりの 坑道は じゅんびちゅうの この 間に 作る〔最初の 列の 生成に のせない〕。えらんだ 場所は meta に 書いて 次から 同じ
    // 計画が 投げても 保存の 読みこみは そのまま〔世界が 消えない ように、別の try〕
    try {
      out.shaftStart = startOf(seed, out.oldCols, shaftStartOf(out.meta));
    } catch {
      out.shaftStart = undefined;
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
