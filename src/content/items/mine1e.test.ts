import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { createDefaultItemInfo } from '../../craft/info/build';
import { ITEM_INFO } from '../../craft/info/table';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { itemIconPixels } from '../../ui/itemIcon';
import { findUnrubiedKanji } from '../../ui/text';
import { hook1c } from '../../world/gen/mineShaftKit';
import { getTilePixels } from '../../world/blocks/textures';
import { itemDef } from './registry';

/**
 * MINE-1E（docs/design/MINE-1.md の 1E・docs/design/MINE-1E.md §4.9・受け入れ基準 E13）: かびた パン〔`kabita_pan`〕の 登録。
 *
 *   ・登録表に あり、名前・重ね 64・ノーマル〔common〕・たべもの〔food〕・絵・説明・`zukan`・`source` が ある〔今の completeness テストは 全 アイテムを 見る ので 新しい 物も 見る。ここは 値を 表で 確かめる〕
 *   ・回復は 登録表の `food.heal`〔体力 2 ＝ ハート 1 こ〕。数は ここに 写さず、読んで くらべる〔#311〕。たべる ところは src/dig/mineKabitaPan.test.ts
 *   ・宝箱: `chestPool()` に 入らず、のぞく 表〔`chestExcluded()`〕に 理由つきで ある
 * id は 仕様の 案〔`kabita_pan`〕。説明の 文そのものは「案」なので、あることと ルビだけ 見る。
 */

const ID: string = 'kabita_pan';
const I = (id: string): ItemId => id as ItemId;
const norm = (s: string): string => s.replace(/\s+/g, '');
const nameOf = (i: ItemId): string => itemType(i)?.name ?? i;

describe('E13: 登録表', () => {
  it('登録表と 持ち物の 種類表に ある・名前 かびた パン・重ね 64・置けない・1 回だけ', () => {
    expect(itemDef(ID), '登録表に かびた パン').toBeDefined();
    const t = itemType(ID)!;
    expect(t, '持ち物の 種類表に かびた パン').toBeDefined();
    expect(norm(t.name)).toBe('かびたパン');
    expect(t.maxStack).toBe(64);
    expect(t.placeBlock, '置けない').toBeNull();
    expect(ITEM_TYPES.filter((x) => x.id === ID)).toHaveLength(1);
  });

  it('めずらしさ ノーマル〔common〕・分け たべもの〔food〕の 並びに 1 回', () => {
    expect(itemRarity(I(ID))).toBe('common');
    expect(itemCategory(ID)).toBe('food');
    expect(CATEGORY_ITEMS.food.filter((x) => x === ID)).toHaveLength(1);
  });

  it('たべものの 回復 ＝ 登録表の food.heal〔体力 2 ＝ ハート 1 こ。1 以上の 整数〕', () => {
    const heal = itemDef(ID)?.food?.heal;
    expect(heal, 'food.heal').toBeTypeOf('number');
    expect(Number.isInteger(heal) && heal! >= 1).toBe(true);
    expect(heal, 'ハート 1 こ ＝ 体力 2').toBe(2);
  });

  it('作り方・ほる もとが ない〔キャンプあとの たんす だけ〕・手に 入れかたの 文に たんすが 出る', () => {
    const d = itemDef(ID)!;
    expect(d.recipe, '作り方').toBeUndefined();
    expect(d.dugFrom, 'ほる もと').toBeUndefined();
    expect(d.source ?? '', 'source').not.toBe('');
    expect(d.source!).toContain('たんす');
    expect(createDefaultItemInfo(nameOf).info(I(ID)).source).toContain('たんす');
  });
});

describe('E13: 絵と 説明', () => {
  it('2D の絵が ある（石の絵に 落ちない）', () => {
    const px = itemIconPixels(I(ID));
    expect(px.length, 'かびた パンの 絵').toBeGreaterThan(0);
    expect(JSON.stringify(px) === JSON.stringify(getTilePixels('stone'))).toBe(false);
  });

  it('説明の 行・つかいかた・図鑑の 文 `zukan` が ある・ルビなしの 漢字が ない', () => {
    const row = ITEM_INFO[ID];
    expect(row, '説明の 行').toBeDefined();
    expect(row!.use).not.toBe('');
    expect(itemDef(ID)!.zukan.trim().length, 'zukan').toBeGreaterThan(0);
    const i = createDefaultItemInfo(nameOf).info(I(ID));
    expect(findUnrubiedKanji(`${i.name}${i.use}${i.how}${i.source}${itemDef(ID)!.zukan}`)).toEqual([]);
  });
});

describe('E13: 宝箱から のぞく', () => {
  it('`chestPool()` に 入らず、`chestExcluded()` に 理由つきで ある〔「じょうだんの 物。宝箱から 出ると がっかり する」〕', () => {
    const H = hook1c(20261012);
    const pooled = new Set(Object.values(H.chestPool()).flat() as string[]);
    expect(pooled.has(ID), 'くじの 箱に 入って いる').toBe(false);
    const ex = H.chestExcluded().find((e) => e.item === ID);
    expect(ex, 'のぞく 表に かびた パン').toBeDefined();
    expect(ex!.reason.trim().length, '理由').toBeGreaterThan(0);
  });
});
