/**
 * BOOK-1: 本の データと 行き来の計算（画面なし。DOM も 3D も 使わない）。
 * 項目を ならびに 1 つ 足すだけで、一覧・◀▶ の となり・点の数が ならびから 決まる（仕様 §2.6）。
 */

/** 1 見開きの 項目の リンク数（6 こ × 2 ページ） */
export const SPREAD_SIZE = 12;

export interface ChapterDef {
  id: string;
  label: string;
  icon: string;
}

export interface ItemDef {
  id: string;
  chapter: string;
}

export interface BuiltChapter {
  id: string;
  label: string;
  itemIds: string[];
}

export interface BuiltBook {
  chapters: BuiltChapter[];
  /** 全項目の id（章の じゅん → 章の中の じゅん） */
  itemIds: string[];
}

/** 項目は ならびの じゅんで 章に 入る */
export function buildBook(chapters: readonly ChapterDef[], items: readonly ItemDef[]): BuiltBook {
  const built = chapters.map((c) => ({ id: c.id, label: c.label, itemIds: items.filter((i) => i.chapter === c.id).map((i) => i.id) }));
  return { chapters: built, itemIds: built.flatMap((c) => c.itemIds) };
}

/** 章の 一覧を SPREAD_SIZE ずつの 見開きに 分ける（0 こなら []） */
export function listSpreads(itemIds: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < itemIds.length; i += SPREAD_SIZE) out.push(itemIds.slice(i, i + SPREAD_SIZE));
  return out;
}

/** ◀ ▶ の となり（はしは null。ぐるっと しない） */
export function neighbors(itemIds: readonly string[], id: string): { prev: string | null; next: string | null } {
  const k = itemIds.indexOf(id);
  if (k < 0) return { prev: null, next: null };
  return { prev: k > 0 ? itemIds[k - 1] : null, next: k < itemIds.length - 1 ? itemIds[k + 1] : null };
}

/** 項目が 何見開き目の 一覧に あるか（1 から。ないとき 1） */
export function spreadOf(itemIds: readonly string[], id: string): number {
  const k = itemIds.indexOf(id);
  return k < 0 ? 1 : Math.floor(k / SPREAD_SIZE) + 1;
}
