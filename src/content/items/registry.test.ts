import { describe, expect, it } from 'vitest';
import { LEGENDARY_DEFAULTS, LIVE_SETTING_DEFAULTS, M7_SETTING_DEFAULTS, W2_SETTING_DEFAULTS, createLiveSettings, createM7Settings, createW2Settings } from '../../contracts';
import { ARMOR_SLOT_OF, CRAFT_DEFAULTS, NINJA_GEAR, SAMURAI_GEAR, createCraftConfig } from '../../craft/config';
import { ARMOR_KIND, ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES, TORCH_COAL } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { TOOL_DEFAULTS, createToolConfig } from '../../tools/config';
import { BLADE_ITEMS, BLADE_LIKE_ITEMS } from '../../tools/bladeSets';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { goldItemPixels, isGoldItem } from '../../ui/itemArtGold';
import { isNinjaItem, ninjaItemPixels } from '../../ui/itemArtNinja';
import { isSamuraiItem, samuraiItemPixels } from '../../ui/itemArtSamurai';
import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { ARMOR_ITEM_IDS, BOW_IDS, FARM_BUCKET_IDS, FARM_TOOL_IDS, GADGET_IDS, GOLD_IDS, INGOT_IDS, KONGO_IDS, LEGEND_IDS, LIVE_ITEM_IDS, MATERIAL_ITEM_IDS, NINJA_ITEM_IDS, ORB_IDS, SAMURAI_ITEM_IDS, SEED_ITEM_IDS, SWORD_IDS, TOOL_ITEM_IDS, VEG_ITEM_IDS, type GoldId } from './ids';
import { itemIconPixels } from '../../ui/itemIcon';
import { BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { getTilePixels } from '../../world/blocks/textures';
import { ARMOR as ARMOR_DEFS_RAW } from './armor';
import { GEYSER, M4_BLOCKS, PLACEABLE, VOX_I } from './blocks';
import { BUCKETS, FARM_TOOLS, SEEDS, SPRINKLER, VEGGIES } from './farm';
import { GOLD } from './gold';
import { KONGO } from './kongo';
import { KOTATSU, LIVE } from './live';
import { INGOT, MATERIALS, ORB } from './materials';
import { GADGETS } from './misc';
import { NINJA } from './ninja';
import { SAMURAI } from './samurai';
import { TOOLS } from './tools';
import { BLOCK_ONLY_IDS } from './types';
import { BOWS, SWORDS } from './weapons';
import { LEGEND } from './legend';
import { NO_INFO_OK } from './noInfoOk';
import { ITEM_DEFS, itemDef, registryHeal } from './registry';
import { toolFamily } from '../../dig/toolFamily';
import { isM4Item, m4ItemPixels } from '../../ui/itemArtM4';
import { isW7Item, w7ItemPixels } from '../../ui/itemArtW7';
import { LEGEND_FX_ITEMS } from '../../fx/bladeTrailModel';

// #306a: 登録表（金シリーズ）から作った「見せ方」が、これまでの表と同じ値になること。
// 期待は これまでの表（2026-10-25 の写し JSON）から 手で 写した 値。登録表を 直すと ここが 落ちる。

const WEAR_HOW = 'ダブルクリック か、てに もって みぎクリック で きる。E の そうび の マス に いれても よい';
const PICK_HOW = 'えらんで、ブロック に むけて ひだりクリック を おしつづける';
const KATANA_HOW = 'えらんで、ようかい に むけて ひだりクリック。R で かまえ を かえると わざ が かわる';
const BOW_HOW = 'えらんで ひだりクリック を おしつづけて ながく ひく。はなすと とぶ';

interface Expect {
  name: string;
  maxStack: number;
  category: string;
  use: string;
  how: string;
  buttons: string[];
  stats?: string;
}

const EXPECT: Record<GoldId, Expect> = {
  kin: { name: 'きん', maxStack: 64, category: 'metal', use: 'きん の そうび の ざいりょう', how: 'E の つくる で つかう', buttons: ['E'] },
  kin_katana: { name: 'きんの かたな', maxStack: 1, category: 'weapon', use: 'ようかい を いちばん つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
  kin_yumi: { name: 'きんの ゆみ', maxStack: 1, category: 'weapon', use: 'や を とばして とおく の ようかい を たおす。や が いる', how: BOW_HOW, buttons: ['1-9', 'left'], stats: 'bow' },
  kin_pickaxe: { name: 'きんの つるはし', maxStack: 1, category: 'tool', use: 'いちばん はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  kin_axe: { name: 'きんの おの', maxStack: 1, category: 'tool', use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
  kin_kabuto: { name: 'きんの かぶと', maxStack: 1, category: 'armor', use: 'ようかい の ひのたま を へらす（あたま）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  kin_yoroi: { name: 'きんの よろい', maxStack: 1, category: 'armor', use: 'ようかい の こうげき を へらす（からだ）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  kin_kote: { name: 'きんの こて', maxStack: 1, category: 'armor', use: 'ようかい の こうげき を へらす（うで）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  kin_suneate: { name: 'きんの すねあて', maxStack: 1, category: 'armor', use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
  harapan_mimizu: { name: 'はらぱんみみず', maxStack: 64, category: 'plant', use: 'なかま の にわとり に あげる と なかよし が いっぱい に なる', how: 'もって なかま の おとな の にわとり に みぎクリック', buttons: ['1-9', 'right'] },
};

const ARMOR = {
  kin_kabuto: { slot: 'head', kind: 'ball', value: { normal: 0, ball: 3, fall: 0 } },
  kin_yoroi: { slot: 'body', kind: 'normal', value: { normal: 3, ball: 0, fall: 0 } },
  kin_kote: { slot: 'arms', kind: 'normal', value: { normal: 2, ball: 0, fall: 0 } },
  kin_suneate: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 3 } },
} as const;

// 作り方（カードの順 = この順）
const CRAFTS: ReadonlyArray<[GoldId, Array<[string, number]>]> = [
  ['kin_katana', [['kin', 2], ['log', 1]]],
  ['kin_yumi', [['kin', 3], ['string', 3]]],
  ['kin_pickaxe', [['kin', 3], ['log', 2]]],
  ['kin_axe', [['kin', 3], ['log', 2]]],
  ['kin_kabuto', [['kin', 2], ['cloth', 1]]],
  ['kin_yoroi', [['kin', 3], ['string', 2], ['cloth', 2]]],
  ['kin_kote', [['kin', 1], ['cloth', 1]]],
  ['kin_suneate', [['kin', 2], ['string', 1]]],
];

/** 置けるブロック 22 個（content/items/blocks.ts） */
const BLOCK_ITEM_IDS = [...Object.keys(PLACEABLE), ...Object.keys(M4_BLOCKS), ...Object.keys(GEYSER), ...Object.keys(VOX_I)];
const GEAR_IDS = [...TOOL_ITEM_IDS, ...SWORD_IDS, ...BOW_IDS, ...ARMOR_ITEM_IDS] as const;
const FARM_IDS = [...SEED_ITEM_IDS, ...VEG_ITEM_IDS, ...FARM_TOOL_IDS, 'sprinkler', ...FARM_BUCKET_IDS] as const;

describe('登録表（金シリーズ）', () => {
  it('金の全 id に ItemDef がある（10 個・id は ids.ts の 1 回だけ）', () => {
    expect(GOLD_IDS).toHaveLength(10);
    for (const id of GOLD_IDS) expect(itemDef(id), id).toBeDefined();
    expect(Object.keys(ITEM_DEFS).sort()).toEqual([...GOLD_IDS, ...KONGO_IDS, ...LEGEND_IDS, ...NINJA_ITEM_IDS, ...SAMURAI_ITEM_IDS, ...GEAR_IDS, ...FARM_IDS, ...ORB_IDS, ...MATERIAL_ITEM_IDS, ...INGOT_IDS, ...GADGET_IDS, ...LIVE_ITEM_IDS, 'nukunuku', ...BLOCK_ITEM_IDS].sort());
    expect(Object.keys(EXPECT).sort()).toEqual([...GOLD_IDS].sort());
  });

  it('足し忘れ防止: 登録表の 全 id が ITEM_TYPES・説明・2D の絵を もつ', () => {
    const types = new Set(ITEM_TYPES.map((t) => t.id as string));
    for (const id of Object.keys(ITEM_DEFS)) {
      expect(types.has(id), `${id} が ITEM_TYPES に無い`).toBe(true);
      // 地形・かざりの 9 個は 説明なし（許可リストは noInfoOk.ts の 1 か所）
      if (!(id in NO_INFO_OK)) expect(ITEM_INFO[id], `${id} の 説明が 無い`).toBeDefined();
    }
    for (const id of GOLD_IDS) {
      expect(isGoldItem(id), id).toBe(true);
      expect(goldItemPixels(id).length, `${id} の 絵が 空`).toBeGreaterThan(0);
    }
    // 同じ id が 2 つの シリーズに 入らない（ITEM_TYPES に 重ならない）
    expect(new Set(ITEM_TYPES.map((t) => t.id)).size).toBe(ITEM_TYPES.length);
  });

  it('同じ id が 2 つの シリーズに 入っていない（シリーズごとの 数の 合計 = ITEM_DEFS の 数）', () => {
    const series = [PLACEABLE, M4_BLOCKS, GEYSER, VOX_I, TOOLS, SWORDS, BOWS, ARMOR_DEFS_RAW, NINJA, SAMURAI, SEEDS, VEGGIES, FARM_TOOLS, SPRINKLER, BUCKETS, ORB, MATERIALS, INGOT, GADGETS, LIVE, KOTATSU, LEGEND, GOLD, KONGO];
    expect(series.reduce((n, d) => n + Object.keys(d).length, 0)).toBe(Object.keys(ITEM_DEFS).length);
  });

  it('アイテムに ならない ブロック（BLOCK_ONLY_IDS）: 登録表に 無く、ITEM_TYPES にも 無い。それ以外の ブロックは 全部 アイテム', () => {
    const types = new Set(ITEM_TYPES.map((t) => t.id as string));
    for (const id of BLOCK_ONLY_IDS) {
      expect(id in ITEM_DEFS, `${id} が 登録表に ある。BLOCK_ONLY_IDS から 外す`).toBe(false);
      expect(types.has(id), `${id} が ITEM_TYPES に ある`).toBe(false);
    }
    const blockOnly = new Set<string>(BLOCK_ONLY_IDS);
    for (const b of BLOCK_TYPES) expect(blockOnly.has(b.id) || b.id in ITEM_DEFS, `${b.id} は アイテムでも BLOCK_ONLY_IDS でも ない`).toBe(true);
  });

  it('全アイテムの 2D の絵が ある（石の絵に 落ちるのは いしだけ）', () => {
    const stone = JSON.stringify(getTilePixels('stone'));
    expect(ITEM_TYPES.filter((t) => JSON.stringify(itemIconPixels(t.id)) === stone).map((t) => t.id)).toEqual(['stone']);
  });

  it('作り方の id が かさならない（作業台 ＋ かまど）', () => {
    const ids = ALL_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('itemDef は 登録の ない id では undefined', () => {
    // 全アイテムが 登録表に 入ったので、ない id は 書きまちがいだけ
    expect(itemDef('no_such_item')).toBeUndefined();
    expect(itemDef('zzz')).toBeUndefined();
  });

  it.each(GOLD_IDS)('%s: 名前・重ね数・置けない・レア度・分類が 今の表と同じ', (id) => {
    const e = EXPECT[id];
    expect(itemType(id)).toEqual({ id, name: e.name, maxStack: e.maxStack, placeBlock: null });
    expect(itemRarity(id)).toBe('epic');
    expect(itemCategory(id)).toBe(e.category);
    expect(CATEGORY_ITEMS[itemCategory(id)]).toContain(id);
  });

  it.each(GOLD_IDS)('%s: 説明の行が 今の表と同じ', (id) => {
    const e = EXPECT[id];
    const row = ITEM_INFO[id]!;
    expect(row.use).toBe(e.use);
    expect(row.how).toBe(e.how);
    expect(row.buttons).toEqual(e.buttons);
    expect(row.stats).toBe(e.stats);
  });

  it('ITEM_TYPES: 金の 10 個は こんごうの 9 個の すぐ前に この順で ならぶ（KONGO-1）', () => {
    expect(ITEM_TYPES.slice(-19, -9).map((t) => t.id)).toEqual([...GOLD_IDS]);
  });

  it('耐久: 金の装備 8 個は 500、きん・みみずは 耐久なし（へる 物）', () => {
    const d = W2_SETTING_DEFAULTS.toolDurability;
    for (const [id] of CRAFTS) {
      expect(d[id], id).toBe(500);
      expect(itemClassOf(id)).toBe('durable');
    }
    expect(d.kin).toBeUndefined();
    expect(d.harapan_mimizu).toBeUndefined();
    expect(itemClassOf('kin')).toBe('consumable');
    expect(itemClassOf('harapan_mimizu')).toBe('consumable');
  });

  it('防具: 部位・防ぐ量・種類が 今の表と同じ', () => {
    for (const [id, a] of Object.entries(ARMOR)) {
      expect(ARMOR_SLOT_OF[id], id).toBe(a.slot);
      expect(CRAFT_DEFAULTS.armorValue[id as GoldId], id).toEqual(a.value);
      expect(ARMOR_KIND[id], id).toBe(a.kind);
    }
    // 防具でない金は 部位を もたない
    for (const id of ['kin', 'kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'harapan_mimizu']) {
      expect(ARMOR_SLOT_OF[id], id).toBeUndefined();
      expect(CRAFT_DEFAULTS.armorValue[id as GoldId], id).toBeUndefined();
    }
  });

  it('道具の数: つるはし・おの・かたなの 強さ・レベル・たたく強さ', () => {
    const t = TOOL_DEFAULTS;
    expect(t.toolPower.kin_pickaxe).toBe(6);
    expect(t.toolPower.kin_axe).toBe(6);
    expect(t.toolLevel.kin_pickaxe).toBe(2);
    expect(t.toolLevel.kin_axe).toBe(0); // 0 も ちゃんと 入る
    expect(t.weaponDamage.kin_katana).toBe(5);
    expect(t.weaponDamage.kin_pickaxe).toBe(5);
    expect(t.weaponDamage.kin_axe).toBe(5);
    expect(t.toolPower.kin_katana).toBeUndefined();
    expect(t.toolLevel.kin_katana).toBeUndefined();
    // 金でない 行は そのまま
    expect(t.toolPower.iron_pickaxe).toBe(6);
    expect(t.weaponDamage.naginata).toBe(3);
  });

  it('刀・ゆみ: 届く長さ・軌跡・ゆみのダメージ・刀の集まり', () => {
    const w = W2_SETTING_DEFAULTS;
    expect(w.bladeReach.kin_katana).toBe(2.2);
    expect(w.bladeTrail.kin_katana).toEqual({ color: 0xf2b938, glow: 0xfff0b4, blade: 0xebb840, bladeShine: 0xfff0b4, style: 'gold', under: 0x2a2238 });
    expect(w.bowDamageByItem).toEqual({ kin_yumi: [2, 3, 5], kongo_yumi: [3, 4, 7] });
    expect(BLADE_ITEMS.has('kin_katana')).toBe(true);
    expect(BLADE_ITEMS.size).toBe(8); // KONGO-1: こんごうの かたなが ふえた
    expect(BLADE_LIKE_ITEMS.size).toBe(9);
    for (const id of ['kin_yumi', 'kin_pickaxe', 'kin_axe']) expect(BLADE_ITEMS.has(id as GoldId), id).toBe(false);
  });

  it('作業台のカードの順: 金の 8 つは toriya の すぐ後ろ、たいまつの 足し分の 前', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id);
    const from = ids.indexOf('toriya') + 1;
    expect(ids.slice(from, from + 8)).toEqual(CRAFTS.map(([id]) => id));
    expect(ids[from + 8]).toBe('kongo_katana'); // KONGO-1: 金の すぐ うしろに こんごうの 8 つ
    expect(ids[from + 16]).toBe(TORCH_COAL);
    for (const [id, inputs] of CRAFTS) {
      const r = CRAFT_RECIPES.find((x) => x.id === id)!;
      expect(r).toEqual({ id, output: { item: id, count: 1 }, inputs: inputs.map(([item, count]) => ({ item, count })), works: true, station: 'craft' });
    }
  });

  it('かまど: きん は きんの たまご から。焼く順は 今のまま', () => {
    expect(BAKE_RECIPES.map((r) => r.id)).toEqual(['iron_ingot', 'kawara', 'brick', 'haniwa', 'kin', 'momo_yaki']);
    expect(BAKE_RECIPES.find((r) => r.id === 'kin')).toEqual({ id: 'kin', output: { item: 'kin', count: 1 }, inputs: [{ item: 'kin_tamago', count: 1 }], works: true, station: 'furnace' });
    expect(ALL_RECIPES).toHaveLength(CRAFT_RECIPES.length + BAKE_RECIPES.length);
  });
});

// ---------------------------------------------------------------- 忍者・侍シリーズ（#306a 段階 3 の 1 本目）
// 期待は これまでの 表（2026-10-25 の写し JSON）から 手で 写した 値。

const NS_ARMOR = {
  ninja_zukin: { name: '［黒頭巾｜くろずきん］', slot: 'head', kind: 'ball', value: { normal: 0, ball: 2, fall: 0 }, use: 'こうげき から まもる（あたま）' },
  ninja_shozoku: { name: '［忍｜しの］び［装束｜しょうぞく］', slot: 'body', kind: 'normal', value: { normal: 2, ball: 0, fall: 0 }, use: 'こうげき から まもる（からだ）' },
  ninja_tekko: { name: '［忍｜しの］びの ［手甲｜てっこう］', slot: 'arms', kind: 'normal', value: { normal: 1, ball: 0, fall: 0 }, use: 'こうげき から まもる（うで）' },
  ninja_tabi: { name: '［忍｜しの］びの ［足袋｜たび］', slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 100000 }, use: 'こうげき から まもる（あし）' },
  samurai_jingasa: { name: '［明珍｜みょうちん］［陣笠｜じんがさ］', slot: 'head', kind: 'ball', value: { normal: 0, ball: 2, fall: 0 }, use: 'こうげき から まもる（あたま）' },
  samurai_haori: { name: '［明珍｜みょうちん］［羽織｜はおり］', slot: 'body', kind: 'normal', value: { normal: 2, ball: 0, fall: 0 }, use: 'こうげき から まもる（からだ）' },
  samurai_tekko: { name: '［明珍｜みょうちん］［手甲｜てっこう］', slot: 'arms', kind: 'normal', value: { normal: 1, ball: 0, fall: 0 }, use: 'こうげき から まもる（うで）' },
  samurai_geta: { name: '［明珍｜みょうちん］［下駄｜げた］', slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 2 }, use: 'こうげき から まもる（あし）' },
} as const;
const NS_IDS = [...NINJA_ITEM_IDS, ...SAMURAI_ITEM_IDS] as const;

describe('登録表（忍者・侍シリーズ）', () => {
  it('全 id に ItemDef・絵が ある（忍者 4・侍 4）', () => {
    expect(NINJA_ITEM_IDS).toHaveLength(4);
    expect(SAMURAI_ITEM_IDS).toHaveLength(4);
    expect(Object.keys(NS_ARMOR).sort()).toEqual([...NS_IDS].sort());
    for (const id of NINJA_ITEM_IDS) {
      expect(itemDef(id), id).toBeDefined();
      expect(isNinjaItem(id), id).toBe(true);
      expect(ninjaItemPixels(id).length, id).toBeGreaterThan(0);
    }
    for (const id of SAMURAI_ITEM_IDS) {
      expect(itemDef(id), id).toBeDefined();
      expect(isSamuraiItem(id), id).toBe(true);
      expect(samuraiItemPixels(id).length, id).toBeGreaterThan(0);
    }
  });

  it.each(NS_IDS)('%s: 名前・レア度・分類・耐久・説明・防具が 今の表と同じ', (id) => {
    const e = NS_ARMOR[id];
    expect(itemType(id)).toEqual({ id, name: e.name, maxStack: 1, placeBlock: null });
    expect(itemRarity(id)).toBe('legendary');
    expect(itemCategory(id)).toBe('armor');
    expect(CATEGORY_ITEMS.armor).toContain(id);
    expect(W2_SETTING_DEFAULTS.toolDurability[id]).toBe(10000);
    expect(itemClassOf(id)).toBe('durable');
    expect(ITEM_INFO[id]!.use).toBe(e.use);
    expect(ITEM_INFO[id]!.stats).toBe('armor');
    expect(ITEM_INFO[id]!.special).toBeTruthy();
    expect(ARMOR_SLOT_OF[id]).toBe(e.slot);
    expect(ARMOR_KIND[id]).toBe(e.kind);
    expect(CRAFT_DEFAULTS.armorValue[id]).toEqual(e.value);
    // 作れない（レシピなし）・刀でも ゆみでも 道具でもない
    expect(CRAFT_RECIPES.some((r) => r.id === id)).toBe(false);
    expect(BLADE_ITEMS.has(id)).toBe(false);
  });

  it('防ぐ量は 調整表 NINJA_TUNING の 数を 読む', () => {
    expect(CRAFT_DEFAULTS.armorValue.ninja_zukin!.ball).toBe(NINJA_TUNING.zukinBallCut);
    expect(CRAFT_DEFAULTS.armorValue.ninja_tabi!.fall).toBe(NINJA_TUNING.tabiFallCut);
    expect(CRAFT_DEFAULTS.armorValue.samurai_geta!.fall).toBe(NINJA_TUNING.getaFallCut);
  });

  it('NINJA_GEAR・SAMURAI_GEAR（部位 → id）は 登録表の armor.slot と 同じ', () => {
    for (const [gear, ids] of [[NINJA_GEAR, NINJA_ITEM_IDS], [SAMURAI_GEAR, SAMURAI_ITEM_IDS]] as const) {
      expect(Object.values(gear).sort()).toEqual([...ids].sort());
      for (const [slot, id] of Object.entries(gear)) expect(itemDef(id)!.armor!.slot, id).toBe(slot);
    }
  });

  it('ITEM_TYPES: 忍者 4・侍 4 は すねあての 次（古い表の 位置）に この順で ならぶ', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const from = ids.indexOf('suneate') + 1;
    expect(ids.slice(from, from + 8)).toEqual([...NS_IDS]);
    expect(ids[from + 8]).toBe('geyser_dirt');
  });

  it('ヌシが おとす 侍装備 4 行は 武器 3 行の あと（weight 1）', () => {
    const rows = W2_SETTING_DEFAULTS.nushiDrops;
    expect(rows.slice(-4)).toEqual(SAMURAI_ITEM_IDS.map((item) => ({ item, weight: 1 })));
  });
});

describe('登録表（レジェンダリー武器）', () => {
  it('全 id に ItemDef・絵・効果の 部品が ある（雷神剣・風神剣・虹）', () => {
    expect([...LEGEND_IDS]).toEqual(['raijin_ken', 'fujin_ken', 'niji']);
    for (const id of LEGEND_IDS) {
      expect(itemDef(id), id).toBeDefined();
      expect(itemDef(id)!.legend, id).toBeDefined();
      expect(isW7Item(id), id).toBe(true);
      expect(w7ItemPixels(id).length, `${id} の 絵が 空`).toBeGreaterThan(0);
      expect(LEGEND_FX_ITEMS.has(id), id).toBe(true);
    }
    expect(LEGEND_FX_ITEMS.size).toBe(3);
  });

  it.each(LEGEND_IDS)('%s: 名前・重ね数・レア度・分類・たいきゅう・刀の数が 今の表と同じ', (id) => {
    const NAME = { raijin_ken: '［雷神剣｜らいじんけん］', fujin_ken: '［風神剣｜ふうじんけん］', niji: '［虹｜にじ］' } as const;
    expect(itemType(id)).toEqual({ id, name: NAME[id], maxStack: 1, placeBlock: null });
    expect(itemRarity(id)).toBe('legendary');
    expect(itemCategory(id)).toBe('weapon');
    expect(W2_SETTING_DEFAULTS.toolDurability[id]).toBe(10000);
    expect(itemClassOf(id)).toBe('durable');
    expect(W2_SETTING_DEFAULTS.bladeReach[id]).toBe(2.2);
    expect(BLADE_ITEMS.has(id)).toBe(true);
    expect(ITEM_INFO[id]!.how).toBe(`${KATANA_HOW}。ながおし して はなすと ためわざ`);
    expect(ITEM_INFO[id]!.buttons).toEqual(['1-9', 'left']);
    expect(ITEM_INFO[id]!.stats).toBe('blade');
  });

  it('説明の 特別な 力と 軌跡の 色（今の表の 写し）', () => {
    expect(ITEM_INFO.raijin_ken!.special).toBe('ためて はなすと そら から かみなり が おちる');
    expect(ITEM_INFO.fujin_ken!.special).toBe('てに もつと はやく はしれる。ためて はなすと かぜ が とぶ');
    expect(ITEM_INFO.niji!.special).toBe('ためて はなすと ひかり の ドーム');
    const t = W2_SETTING_DEFAULTS.bladeTrail;
    expect(t.raijin_ken).toEqual({ color: 0xfff6c0, glow: 0xffffff, blade: 0xb070ff, bladeShine: 0xe6d2ff, style: 'thunder' });
    expect(t.fujin_ken).toEqual({ color: 0xe6f8ff, glow: 0xffffff, blade: 0xcfefff, bladeShine: 0xffffff, style: 'plain' });
    expect(t.niji).toEqual({ color: 0xd16be6, glow: 0xffffff, blade: 0xc3cee2, bladeShine: 0x5fd98e, style: 'plain' });
  });

  it('LEGENDARY_DEFAULTS は 登録表の legend から（強さ・ためわざ・効果）。順は ドロップ表の 順', () => {
    expect(LEGENDARY_DEFAULTS.map((d) => d.item)).toEqual([...LEGEND_IDS]);
    expect(LEGENDARY_DEFAULTS.map((d) => d.power)).toEqual([8, 6, [4, 10]]);
    expect(LEGENDARY_DEFAULTS.map((d) => d.charge?.kind)).toEqual(['lightning', 'spiral', 'shining']);
    expect(LEGENDARY_DEFAULTS[1]!.passive).toEqual([{ kind: 'moveMul', mul: 1.2 }]);
    expect(LEGENDARY_DEFAULTS[0]!.onAttack).toEqual([{ kind: 'trail', style: 'thunder' }]);
  });

  it('初期値は 登録表と 別の 入れ物（設定を 書きかえても 登録表・初期値は 変わらない）', () => {
    for (const d of LEGENDARY_DEFAULTS) {
      const reg = LEGEND[d.item as (typeof LEGEND_IDS)[number]].legend;
      expect(d).toEqual({ item: d.item, ...reg });
      expect(d.charge).not.toBe(reg.charge);
      expect(d.onAttack).not.toBe(reg.onAttack);
      expect(d.passive).not.toBe(reg.passive);
    }
  });

  it('ITEM_TYPES: 3 つは 金の 10 個の すぐ前（その うしろに こんごうの 9 個）。武器の 色分けは crystal_katana の 次', () => {
    expect(ITEM_TYPES.slice(-22, -19).map((t) => t.id)).toEqual([...LEGEND_IDS]);
    const w = CATEGORY_ITEMS.weapon;
    const i = w.indexOf('crystal_katana');
    expect(w.slice(i + 1, i + 4)).toEqual([...LEGEND_IDS]);
    expect(w.slice(i + 4)).toEqual(['yumi', 'ya', 'kin_katana', 'kin_yumi', 'kongo_katana', 'kongo_yumi']);
  });

  it('ヌシの ドロップ表: 先頭 3 行が レジェンダリー（weight 1）', () => {
    expect(W2_SETTING_DEFAULTS.nushiDrops.slice(0, 3)).toEqual(LEGEND_IDS.map((item) => ({ item, weight: 1 })));
  });
});

// ---------------------------------------------------------------- ふつうの 道具・武器・防具（#306 段階 3 列 A）
// 期待は これまでの 表（2026-10-25 の写し JSON）から 手で 写した 値。

type G = (typeof GEAR_IDS)[number];
const G_EXPECT: Record<G, { name: string; stack: number; rarity: string; cat: string; wear?: number; recipe: Array<[string, number]>; count?: number }> = {
  wood_pickaxe: { name: 'きの つるはし', stack: 1, rarity: 'common', cat: 'tool', wear: 59, recipe: [['log', 3]] },
  stone_pickaxe: { name: 'いしの つるはし', stack: 1, rarity: 'common', cat: 'tool', wear: 131, recipe: [['stone', 3], ['log', 2]] },
  iron_pickaxe: { name: 'てつの つるはし', stack: 1, rarity: 'rare', cat: 'tool', wear: 250, recipe: [['iron_ingot', 3], ['log', 2]] },
  wood_axe: { name: 'きの おの', stack: 1, rarity: 'common', cat: 'tool', wear: 59, recipe: [['log', 3]] },
  stone_axe: { name: 'いしの おの', stack: 1, rarity: 'common', cat: 'tool', wear: 131, recipe: [['stone', 3], ['log', 2]] },
  iron_axe: { name: 'てつの おの', stack: 1, rarity: 'rare', cat: 'tool', wear: 250, recipe: [['iron_ingot', 3], ['log', 2]] },
  fude: { name: 'ふで', stack: 1, rarity: 'uncommon', cat: 'tool', wear: 5, recipe: [['sumi', 1], ['bamboo', 2]] }, // TAKO-1
  bokuto: { name: 'ぼくとう', stack: 1, rarity: 'common', cat: 'weapon', wear: 59, recipe: [['log', 2]] },
  katana: { name: 'かたな', stack: 1, rarity: 'rare', cat: 'weapon', wear: 250, recipe: [['iron_ingot', 2], ['log', 1]] },
  naginata: { name: 'なぎなた', stack: 1, rarity: 'rare', cat: 'weapon', wear: 250, recipe: [['iron_ingot', 1], ['log', 3]] },
  crystal_katana: { name: 'きらめく カタナ', stack: 1, rarity: 'superRare', cat: 'weapon', wear: 400, recipe: [['crystal', 2], ['iron_ingot', 2], ['log', 2]] },
  yumi: { name: 'ゆみ', stack: 1, rarity: 'uncommon', cat: 'weapon', wear: 384, recipe: [['log', 3], ['string', 3]] },
  ya: { name: 'や', stack: 64, rarity: 'common', cat: 'weapon', recipe: [['log', 1], ['stone', 1], ['paper', 1]], count: 4 },
  kabuto: { name: 'かぶと', stack: 1, rarity: 'rare', cat: 'armor', wear: 165, recipe: [['iron_ingot', 2], ['cloth', 1]] },
  yoroi: { name: 'よろい', stack: 1, rarity: 'rare', cat: 'armor', wear: 240, recipe: [['iron_ingot', 3], ['string', 2], ['cloth', 2]] },
  kote: { name: 'こて', stack: 1, rarity: 'rare', cat: 'armor', wear: 225, recipe: [['iron_ingot', 1], ['cloth', 1]] },
  suneate: { name: 'すねあて', stack: 1, rarity: 'rare', cat: 'armor', wear: 195, recipe: [['iron_ingot', 2], ['string', 1]] },
};

describe('登録表（ふつうの 道具・武器・防具）', () => {
  it('全 id に ItemDef・絵が ある（17 個。id は ids.ts の 1 回だけ）', () => {
    expect(GEAR_IDS).toHaveLength(17);
    expect(Object.keys(G_EXPECT).sort()).toEqual([...GEAR_IDS].sort());
    for (const id of GEAR_IDS) {
      expect(itemDef(id), id).toBeDefined();
      if (isM4Item(id)) expect(m4ItemPixels(id).length, id).toBeGreaterThan(0); // おの 3 本の 絵は heldAxes・itemArt の 別の 場所
      expect(ITEM_INFO[id], id).toBeDefined();
    }
  });

  it.each(GEAR_IDS)('%s: 名前・重ね数・レア度・分類・耐久・作り方が 今の表と同じ', (id) => {
    const e = G_EXPECT[id];
    expect(itemType(id)).toEqual({ id, name: e.name, maxStack: e.stack, placeBlock: null });
    expect(itemRarity(id)).toBe(e.rarity);
    expect(itemCategory(id)).toBe(e.cat);
    expect(W2_SETTING_DEFAULTS.toolDurability[id]).toBe(e.wear);
    expect(itemClassOf(id)).toBe(e.wear === undefined ? 'consumable' : 'durable');
    expect(CRAFT_RECIPES.find((r) => r.id === id)).toEqual({
      id,
      output: { item: id, count: e.count ?? 1 },
      inputs: e.recipe.map(([item, count]) => ({ item, count })),
      works: true,
      station: 'craft',
    });
  });

  it('説明の行（今の表の 写し）', () => {
    expect(ITEM_INFO.wood_pickaxe).toEqual({ use: 'ブロック を はやく ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' });
    expect(ITEM_INFO.iron_axe).toEqual({ use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' });
    expect(ITEM_INFO.katana).toEqual({ use: 'ようかい を つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' });
    expect(ITEM_INFO.naginata).toEqual({
      use: 'とおく まで とどく。つく と はらう を かわりばんこ',
      how: 'えらんで、ようかい に むけて ひだりクリック（おしつづけると つづけて ふる）',
      buttons: ['1-9', 'left'],
      stats: 'blade',
    });
    expect(ITEM_INFO.yumi).toEqual({ use: 'や を とばして とおく の ようかい を たおす。や が いる', how: BOW_HOW, buttons: ['1-9', 'left'], stats: 'bow' });
    expect(ITEM_INFO.ya).toEqual({ use: 'ゆみ で とばす', how: 'もちもの に いれて おく だけ。ゆみ が つかう', buttons: [], stats: 'arrow' });
    expect(ITEM_INFO.suneate).toEqual({ use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' });
  });

  it('道具の数: ほる強さ・レベル・たたく強さ・なぎなたの 届く長さと 当たるまで・あう ブロックの なかま', () => {
    const t = TOOL_DEFAULTS;
    expect(t.toolPower).toMatchObject({ wood_pickaxe: 2, stone_pickaxe: 4, iron_pickaxe: 6, wood_axe: 2, stone_axe: 4, iron_axe: 6, kuwa: 4 });
    expect(t.toolLevel).toMatchObject({ wood_pickaxe: 0, stone_pickaxe: 1, iron_pickaxe: 2, wood_axe: 0, stone_axe: 0, iron_axe: 0 });
    expect(t.weaponDamage).toMatchObject({ bokuto: 2, katana: 4, naginata: 3, crystal_katana: 4 });
    expect(t.weaponReach).toEqual({ naginata: 5.0 });
    expect(t.weaponTicks).toEqual({ naginata: 40 });
    expect(t.toolPower.katana).toBeUndefined();
    for (const id of ['wood_axe', 'stone_axe', 'iron_axe'] as const) expect(toolFamily(id), id).toBe('log');
    for (const id of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'] as const) expect(toolFamily(id), id).toBe('stone');
    expect(toolFamily('kuwa')).toBe('dirt');
    expect(toolFamily('katana')).toBeNull();
  });

  it('刀: 届く長さ・軌跡。なぎなたは 軌跡だけ（BLADE_ITEMS に 入らず BLADE_LIKE_ITEMS に 入る）。並びは 今のまま', () => {
    const w = W2_SETTING_DEFAULTS;
    expect(w.bladeReach).toEqual({ bokuto: 2.2, katana: 2.2, crystal_katana: 2.2, raijin_ken: 2.2, fujin_ken: 2.2, niji: 2.2, kin_katana: 2.2, kongo_katana: 2.2 });
    expect(w.bladeTrail.bokuto).toEqual({ color: 0x9c6b3a, glow: 0xe8c08a, blade: 0xb98b54, bladeShine: 0xe0bc86, style: 'plain' });
    expect(w.bladeTrail.katana).toEqual({ color: 0xe8f1fa, glow: 0xffffff, blade: 0xc8cdd8, bladeShine: 0xffffff, style: 'plain' });
    expect(w.bladeTrail.crystal_katana).toEqual({ color: 0x7fdcff, glow: 0xe6faff, blade: 0x6fcdf5, bladeShine: 0xe6faff, style: 'star' });
    expect(w.bladeTrail.naginata).toEqual({ color: 0xcfe8ff, glow: 0xffffff, blade: 0xb8cce0, bladeShine: 0xeef6ff, style: 'long' });
    expect(w.bladeReach.naginata).toBeUndefined();
    expect([...BLADE_ITEMS]).toEqual(['bokuto', 'katana', 'crystal_katana', 'raijin_ken', 'fujin_ken', 'niji', 'kin_katana', 'kongo_katana']);
    expect([...BLADE_LIKE_ITEMS]).toEqual([...BLADE_ITEMS, 'naginata']);
    // ゆみ は 設定 bowDamage（ゆみごとの 上書きは なし）
    expect(w.bowDamageByItem.yumi).toBeUndefined();
  });

  it('防具: 部位・防ぐ量・種類が 今の表と同じ', () => {
    const A = {
      kabuto: ['head', 'ball', { normal: 0, ball: 2, fall: 0 }],
      yoroi: ['body', 'normal', { normal: 2, ball: 0, fall: 0 }],
      kote: ['arms', 'normal', { normal: 1, ball: 0, fall: 0 }],
      suneate: ['legs', 'fall', { normal: 0, ball: 0, fall: 2 }],
    } as const;
    for (const [id, [slot, kind, value]] of Object.entries(A)) {
      expect(ARMOR_SLOT_OF[id], id).toBe(slot);
      expect(ARMOR_KIND[id], id).toBe(kind);
      expect(CRAFT_DEFAULTS.armorValue[id as 'kabuto'], id).toEqual(value);
    }
  });

  it('ITEM_TYPES: つるはし・おの 6 → てつの かたまり → 刀 4・ゆみ・や・防具 4 → 忍者 4・侍 4 の 順', () => {
    const ids = ITEM_TYPES.map((t) => t.id as string);
    const i = ids.indexOf('wood_pickaxe');
    expect(ids.slice(i, i + 18)).toEqual([...TOOL_ITEM_IDS, 'iron_ingot', ...SWORD_IDS, ...BOW_IDS, ...ARMOR_ITEM_IDS]);
    expect(ids.slice(i + 18, i + 26)).toEqual([...NINJA_ITEM_IDS, ...SAMURAI_ITEM_IDS]);
  });

  it('色分け: 道具は くわの 前、武器は 刀 4 → レジェンダリー 3 → ゆみ・や → 金、防具は 忍者・侍・金の 前', () => {
    expect(CATEGORY_ITEMS.tool.slice(0, 8)).toEqual([...TOOL_ITEM_IDS, 'kuwa']);
    expect(CATEGORY_ITEMS.weapon).toEqual([...SWORD_IDS, ...LEGEND_IDS, ...BOW_IDS, 'kin_katana', 'kin_yumi', 'kongo_katana', 'kongo_yumi']);
    expect(CATEGORY_ITEMS.armor.slice(0, 5)).toEqual([...ARMOR_ITEM_IDS, 'ninja_zukin']);
  });

  it('作業台のカードの順: つるはし・おの 6 → かまど → 刀 4・ゆみ・や・防具 4 → たいまつ', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id);
    expect(ids.slice(0, 18)).toEqual([...TOOL_ITEM_IDS, 'furnace', ...SWORD_IDS, ...BOW_IDS, ...ARMOR_ITEM_IDS]);
    expect(ids[18]).toBe('torch');
  });
});

// ---------------------------------------------------------------- 設定の 複製は 登録表と 別の 入れ物

/** 入れ子の 中の 数を ぜんぶ 書きかえ、配列には 足し、オブジェクトには 足す（関数は 触らない） */
function scribble(v: unknown, seen = new WeakSet<object>()): void {
  if (v === null || typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] === 'number') v[i] = (v[i] as number) + 1000;
      else scribble(v[i], seen);
    }
    v.push(-1);
    return;
  }
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'number') o[k] = (o[k] as number) + 1000;
    else scribble(o[k], seen);
  }
  o.__scribble = 1;
}

describe('設定の 複製と 登録表', () => {
  it('createW2Settings・createCraftConfig・createToolConfig の 複製を 書きかえても、登録表と 次の 複製は 変わらない', () => {
    const snap = () => JSON.stringify({ defs: ITEM_DEFS, w2: createW2Settings(), craft: createCraftConfig(), tool: createToolConfig(), m7: createM7Settings(), live: createLiveSettings(), heal: [registryHeal('egg'), registryHeal('momo_yaki')] });
    const before = snap();
    const w2 = createW2Settings();
    const craft = createCraftConfig();
    const tool = createToolConfig();
    const m7 = createM7Settings();
    const live = createLiveSettings();
    scribble(w2);
    scribble(craft);
    scribble(tool);
    scribble(m7);
    scribble(live);
    // 書きかえが 効いている（入れ子の armorValue・bladeTrail・bladeReach・toolLevel も）
    expect(craft.armorValue.kabuto!.ball).toBe(1002);
    expect(w2.bladeTrail.katana!.style).toBe('plain');
    expect((w2.bladeTrail.katana as unknown as Record<string, unknown>).__scribble).toBe(1);
    expect(w2.bladeReach.katana).toBe(1002.2);
    expect(tool.toolLevel.iron_pickaxe).toBe(1002);
    expect(m7.farmCanCapacity.watering_can).toBe(1010);
    expect(m7.farmCanTiles.long_watering_can).toBe(1002);
    expect(live.meatHeal).toBe(1010);
    expect(snap()).toBe(before);
    // 初期値の 表そのものも 変わらない
    expect(CRAFT_DEFAULTS.armorValue.kabuto).toEqual({ normal: 0, ball: 2, fall: 0 });
    expect(W2_SETTING_DEFAULTS.bladeReach.katana).toBe(2.2);
    expect(TOOL_DEFAULTS.toolLevel.iron_pickaxe).toBe(2);
    expect(M7_SETTING_DEFAULTS.farmCanCapacity).toEqual({ watering_can: 10, long_watering_can: 20 });
    expect(M7_SETTING_DEFAULTS.farmCanTiles).toEqual({ watering_can: 1, long_watering_can: 2 });
    expect(LIVE_SETTING_DEFAULTS.meatHeal).toBe(10);
    expect(LIVE_SETTING_DEFAULTS.animalEggHeal).toBe(2);
  });
});
