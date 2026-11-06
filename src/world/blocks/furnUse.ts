import { furnInfo, type FurnBlockKind } from './houseBlocks';

/**
 * 家具の 右クリックの はたらき（HOUSE-1D #341。仕様 docs/design/HOUSE-1.md §2.12・AC28・AC54）。このファイルは houseBlocks.ts だけ import する 葉。
 * 右の 案内・右クリックの 実行・座る 係が ぜんぶ ここを 読む（1 か所）。
 *   sit  = すわる（いす・まるいす）／ bath = はいる（おふろ）／ read = よむ（ほんだな：ルールブックを ① もくじで ひらく）
 * たんす・かまどは 今までの 道（ひらく）なので null。テーブル・あんどん・はにわ（案 A：かざり だけ）も null。
 * 家具の しゅるいを 足すと、ここが 型で 落ちる（足し忘れ ふせぎ）。
 */
export type FurnUse = 'sit' | 'bath' | 'read';

const FURN_USE = {
  tansu: null,
  furnace: null,
  table: null,
  long_table: null,
  round_table: null,
  andon: null,
  chair: 'sit',
  stool: 'sit',
  ofuro: 'bath',
  shelf: 'read',
} as const satisfies Record<FurnBlockKind, FurnUse | null>;

const USES: ReadonlySet<string> = new Set(Object.values(FURN_USE).filter((u): u is FurnUse => u !== null));

/** 右クリックの 種類（RightClickKind）が 家具の はたらきか */
export function isFurnUse(kind: string): kind is FurnUse {
  return USES.has(kind);
}

/** ブロックの id が 右クリックで はたらく 家具なら その はたらき（どの マス・どの 向きでも 同じ）。そうでなければ null */
export function furnUseOf(id: string): FurnUse | null {
  const f = furnInfo(id);
  return f ? FURN_USE[f.kind] : null;
}
