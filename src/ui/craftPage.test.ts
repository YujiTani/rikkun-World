import { describe, expect, it } from 'vitest';
import type { ItemId, Recipe } from '../contracts';
import { ALL_RECIPES, baseRecipeId, groupRecipes, TORCH_COAL, TORCH_LOG } from '../craft/recipes';
import { buildCards, buildPageDefs, DESC_PAGE_CHARS, plainLength, splitDesc, firstCraftableVariant, pageStart, STATS_PER_PAGE, type CardView } from './craftModel';

const craftRecipes = ALL_RECIPES.filter((r) => r.station === 'craft');

function cardsFor(counts: Record<string, number>): CardView[] {
  const inv = { count: (i: ItemId) => counts[i] ?? 0 };
  const craft = {
    status: (id: string) => {
      const r = ALL_RECIPES.find((x: Recipe) => x.id === id)!;
      const missing = r.inputs.filter((i) => inv.count(i.item) < i.count).map((i) => ({ item: i.item, count: i.count - inv.count(i.item) }));
      return { craftable: missing.length === 0, missing };
    },
  };
  return buildCards(craftRecipes, craft, inv);
}
const variantCards = (counts: Record<string, number>, ids: string[]) => {
  const all = cardsFor(counts);
  return ids.map((id) => all.find((c) => c.id === id)!);
};

describe('たいまつの 作り方（CRAFT-PAGE A）', () => {
  it('3 つ。もとの torch は き 1・あぶら 1 → 4、足した 2 つは き 1・せきたん 1 → 4 と き 3 → 1', () => {
    const t = ALL_RECIPES.filter((r) => r.output.item === 'torch');
    expect(t.map((r) => r.id)).toEqual(['torch', TORCH_COAL, TORCH_LOG]);
    expect(t.map((r) => [r.output.count, r.inputs.map((i) => `${i.item}${i.count}`).join(','), r.works, r.station])).toEqual([
      [4, 'log1,oil1', true, 'craft'],
      [4, 'log1,coal_ore1', true, 'craft'],
      [1, 'log3', true, 'craft'],
    ]);
  });
  it('カードの グループ: たいまつ だけが 3 つ。それ以外は 1 つずつ。baseRecipeId は 元の id', () => {
    const g = groupRecipes(craftRecipes);
    expect(g.size).toBe(36);
    expect(g.get('torch')).toEqual(['torch', TORCH_COAL, TORCH_LOG]);
    expect(g.get('katana')).toEqual(['katana']);
    expect(baseRecipeId(TORCH_COAL)).toBe('torch');
    expect(baseRecipeId(TORCH_LOG)).toBe('torch');
    expect(baseRecipeId('katana')).toBe('katana');
    expect(baseRecipeId('iron_ingot')).toBe('iron_ingot'); // やく
  });
});

describe('ページ分け（CRAFT-PAGE B）', () => {
  it('作り方 3 つ → つくりかた ①②③ → せつめい。つよさ（数が ある物だけ）が あれば 最後に', () => {
    const p = buildPageDefs({ recipes: ['torch', TORCH_COAL, TORCH_LOG], statCount: 0 });
    expect(p.map((x) => x.name)).toEqual(['つくりかた ①', 'つくりかた ②', 'つくりかた ③', 'せつめい']);
    expect(p.map((x) => x.kind)).toEqual(['make', 'make', 'make', 'desc']);
    expect(p.slice(0, 3).map((x) => x.recipe)).toEqual(['torch', TORCH_COAL, TORCH_LOG]);
  });
  it('作り方 1 つ → ざいりょう。つよさ は 1 ページなら「つよさ」、入りきらないなら「つよさ 1/2」…に分ける', () => {
    expect(buildPageDefs({ recipes: ['katana'], statCount: 2 }).map((x) => x.name)).toEqual(['ざいりょう', 'せつめい', 'つよさ']);
    const n = STATS_PER_PAGE;
    const p = buildPageDefs({ recipes: ['katana'], statCount: n + 1 });
    expect(p.map((x) => x.name)).toEqual(['ざいりょう', 'せつめい', 'つよさ 1/2', 'つよさ 2/2']);
    expect(p[2]).toMatchObject({ from: 0, to: n });
    expect(p[3]).toMatchObject({ from: n, to: n + 1 });
    // つよさの 数が 無い物（分類の 文だけ）は つよさ ページを 出さない
    expect(buildPageDefs({ recipes: ['katana'], statCount: 0 }).map((x) => x.name)).toEqual(['ざいりょう', 'せつめい']);
  });
  it('せつめいが 長いと 文（。）で 区切って 何ページかに 分ける。短ければ 1 ページ', () => {
    const use = 'あ'.repeat(30);
    const how = `${'い'.repeat(30)}。${'う'.repeat(30)}。`;
    const parts = splitDesc(use, how);
    expect(parts).toHaveLength(2); // 30 + 30 = 60 は 入る、あと 30 は 次の ページ
    expect(parts[0]).toEqual({ use, how: `${'い'.repeat(30)}。`, buttons: true });
    expect(parts[1]).toEqual({ use: '', how: `${'う'.repeat(30)}。`, buttons: false });
    const p = buildPageDefs({ recipes: ['katana'], statCount: 0, use, how });
    expect(p.map((x) => x.name)).toEqual(['ざいりょう', 'せつめい 1/2', 'せつめい 2/2']);
    // 短ければ 1 ページ（たいまつ・かたなの 実際の長さ）
    expect(splitDesc('あ'.repeat(40), 'い'.repeat(18))).toHaveLength(1);
    expect(splitDesc('あ'.repeat(14), 'い'.repeat(47))).toHaveLength(1);
    // 使いかたが 長くても 文の 区切りが 無ければ そのまま 1 つ（use が 先の ページ）
    expect(splitDesc('あ'.repeat(30), 'い'.repeat(DESC_PAGE_CHARS))).toHaveLength(2);
    // つかいかたが 無い
    expect(splitDesc('あ', '')).toEqual([{ use: 'あ', how: '', buttons: false }]);
    expect(plainLength('［雷神剣｜らいじんけん］で たたく')).toBe(3 + 5);
  });
  it('ページが 1 枚だけの物（せつめい だけ）も 作れる形', () => {
    expect(buildPageDefs({ recipes: [], statCount: 0 }).map((x) => x.name)).toEqual(['せつめい']);
  });
});

describe('開いたときの ページ・「つくる」の作り方', () => {
  const ids = ['torch', TORCH_COAL, TORCH_LOG];
  const pages = buildPageDefs({ recipes: ids, statCount: 0 });
  it('今の材料で作れる いちばん前。き 1・せきたん 1 → ②', () => {
    const v = variantCards({ log: 1, coal_ore: 1 }, ids);
    expect(firstCraftableVariant(v)).toBe(TORCH_COAL);
    expect(pageStart(pages, v)).toEqual({ index: 1, recipe: TORCH_COAL });
  });
  it('き 3 だけ → ③。き 1・あぶら 1・せきたん 1 → ①', () => {
    expect(pageStart(pages, variantCards({ log: 3 }, ids))).toEqual({ index: 2, recipe: TORCH_LOG });
    expect(pageStart(pages, variantCards({ log: 1, oil: 1, coal_ore: 1 }, ids))).toEqual({ index: 0, recipe: 'torch' });
  });
  it('どれも作れないなら 1 ページ目（つくる の作り方は ①）', () => {
    const v = variantCards({ dirt: 1 }, ids);
    expect(firstCraftableVariant(v)).toBeNull();
    expect(pageStart(pages, v)).toEqual({ index: 0, recipe: 'torch' });
  });
  it('作り方が 1 つの物は 先頭ページ', () => {
    const p = buildPageDefs({ recipes: ['katana'], statCount: 2 });
    expect(pageStart(p, variantCards({ iron_ingot: 2, log: 1 }, ['katana']))).toEqual({ index: 0, recipe: 'katana' });
  });
});
