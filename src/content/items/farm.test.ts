import { describe, expect, it } from 'vitest';
import { CROP_KINDS, M7_SETTING_DEFAULTS, SEED_ITEM, VEG_ITEM, W2_SETTING_DEFAULTS, seedKindOfItem, vegKindOfItem } from '../../contracts';
import { ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, CRAFT_RECIPES } from '../../craft/recipes';
import { toolFamily } from '../../dig/toolFamily';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { TOOL_DEFAULTS } from '../../tools/config';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { BUCKETS, FARM_TOOLS, SEEDS, SPRINKLER, VEGGIES } from './farm';
import { FARM_BUCKET_IDS, FARM_TOOL_IDS, SEED_ITEM_IDS, VEG_ITEM_IDS } from './ids';
import { itemDef } from './registry';

// #306 段階 3 列 A: 畑の 14 個（たね 4・やさい 4・くわ・じょうろ 2・スプリンクラー・バケツ 2）。
// 期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。farm.ts を 直すと ここが 落ちる。

const SEED_ROW = { use: 'はたけ に まくと やさい が そだつ', how: 'もって はたけ に みぎクリック', buttons: ['1-9', 'right'] };
const eat = (hearts: number) => ({ use: `たべると ハート が ${hearts} こ もどる`, how: 'もって みぎクリック', buttons: ['1-9', 'right'] });
const CAN_HOW = 'みず に みぎクリック で くむ、はたけ に みぎクリック';

interface Expect {
  name: string;
  maxStack: number;
  place?: string;
  rarity: string;
  category: string;
  info: Record<string, unknown>;
}

const EXPECT: Record<string, Expect> = {
  seed_onion: { name: 'たまねぎの たね', maxStack: 64, rarity: 'common', category: 'plant', info: SEED_ROW },
  seed_tomato: { name: 'トマトの たね', maxStack: 64, rarity: 'common', category: 'plant', info: SEED_ROW },
  seed_pumpkin: { name: 'かぼちゃの たね', maxStack: 64, rarity: 'common', category: 'plant', info: SEED_ROW },
  seed_eggplant: { name: 'なすの たね', maxStack: 64, rarity: 'common', category: 'plant', info: SEED_ROW },
  onion: { name: 'たまねぎ', maxStack: 64, rarity: 'common', category: 'food', info: eat(1) },
  tomato: { name: 'トマト', maxStack: 64, rarity: 'common', category: 'food', info: eat(1) },
  pumpkin: { name: 'かぼちゃ', maxStack: 64, rarity: 'common', category: 'food', info: eat(2) },
  eggplant: { name: 'なす', maxStack: 64, rarity: 'common', category: 'food', info: eat(1) },
  kuwa: { name: 'くわ', maxStack: 1, rarity: 'common', category: 'tool', info: { use: 'くさ や つち を はたけ に する', how: 'もって くさ・つち に みぎクリック', buttons: ['1-9', 'right'] } },
  watering_can: { name: 'じょうろ', maxStack: 1, rarity: 'common', category: 'tool', info: { use: 'はたけ 1 マス に みず を まく', how: CAN_HOW, buttons: ['1-9', 'right'], stats: 'can' } },
  long_watering_can: {
    name: 'ながい じょうろ',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'tool',
    info: { use: 'はたけ 2 マス（ねらった はたけ と その むこう）に みず を まく', how: CAN_HOW, buttons: ['1-9', 'right'], stats: 'can' },
  },
  sprinkler: {
    name: 'スプリンクラー',
    maxStack: 64,
    place: 'sprinkler',
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'まわり の はたけ を ずっと しめらせる', how: 'もって みぎクリック で おく', buttons: ['1-9', 'right'] },
  },
  bucket: { name: 'バケツ', maxStack: 1, rarity: 'common', category: 'tool', info: { use: 'みず を くんで はこぶ', how: 'みず に みぎクリック で くむ', buttons: ['1-9', 'right'] } },
  water_bucket: { name: 'みずの バケツ', maxStack: 1, rarity: 'common', category: 'tool', info: { use: 'はたけ の そば に みず を おく', how: 'もって みぎクリック で おく', buttons: ['1-9', 'right'] } },
};

const FARM_IDS = Object.keys(EXPECT);

describe('登録表（畑 14 個）', () => {
  it('14 個すべてに ItemDef が ある（id は ids.ts の 1 回。スプリンクラーだけ ブロック側）', () => {
    expect(FARM_IDS).toHaveLength(14);
    expect([...SEED_ITEM_IDS, ...VEG_ITEM_IDS, ...FARM_TOOL_IDS, 'sprinkler', ...FARM_BUCKET_IDS]).toEqual(FARM_IDS);
    for (const id of FARM_IDS) expect(itemDef(id), id).toBeDefined();
  });

  it('SPRINKLER のキーは sprinkler だけ（ブロック側の id。ほかの 物を まぜない）', () => {
    expect(Object.keys(SPRINKLER)).toEqual(['sprinkler']);
    expect(Object.keys({ ...SEEDS, ...VEGGIES, ...FARM_TOOLS, ...BUCKETS })).toHaveLength(13);
  });

  it.each(FARM_IDS)('%s: 名前・重ね数・置くブロック・レア度・分類・説明が 今の表と同じ', (id) => {
    const e = EXPECT[id]!;
    expect(itemType(id as never)).toEqual({ id, name: e.name, maxStack: e.maxStack, placeBlock: e.place ?? null });
    expect(itemRarity(id as never)).toBe(e.rarity);
    expect(itemCategory(id)).toBe(e.category);
    expect(ITEM_INFO[id]).toEqual(e.info);
  });

  it('作業台のカードの順: くわ → じょうろ → ながい じょうろ → スプリンクラー → バケツ（…むしとりあみの 前に たね 4）', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id as string);
    const i = ids.indexOf('kuwa');
    expect(ids.slice(i, i + 10)).toEqual(['kuwa', 'watering_can', 'long_watering_can', 'sprinkler', 'bucket', ...SEED_ITEM_IDS, 'mushi_ami']);
  });

  it('作り方: 材料と 数が 今のまま（works は ぜんぶ 本当）', () => {
    const want: Record<string, [number, Array<[string, number]>]> = {
      kuwa: [1, [['log', 2], ['stone', 1]]],
      watering_can: [1, [['iron_ingot', 1], ['stone', 2]]],
      long_watering_can: [1, [['iron_ingot', 3], ['log', 1]]],
      sprinkler: [1, [['iron_ingot', 4], ['stone', 2]]],
      bucket: [1, [['iron_ingot', 3]]],
      seed_onion: [4, [['onion', 1]]],
      seed_tomato: [4, [['tomato', 1]]],
      seed_pumpkin: [4, [['pumpkin', 1]]],
      seed_eggplant: [4, [['eggplant', 1]]],
    };
    for (const [id, [count, inputs]] of Object.entries(want)) {
      const r = ALL_RECIPES.find((x) => x.id === id)!;
      expect(r.output, id).toEqual({ item: id, count });
      expect(r.inputs, id).toEqual(inputs.map(([item, n]) => ({ item, count: n })));
      expect(r.works, id).toBe(true);
      expect(r.station, id).toBe('craft');
    }
    for (const id of ['onion', 'tomato', 'pumpkin', 'eggplant', 'water_bucket']) expect(ALL_RECIPES.some((x) => x.id === id), id).toBe(false);
  });

  it('たいきゅう: くわは 131 で へる。じょうろ・バケツは こわれない。たね・やさい・スプリンクラーは つかうと 1 こ へる', () => {
    expect(W2_SETTING_DEFAULTS.toolDurability.kuwa).toBe(131);
    expect(itemClassOf('kuwa')).toBe('durable');
    for (const id of ['watering_can', 'long_watering_can', 'bucket', 'water_bucket'] as const) expect(itemClassOf(id), id).toBe('permanent');
    for (const id of ['seed_onion', 'onion', 'sprinkler'] as const) expect(itemClassOf(id), id).toBe('consumable');
  });

  it('くわ: ほる強さ 4・あう ブロックは つち。じょうろの 水の 回数と まく マス数', () => {
    expect(TOOL_DEFAULTS.toolPower.kuwa).toBe(4);
    expect(toolFamily('kuwa')).toBe('dirt');
    expect(M7_SETTING_DEFAULTS.farmCanCapacity).toEqual({ watering_can: 10, long_watering_can: 20 });
    expect(M7_SETTING_DEFAULTS.farmCanTiles).toEqual({ watering_can: 1, long_watering_can: 2 });
  });

  it('ITEM_TYPES は たね 4 → やさい 4 → くわ → じょうろ 2 → スプリンクラー → バケツ 2 の 順に つづく', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const i = ids.indexOf('seed_onion');
    expect(ids.slice(i, i + 14)).toEqual(FARM_IDS);
  });

  it('色分け: たねは くさの なかま、やさいは たべもの、道具は つるはし・おの → くわ → じょうろ → バケツ → むしとりあみ', () => {
    expect(CATEGORY_ITEMS.plant.slice(3, 7)).toEqual([...SEED_ITEM_IDS]);
    expect(CATEGORY_ITEMS.food.slice(0, 5)).toEqual([...VEG_ITEM_IDS, 'egg']);
    expect(CATEGORY_ITEMS.tool.slice(6, 12)).toEqual([...FARM_TOOL_IDS, ...FARM_BUCKET_IDS, 'mushi_ami']);
    expect(CATEGORY_ITEMS.home).toContain('sprinkler');
  });

  it('SEED_ITEM・VEG_ITEM（作物 → id）は 登録表と そろう: たね → 作る やさい・もどす 作物の 種類', () => {
    expect([...CROP_KINDS]).toEqual([...VEG_ITEM_IDS]);
    CROP_KINDS.forEach((k, i) => {
      expect(VEG_ITEM[k], k).toBe(VEG_ITEM_IDS[i]);
      expect(SEED_ITEM[k], k).toBe(SEED_ITEM_IDS[i]);
      expect(itemDef(SEED_ITEM[k])?.recipe?.inputs, k).toEqual([[VEG_ITEM[k], 1]]);
      expect(seedKindOfItem(SEED_ITEM[k]), k).toBe(k);
      expect(vegKindOfItem(VEG_ITEM[k]), k).toBe(k);
      expect(itemDef(VEG_ITEM[k])?.category, k).toBe('food');
    });
  });
});
