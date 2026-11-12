// HOUSE-2C（#364・仕様 3.4 版 docs/design/HOUSE-2.md §2.6）「つくる」で 作る 家の 物の 作り方。DOM・three なし。
// 材料の 数は ここに 書かない: エディターが 使う 1 か所の 表（しゅるいの 材料 house/recipes/mats.ts・家具 house/editor/furniture.ts・手で つくる とき HAND_MATS）から
// 計算する（エディターの 表を かえると「つくる」も かわる）。材料が 半分・4 分の 1 の 物は 1 回で 2 こ・4 こ できる。
// 作り方の id ＝ できる アイテムの id。1 版の 13 は はじめから、レシピで ふえる 物は その レシピ（recipes.learned）を おぼえた あとだけ（gate）。
import type { ItemId, Recipe } from '../contracts';
import { HOUSE_BLOCK_IDS } from '../world/blocks/houseBlocks';
import { HOUSE_FURNITURE_IDS } from '../content/items/ids';
import { FURN_ORDER, FURNITURE, type FurnKind } from '../house/editor/furniture';
import { needOf, type NeedShape } from '../house/editor/model';
import { HAND_MATS } from '../house/recipes/mats';
import { LIGHT_DEFAULT, isStyleless, kindItem, type LookPart } from '../house/recipes/kinds';
import { RECIPE_IDS, recipeLooks, recipeOfFurniture, type RecipeId } from '../house/recipes/table';

/** 材料を 計算する ときの もとの 家（ふつうの 大きさ。かべ き・やね たいら・まど しょうじ 4 つ・と いえの と・あかり ちょうちん） */
const BASE: NeedShape = { w: 5, d: 5, windows: 4, furniture: [], roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: LIGHT_DEFAULT };
/** 家具の 材料の 行（アイテム → 数） */
type Mats = Map<ItemId, number>;

const matsOf = (over: Partial<NeedShape>): Mats => new Map(needOf({ ...BASE, ...over }, () => 0).map((r) => [r.item, r.need]));
/** 2 つの 形の ちがい（over − base。ふえた 物だけ） */
function delta(over: Partial<NeedShape>, base: Partial<NeedShape> = {}): Mats {
  const a = matsOf(over);
  const b = matsOf(base);
  const out: Mats = new Map();
  for (const [k, v] of a) if (v - (b.get(k) ?? 0) > 0) out.set(k, v - (b.get(k) ?? 0));
  return out;
}

/** 外まわり 1 周（P）＝ ふつうの かべの き の 数。窓の 数（N）。しゃちほこは 1 つの 家に 2 ひき（仕様 §4.1。エディターは 2 ひきで きん 2） */
const P = matsOf({}).get('log')!;
const N = BASE.windows;
const SHACHI_PIECES = 2;
const HANADAN = 'hanadan';

/** 1 マス（窓・1 こ・1 ひき）ぶんの 量 perUnit ÷ units から 「1 回」の 作り方を 作る。1 より 小さい 物は 1 回で 1 ÷ q こ できる（さんかく 2・きん 4） */
function recipeOf(item: ItemId, perUnit: Mats, units: number, station: Recipe['station'] = 'craft'): Recipe {
  const qs = [...perUnit].map(([i, n]) => ({ item: i, q: n / units }));
  const out = Math.max(1, ...qs.map((x) => Math.round(1 / x.q)));
  return { id: item, output: { item, count: out }, inputs: qs.map((x) => ({ item: x.item, count: x.q * out })), works: true, station };
}
const fixedRecipe = (item: ItemId, inputs: ReadonlyArray<{ item: ItemId; count: number }>, station: Recipe['station'] = 'craft'): Recipe => ({
  id: item,
  output: { item, count: 1 },
  inputs: inputs.map((i) => ({ ...i })),
  works: true,
  station,
});

/** 1 版の 家の ブロック 5（ゆか・かべ・やね・しょうじ・と）の 作り方。1 マス ぶん・手で つくる とき（id ごとの 表。足し忘れは 型で 落ちる） */
const BLOCK_RECIPE = {
  // いし ＝ ゆかの 1 マスぶん（エディターは いし w×d）
  house_floor: () => recipeOf('house_floor', new Map([['stone' as ItemId, matsOf({}).get('stone' as ItemId)!]]), BASE.w * BASE.d),
  house_wall: () => recipeOf('house_wall', new Map([['log' as ItemId, P]]), P),
  house_roof: () => fixedRecipe('house_roof', [HAND_MATS.house_roof]),
  shoji: () => recipeOf('shoji', delta({}, { windowKind: 'none' }), N),
  house_door: () => fixedRecipe('house_door', [HAND_MATS.house_door]),
} satisfies Record<(typeof HOUSE_BLOCK_IDS)[number], () => Recipe>;
const blockRecipe = (item: (typeof HOUSE_BLOCK_IDS)[number]): Recipe => BLOCK_RECIPE[item]();

/** 1 版の 家具 8（まねきねこ は のぞく。エディターの ② の 順）。材料は 家具の 表の 1 こ ぶん */
const FIRST_FURNITURE: readonly FurnKind[] = FURN_ORDER.filter((k) => (HOUSE_FURNITURE_IDS as readonly string[]).includes(k) && recipeOfFurniture(k) === null);

/** レシピで ふえる 物 1 つの 作り方 */
function gatedRecipe(part: LookPart, kind: string): Recipe | null {
  const item = kindItem(part, kind);
  if (item === null) return null;
  switch (part) {
    case 'roof': return recipeOf(item, delta({ roof: kind as never }, { roof: 'flat' }), P);
    case 'wall': return recipeOf(item, delta({ wall: kind as never }, { wall: 'ki' }), P);
    case 'window': return recipeOf(item, delta({ windowKind: kind as never }, { windowKind: 'none' }), N);
    case 'door': return recipeOf(item, delta({ door: kind as never }, { door: 'ie' }), 1);
    case 'deco': {
      const units = kind.startsWith(HANADAN) ? N : isStyleless(kind) ? SHACHI_PIECES : 1;
      return recipeOf(item, delta({ deco: [kind] as never }), units);
    }
    case 'light': return recipeOf(item, delta({ light: kind as never }, { light: LIGHT_DEFAULT }), 1);
    default: return part satisfies never;
  }
}

/** 作り方の id → その 作り方を 使える ように する レシピ（null ＝ はじめから） */
const GATE = new Map<string, RecipeId | null>();
const craft: Recipe[] = [];
for (const id of HOUSE_BLOCK_IDS) {
  craft.push(blockRecipe(id));
  GATE.set(id, null);
}
for (const k of FIRST_FURNITURE) {
  craft.push(fixedRecipe(k, FURNITURE[k].mats.map(([item, count]) => ({ item, count }))));
  GATE.set(k, null);
}
for (const id of RECIPE_IDS) {
  for (const { part, kind } of recipeLooks(id)) {
    const r = gatedRecipe(part, kind);
    if (r) {
      craft.push(r);
      GATE.set(r.id, id);
    }
  }
}
/** つくる の 家の 物（1 版 13 → レシピで ふえる 物。CRAFT_RECIPES の いちばん うしろ） */
export const HOUSE_CRAFT_RECIPES: readonly Recipe[] = craft;

/** やく の 家の 物（まねきねこ。はにわと 同じ かまど・ねんりょう 1・60 ステップ。レシピを おぼえるまで やけない） */
export const HOUSE_BAKE_RECIPES: readonly Recipe[] = ((): Recipe[] => {
  const gate = recipeOfFurniture('maneki');
  if (gate === null) throw new Error('まねきねこの レシピが 表に ない（house/recipes/table.ts）');
  GATE.set('maneki', gate);
  return [fixedRecipe('maneki', FURNITURE.maneki.mats.map(([item, count]) => ({ item, count })), 'furnace')];
})();

/** その 作り方が 今 使えるか（learned ＝ おぼえた レシピの id） */
export function houseUnlocked(recipeId: string, learned: readonly string[]): boolean {
  const g = GATE.get(recipeId);
  return g === undefined || g === null || learned.includes(g);
}
