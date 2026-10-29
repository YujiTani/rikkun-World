import { describe, expect, it } from 'vitest';
import type { CraftEvent, ItemId, Recipe } from '../contracts';
import { createItemInfo, defaultInfoNumbers } from '../craft/info';
import { ALL_RECIPES } from '../craft/recipes';
import { rarityTier } from '../drops/rarity';
import { itemType } from '../inventory/items';
import { buildCards, buildDetail, buildTiles, buttonState, visibleCards, CraftMadeTracker, pickSelection } from './craftModel';

const nameOf = (i: ItemId) => itemType(i)?.name ?? i;
const info = createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: defaultInfoNumbers });
const craftRecipes = ALL_RECIPES.filter((r) => r.station === 'craft');
const bakeRecipes = ALL_RECIPES.filter((r) => r.station === 'furnace');

function world(counts: Record<string, number>) {
  const inv = { count: (i: ItemId) => counts[i] ?? 0 };
  const craft = {
    status: (id: string) => {
      const r = ALL_RECIPES.find((x: Recipe) => x.id === id)!;
      const missing = r.inputs.filter((i) => inv.count(i.item) < i.count).map((i) => ({ item: i.item, count: i.count - inv.count(i.item) }));
      return { craftable: missing.length === 0, missing };
    },
  };
  return { inv, craft };
}

describe('マスの一覧', () => {
  it('持ち物が空: 全部 glowing false・dim true。き 2 で bokuto が光る', () => {
    const e = world({});
    const t = buildTiles(buildCards(craftRecipes, e.craft, e.inv), null, () => false);
    expect(t).toHaveLength(craftRecipes.length);
    expect(t.every((x) => !x.glowing && x.dim)).toBe(true);
    const w = world({ log: 2 });
    const t2 = buildTiles(buildCards(craftRecipes, w.craft, w.inv), null, () => false);
    const b = t2.find((x) => x.id === 'bokuto')!;
    expect(b.glowing).toBe(true);
    expect(b.dim).toBe(false);
  });
  it('later は 1 こも 無い（ITEM-FX-1: ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ に 働きが 入った。works:false の レシピが 無い）', () => {
    const e = world({});
    const t = buildTiles(buildCards(craftRecipes, e.craft, e.inv), null, () => false);
    expect(t.filter((x) => x.later).map((x) => x.id)).toEqual([]);
    const k = buildTiles(buildCards(bakeRecipes, e.craft, e.inv, { bake: true }), null, () => false);
    expect(k.filter((x) => x.later).map((x) => x.id)).toEqual([]);
  });
  it('えらぶ: 前のマス → つくれる いちばん前 → 1 つ目', () => {
    const e = world({});
    expect(pickSelection(buildCards(craftRecipes, e.craft, e.inv), null)).toBe('wood_pickaxe');
    const w = world({ log: 2 });
    const cards = buildCards(craftRecipes, w.craft, w.inv);
    expect(pickSelection(cards, null)).toBe('wood_pickaxe' === cards.find((c) => c.glowing)?.id ? 'wood_pickaxe' : cards.find((c) => c.glowing)!.id);
    expect(pickSelection(cards, 'katana')).toBe('katana');
  });
});

describe('せつめい パネルの中身（AC4・AC6）', () => {
  it('katana を えらぶ: てつの かたまり 1・き 1', () => {
    const w = world({ iron_ingot: 1, log: 1 });
    const cards = buildCards(craftRecipes, w.craft, w.inv);
    const katana = cards.find((c) => c.id === 'katana')!;
    const d = buildDetail({ shown: katana, selected: katana, info: info.info('katana'), bake: false, fuelCounts: null, fuelNext: null });
    expect(d.name).toBe('かたな');
    expect(d.stars).toBe(3);
    expect(d.rarityWord).toBe(rarityTier('rare').word);
    expect(d.buttons).toEqual(['1-9', 'left']);
    expect(d.materials).toEqual([
      { item: 'iron_ingot', have: 1, need: 2, ok: false, inTansu: 0 },
      { item: 'log', have: 1, need: 1, ok: true, inTansu: 0 },
    ]);
    expect(d.button).toEqual({ enabled: false, label: 'ざいりょう が たりない' });
    expect(d.hint).toBeNull();
    const w2 = world({ iron_ingot: 2, log: 1 });
    const k2 = buildCards(craftRecipes, w2.craft, w2.inv).find((c) => c.id === 'katana')!;
    expect(buttonState(k2, false, null)).toEqual({ enabled: true, label: 'つくる' });
  });
  it('合わせたマスが ちがうと hint が出て、ボタンは えらんでいるマスのまま', () => {
    const w = world({ iron_ingot: 2, log: 1 });
    const cards = buildCards(craftRecipes, w.craft, w.inv);
    const sel = cards.find((c) => c.id === 'katana')!;
    const hov = cards.find((c) => c.id === 'naginata')!;
    const d = buildDetail({ shown: hov, selected: sel, info: info.info('naginata'), bake: false, fuelCounts: null, fuelNext: null });
    expect(d.id).toBe('naginata');
    expect(d.hint).toBe('クリック で えらぶ');
    expect(d.button.enabled).toBe(true);
  });
  it('やく: ねんりょう が ないと「ねんりょう が たりない」', () => {
    const w = world({ iron_ore: 1 });
    const c = buildCards(bakeRecipes, w.craft, w.inv, { bake: true }).find((x) => x.id === 'iron_ingot')!;
    expect(buttonState(c, true, null)).toEqual({ enabled: false, label: 'ねんりょう が たりない' });
    expect(buttonState(c, true, 'coal_ore')).toEqual({ enabled: true, label: 'やく' });
    const d = buildDetail({ shown: c, selected: c, info: info.info('iron_ingot'), bake: true, fuelCounts: { coal_ore: 1, oil: 0, log: 0 }, fuelNext: 'coal_ore' });
    expect(d.fuel).toEqual({ next: 'coal_ore', counts: { coal_ore: 1, oil: 0, log: 0 }, inTansu: {} });
  });
});

describe('つくった出来事とコンボ（AC14）', () => {
  const craftEv = (tick: number): CraftEvent => ({ type: 'craft', tick, recipe: 'bokuto', item: 'bokuto', count: 1 });
  const mk = () => new CraftMadeTracker({ comboTicks: 120, comboMax: 8, isFirstMade: () => false });
  it('60 ステップおきに 3 回 → 1・2・3。121 あけると 1', () => {
    const t = mk();
    const got: number[] = [];
    for (let i = 0; i < 3; i++) {
      got.push(t.handle(craftEv(i))!.combo);
      t.advance(60);
    }
    expect(got).toEqual([1, 2, 3]);
    t.advance(61);
    expect(t.handle(craftEv(9))!.combo).toBe(1);
  });
  it('8 回で 8、9 回目も 8。craftFail で 0', () => {
    const t = mk();
    let last = 0;
    for (let i = 0; i < 9; i++) {
      last = t.handle(craftEv(i))!.combo;
      t.advance(10);
    }
    expect(last).toBe(8);
    t.handle({ type: 'craftFail', tick: 1, recipe: 'x', reason: 'missing' });
    expect(t.combo()).toBe(0);
    expect(t.handle(craftEv(2))!.combo).toBe(1);
  });
  it('first はそのレシピを まだ作っていないとき。bakeDone は kind bake。ほかの出来事は null', () => {
    const t = new CraftMadeTracker({ comboTicks: 120, comboMax: 8, isFirstMade: (k, r) => k === 'bake' && r === 'brick' });
    const seen: unknown[] = [];
    t.onMade((e) => seen.push(e));
    const e = t.handle({ type: 'bakeDone', tick: 5, recipe: 'brick', item: 'brick', count: 2, position: { x: 0, y: 0, z: 0 } })!;
    expect(e).toMatchObject({ kind: 'bake', first: true, count: 2 });
    expect(t.handle(craftEv(1))!.first).toBe(false);
    expect(t.handle({ type: 'pickup', tick: 1, item: 'log', count: 1 })).toBeNull();
    expect(seen).toHaveLength(2);
  });
});

describe('一覧に出すのは 材料が 1 種類でもあるレシピだけ（AC56）', () => {
  it('空なら 0 こ。材料を 1 つ拾うと出る。作れる → 足りない の順', () => {
    const e = world({});
    expect(visibleCards(buildCards(craftRecipes, e.craft, e.inv))).toEqual([]);
    const w = world({ log: 1 });
    const v = visibleCards(buildCards(craftRecipes, w.craft, w.inv));
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((c) => c.materials.some((m) => m.have > 0))).toBe(true);
    expect(v.some((c) => c.id === 'katana')).toBe(true); // き だけでも katana は出る
    expect(v.some((c) => c.id === 'furnace')).toBe(false); // いし が無い
    const w2 = world({ log: 2, stone: 3 });
    const ids = visibleCards(buildCards(craftRecipes, w2.craft, w2.inv));
    const firstDim = ids.findIndex((c) => !c.glowing);
    expect(firstDim).toBeGreaterThan(0);
    expect(ids.slice(firstDim).every((c) => !c.glowing)).toBe(true);
    expect(ids[0].id).toBe('stone_pickaxe');
  });
});
