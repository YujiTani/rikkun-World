import { describe, expect, it } from 'vitest';
import { itemType } from '../../inventory/items';
import { houseRig } from '../houseRig';
import { SCROLL, allRecipes, fillBag, rh, scrolls, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3.3 版）AC2: どの レシピに なるか（まきものを 使った とき に 決まる）。仕様 docs/design/HOUSE-2.md §2.2・§4.2・§5（かみ 3 まい）。
 * レシピは 20 まいの まま（1 まいで むら・おしろ・こうざんの 3 つが 出る ＝ 数は ここに 書かない。recipes().all から）。
 * 3.3 版で かわった こと: 決まる のは「使った とき」。答えは **世界の シード と おぼえた 物 だけ** で きまる（坑道の 場所・まきものを 拾った 場所・何まい 持って いるかには よらない）。
 * 約束: src/house/recipes/pick.ts の `pickRecipe({ seed, learned })` → レシピの id | null（ぜんぶ おぼえて いたら null。`at` は なくなった）。
 *       窓口 `house.recipes().nextPick`（今 使ったら おぼえる 物。ぜんぶ おぼえて いれば null）・`house.read(who?)`（手に もって 右クリックの 本体）。
 * 表は 数えない: ぜんぶの 数は 窓口 recipes().all から。まだ 無い 間は 窓口と pick.ts の 形が 合わなくて 赤。
 */

type Pick = (o: { seed: number; learned: readonly string[] }) => string | null;
const mods = import.meta.glob('./pick.ts', { eager: true }) as Record<string, { pickRecipe?: Pick }>;
const pick = (): Pick => {
  const f = mods['./pick.ts']?.pickRecipe;
  expect(f, 'src/house/recipes/pick.ts の pickRecipe').toBeTypeOf('function');
  return f!;
};
const AT = (i: number) => ({ x: 100 + i * 211, y: 43, z: -300 + i * 97 });
const SEEDS = [1, 2, 3, 77, 999, 20261012];

/** 世界の シード seed の 世界（houseRig の extraDeps で シードを かえる） */
const world = (seed: number): Rig => houseRig({ extraDeps: { seed } });
/** まきものを 1 まい 持って 手に もって 右クリック（read）して、おぼえた レシピの id を 返す（ぜんぶ おぼえて いたら null） */
function readOne(r: Rig): string | null {
  const before = rh(r).recipes().learned.length;
  r.bag.add(SCROLL, 1);
  expect(rh(r).read(), 'まきものを 持って いるので 読める').toBe(true);
  const after = rh(r).recipes().learned;
  return after.length > before ? after.at(-1)! : null;
}
/** ぜんぶ おぼえる まで 読んだ 順の id */
function readAll(r: Rig): string[] {
  const out: string[] = [];
  for (let i = 0, n = rh(r).recipes().all.length; i < n; i++) out.push(readOne(r)!);
  return out;
}

describe('AC2 どの レシピに なるか（pickRecipe）', () => {
  it('表が ある（窓口 recipes().all）。id は 重ならない・かわらの やね（roof_kawara）が 入って いる', () => {
    const all = rh(houseRig()).recipes().all;
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size, 'id は 重ならない').toBe(all.length);
    expect(all).toContain('roof_kawara');
  });

  it('1 まい目は かならず roof_kawara（シードに よらない）', () => {
    for (const seed of SEEDS) expect(pick()({ seed, learned: [] }), `seed ${seed}`).toBe('roof_kawara');
  });

  it('まだの 物から 1 まい。同じ 物は 2 回 出ない。表の ぜんぶを おぼえるまで 1 まいずつ ちがう 物が 出て、そのあとは null', () => {
    const all = allRecipes();
    const learned: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const got = pick()({ seed: 77, learned });
      expect(got, `${i} まい目`).not.toBeNull();
      expect(all, `${i} まい目は 表に ある`).toContain(got);
      expect(learned, `${i} まい目は まだの 物`).not.toContain(got);
      learned.push(got!);
    }
    expect(new Set(learned).size).toBe(all.length);
    expect(pick()({ seed: 77, learned }), 'ぜんぶ おぼえた あとは null（かみ 3 まいに なる）').toBeNull();
  });

  it('同じ 世界・同じ おぼえた 物 なら いつも 同じ 答え。おぼえた 物の 並び順は 関係ない', () => {
    const a = pick()({ seed: 77, learned: ['roof_kawara', 'wall_renga'] });
    expect(pick()({ seed: 77, learned: ['roof_kawara', 'wall_renga'] })).toBe(a);
    expect(pick()({ seed: 77, learned: ['wall_renga', 'roof_kawara'] })).toBe(a);
  });

  it('坑道の 場所には よらない（3.3 版）: 場所を わたしても わたさなくても 答えは 同じ。シードが ちがえば ちがう 物が 出る（シード いろいろで 3 しゅるい いじょう）', () => {
    const withAt = pick() as unknown as (o: { seed: number; at: { x: number; y: number; z: number }; learned: readonly string[] }) => string | null;
    for (const seed of SEEDS) for (let i = 0; i < 6; i++) expect(withAt({ seed, at: AT(i), learned: ['roof_kawara'] }), `seed ${seed} 場所 ${i}`).toBe(pick()({ seed, learned: ['roof_kawara'] }));
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(pick()({ seed, learned: ['roof_kawara'] })!);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe('AC2 まきものを 使った とき（窓口 read・recipes().nextPick）', () => {
  it('nextPick: はじめは roof_kawara。ぜんぶ おぼえるまで 今 おぼえる 物を 指し（まだの 物）、ぜんぶ おぼえたら null', () => {
    const r = houseRig();
    expect(rh(r).recipes().nextPick, '1 まい目').toBe('roof_kawara');
    for (const id of rh(r).recipes().all) {
      const x = rh(r).recipes();
      expect(x.nextPick, 'まだの 物').not.toBeNull();
      expect(x.learned, 'まだの 物').not.toContain(x.nextPick);
      expect(x.all).toContain(x.nextPick);
      expect(rh(r).learn(id)).toBe(true);
    }
    expect(rh(r).recipes().nextPick, 'ぜんぶ おぼえた').toBeNull();
  });

  it('使うと おぼえる 物は その 直前の nextPick。1 まい目は roof_kawara。同じ 物は 2 回 出ない。ぜんぶ おぼえる まで 1 まいずつ', () => {
    const r = houseRig();
    const got: string[] = [];
    for (let i = 0, n = rh(r).recipes().all.length; i < n; i++) {
      const next = rh(r).recipes().nextPick;
      got.push(readOne(r)!);
      expect(got.at(-1), `${i} まい目は 直前の nextPick`).toBe(next);
    }
    expect(got[0]).toBe('roof_kawara');
    expect(new Set(got).size, 'ぜんぶ ちがう 物').toBe(rh(r).recipes().all.length);
    expect(rh(r).recipes().learned, 'おぼえた 順').toEqual(got);
    expect(rh(r).recipes().nextPick).toBeNull();
  });

  it('決まるのは 世界の シード と おぼえた 物 だけ: どの 坑道で 拾った まきものでも 何まい 持って いても 同じ 順（found の 場所が ちがう 2 つの 世界で 同じ）', () => {
    const a = world(77);
    const b = world(77);
    for (let i = 0; i < 4; i++) rh(a).found(AT(i)); // 坑道が ちがう（4 まい）
    for (let i = 0; i < 2; i++) rh(b).found(AT(50 + i * 7)); // 場所も 枚数も ちがう（2 まい）
    expect(rh(a).recipes().nextPick, 'まだ 使って いない: 拾った だけでは かわらない').toBe('roof_kawara');
    const orderA: string[] = [];
    const orderB: string[] = [];
    for (let i = 0, n = rh(a).recipes().all.length; i < n; i++) {
      if (scrolls(a) === 0) rh(a).found(AT(10 + i)); // 足りなく なったら また 別の 坑道で 拾う
      expect(rh(a).read(), `a ${i}`).toBe(true);
      orderA.push(rh(a).recipes().learned.at(-1)!);
      if (scrolls(b) === 0) rh(b).found(AT(100 + i));
      expect(rh(b).read(), `b ${i}`).toBe(true);
      orderB.push(rh(b).recipes().learned.at(-1)!);
    }
    expect(orderA, '世界ごとに おぼえる 順は 1 本').toEqual(orderB);
  });

  it('世界の シードが ちがえば おぼえる 順も ちがう（シード いろいろで 2 しゅるい いじょう）。どの 世界も 1 まい目は roof_kawara', () => {
    const orders = SEEDS.map((seed) => readAll(world(seed)));
    for (const o of orders) expect(o[0]).toBe('roof_kawara');
    expect(new Set(orders.map((o) => o.join(','))).size).toBeGreaterThanOrEqual(2);
  });

  it('使う 前に 保存して 開きなおしても 同じ 答え（nextPick・つぎに おぼえる 物）', () => {
    const a = houseRig();
    readOne(a);
    readOne(a);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    const next = rh(a).recipes().nextPick;
    const b = houseRig();
    b.sys.load(saved);
    expect(rh(b).recipes().learned).toEqual(rh(a).recipes().learned);
    expect(rh(b).recipes().nextPick, '開きなおしても nextPick は 同じ').toBe(next);
    expect(readOne(b), '使うと その 物').toBe(next);
  });
});

describe('AC2 ぜんぶ おぼえた あとに 使う: まきもの 1 まい へって かみ 3 まい（案 B）・入らない 分は 足もとに（仕様 §5）', () => {
  /** 表の ぜんぶを おぼえた 世界（まきものの 近道 learn）。bag は からっぽ */
  function done(): Rig {
    const r = houseRig();
    for (const id of rh(r).recipes().all) rh(r).learn(id);
    return r;
  }
  const paperDropped = (r: Rig): number => r.drops.filter((d) => d.item === 'paper').reduce((n, d) => n + d.count, 0);

  it('かみ 3 まい・まきもの 1 まい へる・おぼえた 物は ふえない。何回 でも 同じ（まきものが ある かぎり）', () => {
    const r = done();
    const learned = rh(r).recipes().learned;
    r.bag.add(SCROLL, 2);
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r), 'まきもの 1 まい へる').toBe(1);
    expect(r.bag.count('paper'), 'かみ 3 まい').toBe(3);
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r)).toBe(0);
    expect(r.bag.count('paper')).toBe(6);
    expect(rh(r).recipes().learned, 'おぼえた 物は ふえない').toEqual(learned);
    expect(rh(r).read(), 'まきものが もう ない').toBe(false);
    expect(r.bag.count('paper'), 'かみは ふえない').toBe(6);
    expect(paperDropped(r), '空きが あれば 足もとには 落とさない').toBe(0);
  });

  it('持ち物が いっぱいでも まきものの マスが あく ので かみ 3 まいは 持ち物に 入る（足もとに 落とさない）', () => {
    const r = done();
    r.bag.add(SCROLL, 1);
    fillBag(r); // まきもの 1 まいの マスも ふくめて いっぱい（かみの 空きは ない）
    expect(r.bag.count('paper')).toBe(0);
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r)).toBe(0);
    expect(r.bag.count('paper'), '使った まきものの マスに 入る').toBe(3);
    expect(paperDropped(r)).toBe(0);
  });

  it('持ち物が いっぱいで、まきものが 2 まい 重なって いる（マスが あかない）: かみ 3 まいは ぜんぶ 足もとに 落ちる。持ち物の ほかの 中身は かわらない', () => {
    const r = done();
    r.bag.add(SCROLL, 2);
    fillBag(r);
    const stones = r.bag.count('stone');
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r), 'まきもの 1 まい へる').toBe(1);
    expect(r.bag.count('paper'), '入らない').toBe(0);
    expect(paperDropped(r), '足もとに かみ 3 まい').toBe(3);
    expect(r.bag.count('stone')).toBe(stones);
    expect(r.drops.filter((d) => d.item !== 'paper'), 'かみ いがいは 落とさない').toEqual([]);
  });

  it('一部だけ 入る（かみの 山に あと 2 まいぶん 空き・ほかの マスは いっぱい・まきもの 2 まい）: 2 まいは 持ち物・のこりの 1 まいが 足もとに', () => {
    const r = done();
    r.bag.add(SCROLL, 2);
    fillBag(r);
    const max = itemType('paper')!.maxStack;
    const slot = r.bag.slots().findIndex((s) => s?.item === 'stone');
    r.bag.setSlot(slot, { item: 'paper', count: max - 2 });
    expect(rh(r).read()).toBe(true);
    expect(r.bag.count('paper'), '山が いっぱいに なる').toBe(max);
    expect(paperDropped(r), '入らなかった 1 まい').toBe(1);
  });

  it('テロップ「もう ぜんぶ おぼえて いるよ。まきものは かみに なった」が 出る。ふつうの おぼえた 音・ぜんぶの 音・紙ふぶきは ふえない', () => {
    const r = done();
    const confetti = r.hook.celebrate().confetti;
    const sfx0 = r.sfx.length;
    r.bag.add(SCROLL, 1);
    expect(rh(r).read()).toBe(true);
    const band = rh(r).recipeBand();
    expect(band, 'テロップ').not.toBeNull();
    expect(band!.text.replace(/\s+/g, '')).toBe('もうぜんぶおぼえているよ。まきものはかみになった');
    expect(r.sfx.slice(sfx0).filter((e) => ['recipe', 'recipeAll'].includes((e as { k: string }).k)), 'おぼえた 音は 鳴らさない').toEqual([]);
    expect(r.hook.celebrate().confetti, '紙ふぶきは ふえない').toBe(confetti);
  });
});
