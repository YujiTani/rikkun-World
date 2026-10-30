import { describe, expect, it } from 'vitest';
import { LIVE_SETTING_DEFAULTS, W2_SETTING_DEFAULTS, createLiveSettings } from '../../contracts';
import { ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { LIVE_ITEM_IDS } from './ids';
import { KOTATSU, LIVE } from './live';
import { ITEM_DEFS, itemDef, registryHeal } from './registry';

// #306 段階 3 列 A: 生き物の 8 個（たまご・むし・むしとりあみ・こたつ・とりごや・きんの たまご・なま／やいた もも にく）。
// 期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。live.ts を 直すと ここが 落ちる。

const eat = (hearts: number) => ({ use: `たべると ハート が ${hearts} こ もどる`, how: 'もって みぎクリック', buttons: ['1-9', 'right'] });

interface Expect {
  name: string;
  maxStack: number;
  place?: string;
  rarity: string;
  category: string;
  info: Record<string, unknown>;
}

const EXPECT: Record<string, Expect> = {
  egg: { name: 'たまご', maxStack: 64, rarity: 'common', category: 'food', info: eat(1) },
  mushi: { name: 'むし', maxStack: 64, rarity: 'common', category: 'plant', info: { use: 'にわとり に あげる と なかよく なる', how: 'もって にわとり に みぎクリック', buttons: ['1-9', 'right'] } },
  mushi_ami: { name: 'むしとりあみ', maxStack: 1, rarity: 'common', category: 'tool', info: { use: 'き から むし を とる', how: 'もって き に みぎクリック', buttons: ['1-9', 'right'] } },
  nukunuku: { name: 'こたつ', maxStack: 64, place: 'nukunuku', rarity: 'uncommon', category: 'home', info: { use: 'たまご を あたためる', how: 'おいて、たまご を もって みぎクリック', buttons: ['1-9', 'right'] } },
  toriya: { name: 'とりごや', maxStack: 1, rarity: 'uncommon', category: 'home', info: { use: 'にわとり の いえ', how: 'おいて、ひよこ を つれて いく', buttons: ['1-9', 'right'] } },
  kin_tamago: { name: 'きん の たまご', maxStack: 64, rarity: 'epic', category: 'material', info: { use: 'だいじ な たから。こたつ で あたためる と マッチョ ひよこ', how: 'こたつ に いれる', buttons: ['1-9', 'right'] } },
  momo_nama: { name: 'なま もも にく', maxStack: 64, rarity: 'common', category: 'food', info: { use: 'かまど で やく と たべられる', how: 'かまど に みぎクリック して やく', buttons: ['right'] } },
  momo_yaki: { name: 'やいた もも にく', maxStack: 64, rarity: 'common', category: 'food', info: eat(5) },
};

const IDS = Object.keys(EXPECT);

describe('登録表（生き物 8 個）', () => {
  it('8 個すべてに ItemDef が ある（id は ids.ts の 1 回。こたつだけ ブロック側）', () => {
    expect(IDS).toHaveLength(8);
    expect([...LIVE_ITEM_IDS, 'nukunuku'].sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(itemDef(id), id).toBeDefined();
  });

  it('KOTATSU のキーは nukunuku だけ（ブロック側の id。ほかの 物を まぜない）', () => {
    expect(Object.keys(KOTATSU)).toEqual(['nukunuku']);
    expect(Object.keys(LIVE)).toEqual([...LIVE_ITEM_IDS]);
  });

  it.each(IDS)('%s: 名前・重ね数・置くブロック・レア度・分類・説明が 今の表と同じ', (id) => {
    const e = EXPECT[id]!;
    expect(itemType(id as never)).toEqual({ id, name: e.name, maxStack: e.maxStack, placeBlock: e.place ?? null });
    expect(itemRarity(id as never)).toBe(e.rarity);
    expect(itemCategory(id)).toBe(e.category);
    expect(ITEM_INFO[id]).toEqual(e.info);
  });

  it('ITEM_TYPES は 花の ブロックの 次に、たまご → むし → むしとりあみ → こたつ → とりごや → きんの たまご → もも にく 2 つ の 順', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const i = ids.indexOf('egg');
    expect(ids.slice(i - 1, i + 9)).toEqual(['nobana', 'egg', 'mushi', 'mushi_ami', 'nukunuku', 'toriya', 'kin_tamago', 'momo_nama', 'momo_yaki', 'raijin_ken']);
  });

  it('色分けの 並び: 古い表と 同じ', () => {
    const plant = CATEGORY_ITEMS.plant;
    expect(plant.slice(plant.indexOf('bamboo'), plant.indexOf('bamboo') + 3)).toEqual(['bamboo', 'mushi', 'nobana']);
    expect(CATEGORY_ITEMS.material).toEqual(['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb', 'sumi', 'kin_tamago']);
    const at = (cat: readonly string[], id: string, n: number) => cat.slice(cat.indexOf(id), cat.indexOf(id) + n);
    expect(at(CATEGORY_ITEMS.tool, 'bucket', 3)).toEqual(['bucket', 'water_bucket', 'mushi_ami']);
    expect(at(CATEGORY_ITEMS.home, 'sprinkler', 3)).toEqual(['sprinkler', 'nukunuku', 'toriya']);
    expect(CATEGORY_ITEMS.food.slice(0, 7)).toEqual(['onion', 'tomato', 'pumpkin', 'eggplant', 'egg', 'momo_nama', 'momo_yaki']);
  });

  it('作り方: 作業台は むしとりあみ → こたつ → とりごや（カードの 順。たね 4 の 次・きんの 装備の 前）、かまどは いちばん うしろに やいた もも にく', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id as string);
    const i = ids.indexOf('mushi_ami');
    expect(ids.slice(i - 1, i + 4)).toEqual(['seed_eggplant', 'mushi_ami', 'nukunuku', 'toriya', 'kin_katana']);
    const want: Record<string, Array<[string, number]>> = {
      mushi_ami: [['log', 1], ['string', 2]],
      nukunuku: [['grass', 3], ['log', 2], ['torch', 1]],
      toriya: [['log', 8], ['grass', 4]],
    };
    for (const [id, inputs] of Object.entries(want)) {
      const r = CRAFT_RECIPES.find((x) => x.id === id)!;
      expect(r.output, id).toEqual({ item: id, count: 1 });
      expect(r.inputs, id).toEqual(inputs.map(([item, count]) => ({ item, count })));
      expect(r.works, id).toBe(true);
      expect(r.station, id).toBe('craft');
    }
    expect(BAKE_RECIPES.map((r) => r.id).at(-1)).toBe('momo_yaki');
    expect(BAKE_RECIPES.at(-1)).toEqual({ id: 'momo_yaki', output: { item: 'momo_yaki', count: 1 }, inputs: [{ item: 'momo_nama', count: 1 }], works: true, station: 'furnace' });
    for (const id of ['egg', 'mushi', 'kin_tamago', 'momo_nama']) expect(ALL_RECIPES.some((x) => x.id === id), id).toBe(false);
  });

  it('たいきゅう: むしとりあみは こわれない。ほかは つかうと 1 こ へる。へる 道具の 表には 入らない', () => {
    expect(itemClassOf('mushi_ami')).toBe('permanent');
    expect(W2_SETTING_DEFAULTS.toolDurability.mushi_ami).toBeUndefined();
    for (const id of ['egg', 'mushi', 'nukunuku', 'toriya', 'kin_tamago', 'momo_nama', 'momo_yaki'] as const) expect(itemClassOf(id), id).toBe('consumable');
  });

  it('たべた ときの 回復量: たまご 2・やいた もも にく 10 が 設定の 初期値に なる。ほかの 物に food は ない', () => {
    expect(registryHeal('egg')).toBe(2);
    expect(registryHeal('momo_yaki')).toBe(10);
    expect(LIVE_SETTING_DEFAULTS.animalEggHeal).toBe(2);
    expect(LIVE_SETTING_DEFAULTS.meatHeal).toBe(10);
    expect(() => registryHeal('momo_nama')).toThrow();
    const withFood = Object.entries(ITEM_DEFS).filter(([, d]) => d?.food).map(([id]) => id);
    expect(withFood).toEqual(['egg', 'momo_yaki']);
  });

  it('設定の 複製を 書きかえても、登録表の 回復量は 変わらない', () => {
    const live = createLiveSettings();
    live.animalEggHeal = 99;
    live.meatHeal = 99;
    expect(registryHeal('egg')).toBe(2);
    expect(registryHeal('momo_yaki')).toBe(10);
    expect(createLiveSettings().animalEggHeal).toBe(2);
    expect(createLiveSettings().meatHeal).toBe(10);
    expect(LIVE.egg.food).toEqual({ heal: 2 });
  });
});
