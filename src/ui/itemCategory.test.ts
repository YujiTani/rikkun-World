import { describe, expect, it } from 'vitest';
import { RARITY_TIERS, itemRarity, rarityIndex } from '../drops/rarity';
import { ITEM_TYPES } from '../inventory/items';
import { contrastRatio, parseCssColor } from './theme/colorMath';
import { PALETTE_HEX } from './theme/palette';
import { CATEGORY_ITEMS, ITEM_CATEGORIES, categoryVar, itemCategory } from './itemCategory';

const rgb = (h: string) => parseCssColor(`rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`)!;

describe('マスの カテゴリー（§3.5 (7)）', () => {
  it('13 カテゴリー。同じ id が 2 つの カテゴリーに無い（アイテムの 数は 決め打ちしない。#311）', () => {
    expect(ITEM_CATEGORIES.length).toBe(13);
    const all = ITEM_CATEGORIES.flatMap((c) => CATEGORY_ITEMS[c]);
    expect(new Set(all).size).toBe(all.length);
  });
  it('今ある全アイテムが 表にある（たんす は D が足す）。表に無いものは そざい', () => {
    for (const t of ITEM_TYPES) expect(CATEGORY_ITEMS[itemCategory(t.id)], t.id).toContain(t.id);
    expect(itemCategory('zzz')).toBe('material');
    expect(itemCategory('katana')).toBe('weapon');
    expect(itemCategory('tansu')).toBe('home');
  });
  it('色は 変数 --rk-cat-* にあり、白との明るさの比が 4.5 以上', () => {
    const white = rgb('#ffffff');
    for (const c of ITEM_CATEGORIES) {
      const hex = PALETTE_HEX[categoryVar(c)];
      expect(hex, c).toBeTruthy();
      expect(contrastRatio(white, rgb(hex)), c).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('M7: たね 4 は しょくぶつ・くわ は どうぐ・やさい 4 は たべもの（うめ色）', () => {
    for (const k of ['onion', 'tomato', 'pumpkin', 'eggplant']) {
      expect(itemCategory(`seed_${k}`)).toBe('plant');
      expect(itemCategory(k)).toBe('food');
    }
    expect(itemCategory('kuwa')).toBe('tool');
    expect(PALETTE_HEX['--rk-cat-food']).toBe('#8e3d73');
  });
  it('めずらしさ → 0〜6（7 つの id ぜんぶ）', () => {
    expect(rarityIndex(itemRarity('dirt'))).toBe(0);
    expect(rarityIndex(itemRarity('crystal'))).toBe(3);
    RARITY_TIERS.forEach((t, i) => expect(rarityIndex(t.id)).toBe(i));
  });
});
