import { describe, expect, it } from 'vitest';
import { RARITY_TIERS, itemRarity, rarityIndex } from '../drops/rarity';
import { ITEM_TYPES } from '../inventory/items';
import { contrastRatio, parseCssColor } from './theme/colorMath';
import { PALETTE_HEX } from './theme/palette';
import { CATEGORY_ITEMS, ITEM_CATEGORIES, categoryVar, itemCategory } from './itemCategory';
import { GEM_SHAPES, gemPixels, gemShape } from './gemArt';

const rgb = (h: string) => parseCssColor(`rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`)!;

describe('マスの カテゴリー（§3.5 (7)）', () => {
  it('13 カテゴリーで 67 こ（WEAPON-7: 雷神剣・FLORA-75: のばな・LIVE-1: たまご 込み）（ようかいだま 込み。#184: 12 の国の 7 こ をふくむ）。同じ id が 2 つの カテゴリーに無い', () => {
    expect(ITEM_CATEGORIES.length).toBe(13);
    const all = ITEM_CATEGORIES.flatMap((c) => CATEGORY_ITEMS[c]);
    expect(all.length).toBe(67); // WEAPON-7: 雷神剣 +1・FLORA-75: のばな +1・LIVE-1: たまご +1
    expect(new Set(all).size).toBe(67);
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

describe('宝石の印', () => {
  it('7 つの形は ぜんぶちがい、16×16 の中に収まる（ふちが切れない）', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 7; r++) {
      const px = gemPixels(r);
      expect(px.length).toBe(256);
      expect(gemShape(r)).toBe(GEM_SHAPES[r]);
      const solid = px.filter((p) => p[3] > 0);
      expect(solid.length).toBeGreaterThan(40);
      for (let i = 0; i < 16; i++) {
        for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) expect(px[y * 16 + x][3] === 0 || px[y * 16 + x][0] === 0x10, `${r}:${x},${y}`).toBe(true);
      }
      seen.add(px.map((p) => p[3] > 0 && p[0] === 0x10 ? 'o' : p[3] > 0 ? 'f' : '.').join(''));
    }
    expect(seen.size).toBe(7);
    expect(gemShape(7)).toBe(GEM_SHAPES[6]);
    expect(gemShape(-1)).toBe(GEM_SHAPES[0]);
  });
});
