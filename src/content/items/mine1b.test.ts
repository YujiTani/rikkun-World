import { describe, expect, it } from 'vitest';
import type { ItemId, Rarity } from '../../contracts';
import { createDefaultItemInfo } from '../../craft/info/build';
import { ITEM_INFO } from '../../craft/info/table';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { CATEGORY_ITEMS, itemCategory, type ItemCategory } from '../../ui/itemCategory';
import { itemIconPixels } from '../../ui/itemIcon';
import { findUnrubiedKanji } from '../../ui/text';
import { getTilePixels } from '../../world/blocks/textures';
import { itemDef } from './registry';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4・受け入れ基準 B7）: 新しい アイテムの 登録と 図鑑の「てに いれかた」。
 *
 *   ・せっかいせき・しっくい・ほたるいし・きんの いし・チョーク・いしばい・ダイヤが 登録表に あり、名前・重ね 64・めずらしさ・分け・絵・説明が ある
 *     〔今の completeness／registry テストと 同じ 見方。全 アイテムを 見る 今の テストが 新しい 物も 見る ので、ここは 値を 仕様の 表で 確かめる〕
 *   ・`diamond` は KONGO-1 §4.1 と 同じ 値〔名前 ダイヤ・重ね 64・mythic・metal・きんの となり〕で、1 回だけ 登録されて いる（二重に 定義しない）
 *   ・ねんど〔ブロック `nendo`〕・すいしょうの いし・ダイヤの いし・チョークの しるしは 持てない〔アイテムに ならない ブロック〕
 *   ・図鑑の「てに いれかた」が §4.4 の 文に なる
 * ・id は 仕様の 案。件数は 決め打ちしない〔#311〕。説明の 文そのものは「案」なので、あることと ルビだけ 見る
 */

interface Row {
  id: string;
  name: string;
  rarity: Rarity;
  category: ItemCategory;
  /** 置くと なる ブロック（置けない 物は null） */
  place: string | null;
}

/** 仕様 §4.4 の 表（アイテム 7 つ。ダイヤは KONGO-1 と 同じ） */
const ROWS: readonly Row[] = [
  { id: 'sekkaiseki', name: 'せっかいせき', rarity: 'uncommon', category: 'ore', place: 'sekkaiseki' },
  { id: 'shikkui', name: 'しっくい', rarity: 'uncommon', category: 'build', place: 'shikkui' },
  { id: 'hotaruishi', name: 'ほたるいし', rarity: 'rare', category: 'ore', place: 'hotaruishi' },
  { id: 'kin_ore', name: 'きんの いし', rarity: 'epic', category: 'ore', place: 'kin_ore' },
  { id: 'chalk', name: 'チョーク', rarity: 'uncommon', category: 'tool', place: null },
  { id: 'ishibai', name: 'いしばい', rarity: 'uncommon', category: 'material', place: null },
  { id: 'diamond', name: 'ダイヤ', rarity: 'mythic', category: 'metal', place: null },
];
/** 1B で はじめて 登録表に 入る 6 つ（ダイヤは もう ある） */
const NEW_IDS = ROWS.filter((r) => r.id !== 'diamond').map((r) => r.id);

const I = (id: string): ItemId => id as ItemId;
const nameOf = (i: ItemId): string => itemType(i)?.name ?? i;

describe('B7: 登録表（名前・重ね 64・めずらしさ・分け・置ける ブロック）', () => {
  it('7 つとも 登録表と 持ち物の 種類表に あり、名前・重ね 64・置く ブロックが 表の とおり', () => {
    for (const r of ROWS) {
      expect(itemDef(r.id), `${r.id} が 登録表に ある`).toBeDefined();
      expect(itemType(r.id), `${r.id} が 持ち物の 種類表に ある`).toEqual({ id: r.id, name: r.name, maxStack: 64, placeBlock: r.place });
    }
  });

  it('めずらしさ・色分けの 分けが 表の とおり（その 分けの 並びに 1 回 入る）', () => {
    for (const r of ROWS) {
      expect(itemRarity(I(r.id)), `${r.id} の めずらしさ`).toBe(r.rarity);
      expect(itemCategory(r.id), `${r.id} の 分け`).toBe(r.category);
      expect(CATEGORY_ITEMS[r.category].filter((id) => id === r.id), `${r.id} が ${r.category} の 並びに 1 回`).toHaveLength(1);
    }
  });

  it('持ち物の 種類表に 同じ id が 2 つ ない（ダイヤを 二重に 作らない）', () => {
    for (const r of ROWS) expect(ITEM_TYPES.filter((t) => t.id === r.id), r.id).toHaveLength(1);
  });

  it('ダイヤは KONGO-1 と 同じ 値で、きんぞくの 分けの きんの となり', () => {
    const t = itemType('diamond')!;
    expect(t).toMatchObject({ name: 'ダイヤ', maxStack: 64 });
    expect(itemRarity(I('diamond'))).toBe('mythic');
    expect(itemCategory('diamond')).toBe('metal');
    const metal = CATEGORY_ITEMS.metal;
    expect(metal.indexOf('diamond')).toBe(metal.indexOf('kin') + 1);
  });

  it('持てない ブロック（ねんど〔ブロック〕・すいしょうの いし・ダイヤの いし・チョークの しるし）は アイテムに ならない', () => {
    for (const id of ['nendo', 'suisho_ore', 'diamond_ore', 'chalk_mark']) {
      expect(itemType(id), `${id} は 持ち物に 入らない`).toBeUndefined();
      expect(itemDef(id), `${id} は 登録表に ない`).toBeUndefined();
    }
    // ほると 出る 物は もとからある アイテム
    for (const id of ['clay', 'crystal']) expect(itemType(id), id).toBeDefined();
  });
});

describe('B7: 絵と 説明', () => {
  it('2D の絵が ある（石の絵に 落ちない）', () => {
    const stone = JSON.stringify(getTilePixels('stone'));
    for (const r of ROWS) {
      const px = itemIconPixels(I(r.id));
      expect(px.length, `${r.id} の 絵`).toBeGreaterThan(0);
      expect(JSON.stringify(px) === stone, `${r.id} が 石の絵に 落ちて いる`).toBe(false);
    }
  });

  it('説明の 行が ある・つかいかた が ある・ルビなしの 漢字が ない', () => {
    const src = createDefaultItemInfo(nameOf);
    for (const r of ROWS) {
      const row = ITEM_INFO[r.id];
      expect(row, `${r.id} の 説明の 行`).toBeDefined();
      expect(row!.use, `${r.id} の つかいみち`).not.toBe('');
      expect(row!.how !== '' || row!.buttons.length > 0, `${r.id} の つかいかた`).toBe(true);
      const i = src.info(I(r.id));
      expect(findUnrubiedKanji(`${i.name}${i.use}${i.how}${i.source}`), r.id).toEqual([]);
    }
  });
});

/** 空白の ちがいは 見ない（「きん の たまご」と「きんの たまご」） */
const norm = (s: string): string => s.replace(/\s+/g, '');

describe('B7: 図鑑の「てに いれかた」（§4.4 の 文）', () => {
  const src = createDefaultItemInfo(nameOf);
  const source = (id: string): string => norm(src.info(I(id)).source);

  it('せっかいせき・ほたるいし・きんの いし: ほる〔道具の 名前つき〕', () => {
    expect(source('sekkaiseki')).toBe(norm('せっかいせき を ほる（いしの つるはし から）'));
    expect(source('hotaruishi')).toBe(norm('ほたるいし を ほる（いしの つるはし から）'));
    expect(source('kin_ore')).toBe(norm('きんの いし を ほる（てつの つるはし から）'));
  });

  it('チョーク・しっくい: 作業台で つくる〔「を さぎょうだい」の 言い方は 今の 文の しくみに 合わせて どちらでも よい〕', () => {
    expect([norm('せっかいせき 1 を さぎょうだい で つくる'), norm('せっかいせき 1 で つくる')]).toContain(source('chalk'));
    expect([norm('いしばい 1・いと 1 を さぎょうだい で つくる'), norm('いしばい 1・いと 1 で つくる')]).toContain(source('shikkui'));
  });

  it('いしばい: かまどで やく', () => {
    expect(source('ishibai')).toBe(norm('せっかいせき 1 を かまど で やく'));
  });

  it('きん: きんの たまご と きんの いし の 2 つの やきかた（たまごが 先）', () => {
    expect(source('kin')).toBe(norm('きんの たまご 1 を かまど で やく・きんの いし 1 を かまど で やく'));
  });

  it('ねんど・すいしょう・ダイヤ: ほる〔ほる ブロックの 名前で。ふつうの 文の しくみで ブロックと アイテムの 名前が ちがう 物〕', () => {
    expect(source('clay')).toBe(norm('ねんど を ほる・ぬりかべ が おとす'));
    expect(source('crystal')).toBe(norm('すいしょうの いし を ほる（てつの つるはし から）・ろくろくび が おとす'));
    expect(source('diamond')).toBe(norm('ダイヤの いし を ほる（てつの つるはし から）'));
  });

  it('宝箱から 出る ことは 書かない（どの 物も 出る ため）', () => {
    for (const r of ROWS) expect(src.info(I(r.id)).source, r.id).not.toMatch(/たからばこ|宝箱/);
  });

  it('材料に する 作り方が「つかう もの」に のる（せっかいせき → チョーク・いしばい、いしばい → しっくい）', () => {
    expect(src.info(I('sekkaiseki')).usedIn).toEqual(expect.arrayContaining(['chalk', 'ishibai']));
    expect(src.info(I('ishibai')).usedIn).toContain('shikkui');
    expect(src.info(I('kin_ore')).usedIn.length, 'きんの いしを やく 作り方').toBeGreaterThan(0);
  });

  it('1B で ふえた 物は 全部「どこで 手に 入るか」が 空でない', () => {
    for (const id of NEW_IDS) expect(src.info(I(id)).source, id).not.toBe('');
  });
});
