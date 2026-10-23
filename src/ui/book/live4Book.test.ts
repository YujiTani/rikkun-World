import { describe, expect, it } from 'vitest';
import { findUnrubiedKanji } from '../text';

const { BOOK_ITEMS } = (await import('./bookData')) as any;
const plain = (html: string) => html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');

/**
 * LIVE-4 AC18（docs/design/LIVE-4.md 版 2 §3.1）: 案内画面（本）「そだてる」タブ の 1 行。
 * 注意: 文 が 長い（約 60 字）ので、今 の bookData.test.ts の「説明 は 50 字 以下」と ぶつかる。デザイン に 差し戻し（docs/test-reports/LIVE-4.md の 矛盾 C1）。
 */
describe('LIVE-4 AC18 案内画面「そだてる」の 1 行', () => {
  const LINE = 'マッチョ にわとり に むし を あげて つれて いくと、きみ が たたいた ようかい や きみ を たたいた ようかい を いっしょ に たたいて くれる';
  it('そだてる 章 に §3.1 の 文 の 項目 が 1 こ あり、漢字 は ruby の 中', () => {
    const grow = (BOOK_ITEMS as any[]).filter((i) => i.chapter === 'grow');
    const it = grow.find((i) => plain(i.caption) === LINE.replace(/\s+/g, ''));
    expect(it, '§3.1 の 文').toBeTruthy();
    expect(findUnrubiedKanji(it.caption)).toEqual([]);
  });
});
