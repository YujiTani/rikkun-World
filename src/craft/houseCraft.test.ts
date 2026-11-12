import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { BAKE_RECIPE_NAMES, CRAFT_RECIPE_NAMES } from '../achievements/defs';
import { FURNITURE } from '../house/editor/furniture';
import { FLOWER_IDS } from '../house/recipes/mats';
import { RECIPE_IDS, type RecipeId } from '../house/recipes/table';
import {
  craftRig, firstVersionItems, firstVersionWant, gatedCraftItems, gatedWant, maneki, styledForms, unstyledItems, withoutFlowerRow,
  type CraftRig, type Need, type Want,
} from '../house/recipes/craftKit';
import { BAKE_RECIPES, CRAFT_RECIPES } from './recipes';

/**
 * HOUSE-2C AC16・AC17（仕様 3.4 版 §2.6・§6.2）: 「つくる」で 家の 物を 作る。**材料の 数は テストに 書かない**: エディターの 表
 * （しゅるいの 材料の 表 recipes/mats.ts・家具の 表 editor/furniture.ts・「手で つくる とき」HAND_MATS）から 計算して くらべる（craftKit.ts）。
 * 窓口の 名前は src/house/recipes/craftKit.ts の「2C の 約束」。カードの 出方・案の ボタンは src/ui/craftHouseCards.test.ts。
 */

const rig = craftRig;
type Rig = CraftRig;

const recipeOf = (id: string) => CRAFT_RECIPES.find((r) => r.id === id);
const norm = (xs: readonly Need[]): string => JSON.stringify([...xs].map((x) => [x.item, x.count]).sort());
const give = (r: Rig, xs: readonly Need[], times = 1): void => {
  for (const x of xs) r.inv.add(x.item, x.count * times);
};
/** 持ち物の 中身（アイテム → 数） */
const bag = (r: Rig): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of r.inv.slots()) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
  return out;
};
const ALL_LEARNED: string[] = [...RECIPE_IDS];

describe('AC16: つくる（1 版の 物。レシピを 1 つも おぼえて いなくても 作れる）', () => {
  it('1 版の 13（家の ブロック 5・家具 8）の 作り方が 作り方の 一覧に あり、材料と できる 数は エディターの 表から 計算した とおり', () => {
    const items = firstVersionItems();
    expect(items.length, '表から 数えた 1 版の 物').toBeGreaterThan(0);
    for (const item of items) {
      const r = recipeOf(item);
      expect(r, `${item} の 作り方`).toBeDefined();
      expect(r!.output.item, `${item} が できる`).toBe(item);
      const want: Want = firstVersionWant(item);
      expect(r!.output.count, `${item} の できる 数`).toBe(want.out);
      expect(norm(r!.inputs), `${item} の 材料`).toBe(norm(want.inputs));
      expect(r!.station, `${item} の 台`).toBe('craft');
    }
  });

  it('レシピを 1 つも おぼえて いなくても 解禁（unlocked）・1 回 ぶんの 材料で make → ok・材料が へり・その 物が ふえる', () => {
    for (const item of firstVersionItems()) {
      const r = rig([]);
      const want = firstVersionWant(item);
      expect(r.craft.unlocked(item), `${item} は はじめから`).toBe(true);
      expect(r.craft.make(item).ok, `${item}: 材料 なしでは 作れない`).toBe(false);
      give(r, want.inputs);
      const res = r.craft.make(item);
      expect(res.ok, `${item} を 作る（${res.reason}）`).toBe(true);
      expect(r.inv.count(item), `${item} が ふえる`).toBe(want.out);
      for (const x of want.inputs) expect(r.inv.count(x.item), `${item}: ${x.item} が へる`).toBe(0);
    }
  });

  it('材料が 1 回 ぶんに 1 こ たりない と 作れない（持ち物 そのまま）', () => {
    for (const item of firstVersionItems()) {
      const r = rig([]);
      const want = firstVersionWant(item);
      give(r, want.inputs);
      r.inv.remove(want.inputs[0]!.item, 1);
      const before = bag(r);
      expect(r.craft.make(item).ok, item).toBe(false);
      expect(bag(r), `${item}: 持ち物 そのまま`).toEqual(before);
    }
  });
});

describe('AC17: つくる（レシピの 物）', () => {
  /** 材料を ぜんぶ 持つ（作り方の 表の ぜんぶの 材料を 多めに）＋ まきもの。レシピは まだ おぼえて いない */
  function richUnlearned(): Rig {
    const r = rig([]);
    for (const x of [...CRAFT_RECIPES, ...BAKE_RECIPES].flatMap((c) => c.inputs)) r.inv.add(x.item, 99);
    r.inv.add('recipe_scroll' as ItemId, 5);
    return r;
  }

  it('おぼえて いない 世界: 材料を ぜんぶ 持ち・まきものを 持って いても、レシピの 物は 作れない（ok: false・持ち物 そのまま）', () => {
    const r = richUnlearned();
    const gated = [...gatedCraftItems().map((g) => g.item), ...unstyledItems()];
    expect(gated.length).toBeGreaterThan(0);
    const before = bag(r);
    for (const item of gated) {
      expect(r.craft.unlocked(item), `${item}: まだ`).toBe(false);
      expect(r.craft.make(item).ok, `${item} を 作る`).toBe(false);
    }
    expect(bag(r), '持ち物 不変').toEqual(before);
  });

  it('やく: まねきねこ も おぼえるまで やけない（持ち物・かまど そのまま）', () => {
    const r = richUnlearned();
    r.inv.add('coal_ore', 3);
    const before = bag(r);
    expect(r.craft.unlocked(maneki().item)).toBe(false);
    expect(r.craft.bake(maneki().item, 3, 5, 3).ok).toBe(false);
    expect(bag(r)).toEqual(before);
  });

  it('案の ある 形: おぼえた あとは 3 案 それぞれ make で その 案の アイテムが できる・材料の へり方は 3 案 同じ（表から 計算）・できる 数は 1 ÷（1 マス ぶん）', () => {
    for (const f of styledForms()) {
      const want = gatedWant(f.part, f.form);
      const used: string[] = [];
      for (const item of f.items) {
        const r = rig(ALL_LEARNED);
        const rec = recipeOf(item);
        expect(rec, `${item} の 作り方`).toBeDefined();
        expect(rec!.output.count, `${item} の できる 数`).toBe(want.out);
        expect(norm(withoutFlowerRow({ inputs: rec!.inputs, out: 1 })), `${item} の 材料`).toBe(norm(withoutFlowerRow(want)));
        expect(r.craft.unlocked(item), `${item}: おぼえた`).toBe(true);
        give(r, want.inputs);
        const before = bag(r);
        const res = r.craft.make(item);
        expect(res.ok, `${item} を 作る（${res.reason}）`).toBe(true);
        const after = bag(r);
        expect(after[item], `${item} が できる 数`).toBe(want.out);
        const spent: Record<string, number> = {};
        for (const k of Object.keys(before)) if (k !== item) spent[k] = (before[k] ?? 0) - (after[k] ?? 0);
        used.push(JSON.stringify(Object.entries(spent).filter(([, n]) => n !== 0).sort()));
        for (const x of withoutFlowerRow(want)) expect(r.inv.count(x.item), `${item}: ${x.item}`).toBe(0);
      }
      expect(new Set(used).size, `${f.part}-${f.form}: 3 案の 材料の へり方が 同じ`).toBe(1);
    }
  });

  it('1 つの レシピだけ おぼえた とき: その レシピの 形 だけ 作れる（ほかの レシピの 形は まだ）', () => {
    const pairs = gatedCraftItems();
    const target = pairs[0]!.recipe;
    const r = richUnlearned();
    r.known.ids = [target];
    for (const g of pairs) expect(r.craft.unlocked(g.item), `${g.item}（${g.recipe}）`).toBe(g.recipe === target);
  });

  it('しゃちほこ・あかり 2: おぼえた あとは 作れて 1 こ ふえる（できる 数・材料は 表から）', () => {
    for (const item of unstyledItems()) {
      const kind = item.replace(/^(deco|light)_/, '');
      const part = item.startsWith('light_') ? 'light' : 'deco';
      const want = gatedWant(part, kind);
      const r = rig(ALL_LEARNED);
      const rec = recipeOf(item);
      expect(rec, `${item} の 作り方`).toBeDefined();
      expect(rec!.output.count).toBe(want.out);
      expect(norm(rec!.inputs)).toBe(norm(want.inputs));
      give(r, want.inputs);
      expect(r.craft.make(item).ok, item).toBe(true);
      expect(r.inv.count(item)).toBe(want.out);
    }
  });

  it('まねきねこ: つくる には 無く、やく の 作り方に ある（材料は 家具の 表・ねんりょう 1・60 ステップ）。おぼえると やける', () => {
    const { item } = maneki();
    expect(CRAFT_RECIPES.some((c) => c.output.item === item), 'つくる には ない').toBe(false);
    const rec = BAKE_RECIPES.find((c) => c.id === item);
    expect(rec, 'やく の 作り方').toBeDefined();
    expect(rec!.station).toBe('furnace');
    expect(norm(rec!.inputs)).toBe(norm(FURNITURE.maneki.mats.map(([i, n]) => ({ item: i, count: n }))));
    const r = rig(ALL_LEARNED);
    for (const x of rec!.inputs) r.inv.add(x.item, x.count);
    r.inv.add('coal_ore', 1);
    expect(r.craft.bake(item, 3, 5, 3).ok).toBe(true);
    expect(r.inv.count('coal_ore'), 'ねんりょう 1 こ').toBe(0);
    r.step(59);
    expect(r.inv.count(item), '59 ステップでは まだ').toBe(0);
    r.step(1);
    expect(r.inv.count(item), '60 ステップで 1 こ').toBe(1);
  });

  it('はなだん: はな 3 いろの 合計で 作れる（きいろ → オレンジ → ピンクの 順に へる）', () => {
    const [y, o, p] = FLOWER_IDS;
    const item = styledForms().find((f) => f.form === 'hanadan')!.items[0]!;
    const want = gatedWant('deco', 'hanadan');
    const rest = withoutFlowerRow(want);
    const flowersNeeded = want.inputs.filter((i) => !rest.includes(i)).reduce((n, i) => n + i.count, 0);
    expect(flowersNeeded, 'はなは 1 回 ぶん 1 こ以上').toBeGreaterThan(0);
    // どれか 1 いろ だけでも 作れる
    for (const color of [y!, o!, p!]) {
      const r = rig(ALL_LEARNED);
      give(r, rest);
      r.inv.add(color, flowersNeeded);
      expect(r.craft.make(item).ok, `${color} だけで`).toBe(true);
      expect(r.inv.count(color), `${color} が へる`).toBe(0);
    }
    // へる 順: きいろ → オレンジ → ピンク（3 いろ 1 こずつ 持つ ＋ 1 回 ぶんが 1 こ なら きいろから）
    const r = rig(ALL_LEARNED);
    give(r, rest);
    r.inv.add(y!, flowersNeeded);
    r.inv.add(o!, flowersNeeded);
    r.inv.add(p!, flowersNeeded);
    expect(r.craft.make(item).ok).toBe(true);
    expect([r.inv.count(y!), r.inv.count(o!), r.inv.count(p!)], 'きいろ から へる').toEqual([0, flowersNeeded, flowersNeeded]);
    give(r, rest);
    expect(r.craft.make(item).ok).toBe(true);
    expect([r.inv.count(y!), r.inv.count(o!), r.inv.count(p!)], '次は オレンジ').toEqual([0, 0, flowersNeeded]);
  });

  it('実績: 家の 作り方は 「ぜんぶ つくった」（CRAFT_RECIPE_NAMES）にも やく 表にも 入らない', () => {
    const house = new Set<string>([...firstVersionItems(), ...gatedCraftItems().map((g) => g.item), ...unstyledItems(), maneki().item]);
    for (const [id] of [...CRAFT_RECIPE_NAMES, ...BAKE_RECIPE_NAMES]) expect(house.has(id), `${id} は 家の 作り方`).toBe(false);
  });

  it('おぼえた レシピの 数は 表（RECIPE_IDS）から: まきものの 後ろの 文字は 作る 物では ない', () => {
    const craftable: RecipeId[] = [...new Set(gatedCraftItems().map((g) => g.recipe))];
    expect(craftable.length).toBeGreaterThan(0);
    for (const id of craftable) expect(RECIPE_IDS).toContain(id);
  });
});
