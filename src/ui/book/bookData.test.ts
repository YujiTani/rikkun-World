import { describe, expect, it } from 'vitest';
import { findUnrubiedKanji } from '../text';

// @ts-ignore 実装前は ファイルが ない（BOOK-1。bookData.ts ができたら 型も 付く）
const { BOOK_CHAPTERS, BOOK_ITEMS } = (await import('./bookData')) as any;

/** BOOK-1 §4.3 の 40 こ（章の じゅん・章の中の じゅん） */
const EXPECTED: Record<string, string[]> = {
  move: ['move-walk', 'move-jump', 'move-look', 'move-run'],
  dig: ['dig-hold', 'dig-crack', 'dig-place', 'dig-select', 'dig-bag'],
  fight: ['fight-swing', 'fight-stance', 'fight-chudan', 'fight-jodan', 'fight-gedan', 'fight-naginata', 'fight-yumi', 'fight-armor', 'fight-wear', 'fight-night'],
  craft: ['craft-open', 'craft-glow', 'craft-hammer', 'craft-furnace', 'craft-fuel', 'craft-drop', 'craft-tansu', 'craft-log', 'craft-nearby'],
  grow: ['grow-till', 'grow-sow', 'grow-wet', 'grow-harvest', 'grow-eat', 'grow-seeds', 'grow-light', 'grow-can-fill', 'grow-can-water', 'grow-sprinkler', 'grow-pet', 'grow-bucket'],
};

/** ふりがな（rt）とタグ・空白を のぞいた字 */
const plain = (html: string) => html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const KANJI = /[一-鿿]/;

describe('BOOK-1 項目のデータ（AC2）', () => {
  it('説明は 1〜2 文・50 字以下・ふりがなの ない漢字 0。見出しは 8 字以下で 漢字なし。章と 挿絵の指定がある', () => {
    const chapterIds = BOOK_CHAPTERS.map((c: any) => c.id);
    for (const i of BOOK_ITEMS as any[]) {
      const cap = plain(i.caption);
      const sentences = cap.split('。').filter((x) => x.length > 0);
      expect(sentences.length, i.id).toBeGreaterThanOrEqual(1);
      expect(sentences.length, i.id).toBeLessThanOrEqual(2);
      expect(cap.length, i.id).toBeLessThanOrEqual(50);
      expect(findUnrubiedKanji(i.caption), i.id).toEqual([]);
      const title = i.title.replace(/\s+/g, '');
      expect(title.length, i.id).toBeGreaterThan(0);
      expect(title.length, i.id).toBeLessThanOrEqual(8);
      expect(KANJI.test(title), i.id).toBe(false);
      expect(chapterIds, i.id).toContain(i.chapter);
      expect(i.art, i.id).toBeTruthy();
    }
  });
  it('id は かさならない。どの章も 1 こ以上', () => {
    const ids = (BOOK_ITEMS as any[]).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of BOOK_CHAPTERS as any[]) expect((BOOK_ITEMS as any[]).filter((i) => i.chapter === c.id).length, c.id).toBeGreaterThanOrEqual(1);
  });
});

describe('BOOK-1 全項目の じゅん（AC3）', () => {
  it('章の じゅん ＝ move・dig・fight・craft・grow。項目の id が §4.3 の 40 こと 同じ順', () => {
    expect(BOOK_CHAPTERS.map((c: any) => c.id)).toEqual(Object.keys(EXPECTED));
    expect(BOOK_CHAPTERS.map((c: any) => c.label)).toEqual(['うごく', 'ほる・おく', 'たたかう', 'つくる・やく', 'そだてる']);
    expect((BOOK_ITEMS as any[]).map((i) => i.id)).toEqual(Object.values(EXPECTED).flat());
    expect((BOOK_ITEMS as any[]).length).toBe(40);
  });
  it('章ごとの 数が §4.2 と 同じ（4・5・10・9・12）', () => {
    for (const [id, ids] of Object.entries(EXPECTED)) {
      expect((BOOK_ITEMS as any[]).filter((i) => i.chapter === id).map((i) => i.id)).toEqual(ids);
    }
  });
});
