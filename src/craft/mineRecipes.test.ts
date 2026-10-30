import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, ItemStack, Recipe, Vec3 } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { CraftSystemImpl } from './CraftSystem';
import { CRAFT_DEFAULTS } from './config';
import { ALL_RECIPES, BAKE_RECIPES, CRAFT_RECIPES, baseRecipeId, groupRecipes } from './recipes';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4・受け入れ基準 B4）: 新しい 作り方。
 *
 *   かまど   : きんの いし 1 → きん 1、せっかいせき 1 → いしばい 2（ねんりょう 1・60 ステップ）。きんの たまご → きん は 今の まま。
 *              作る 画面の きんの カードは 1 枚で 作り方 2 つ（たいまつの 足した 作り方と 同じ 出し方）。いしばいは やく カードの いちばん うしろ。
 *   作業台   : せっかいせき 1 → チョーク 4、いしばい 1 ＋ いと 1 → しっくい 2。作業台の カードの いちばん うしろに この 順。
 *   今の カードの 順は かわらない。せっかいせきを かまどで やいても しっくいは できない（2 版の「やくと しっくい」は やめた）。
 *
 * ・作り方の id は 仕様の 案（登録表の アイテムの id と 同じ）。きんの いしから きんを 作る 2 つ目の 作り方の id は developer が 決める ので、
 *   カードの グループ（`groupRecipes`）から 形で 探す。
 * ・カードの 数は 決め打ちしない〔#311〕。下の 凍らせた 並びは「1A までの ゲームの カード」で、ずれると 保存・実績の 記録が こわれる
 */

/** MINE-1A と TAKO-1〔ふで。道具の さいご〕までの 作業台の カード（先頭の 作り方の id）の 並び。書きかえて 通さない */
const CRAFT_CARDS_1A: readonly string[] = [
  'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe', 'fude', 'furnace',
  'bokuto', 'katana', 'naginata', 'crystal_katana', 'yumi', 'ya', 'kabuto', 'yoroi', 'kote', 'suneate',
  'torch', 'lantern', 'kite', 'futon', 'omamori', 'waraji', 'tansu',
  'kuwa', 'watering_can', 'long_watering_can', 'sprinkler', 'bucket', 'seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant',
  'mushi_ami', 'nukunuku', 'toriya',
  'kin_katana', 'kin_yumi', 'kin_pickaxe', 'kin_axe', 'kin_kabuto', 'kin_yoroi', 'kin_kote', 'kin_suneate',
  'kongo_katana', 'kongo_yumi', 'kongo_pickaxe', 'kongo_axe', 'kongo_kabuto', 'kongo_yoroi', 'kongo_kote', 'kongo_suneate',
];

/** MINE-1A までの かまどの カードの 並び。書きかえて 通さない */
const BAKE_CARDS_1A: readonly string[] = ['iron_ingot', 'kawara', 'brick', 'haniwa', 'kin', 'momo_yaki'];

const I = (id: string): ItemId => id as ItemId;

/** カードの 先頭の 作り方（その カードが 出す 物） */
function cards(recipes: readonly Recipe[]): Array<{ card: string; output: string; ids: string[] }> {
  return [...groupRecipes(recipes)].map(([card, ids]) => ({ card, ids, output: recipes.find((r) => r.id === card)!.output.item }));
}

/** 出す 物から 作り方を 全部 探す */
const makingOf = (recipes: readonly Recipe[], item: string): Recipe[] => recipes.filter((r) => r.output.item === item);

/** 材料を「名前×数」の 並びに（順番に よらず くらべる） */
const inputsOf = (r: Recipe): string[] => r.inputs.map((i) => `${i.item}×${i.count}`).sort();

describe('B4: カード（今の 並びは かわらず、いちばん うしろに 足す）', () => {
  it('作業台: 今の カードが 同じ 順で 先頭に あり、その うしろに チョーク → しっくい（この 順。さらに うしろに 1C いこうが 足しても よい）', () => {
    const outs = cards(CRAFT_RECIPES);
    expect(outs.slice(0, CRAFT_CARDS_1A.length).map((c) => c.card)).toEqual(CRAFT_CARDS_1A);
    const added = outs.slice(CRAFT_CARDS_1A.length).map((c) => c.output);
    expect(added, '新しい カード チョーク').toContain('chalk');
    expect(added, '新しい カード しっくい').toContain('shikkui');
    expect(added.indexOf('chalk'), 'チョーク → しっくい の 順').toBeLessThan(added.indexOf('shikkui'));
  });

  it('かまど: 今の カードが 同じ 順で 先頭に あり、その うしろに いしばい（きんは 同じ カードの まま。さらに うしろに 足しても よい）', () => {
    const outs = cards(BAKE_RECIPES);
    expect(outs.slice(0, BAKE_CARDS_1A.length).map((c) => c.card)).toEqual(BAKE_CARDS_1A);
    expect(outs.slice(BAKE_CARDS_1A.length).map((c) => c.output), '新しい カード いしばい').toContain('ishibai');
  });

  it('作り方の id は どれも 1 つだけ（同じ id で 2 つ 登録しない）', () => {
    const ids = ALL_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('B4: 作業台の 作り方（チョーク・しっくい）', () => {
  it('チョーク: せっかいせき 1 → チョーク 4（作業台の 1 つだけ）', () => {
    const rs = makingOf(CRAFT_RECIPES, 'chalk');
    expect(rs, '作業台の チョークの 作り方').toHaveLength(1);
    const r = rs[0]!;
    expect(r.station).toBe('craft');
    expect(r.works).toBe(true);
    expect(r.output).toEqual({ item: 'chalk', count: 4 });
    expect(inputsOf(r)).toEqual(['sekkaiseki×1']);
  });

  it('しっくい: いしばい 1 ＋ いと 1 → しっくい 2（作業台の 1 つだけ）', () => {
    const rs = makingOf(CRAFT_RECIPES, 'shikkui');
    expect(rs, '作業台の しっくいの 作り方').toHaveLength(1);
    const r = rs[0]!;
    expect(r.station).toBe('craft');
    expect(r.works).toBe(true);
    expect(r.output).toEqual({ item: 'shikkui', count: 2 });
    expect(inputsOf(r)).toEqual(['ishibai×1', 'string×1']);
  });
});

describe('B4: かまどの 作り方（いしばい・きん）', () => {
  it('いしばい: せっかいせき 1 → いしばい 2（かまど。やく カードの 1 枚）', () => {
    const rs = makingOf(BAKE_RECIPES, 'ishibai');
    expect(rs, 'かまどの いしばいの 作り方').toHaveLength(1);
    const r = rs[0]!;
    expect(r.station).toBe('furnace');
    expect(r.works).toBe(true);
    expect(r.output).toEqual({ item: 'ishibai', count: 2 });
    expect(inputsOf(r)).toEqual(['sekkaiseki×1']);
    expect(cards(BAKE_RECIPES).filter((c) => c.output === 'ishibai')).toHaveLength(1);
  });

  it('きん: カードは 1 枚で 作り方 2 つ（きんの たまご 1 → きん 1 は 今の まま〔先頭〕、きんの いし 1 → きん 1）', () => {
    const kin = cards(BAKE_RECIPES).filter((c) => c.output === 'kin');
    expect(kin, 'きんの カード').toHaveLength(1);
    expect(kin[0]!.card, 'カードの id は 今の まま').toBe('kin');
    expect(kin[0]!.ids, '作り方が 2 つ').toHaveLength(2);
    const [first, second] = kin[0]!.ids.map((id) => BAKE_RECIPES.find((r) => r.id === id)!);
    // 先頭: 今の きんの たまご（GOLD-1。src/craft/gold1.test.ts と 同じ）
    expect(first!.id).toBe('kin');
    expect(first!.station).toBe('furnace');
    expect(first!.inputs).toEqual([{ item: 'kin_tamago', count: 1 }]);
    expect(first!.output).toEqual({ item: 'kin', count: 1 });
    // 足した 作り方: きんの いし 1 → きん 1
    expect(second!.station).toBe('furnace');
    expect(second!.works).toBe(true);
    expect(inputsOf(second!)).toEqual(['kin_ore×1']);
    expect(second!.output).toEqual({ item: 'kin', count: 1 });
    expect(second!.id).not.toBe(first!.id);
  });

  it('足した 作り方は「つくった」の 記録で 元の きんの カードと 同じ 物に 数える（baseRecipeId）', () => {
    const kin = cards(BAKE_RECIPES).find((c) => c.output === 'kin')!;
    expect(kin.ids.length, '作り方が 2 つ以上').toBeGreaterThan(1);
    for (const id of kin.ids) expect(baseRecipeId(id), id).toBe('kin');
  });
});

describe('B4: 作らない 物（せっかいせきを かまどで やいても しっくいは できない。ダイヤは かまどを 通さない）', () => {
  it('かまどで しっくいを 作る 作り方は ない。せっかいせきを やく 作り方は いしばい だけ', () => {
    expect(makingOf(BAKE_RECIPES, 'shikkui')).toEqual([]);
    const burnsSekkaiseki = BAKE_RECIPES.filter((r) => r.inputs.some((i) => (i.item as string) === 'sekkaiseki'));
    expect(burnsSekkaiseki.map((r) => r.output.item)).toEqual(['ishibai']);
  });

  it('チョークを かまどで 作る 作り方も ない（作業台だけ）', () => {
    expect(makingOf(BAKE_RECIPES, 'chalk')).toEqual([]);
  });

  it('ダイヤは 作り方が ない（ダイヤの いしを ほるだけ）。ダイヤの いしを 材料に する 作り方も ない', () => {
    expect(makingOf(ALL_RECIPES, 'diamond')).toEqual([]);
    expect(ALL_RECIPES.filter((r) => r.inputs.some((i) => (i.item as string) === 'diamond_ore'))).toEqual([]);
  });
});

/* ---- 本物の 作る・やく しくみ（CraftSystemImpl）で 動かす ---- */

class FlatWorld {
  private blocks = new Map<string, BlockId>();
  readonly size = { x: 16, y: 16, z: 16 };
  isLoaded(): boolean {
    return true;
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'air' && b !== 'water' && b !== 'outside';
  }
}

function rig() {
  const world = new FlatWorld();
  world.setBlock(3, 5, 3, 'furnace');
  const inv = new InventoryImpl();
  const craft = new CraftSystemImpl({
    world,
    inventory: inv,
    drops: { scatter: (_p: Vec3, _stacks: readonly ItemStack[]) => 0 },
  });
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) craft.update();
  };
  /** 持ち物に 入れる（登録されて いない 物は ここで 気づく） */
  const give = (item: string, n: number): void => {
    expect(inv.add(I(item), n), `${item} ${n} こを もちものに 入れる〔登録表に ある〕`).toBe(0);
  };
  return { inv, craft, step, give };
}

describe('B4: 作業台で 作る（CraftSystem）', () => {
  it('せっかいせき 1 → チョーク 4。せっかいせきは 1 つ へる', () => {
    const { inv, craft, give } = rig();
    give('sekkaiseki', 1);
    expect(craft.make('chalk')).toMatchObject({ ok: true, reason: null });
    expect(inv.count(I('chalk'))).toBe(4);
    expect(inv.count(I('sekkaiseki'))).toBe(0);
  });

  it('せっかいせきが ないと チョークは 作れない', () => {
    const { inv, craft } = rig();
    expect(craft.make('chalk')).toMatchObject({ ok: false, reason: 'missing' });
    expect(inv.count(I('chalk'))).toBe(0);
  });

  it('いしばい 1 ＋ いと 1 → しっくい 2', () => {
    const { inv, craft, give } = rig();
    give('ishibai', 1);
    give('string', 1);
    expect(craft.make('shikkui')).toMatchObject({ ok: true, reason: null });
    expect(inv.count(I('shikkui'))).toBe(2);
    expect(inv.count(I('ishibai'))).toBe(0);
    expect(inv.count(I('string'))).toBe(0);
  });

  it('せっかいせき 1 ＋ いと 1 では しっくいは 作れない（いしばいを はさむ）', () => {
    const { inv, craft, give } = rig();
    give('sekkaiseki', 1);
    give('string', 1);
    expect(craft.make('shikkui')).toMatchObject({ ok: false, reason: 'missing' });
    expect(inv.count(I('shikkui'))).toBe(0);
  });
});

describe('B4: かまどで やく（60 ステップ・ねんりょう 1）', () => {
  it('ふつうの ねんりょうの かかり方は 今の まま（60 ステップ）', () => {
    expect(CRAFT_DEFAULTS.bakeTicks).toBe(60);
  });

  it('せっかいせき 1 → いしばい 2: 59 ステップでは まだ・60 で 入る。ねんりょう 1 つ へる', () => {
    const { inv, craft, step, give } = rig();
    give('sekkaiseki', 1);
    give('coal_ore', 1);
    expect(craft.bake('ishibai', 3, 5, 3)).toMatchObject({ ok: true, reason: null });
    expect(inv.count(I('sekkaiseki'))).toBe(0);
    expect(inv.count(I('coal_ore')), 'ねんりょう 1').toBe(0);
    step(59);
    expect(inv.count(I('ishibai'))).toBe(0);
    step(1);
    expect(inv.count(I('ishibai'))).toBe(2);
    expect(inv.count(I('shikkui')), 'せっかいせきを やいても しっくいは できない').toBe(0);
  });

  it('きんの いし 1 → きん 1: 59 ステップでは まだ・60 で 入る', () => {
    const { inv, craft, step, give } = rig();
    const kin = cards(BAKE_RECIPES).find((c) => c.output === 'kin')!;
    const fromOre = kin.ids.find((id) => id !== 'kin');
    expect(fromOre, 'きんの いしから 作る 作り方').toBeDefined();
    give('kin_ore', 1);
    give('coal_ore', 1);
    expect(craft.bake(fromOre!, 3, 5, 3)).toMatchObject({ ok: true, reason: null });
    expect(inv.count(I('kin_ore'))).toBe(0);
    expect(inv.count(I('coal_ore'))).toBe(0);
    step(59);
    expect(inv.count(I('kin'))).toBe(0);
    step(1);
    expect(inv.count(I('kin'))).toBe(1);
  });

  it('きんの たまご 1 → きん 1 は 今まで どおり', () => {
    const { inv, craft, step, give } = rig();
    give('kin_tamago', 1);
    give('coal_ore', 1);
    expect(craft.bake('kin', 3, 5, 3)).toMatchObject({ ok: true, reason: null });
    step(60);
    expect(inv.count(I('kin'))).toBe(1);
    expect(inv.count(I('kin_tamago'))).toBe(0);
  });

  it('かまどで しっくいは 作れない（作り方が ない）', () => {
    const { inv, craft, give } = rig();
    give('sekkaiseki', 1);
    give('coal_ore', 1);
    expect(craft.bake('shikkui', 3, 5, 3)).toMatchObject({ ok: false, reason: 'unknown' });
    expect(inv.count(I('sekkaiseki')), 'へらない').toBe(1);
  });

  it('ダイヤの いしは かまどで やけない（ダイヤは 掘って 手に 入れる だけ）', () => {
    const { craft } = rig();
    expect(craft.bake('diamond', 3, 5, 3)).toMatchObject({ ok: false, reason: 'unknown' });
  });
});
