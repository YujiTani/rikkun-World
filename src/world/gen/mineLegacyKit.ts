import { colKey } from '../stream/ring';
import { spawnOf } from './terrain';

/**
 * MINE-1E の 前の 世界〔legacy〕を 作る テスト用の 道具。ゲームの 外〔テスト〕だけで 使う。`mineShaftKit.ts` の 型には 頼らない〔輪を 作らない・行数を ふやさない〕。
 * 古い 列の 一覧の 形は `mineShaftKit.ts` の `OldCols` と 同じ〔`kodo`・`heya`・`boken`。colKey の 集まり〕。
 */
interface LegacyCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
  boken: ReadonlySet<number>;
}

/**
 * 1E の 前〔1D までの 作り方〕の 世界: スタートの まわり half マスの 列を ぜんぶ 1E の 古い 列に した 一覧。
 * 1E の 一覧の 列に かかる 区画は 1C・1D の 坑道を そのまま 作る〔MINE-1E §4.13〕ので、1C・1D の 受け入れ基準〔C3・C6・C7 ほか〕は
 * この 世界の「ほかの 坑道」で 見る〔新しい 世界の ほかの 坑道は 1E の 坑道 `gen: 'e'` で E2〜E4 が 見る〕。
 * 1E の 実装の 前は `boken` を 読まない ので、いつもの 世界と 同じ〔緑のまま〕。
 */
const legacyMemo = new Map<string, LegacyCols>();
export function legacyOld(seed: number, half = 2304): LegacyCols {
  const memo = legacyMemo.get(`${seed}:${half}`);
  if (memo) return memo;
  const sp = spawnOf(seed);
  const boken = new Set<number>();
  const cx0 = (sp.x - half) >> 4;
  const cx1 = (sp.x + half) >> 4;
  const cz0 = (sp.z - half) >> 4;
  const cz1 = (sp.z + half) >> 4;
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) boken.add(colKey(cx, cz));
  const out: LegacyCols = { kodo: new Set<number>(), heya: new Set<number>(), boken };
  legacyMemo.set(`${seed}:${half}`, out);
  return out;
}

/** 古い 保存から 開いた 一覧に「1E の 前の 世界」の 1E の 一覧〔スタートの まわり ぜんぶ〕を 足す。坑道・部屋の 一覧は 保存の とおり */
export function legacyWith(seed: number, old?: { kodo?: ReadonlySet<number>; heya?: ReadonlySet<number> }): LegacyCols {
  return { kodo: old?.kodo ?? new Set<number>(), heya: old?.heya ?? new Set<number>(), boken: legacyOld(seed).boken };
}

