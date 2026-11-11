import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { createDefaultItemInfo } from '../../craft/info/build';
import { ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { itemIconPixels } from '../../ui/itemIcon';
import { findUnrubiedKanji } from '../../ui/text';
import { dugItemOf } from '../../dig/dugItems';
import { hook1c } from '../../world/gen/mineShaftKit';
import { getTilePixels } from '../../world/blocks/textures';
import { itemDef } from './registry';

/**
 * HOUSE-2A（#364・仕様 3.3 版 docs/design/HOUSE-2.md §2.1・§6.2 AC1・AC7）: アイテム「レシピの まきもの」〔`recipe_scroll`〕の 登録。
 * 手順は src/content/CLAUDE.md「アイテム 1 つを 足すとき」と「たしかめ」。件数を 数える テストは 表から 数える ので 直す 所は ない（#311）。
 * 値の 写し `content/__snapshots__/content.json` は 実装で `npx vitest run -u src/content` して 差分を 読む（recipe_scroll の 1 件だけ ふえて いる こと）。
 * 使う ところ（右クリック）は src/dig/rightClickScroll.test.ts、おぼえる ところは src/house/recipes/*.test.ts。
 * 文は「下書き」（仕様 §2.1）なので あることと ルビ・かぎの ことばだけ 見る。
 */

const ID: string = 'recipe_scroll';
const I = (id: string): ItemId => id as ItemId;
const norm = (s: string): string => s.replace(/\s+/g, '');
const nameOf = (i: ItemId): string => itemType(i)?.name ?? i;

describe('recipe_scroll: 登録表', () => {
  it('登録表と 持ち物の 種類表に 1 回ずつ・名前「レシピの まきもの」・重ねられる（小物と 同じ 重ね数 64）・置けない', () => {
    expect(itemDef(ID), '登録表').toBeDefined();
    const t = itemType(ID)!;
    expect(t, '持ち物の 種類表').toBeDefined();
    expect(norm(t.name)).toBe('レシピのまきもの');
    expect(t.maxStack, '重ねられる').toBeGreaterThan(1);
    expect(t.maxStack, '小物の いつもの 数（misc.ts の ふつうの 小物と 同じ）').toBe(64);
    expect(t.placeBlock, '置けない').toBeNull();
    expect(ITEM_TYPES.filter((x) => x.id === ID)).toHaveLength(1);
  });

  it('めずらしさ が ある・分け（色分け）の 並びに 1 回', () => {
    expect(itemRarity(I(ID)), 'めずらしさ').toBeTypeOf('string');
    expect(CATEGORY_ITEMS[itemCategory(ID)].filter((x) => x === ID)).toHaveLength(1);
  });

  it('作れない（作り方が ない・「つくる」の 一覧に 出ない）。まきものの ブロックを ほると この アイテム（dugItemOf）', () => {
    expect(itemDef(ID)?.recipe, '作り方').toBeUndefined();
    expect(ALL_RECIPES.filter((r) => r.output.item === ID), 'つくる に 出ない').toEqual([]);
    expect(dugItemOf('makimono'), '床の まきものを ほると recipe_scroll').toBe(ID);
  });
});

describe('recipe_scroll: 手に 入れかたと 説明', () => {
  it('手に 入れかた（source）に「こうどうの いちばん したの へや」。2D の 絵が ある（石の 絵に 落ちない）', () => {
    expect(norm(itemDef(ID)?.source ?? ''), 'source').toContain('こうどうのいちばんしたのへや');
    expect(norm(createDefaultItemInfo(nameOf).info(I(ID)).source)).toContain('こうどうのいちばんしたのへや');
    const px = itemIconPixels(I(ID));
    expect(px.length, '絵').toBeGreaterThan(0);
    expect(JSON.stringify(px) === JSON.stringify(getTilePixels('stone'))).toBe(false);
  });

  it('説明の 行: つかいかた「ひらいて よむと いえの つくりかたを ひとつ おぼえる」・どう つかう「もって みぎクリック」（仕様 §2.2）', () => {
    const row = ITEM_INFO[ID];
    expect(row, '説明の 行').toBeDefined();
    expect(norm(row!.use)).toBe('ひらいてよむといえのつくりかたをひとつおぼえる');
    expect(norm(row!.how)).toBe('もってみぎクリック');
  });

  it('図鑑の 文 zukan が ある（「よむと おぼえる」の 意味が 入る）・ルビなしの 漢字が ない', () => {
    const z = itemDef(ID)!.zukan;
    expect(z.trim().length).toBeGreaterThan(0);
    expect(norm(z), '開いて よむと 家の 新しい 作り方を ひとつ おぼえる').toMatch(/よむと.*おぼえる/);
    const i = createDefaultItemInfo(nameOf).info(I(ID));
    expect(findUnrubiedKanji(`${i.name}${i.use}${i.how}${i.source}${z}`)).toEqual([]);
  });
});

describe('recipe_scroll: 宝箱の くじから のぞく（宝箱の レシピの わくは 別に 1 つ ふえる ので くじには 入れない）', () => {
  it('`chestPool()` に 入らず、`chestExcluded()` に 理由つきで ある', () => {
    const H = hook1c(20261012);
    const pooled = new Set(Object.values(H.chestPool()).flat() as string[]);
    expect(pooled.has(ID), 'くじの 箱に 入って いる').toBe(false);
    const ex = H.chestExcluded().find((e) => e.item === ID);
    expect(ex, 'のぞく 表に recipe_scroll').toBeDefined();
    expect(ex!.reason.trim().length, '理由').toBeGreaterThan(0);
  });
});
