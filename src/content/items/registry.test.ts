import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { ARMOR_SLOT_OF, CRAFT_DEFAULTS, NINJA_GEAR, SAMURAI_GEAR } from '../../craft/config';
import { ARMOR_KIND, ITEM_INFO } from '../../craft/info/table';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES, TORCH_COAL } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { TOOL_DEFAULTS } from '../../tools/config';
import { BLADE_ITEMS, BLADE_LIKE_ITEMS } from '../../tools/bladeSets';
import { itemClassOf } from '../../tools/durability';
import { CATEGORY_ITEMS, itemCategory } from '../../ui/itemCategory';
import { goldItemPixels, isGoldItem } from '../../ui/itemArtGold';
import { isNinjaItem, ninjaItemPixels } from '../../ui/itemArtNinja';
import { isSamuraiItem, samuraiItemPixels } from '../../ui/itemArtSamurai';
import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { GOLD_IDS, NINJA_ITEM_IDS, SAMURAI_ITEM_IDS, type GoldId } from './ids';
import { ITEM_DEFS, REGISTRY_OVERLAPS, itemDef } from './registry';

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

describe('登録表（金シリーズ）', () => {
  it('金の全 id に ItemDef がある（10 個・id は ids.ts の 1 回だけ）', () => {
    expect(GOLD_IDS).toHaveLength(10);
    for (const id of GOLD_IDS) expect(itemDef(id), id).toBeDefined();
    expect(Object.keys(ITEM_DEFS).sort()).toEqual([...GOLD_IDS, ...NINJA_ITEM_IDS, ...SAMURAI_ITEM_IDS].sort());
    expect(Object.keys(EXPECT).sort()).toEqual([...GOLD_IDS].sort());
  });

  it('足し忘れ防止: 登録表の 全 id が ITEM_TYPES・説明・2D の絵を もつ', () => {
    const types = new Set(ITEM_TYPES.map((t) => t.id as string));
    for (const id of Object.keys(ITEM_DEFS)) {
      expect(types.has(id), `${id} が ITEM_TYPES に無い`).toBe(true);
      expect(ITEM_INFO[id], `${id} の 説明が 無い`).toBeDefined();
    }
    for (const id of GOLD_IDS) {
      expect(isGoldItem(id), id).toBe(true);
      expect(goldItemPixels(id).length, `${id} の 絵が 空`).toBeGreaterThan(0);
    }
    // 同じ id が 2 つの シリーズに 入らない（ITEM_TYPES に 重ならない）
    expect(new Set(ITEM_TYPES.map((t) => t.id)).size).toBe(ITEM_TYPES.length);
  });

  it('うつしかえ: 登録表の id が 古い表にも 書いてあったら 落ちる（片方を 消す）', () => {
    // 合わせる側の 古い表（ITEM_TYPES・ITEM_ONLY_RARITY・CATEGORY_ITEMS・ITEM_INFO・ARMOR_KIND・ARMOR_SLOT_OF・
    // armorValue・toolPower/Level・weaponDamage・bladeReach・toolDurability・bladeTrail・PERMANENT・BLADE_ITEMS・レシピ）が
    // 組み立てるときに 重なりを REGISTRY_OVERLAPS に 記録する
    expect(REGISTRY_OVERLAPS).toEqual([]);
  });

  it('itemDef は 登録の ない id では undefined', () => {
    expect(itemDef('katana')).toBeUndefined();
    expect(itemDef('kin_tamago')).toBeUndefined();
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

  it('ITEM_TYPES: 金の 10 個は 末尾に この順で ならぶ', () => {
    expect(ITEM_TYPES.slice(-10).map((t) => t.id)).toEqual([...GOLD_IDS]);
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
    expect(w.bowDamageByItem).toEqual({ kin_yumi: [2, 3, 5] });
    expect(BLADE_ITEMS.has('kin_katana')).toBe(true);
    expect(BLADE_ITEMS.size).toBe(7);
    expect(BLADE_LIKE_ITEMS.size).toBe(8);
    for (const id of ['kin_yumi', 'kin_pickaxe', 'kin_axe']) expect(BLADE_ITEMS.has(id as GoldId), id).toBe(false);
  });

  it('作業台のカードの順: 金の 8 つは toriya の すぐ後ろ、たいまつの 足し分の 前', () => {
    const ids = CRAFT_RECIPES.map((r) => r.id);
    const from = ids.indexOf('toriya') + 1;
    expect(ids.slice(from, from + 8)).toEqual(CRAFTS.map(([id]) => id));
    expect(ids[from + 8]).toBe(TORCH_COAL);
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
