import { describe, expect, it } from 'vitest';
import { createDefaultItemInfo } from '../../craft/info/build';
import { firstVersionItems, gatedCraftItems, maneki } from '../../house/recipes/craftKit';
import { recipeName } from '../../house/recipes/table';
import { itemType } from '../../inventory/items';
import { findUnrubiedKanji } from '../../ui/text';
import type { ItemId } from '../../contracts';

/**
 * HOUSE-2C AC19（仕様 3.4 版 §2.6「図鑑の てにいれかた」・§6.2）: 図鑑の「てにいれかた」（`createDefaultItemInfo(...).info(item).source`）。
 * 1 版の 13 は「けんちくし が たてた いえ を ほる。つくる で つくれる」。案ごとの アイテム ぜんぶ・しゃちほこ・あかり 2 は
 * 「けんちくし が たてた いえ を ほる。まきもの を よんで 〇〇の レシピを おぼえると つくる で つくれる」（〇〇 ＝ その レシピの 名前。レシピの 表〔house/recipes/table.ts〕から 引く）、
 * まねきねこ は 終わりが「かまど で やける」。どの 文も ひらがな・カタカナ だけ（漢字 なし）。物の 数は 表から（#311）。
 */

const nameOf = (i: ItemId): string => itemType(i)?.name ?? i;
const norm = (s: string): string => s.replace(/\s+/g, '');
const sourceOf = (item: ItemId): string => createDefaultItemInfo(nameOf).info(item).source;
const HEAD = 'けんちくし が たてた いえ を ほる';

describe('AC19: 図鑑の てにいれかた', () => {
  it('1 版の 13: 「けんちくし が たてた いえ を ほる。つくる で つくれる」', () => {
    expect(firstVersionItems().length).toBeGreaterThan(0);
    for (const item of firstVersionItems()) expect(norm(sourceOf(item)), item).toBe(norm(`${HEAD}。つくる で つくれる`));
  });

  it('レシピで ふえる 物（案ごとの アイテム ぜんぶ・しゃちほこ・あかり 2）: 「…まきもの を よんで 〇〇の レシピを おぼえると つくる で つくれる」（〇〇 ＝ レシピの 名前）', () => {
    const list = gatedCraftItems();
    expect(list.length).toBeGreaterThan(0);
    for (const { item, recipe } of list) {
      expect(norm(sourceOf(item)), `${item}（${recipe}）`).toBe(norm(`${HEAD}。まきもの を よんで ${recipeName(recipe)}の レシピを おぼえると つくる で つくれる`));
    }
  });

  it('まねきねこ: 終わりが「かまど で やける」', () => {
    const { item, recipe } = maneki();
    expect(norm(sourceOf(item))).toBe(norm(`${HEAD}。まきもの を よんで ${recipeName(recipe)}の レシピを おぼえると かまど で やける`));
  });

  it('どの 文も ひらがな・カタカナ だけ（漢字 なし）', () => {
    for (const item of [...firstVersionItems(), ...gatedCraftItems().map((g) => g.item), maneki().item]) {
      expect(findUnrubiedKanji(sourceOf(item)), item).toEqual([]);
    }
  });
});
