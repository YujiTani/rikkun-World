import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { GADGET_IDS, INGOT_IDS, MATERIAL_ITEM_IDS, ORB_IDS } from './ids';
import { ITEM_DEFS, itemDef, pickDefs } from './registry';

// #306 段階 3 列 A: 素材 8 個（ようかいだま・かみ・あぶら・いと・ぬの・ねんど・すいしょう・てつの かたまり）と
// 小物 6 個（ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）。
// 期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。materials.ts・misc.ts を 直すと ここが 落ちる。

const E = 'E の つくる で つかう';

interface Expect {
  name: string;
  maxStack: number;
  rarity: string;
  category: string;
  /** ITEM-FX-1: 小物 6 個の 説明は 「できること」に かわった ので 写さない（gadgetTuning.test.ts が 見る） */
  info: Record<string, unknown> | null;
  /** ITEM-FX-1: ちょうちん・ふとん・はにわ は ブロックとして おける */
  placeBlock?: string;
}

const EXPECT: Record<string, Expect> = {
  yokai_orb: { name: 'ようかいだま', maxStack: 64, rarity: 'uncommon', category: 'material', info: { use: 'いまは つかえない よ', how: '', buttons: [] } },
  paper: { name: 'かみ', maxStack: 64, rarity: 'common', category: 'material', info: { use: 'や・ちょうちん・たこ の ざいりょう', how: E, buttons: ['E'] } },
  oil: { name: 'あぶら', maxStack: 64, rarity: 'uncommon', category: 'material', info: { use: 'たいまつ・ちょうちん の ざいりょう。かまど の ねんりょう にも なる', how: `${E}。ねんりょう は かってに つかう`, buttons: ['E'] } },
  string: { name: 'いと', maxStack: 64, rarity: 'common', category: 'material', info: { use: 'ゆみ・よろい・すねあて・たこ・ふとん・おまもり・わらじ の ざいりょう', how: E, buttons: ['E'] } },
  cloth: { name: 'ぬの', maxStack: 64, rarity: 'common', category: 'material', info: { use: 'かぶと・よろい・こて・ふとん・おまもり の ざいりょう', how: E, buttons: ['E'] } },
  clay: { name: 'ねんど', maxStack: 64, rarity: 'uncommon', category: 'material', info: { use: 'かまど で やくと かわら・レンガ・はにわ に なる', how: 'かまど に みぎクリック して やく', buttons: ['right'] } },
  crystal: { name: 'すいしょう', maxStack: 64, rarity: 'superRare', category: 'metal', info: { use: 'きらめく カタナ・おまもり の ざいりょう。ハイパーレア', how: E, buttons: ['E'] } },
  iron_ingot: { name: 'てつの かたまり', maxStack: 64, rarity: 'rare', category: 'metal', info: { use: 'てつの つるはし・ぶき・ぼうぐ・たんす の ざいりょう', how: E, buttons: ['E'] } },
  lantern: { name: 'ちょうちん', maxStack: 64, rarity: 'uncommon', category: 'light', info: null, placeBlock: 'lantern' },
  kite: { name: 'たこ', maxStack: 1, rarity: 'uncommon', category: 'home', info: null },
  futon: { name: 'ふとん', maxStack: 1, rarity: 'uncommon', category: 'home', info: null, placeBlock: 'futon' },
  omamori: { name: 'おまもり', maxStack: 1, rarity: 'superRare', category: 'home', info: null },
  waraji: { name: 'わらじ', maxStack: 1, rarity: 'common', category: 'home', info: null },
  haniwa: { name: 'はにわ', maxStack: 64, rarity: 'uncommon', category: 'home', info: null, placeBlock: 'haniwa' },
};

const IDS = Object.keys(EXPECT);

describe('登録表（素材 8 個・小物 6 個）', () => {
  it('14 個すべてに ItemDef が ある（id は ids.ts の 1 回。ITEM-FX-1 で ふえた omamori_torn は gadgetTuning.test.ts が 見る）', () => {
    expect(IDS).toHaveLength(14);
    expect([...ORB_IDS, ...MATERIAL_ITEM_IDS, ...INGOT_IDS, ...GADGET_IDS].filter((i) => i !== 'omamori_torn').sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(itemDef(id), id).toBeDefined();
  });

  it.each(IDS)('%s: 名前・重ね数・置けない・レア度・分類・説明が 今の表と同じ', (id) => {
    const e = EXPECT[id]!;
    expect(itemType(id as never)).toEqual({ id, name: e.name, maxStack: e.maxStack, placeBlock: e.placeBlock ?? null });
    expect(itemRarity(id as never)).toBe(e.rarity);
    expect(itemCategory(id)).toBe(e.category);
    if (e.info) expect(ITEM_INFO[id]).toEqual(e.info);
  });

  it('ITEM_TYPES: ようかいだま → ざいりょう 6 は 先頭の ブロックの 次、てつの かたまりは つるはし・おの 6 の 次、小物 6 は 間欠泉の つちの 次', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const i = ids.indexOf('yokai_orb');
    expect(ids.slice(i, i + 7)).toEqual(['yokai_orb', 'paper', 'oil', 'string', 'cloth', 'clay', 'crystal']);
    expect(ids[i + 7]).toBe('furnace');
    const j = ids.indexOf('iron_ingot');
    expect(ids.slice(j - 1, j + 2)).toEqual(['iron_axe', 'iron_ingot', 'bokuto']);
    const k = ids.indexOf('geyser_dirt');
    expect(ids.slice(k, k + 9)).toEqual(['geyser_dirt', 'lantern', 'kite', 'futon', 'omamori', 'omamori_torn', 'waraji', 'haniwa', 'seed_onion']); // ITEM-FX-1: やぶれた おまもり は おまもり の すぐ あと
  });

  it('色分け: 並びは 古い表と 同じ', () => {
    expect(CATEGORY_ITEMS.material).toEqual(['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb', 'kin_tamago']);
    expect(CATEGORY_ITEMS.metal.slice(0, 2)).toEqual(['iron_ingot', 'crystal']);
    expect(CATEGORY_ITEMS.light).toEqual(['torch', 'lantern']);
    expect(CATEGORY_ITEMS.home.slice(0, 7)).toEqual(['furnace', 'tansu', 'futon', 'haniwa', 'kite', 'waraji', 'omamori']);
  });

  it('作業台のカードの順: たいまつ → ちょうちん・たこ・ふとん・おまもり・わらじ → たんす（ITEM-FX-1: works は ぜんぶ 真。おまもり の 材料は すいしょう 3・きん 1・ぬの 2・いと 2）', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id as string);
    const i = ids.indexOf('torch');
    expect(ids.slice(i, i + 7)).toEqual(['torch', 'lantern', 'kite', 'futon', 'omamori', 'waraji', 'tansu']);
    const want: Record<string, Array<[string, number]>> = {
      lantern: [['paper', 2], ['log', 1], ['oil', 1]],
      kite: [['paper', 3], ['string', 2], ['log', 1]],
      futon: [['cloth', 3], ['string', 1]],
      omamori: [['crystal', 3], ['kin', 1], ['cloth', 2], ['string', 2]],
      waraji: [['grass', 3], ['string', 1]],
    };
    for (const [id, inputs] of Object.entries(want)) {
      const r = CRAFT_RECIPES.find((x) => x.id === id)!;
      expect(r.output, id).toEqual({ item: id, count: 1 });
      expect(r.inputs, id).toEqual(inputs.map(([item, count]) => ({ item, count })));
      expect(r.works, id).toBe(true);
      expect(r.station, id).toBe('craft');
    }
  });

  it('かまどの順: てつの かたまり → かわら → レンガ → はにわ → きん …', () => {
    const ids = BAKE_RECIPES.map((r) => r.id as string);
    expect(ids.slice(0, 5)).toEqual(['iron_ingot', 'kawara', 'brick', 'haniwa', 'kin']);
    const iron = BAKE_RECIPES.find((x) => x.id === 'iron_ingot')!;
    expect(iron).toEqual({ id: 'iron_ingot', output: { item: 'iron_ingot', count: 1 }, inputs: [{ item: 'iron_ore', count: 1 }], works: true, station: 'furnace' });
    const haniwa = BAKE_RECIPES.find((x) => x.id === 'haniwa')!;
    expect(haniwa).toEqual({ id: 'haniwa', output: { item: 'haniwa', count: 1 }, inputs: [{ item: 'clay', count: 2 }], works: true, station: 'furnace' });
    // ざいりょう 7 つ（てつの かたまりを のぞく）には 作り方が ない
    for (const id of [...ORB_IDS, ...MATERIAL_ITEM_IDS]) expect(ALL_RECIPES.some((x) => x.id === id), id).toBe(false);
  });

  it('たいきゅう: 小物は こわれない。ざいりょう・てつの かたまりは つかうと 1 こ へる。へる 道具の 表には 入らない', () => {
    for (const id of GADGET_IDS) {
      expect(itemClassOf(id), id).toBe('permanent');
      expect(W2_SETTING_DEFAULTS.toolDurability[id], id).toBeUndefined();
    }
    for (const id of [...ORB_IDS, ...MATERIAL_ITEM_IDS, ...INGOT_IDS]) expect(itemClassOf(id), id).toBe('consumable');
  });

  it('pickDefs: 指定の 順に 取り出す。登録に ない id は 投げる', () => {
    expect(Object.keys(pickDefs(ITEM_DEFS, ['kite', 'lantern']))).toEqual(['kite', 'lantern']);
    expect(() => pickDefs(ITEM_DEFS, ['no_such_item' as never])).toThrow(); // 全アイテムが 登録表に 入ったので、ない id は 書きまちがいだけ
  });
});
