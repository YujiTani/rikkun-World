import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '../../content/items/registry';
import { rarityIndex } from '../../drops/rarityTable';
import { BookModel } from './bookModel';
import { buildBook } from './bookNav';
import { ZUKAN_SHADOW_INDEX, ZUKAN_SPREAD, filterZukan, normalizeKana, zukanEntries, zukanPages } from './zukanData';

/** ZUKAN-1: 本の アイテム ずかん（データと 流れ。画面なし） */
const book = buildBook([{ id: 'a', label: 'エー', icon: 'a' }], [{ id: 'a1', chapter: 'a' }]);

function make() {
  const m = new BookModel(book, { reduced: () => true });
  const settle = () => {
    let n = 0;
    while (m.anim !== 'none' && n++ < 2000) m.tick();
  };
  m.openFromButton();
  settle();
  return { m, settle };
}

describe('ずかんの データ', () => {
  const all = zukanEntries();

  it('登録表の 全アイテムが 1 回ずつ のる', () => {
    const ids = all.map((e) => e.id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(ITEM_DEFS).sort());
  });

  it('影は レア度 7 以上の 物だけ', () => {
    for (const e of all) expect(e.shadow, e.id).toBe(rarityIndex(e.rarity) >= ZUKAN_SHADOW_INDEX);
    expect(all.some((e) => e.shadow)).toBe(true);
  });

  it('さがす: ひらがな・カタカナ・空白・漢字の よみ どれでも 見つかる', () => {
    expect(normalizeKana('カタナ')).toBe('かたな');
    const katana = all.find((e) => e.key === 'かたな')!;
    expect(filterZukan(all, 'かたな', null)).toContain(katana.id);
    expect(filterZukan(all, 'カタナ', null)).toContain(katana.id);
    // 漢字の 名前は よみで 見つかる（ルビ記法の よみ）
    const kanji = all.find((e) => e.name.includes('｜'))!;
    expect(filterZukan(all, kanji.key.slice(0, 2), null)).toContain(kanji.id);
    expect(filterZukan(all, 'ぜったい ない なまえ', null)).toEqual([]);
  });

  it('組で しぼる・字が 空なら ぜんぶ', () => {
    expect(filterZukan(all, '', null)).toHaveLength(all.length);
    const w = filterZukan(all, '', 'weapon');
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((id) => all.find((e) => e.id === id)!.group === 'weapon')).toBe(true);
  });
});

describe('ずかんの 流れ', () => {
  it('もくじ → ずかん → アイテム → もどる → もどる で もくじ', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    expect(m.view).toBe('zukan');
    expect(m.links()).toEqual(m.zukanIds().slice(0, ZUKAN_SPREAD));
    const id = m.links()[0];
    m.openZukanItem(id);
    settle();
    expect(m.view).toBe('zukanItem');
    expect(m.item).toBe(id);
    m.back();
    settle();
    expect(m.view).toBe('zukan');
    m.escape();
    settle();
    expect(m.view).toBe('toc');
  });

  it('さがすと 1 見開き目に もどり、▶ で となりの 見開き・アイテムの ◀▶ は しぼった 中で', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    const total = zukanPages(m.zukanIds().length);
    expect(total).toBeGreaterThan(1);
    m.step(1);
    settle();
    expect(m.zukanPage).toBe(2);
    m.setZukanFilter('かたな', null);
    expect(m.zukanPage).toBe(1);
    const ids = m.zukanIds();
    expect(ids.length).toBeGreaterThan(1);
    m.openZukanItem(ids[0]);
    settle();
    m.step(1);
    settle();
    expect(m.item).toBe(ids[1]);
    m.step(-1);
    settle();
    m.step(-1);
    settle();
    expect(m.item).toBe(ids[0]);
    expect(m.bumps).toBe(1);
  });

  it('ずかんを ひらきなおすと さがす 字は 空', () => {
    const { m, settle } = make();
    m.openZukan();
    settle();
    m.setZukanFilter('かたな', 'weapon');
    m.toToc();
    settle();
    m.openZukan();
    settle();
    expect(m.zukanQuery).toBe('');
    expect(m.zukanGroup).toBeNull();
  });

  it('jump: zukan・zukan:<id>', () => {
    const { m } = make();
    const id = zukanEntries()[40].id;
    m.jump(`zukan:${id}`);
    expect(m.view).toBe('zukanItem');
    expect(m.zukanPage).toBe(Math.floor(40 / ZUKAN_SPREAD) + 1);
    m.jump('zukan');
    expect(m.view).toBe('zukan');
  });
});
