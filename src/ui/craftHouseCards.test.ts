import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { BAKE_RECIPES, CRAFT_RECIPES } from '../craft/recipes';
import { RECIPE_IDS } from '../house/recipes/table';
import {
  craftRig, craftViewCards, firstVersionItems, firstVersionWant, gatedCraftItems, gatedWant, loadCraftLooks, maneki, styledForms, unstyledItems,
  type CraftLooksMod,
} from '../house/recipes/craftKit';

/**
 * HOUSE-2C AC16・AC17・AC17b（仕様 3.4 版 §2.6・§3.5・§6.2）: 「つくる」の カード（`craft.ui().tiles` の もと ＝ craftViewCards）と 案の ボタン（CraftLooks）。
 * カードの 数・案の 数・材料の 数は テストに 書かない（表から 数える。#311）。窓口の 名前は src/house/recipes/craftKit.ts の「2C の 約束」。
 * 本物の 画面（クリック・スクロール）は e2e/house2c.spec.ts（通し 1 本）と e2e/ui-gate.spec.ts（'craft-house'・'duo-inv-craft-house'）。
 */

const ALL_LEARNED: string[] = [...RECIPE_IDS];
const FIRST = firstVersionItems();
/** カードに なる 物の id（案の ある 形は むらの 作り方の id）。ならびは §4.1 の 表の 順 */
const GATED_CARDS: ItemId[] = (() => {
  const styled = new Map(styledForms().flatMap((f) => f.items.map((i) => [i, f.items[0]!] as const)));
  const seen: ItemId[] = [];
  for (const g of gatedCraftItems()) {
    const card = styled.get(g.item) ?? g.item;
    if (!seen.includes(card)) seen.push(card);
  }
  return seen;
})();
const ALL_HOUSE: Set<string> = new Set<string>([...FIRST, ...gatedCraftItems().map((g) => g.item), ...unstyledItems(), maneki().item]);
const isHouse = (id: string): boolean => ALL_HOUSE.has(id);

/** 作り方の 表の ぜんぶの 材料を 1 こずつ 持つ（カードが ぜんぶ 出る） */
function richBag(r: ReturnType<typeof craftRig>, n = 1): void {
  for (const x of [...CRAFT_RECIPES, ...BAKE_RECIPES].flatMap((c) => c.inputs)) r.inv.add(x.item, Math.max(n, x.count));
}
const ids = (cards: readonly { id: string }[]): string[] => cards.map((c) => c.id);

describe('AC16: 1 版の 物は おぼえて いなくても カードが 出る（材料を 1 しゅるい 持つと。0 しゅるいなら 出ない）', () => {
  it('レシピを 1 つも おぼえて いない 世界', () => {
    for (const item of FIRST) {
      const r = craftRig([]);
      expect(ids(craftViewCards(r.view, r.inv)), `${item}: 材料 なしでは 出ない`).not.toContain(item);
      const first = firstVersionWant(item).inputs[0]!;
      r.inv.add(first.item, 1);
      expect(ids(craftViewCards(r.view, r.inv)), `${item}: ${first.item} を 1 こ 持つと 出る`).toContain(item);
    }
  });
});

describe('AC17: レシピの 物は おぼえるまで カードに 出ない', () => {
  it('おぼえて いない・材料も まきものも ある: 出ない', () => {
    const r = craftRig([]);
    richBag(r);
    r.inv.add('recipe_scroll' as ItemId, 3);
    const cards = ids(craftViewCards(r.view, r.inv));
    expect(cards.length, '1 版の 物は 出ている').toBeGreaterThan(0);
    for (const id of ALL_HOUSE) if (!FIRST.includes(id as ItemId)) expect(cards, `${id} は まだ 出ない`).not.toContain(id);
  });

  it('おぼえた あと: 案の ある 形は カード 1 まい（id ＝ むらの 作り方）・おしろ・こうざんの カードは 出ない。しゃちほこ・あかり 2 は 1 まい。まねきねこ は つくる に 出ない', () => {
    const r = craftRig(ALL_LEARNED);
    richBag(r);
    const cards = ids(craftViewCards(r.view, r.inv));
    for (const f of styledForms()) {
      expect(cards.filter((c) => f.items.includes(c as ItemId)), `${f.part}-${f.form}`).toEqual([f.items[0]]);
    }
    for (const item of unstyledItems()) expect(cards.filter((c) => c === item), item).toHaveLength(1);
    expect(cards, 'まねきねこ は やく').not.toContain(maneki().item);
  });

  it('1 つの レシピ だけ おぼえた とき: その 形の カード だけ 出る', () => {
    const target = gatedCraftItems()[0]!.recipe;
    const r = craftRig([target]);
    richBag(r);
    const cards = ids(craftViewCards(r.view, r.inv));
    const want = new Set(gatedCraftItems().filter((g) => g.recipe === target).map((g) => g.item));
    for (const g of gatedCraftItems()) {
      const shown = cards.includes(g.item);
      // 案の ある 形は むらの カードだけ 出る
      const isMura = styledForms().every((f) => !f.items.includes(g.item) || f.items[0] === g.item);
      expect(shown, `${g.item}（${g.recipe}）`).toBe(want.has(g.item) && isMura);
    }
  });
});

describe('§2.6: カードの ならび（作れる → 足りない・その 中は 作り方の 表の 順。家の 物は それぞれの いちばん うしろ）', () => {
  it('作れる 物の 中でも 足りない 物の 中でも、家の 物は 家で ない 物より うしろ', () => {
    for (const n of [1, 99]) {
      const r = craftRig(ALL_LEARNED);
      richBag(r, n);
      const cards = craftViewCards(r.view, r.inv);
      for (const glowing of [true, false]) {
        const flags = cards.filter((c) => c.glowing === glowing).map((c) => isHouse(c.id));
        expect(flags, `glowing ${glowing}（材料 ${n}）: 家の 物は 後ろ`).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
      }
      const glowFlags = cards.map((c) => c.glowing);
      expect(glowFlags, '作れる 物が 先').toEqual([...glowFlags].sort((a, b) => Number(b) - Number(a)));
    }
  });

  it('家の 物の 中の 順: 1 版の 家の ブロック 5 → 家具 8（エディターの ② の 順）→ レシピで ふえる 形（§4.1 の 表の 順）', () => {
    const r = craftRig(ALL_LEARNED);
    richBag(r, 99);
    const cards = ids(craftViewCards(r.view, r.inv)).filter(isHouse);
    expect(cards).toEqual([...FIRST, ...GATED_CARDS]);
  });
});

describe('AC17b: 案の ボタン（CraftLooks）', () => {
  const forms = styledForms();
  const load = (): Promise<CraftLooksMod> => loadCraftLooks();

  it('案の ある カード: items は むら → おしろ → こうざんの アイテム・はじめは むら。案の ない カード（1 版・しゃちほこ・あかり）は null', async () => {
    const { CraftLooks } = await load();
    const looks = new CraftLooks();
    expect(forms.length).toBeGreaterThan(0);
    for (const f of forms) expect(looks.view(f.items[0]!), `${f.part}-${f.form}`).toEqual({ items: f.items, selected: f.items[0] });
    for (const item of [...FIRST, ...unstyledItems()]) expect(looks.view(item), item).toBeNull();
  });

  it('pick(おしろ): selected と recipeOf が おしろ・材料は かわらない・カードの 絵が おしろ（作らない）', async () => {
    const { CraftLooks } = await load();
    for (const f of forms) {
      const card = f.items[0]!;
      const looks = new CraftLooks();
      const r = craftRig(ALL_LEARNED);
      for (const x of gatedWant(f.part, f.form).inputs) r.inv.add(x.item, x.count);
      const before = craftViewCards(r.view, r.inv, looks).find((c) => c.id === card)!;
      expect(before.output.item, 'はじめは むらの 絵').toBe(f.items[0]);
      expect(looks.pick(card, f.items[1]!), `${f.form}: おしろを 押す`).toBe(true);
      expect(looks.view(card)!.selected).toBe(f.items[1]);
      expect(looks.recipeOf(card), 'えらんで いる 案の 作り方').toBe(f.items[1]);
      const after = craftViewCards(r.view, r.inv, looks).find((c) => c.id === card)!;
      expect(after.id, 'カードの id は むらの 作り方の まま').toBe(card);
      expect(after.output.item, 'カードの 絵が おしろ').toBe(f.items[1]);
      expect(after.materials, '材料 不変').toEqual(before.materials);
      expect(after.glowing).toBe(before.glowing);
      expect(r.inv.count(f.items[1]!), '作らない').toBe(0);
    }
  });

  it('えらんだ 案で 作る: recipeOf の 作り方を make すると その 案の アイテムが できる', async () => {
    const { CraftLooks } = await load();
    const f = forms[0]!;
    const looks = new CraftLooks();
    looks.pick(f.items[0]!, f.items[2]!);
    const r = craftRig(ALL_LEARNED);
    for (const x of gatedWant(f.part, f.form).inputs) r.inv.add(x.item, x.count);
    expect(r.craft.make(looks.recipeOf(f.items[0]!)).ok).toBe(true);
    expect(r.inv.count(f.items[2]!), 'こうざんが できる').toBe(gatedWant(f.part, f.form).out);
    expect(r.inv.count(f.items[0]!), 'むらは できない').toBe(0);
  });

  it('ちがう カードを えらんでも・もう 一度 開いても えらびは のこる。べつの カードの 案は まぜない（その カードの 案で なければ false）', async () => {
    const { CraftLooks } = await load();
    const [a, b] = forms;
    const looks = new CraftLooks();
    expect(looks.pick(a!.items[0]!, a!.items[1]!)).toBe(true);
    expect(looks.pick(b!.items[0]!, b!.items[2]!)).toBe(true);
    expect(looks.view(a!.items[0]!)!.selected, 'a は おしろの まま').toBe(a!.items[1]);
    expect(looks.view(b!.items[0]!)!.selected).toBe(b!.items[2]);
    expect(looks.pick(a!.items[0]!, b!.items[1]!), 'ほかの カードの 案').toBe(false);
    expect(looks.view(a!.items[0]!)!.selected, 'false の あとも そのまま').toBe(a!.items[1]);
    expect(looks.pick(FIRST[0]!, a!.items[1]!), '案の ない カード').toBe(false);
    expect(looks.pick(a!.items[0]!, 'dirt' as ItemId), '知らない アイテム').toBe(false);
    expect(looks.recipeOf(FIRST[0]!), '案の ない カードは 自分').toBe(FIRST[0]);
  });

  it('開きなおした 世界（新しい CraftLooks）は むら。1P と 2P は べつ（2P で こうざんに しても 1P は かわらない）', async () => {
    const { CraftLooks } = await load();
    const f = forms[0]!;
    const p1 = new CraftLooks();
    const p2 = new CraftLooks();
    p2.pick(f.items[0]!, f.items[2]!);
    expect(p1.view(f.items[0]!)!.selected).toBe(f.items[0]);
    expect(p2.view(f.items[0]!)!.selected).toBe(f.items[2]);
    expect(new CraftLooks().view(f.items[0]!)!.selected, '開きなおすと むら').toBe(f.items[0]);
  });

  it('houseCardOf: 案の ある 形の 3 つの 作り方は むらの 作り方に、ほかは そのまま', async () => {
    const { houseCardOf } = await load();
    for (const f of forms) for (const i of f.items) expect(houseCardOf(i), i).toBe(f.items[0]);
    for (const i of [...FIRST, ...unstyledItems(), 'wood_pickaxe']) expect(houseCardOf(i), i).toBe(i);
  });
});
