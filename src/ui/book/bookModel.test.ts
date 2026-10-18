import { describe, expect, it } from 'vitest';
import { BookModel, type BookSound } from './bookModel';
import { buildBook } from './bookNav';

/** BOOK-1: 本の 流れの 状態（画面なし）。コマ送りで 動きの 途中を 作れる */
const chapters = [
  { id: 'a', label: 'エー', icon: 'a' },
  { id: 'b', label: 'ビー', icon: 'b' },
];
const mk = (c: string, n: number) => Array.from({ length: n }, (_, k) => ({ id: `${c}${k + 1}`, chapter: c }));
const book = buildBook(chapters, [...mk('a', 3), ...mk('b', 13)]);

function make(reduced = false) {
  const sounds: BookSound[] = [];
  const m = new BookModel(book, { reduced: () => reduced, onSound: (s) => sounds.push(s) });
  const settle = () => {
    let n = 0;
    while (m.anim !== 'none' && n++ < 2000) m.tick();
    return n;
  };
  return { m, sounds, settle };
}

describe('BookModel 流れ', () => {
  it('ひらく: appear → open → none、もくじ、リンク ＝ 章。音 open が 1 つ', () => {
    const { m, sounds } = make();
    m.openFromButton();
    const trail: string[] = [m.anim];
    for (let i = 0; i < 500 && m.anim !== 'none'; i++) {
      m.tick();
      if (trail[trail.length - 1] !== m.anim) trail.push(m.anim);
    }
    expect(trail).toEqual(['appear', 'open', 'none']);
    expect([m.isOpen, m.view]).toEqual([true, 'toc']);
    expect(m.links()).toEqual(['a', 'b']);
    expect(sounds).toEqual(['open']);
  });
  it('章 → 項目 → ▶ ◀ → もどる → もくじ。動きの間は リンクが 空', () => {
    const { m, settle } = make();
    m.jump('toc');
    m.openChapter('b');
    expect(m.anim).toBe('turn');
    expect(m.links()).toEqual([]);
    settle();
    expect([m.view, m.chapter]).toEqual(['chapter', 'b']);
    expect(m.links()).toEqual(book.chapters[1].itemIds.slice(0, 12));
    m.openItem('b2');
    settle();
    expect([m.view, m.item]).toEqual(['item', 'b2']);
    m.step(1);
    settle();
    expect(m.item).toBe('b3');
    m.step(-1);
    m.step(-1); // 動きの途中は うけつけない
    settle();
    expect(m.item).toBe('b2');
    m.back();
    settle();
    expect([m.view, m.chapter, m.listPage]).toEqual(['chapter', 'b', 1]);
    m.openItem('b13');
    settle();
    m.back();
    settle();
    expect(m.listPage).toBe(2);
    m.toToc();
    settle();
    expect(m.view).toBe('toc');
  });
  it('はし: bump ＋ bumps ふえる。項目は そのまま。ぐるっと しない', () => {
    const { m, sounds, settle } = make();
    m.jump('a1');
    m.step(-1);
    expect(m.anim).toBe('bump');
    settle();
    expect([m.item, m.bumps]).toEqual(['a1', 1]);
    m.jump('a3');
    m.step(1);
    settle();
    expect([m.item, m.bumps]).toEqual(['a3', 2]);
    expect(sounds.filter((s) => s === 'bump').length).toBe(1 + 1);
    expect(sounds).not.toContain('turn');
  });
  it('② 一覧が 2 見開き: ▶ で つづき、はしで bump。1 見開きの章は ◀ ▶ なし（ゆれない）', () => {
    const { m, settle } = make();
    m.jump('b');
    expect(m.arrows()).toEqual({ show: true, prevEdge: true, nextEdge: false });
    expect(m.links().length).toBe(12);
    m.step(1);
    settle();
    expect([m.listPage, m.links()]).toEqual([2, ['b13']]);
    expect(m.arrows()).toEqual({ show: true, prevEdge: false, nextEdge: true });
    m.step(1);
    settle();
    expect([m.listPage, m.bumps]).toEqual([2, 1]);
    m.jump('a');
    expect(m.arrows().show).toBe(false);
    m.step(1);
    expect([m.anim, m.bumps]).toEqual(['none', 1]);
    m.jump('toc');
    m.step(1);
    expect(m.anim).toBe('none');
  });
  it('とじる: 途中でも 効く。終わると closed。しおりひもは 章を ひらいたあと', () => {
    const { m, sounds, settle } = make();
    expect(m.lastChapter).toBeNull();
    m.openFromButton();
    settle();
    m.openChapter('a');
    settle();
    m.step(1); // 章の 一覧では 1 見開き → なにも しない
    m.openItem('a1');
    m.tick();
    m.close();
    expect(m.anim).toBe('close');
    expect(m.isOpen).toBe(true);
    settle();
    expect([m.isOpen, m.view]).toEqual([false, 'closed']);
    expect(m.lastChapter).toBe('a');
    expect(sounds.filter((s) => s === 'close').length).toBe(1);
    m.openFromButton();
    expect(m.view).toBe('toc');
  });
  it('動きを へらす: 動きの のこりは 0 から。次の 1 コマで 次の ページ。音は 同じ', () => {
    const { m, sounds } = make(true);
    m.openFromButton();
    expect([m.anim, m.animLeft]).toEqual(['appear', 0]);
    m.tick();
    expect([m.view, m.anim]).toEqual(['toc', 'none']);
    m.openChapter('a');
    expect(m.animLeft).toBe(0);
    m.tick();
    expect([m.view, m.chapter, m.anim]).toEqual(['chapter', 'a', 'none']);
    m.openItem('a1');
    m.tick();
    m.step(-1);
    m.tick();
    expect(m.bumps).toBe(1);
    m.close();
    m.tick();
    expect(m.isOpen).toBe(false);
    expect(sounds).toEqual(['open', 'turn', 'turn', 'bump', 'close']);
  });
  it('jump は 動きなし・音なし。しまう closeNow も 音なし', () => {
    const { m, sounds } = make();
    m.jump('b5');
    expect([m.isOpen, m.view, m.item, m.chapter, m.anim]).toEqual([true, 'item', 'b5', 'b', 'none']);
    m.jump('b');
    expect([m.view, m.listPage]).toEqual(['chapter', 1]);
    m.closeNow();
    expect([m.isOpen, m.view, m.anim]).toEqual([false, 'closed', 'none']);
    expect(sounds).toEqual([]);
  });
  it('ガイドの 章: 前の章を おぼえる。項目の数', () => {
    const { m } = make();
    expect([m.guideChapter, m.guideItems()]).toEqual(['a', 3]);
    m.jump('b');
    expect([m.guideChapter, m.guideItems()]).toEqual(['b', 13]);
    m.jump('toc');
    expect(m.guideChapter).toBe('b');
  });
});
