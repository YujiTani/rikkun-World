import { BOKEN_GEN, HEYA_GEN, KODO_GEN } from './gens';

/** 古い 列の 一覧の 持ち方（MINE-1C §4.8・1E §4.13）。SaveManager と 起動の 読みこみ〔streamRestore〕が 同じ 物を 使う ため 葉に した（保存 ← 保存の 輪を つくらない） */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 古い 列の 一覧 3 つ */
export interface OldColSets {
  kodo: Set<number>;
  heya: Set<number>;
  boken: Set<number>;
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

/** meta の 一覧の 書き方（1E〜）: 列 1 つを 数 1 つで 書く〔colKey × 8 ＋ 印〕。kodo ⊆ heya ⊆ boken なので 一覧が 3 つ あっても 列 1 つ 12 バイト いか */
const BIT_KODO = 1;
const BIT_HEYA = 2;
const BIT_BOKEN = 4;

/** 一覧 3 つを meta の 数の 並びに する（ない ときは 空） */
export function packOldCols(o: { kodo: ReadonlySet<number>; heya: ReadonlySet<number>; boken: ReadonlySet<number> }): number[] {
  const bits = new Map<number, number>();
  const add = (set: ReadonlySet<number>, bit: number): void => {
    for (const k of set) bits.set(k, (bits.get(k) ?? 0) | bit);
  };
  add(o.kodo, BIT_KODO);
  add(o.heya, BIT_HEYA);
  add(o.boken, BIT_BOKEN);
  return [...bits].map(([k, b]) => k * 8 + b);
}

/**
 * 古い 列の 一覧を 決める〔kodo は KODO_GEN・heya は HEYA_GEN・boken は BOKEN_GEN を 基準に〕。
 * 新しい 書き方 `oldCols.cols` が あれば それ。版 5・6 の 書き方 `{ kodo, heya? }` は 配列を そのまま 読み、1E の 一覧は 版が 7 より 前なら 保存の 列 ぜんぶ。
 */
export function oldColsOf(meta: Record<string, unknown> | null, keys: ReadonlySet<number>): OldColSets {
  const list = meta?.oldCols;
  const gen = meta?.gen;
  const g = typeof gen === 'number' && Number.isInteger(gen) ? gen : -1;
  if (isObj(list) && Array.isArray(list.cols)) {
    const out: OldColSets = { kodo: new Set(), heya: new Set(), boken: new Set() };
    for (const v of ints(list.cols)) {
      const k = Math.floor(v / 8);
      const b = v - k * 8;
      if (b & BIT_KODO) out.kodo.add(k);
      if (b & BIT_HEYA) out.heya.add(k);
      if (b & BIT_BOKEN) out.boken.add(k);
    }
    return out;
  }
  // 坑道（kodo）・部屋（heya）・1E（boken）は べつべつ: 一覧が あれば それ。なければ 版が その 版 以上なら 空〔新しい 世界〕・古い・meta が ない ときは 保存の 列 ぜんぶ
  const pick = (v: unknown, from: number): Set<number> => (Array.isArray(v) ? new Set(ints(v)) : g >= from ? new Set() : new Set(keys));
  return { kodo: pick(isObj(list) ? list.kodo : undefined, KODO_GEN), heya: pick(isObj(list) ? list.heya : undefined, HEYA_GEN), boken: pick(undefined, BOKEN_GEN) };
}

