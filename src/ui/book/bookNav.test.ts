import { describe, expect, it } from 'vitest';

/**
 * BOOK-1 AC4: 画面なしの データと 行き来の計算（`src/ui/book/bookNav.ts`）。
 * 決めた名前（開発は これで作る）:
 *   SPREAD_SIZE = 12                                  1 見開きの 項目の リンク数（6 × 2 ページ）
 *   buildBook(chapters, items) → { chapters: { id, label, itemIds }[], itemIds: string[] }
 *       chapters は { id, label, icon }、items は { id, chapter, ... } のならび。項目は ならびの じゅんで 章に 入る
 *   listSpreads(itemIds) → string[][]                 章の一覧を 12 こずつの 見開きに 分ける（0 こなら []）
 *   neighbors(itemIds, id) → { prev: string | null, next: string | null }   ◀ ▶ の となり（はしは null。ぐるっと しない）
 */
const nav = (await import('./bookNav')) as any;

const chapters = [
  { id: 'a', label: 'エー', icon: 'a' },
  { id: 'fight', label: 'たたかう', icon: 'f' },
];
const mk = (chapter: string, n: number, from = 1) => Array.from({ length: n }, (_, k) => ({ id: `${chapter}-${from + k}`, chapter, title: 't', caption: 'c', art: 'x' }));

describe('BOOK-1 データと 行き来の計算（AC4）', () => {
  it('SPREAD_SIZE は 12', () => {
    expect(nav.SPREAD_SIZE).toBe(12);
  });
  it('項目を 1 つ足すと、ほかを変えずに その章の 一覧に 1 こ ふえ、◀▶ の となりが つながる', () => {
    const items = [...mk('a', 3), ...mk('fight', 4)];
    const before = nav.buildBook(chapters, items);
    const extra = { id: 'fight-new', chapter: 'fight', title: 't', caption: 'c', art: 'x' };
    const withNew = [...items.slice(0, 5), extra, ...items.slice(5)]; // fight の まん中に 足す
    const after = nav.buildBook(chapters, withNew);
    const f0 = before.chapters.find((c: any) => c.id === 'fight').itemIds;
    const f1 = after.chapters.find((c: any) => c.id === 'fight').itemIds;
    expect(f1.length).toBe(f0.length + 1);
    expect(f1).toEqual(['fight-1', 'fight-2', 'fight-new', 'fight-3', 'fight-4']);
    expect(after.chapters.find((c: any) => c.id === 'a').itemIds).toEqual(before.chapters.find((c: any) => c.id === 'a').itemIds);
    expect(after.itemIds.length).toBe(before.itemIds.length + 1);
    expect(nav.neighbors(f1, 'fight-2')).toEqual({ prev: 'fight-1', next: 'fight-new' });
    expect(nav.neighbors(f1, 'fight-new')).toEqual({ prev: 'fight-2', next: 'fight-3' });
  });
  it('はしの となりは null（ぐるっと しない）', () => {
    const ids = ['x1', 'x2', 'x3'];
    expect(nav.neighbors(ids, 'x1')).toEqual({ prev: null, next: 'x2' });
    expect(nav.neighbors(ids, 'x3')).toEqual({ prev: 'x2', next: null });
  });
  it('13 こに すると 一覧が 2 見開き（12 こ ＋ 1 こ）。12 こまでは 1 見開き', () => {
    const ids12 = mk('fight', 12).map((i) => i.id);
    expect(nav.listSpreads(ids12).map((s: string[]) => s.length)).toEqual([12]);
    const ids13 = mk('fight', 13).map((i) => i.id);
    const sp = nav.listSpreads(ids13);
    expect(sp.map((s: string[]) => s.length)).toEqual([12, 1]);
    expect(sp.flat()).toEqual(ids13);
  });
  it('たたかう 10 こ ＋ 3 こ（パリィ・3 段攻撃・チャージ）で 13 こ → 2 見開き', () => {
    const items = [...mk('fight', 10), ...['fight-parry', 'fight-combo', 'fight-charge'].map((id) => ({ id, chapter: 'fight', title: 't', caption: 'c', art: 'x' }))];
    const book = nav.buildBook(chapters, items);
    const ids = book.chapters.find((c: any) => c.id === 'fight').itemIds;
    expect(ids.length).toBe(13);
    expect(nav.listSpreads(ids).map((s: string[]) => s.length)).toEqual([12, 1]);
  });
});
