import { describe, expect, it } from 'vitest';
import { ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES } from '../../craft/recipes';
import { DIG_DEFAULTS } from '../../dig/config';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { GEYSER, M4_BLOCKS, PLACEABLE, VOX_I } from './blocks';
import { NO_INFO_OK } from './noInfoOk';
import { ITEM_DEFS, itemDef } from './registry';

// #306 段階 3 列 A（最後）: 置けるブロック 22 個。期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。
// blocks.ts を 直すと ここが 落ちる。名前の 出どころ（BLOCK_TYPES）・レア度の 出どころ（DIG_DEFAULTS）は 動かさない。

const PLACE = 'てに もって みぎクリック で おく';
const BTN = ['1-9', 'right'];

interface Expect {
  name: string;
  rarity: string;
  category: string;
  info?: Record<string, unknown>;
}

const EXPECT: Record<string, Expect> = {
  grass: { name: 'くさ', rarity: 'common', category: 'plant', info: { use: 'ブロック として おける。わらじ の ざいりょう', how: PLACE, buttons: BTN, dig: true } },
  dirt: { name: 'つち', rarity: 'common', category: 'soil', info: { use: 'ブロック として おける', how: PLACE, buttons: BTN, dig: true } },
  stone: { name: 'いし', rarity: 'common', category: 'stone', info: { use: 'おける。つるはし・かまど・や の ざいりょう', how: PLACE, buttons: BTN, dig: true } },
  sand: { name: 'すな', rarity: 'common', category: 'soil', info: { use: 'おける', how: PLACE, buttons: BTN, dig: true } },
  log: { name: 'き', rarity: 'uncommon', category: 'plant', info: { use: 'おける。いろんな もの の ざいりょう。かまど の ねんりょう にも なる', how: `${PLACE}。ねんりょう は かまど が かってに つかう`, buttons: BTN, dig: true } },
  leaves: { name: 'はっぱ', rarity: 'common', category: 'plant', info: { use: 'おける', how: PLACE, buttons: BTN, dig: true } },
  coal_ore: { name: 'せきたん', rarity: 'uncommon', category: 'ore', info: { use: 'かまど の ねんりょう（いちばん さきに つかう）。おける', how: 'かまど で やく と かってに つかう。おくのは てに もって みぎクリック', buttons: BTN, dig: true } },
  iron_ore: { name: 'てつ', rarity: 'rare', category: 'ore', info: { use: 'かまど で やくと てつの かたまり に なる。おける', how: 'かまど に みぎクリック して やく', buttons: ['right'], dig: true } },
  furnace: { name: 'かまど', rarity: 'uncommon', category: 'home', info: { use: 'おいて、てつ や ねんど を やく', how: 'おいて、かまど に むけて みぎクリック（E でも）', buttons: BTN } },
  kawara: { name: 'かわら', rarity: 'uncommon', category: 'build', info: { use: 'ブロック として おける（やね に ぴったり）', how: PLACE, buttons: BTN } },
  brick: { name: 'レンガ', rarity: 'uncommon', category: 'build', info: { use: 'ブロック として おける（かべ に ぴったり）', how: PLACE, buttons: BTN } },
  torch: { name: 'たいまつ', rarity: 'common', category: 'light', info: { use: 'おくと まわり が あかるく なる。あかるい ところ には ようかい が でない', how: PLACE, buttons: BTN } },
  tansu: {
    name: 'たんす',
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'おいて、もちもの を たくさん（54 こ の マス）しまえる', how: 'おいて、たんす に むけて みぎクリック で ひらく（E でも）。シフト を おしながら クリック で いっきに うつす', buttons: BTN, stats: 'tansu' },
  },
  geyser_dirt: { name: '［間欠泉｜かんけつせん］の つち', rarity: 'uncommon', category: 'soil' },
  snow: { name: 'ゆき', rarity: 'common', category: 'soil' },
  momiji_leaves: { name: 'もみじの はっぱ', rarity: 'common', category: 'plant' },
  matsu_leaves: { name: 'まつの はっぱ', rarity: 'common', category: 'plant' },
  flower_y: { name: 'はな', rarity: 'common', category: 'plant' },
  flower_o: { name: 'はな', rarity: 'common', category: 'plant' },
  flower_p: { name: 'はな', rarity: 'common', category: 'plant' },
  bamboo: { name: 'たけ', rarity: 'common', category: 'plant' },
  nobana: { name: 'のばな', rarity: 'common', category: 'plant' },
};

const IDS = Object.keys(EXPECT);

describe('登録表（置けるブロック 22 個）', () => {
  it('22 個すべてに ItemDef が ある（8 + 5 + 1 + 8）', () => {
    expect(IDS).toHaveLength(22);
    expect(Object.keys(PLACEABLE)).toHaveLength(8);
    expect(Object.keys(M4_BLOCKS)).toEqual(['furnace', 'kawara', 'brick', 'torch', 'tansu']);
    expect(Object.keys(GEYSER)).toEqual(['geyser_dirt']);
    expect(Object.keys(VOX_I)).toHaveLength(8);
    expect([...Object.keys(PLACEABLE), ...Object.keys(M4_BLOCKS), ...Object.keys(GEYSER), ...Object.keys(VOX_I)].sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(itemDef(id), id).toBeDefined();
  });

  it.each(IDS)('%s: 名前・重ね数・置くブロック・レア度・分類・説明が 今の表と同じ', (id) => {
    const e = EXPECT[id]!;
    expect(itemType(id)).toEqual({ id, name: e.name, maxStack: 64, placeBlock: id });
    expect(itemRarity(id as never)).toBe(e.rarity);
    expect(itemCategory(id)).toBe(e.category);
    expect(CATEGORY_ITEMS[itemCategory(id)]).toContain(id);
    expect(ITEM_INFO[id]).toEqual(e.info);
    // たいきゅうは 今まで どおり（blocks.ts では 書かない）: たんすだけ こわれない 扱い
    expect(itemClassOf(id as never), id).toBe(id === 'tansu' ? 'permanent' : 'consumable');
  });

  it('名前は BLOCK_TYPES から（間欠泉の つち以外の 21 個。間欠泉の つちだけ ルビつきで 登録表に 直接）、レア度は DIG_DEFAULTS.rarity から（二重に 書かない）', () => {
    const fromTypes = [...Object.keys(PLACEABLE), ...Object.keys(M4_BLOCKS), ...Object.keys(VOX_I)];
    for (const id of fromTypes) expect(itemDef(id)!.name, id).toBe(BLOCK_TYPES.find((b) => b.id === id)!.name);
    for (const id of IDS) expect(itemDef(id)!.rarity, id).toBe((DIG_DEFAULTS.rarity as Record<string, string>)[id]);
  });

  it('説明が 無い 9 個は 地形・かざり（geyser_dirt と 12 の国の 8 つ。許可リストは noInfoOk.ts の 1 か所）', () => {
    expect(IDS.filter((id) => !itemDef(id)!.info).sort()).toEqual(Object.keys(NO_INFO_OK).sort());
    expect(Object.keys(NO_INFO_OK)).toHaveLength(9);
  });

  it('ITEM_TYPES の 並び: 先頭 8 → ざいりょう 7 → かまど・かわら・レンガ・たいまつ・たんす / 侍装備の 次に 間欠泉の つち / バケツの 次に 12 の国の 8 つ', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    expect(ids.slice(0, 8)).toEqual(['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore']);
    const f = ids.indexOf('furnace');
    expect(ids.slice(f - 1, f + 6)).toEqual(['hemp', 'furnace', 'kawara', 'brick', 'torch', 'tansu', 'wood_pickaxe']); // TAKO-1: すみは ざいりょうの さいご
    const g = ids.indexOf('geyser_dirt');
    expect(ids.slice(g - 1, g + 2)).toEqual(['samurai_geta', 'geyser_dirt', 'lantern']);
    const s = ids.indexOf('snow');
    expect(ids.slice(s - 1, s + 10)).toEqual(['water_bucket', 'snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'nobana', 'egg', 'mushi']);
  });

  it('色分けの 並び: 古い表と 同じ', () => {
    expect(CATEGORY_ITEMS.soil).toEqual(['dirt', 'sand', 'snow', 'geyser_dirt']);
    expect(CATEGORY_ITEMS.stone).toEqual(['stone']);
    // MINE-1B: 鉱石の 分けに せっかいせき・ほたるいし・きんの いし、たてものの 分けに しっくいが ふえる。今の 物の 並びは かわらない（新しい 物の 位置は 決めない）
    const keep = (list: readonly string[], ids: readonly string[]): string[] => list.filter((id) => ids.includes(id));
    expect(keep(CATEGORY_ITEMS.ore, ['coal_ore', 'iron_ore'])).toEqual(['coal_ore', 'iron_ore']);
    expect(keep(CATEGORY_ITEMS.build, ['kawara', 'brick'])).toEqual(['kawara', 'brick']);
    expect(CATEGORY_ITEMS.light.slice(0, 2)).toEqual(['torch', 'lantern']);
    expect(CATEGORY_ITEMS.home.slice(0, 3)).toEqual(['furnace', 'tansu', 'futon']);
    const plant = CATEGORY_ITEMS.plant;
    expect(plant.slice(0, 4)).toEqual(['grass', 'log', 'leaves', 'seed_onion']);
    const m = plant.indexOf('momiji_leaves');
    expect(plant.slice(m, m + 8)).toEqual(['momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'mushi', 'nobana']);
  });

  it('作り方: かまど（石 5）・たいまつ（き 1・あぶら 1 → 4）・たんす（き 8・てつの かたまり 2）は 作業台、かわら・レンガは かまど（ねんど 1 → 2）', () => {
    const craft = CRAFT_RECIPES.map((r) => r.id as string);
    expect(craft[7]).toBe('furnace'); // TAKO-1: ふでが 道具の さいごに 入った
    expect(craft[craft.indexOf('furnace') + 1]).toBe('bokuto');
    expect(craft[craft.indexOf('torch') - 1]).toBe('suneate');
    expect(craft[craft.indexOf('tansu') - 1]).toBe('waraji');
    const want: Record<string, [number, Array<[string, number]>]> = {
      furnace: [1, [['stone', 5]]],
      torch: [4, [['log', 1], ['oil', 1]]],
      tansu: [1, [['log', 8], ['iron_ingot', 2]]],
    };
    for (const [id, [count, inputs]] of Object.entries(want)) {
      const r = CRAFT_RECIPES.find((x) => x.id === id)!;
      expect(r, id).toEqual({ id, output: { item: id, count }, inputs: inputs.map(([item, n]) => ({ item, count: n })), works: true, station: 'craft' });
    }
    expect(BAKE_RECIPES.map((r) => r.id).slice(0, 3)).toEqual(['iron_ingot', 'kawara', 'brick']);
    for (const id of ['kawara', 'brick']) {
      expect(BAKE_RECIPES.find((x) => x.id === id), id).toEqual({ id, output: { item: id, count: 2 }, inputs: [{ item: 'clay', count: 1 }], works: true, station: 'furnace' });
    }
    // 草・つち・石・砂・き・はっぱ・石炭・鉄・間欠泉の つち・12 の国の ブロックは 作れない
    for (const id of IDS.filter((x) => !['furnace', 'kawara', 'brick', 'torch', 'tansu'].includes(x))) expect(ALL_RECIPES.some((x) => x.id === id), id).toBe(false);
  });

  it('ITEM_TYPES の 全 id に ItemDef が ある（ない id は 一覧で 出す）。ITEM_DEFS の 全 id も ITEM_TYPES に ある', () => {
    const noDef = ITEM_TYPES.map((t) => t.id as string).filter((id) => !itemDef(id));
    expect(noDef).toEqual([]);
    const types = new Set(ITEM_TYPES.map((t) => t.id as string));
    expect(Object.keys(ITEM_DEFS).filter((id) => !types.has(id))).toEqual([]);
    expect(Object.keys(ITEM_DEFS).length).toBe(ITEM_TYPES.length);
  });
});
