import { describe, expect, it } from 'vitest';
import { itemType } from '../../inventory/items';
import { houseRig } from '../houseRig';
import { allRecipes, rh } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3 版）AC2: どの レシピに なるか（拾った とき に 決まる）。仕様 docs/design/HOUSE-2.md §2.1・§4.2・§5（かみ 3 まい）。
 * レシピは 20 まいの まま（1 まいで むら・おしろ・こうざんの 3 つが 出る ＝ 数は ここに 書かない。recipes().all から）。
 * 約束: src/house/recipes/pick.ts の `pickRecipe({ seed, at: { x, y, z }, learned })` → レシピの id | null（ぜんぶ おぼえて いたら null）。
 * 表は 数えない: ぜんぶの 数は 窓口 recipes().all から。まだ 無い 間は 窓口と pick.ts が 無くて 赤。
 */

type Pick = (o: { seed: number; at: { x: number; y: number; z: number }; learned: readonly string[] }) => string | null;
const mods = import.meta.glob('./pick.ts', { eager: true }) as Record<string, { pickRecipe?: Pick }>;
const pick = (): Pick => {
  const f = mods['./pick.ts']?.pickRecipe;
  expect(f, 'src/house/recipes/pick.ts の pickRecipe').toBeTypeOf('function');
  return f!;
};
const AT = (i: number) => ({ x: 100 + i * 211, y: 43, z: -300 + i * 97 });

describe('AC2 どの レシピに なるか', () => {
  it('表が ある（窓口 recipes().all）。id は 重ならない・かわらの やね（roof_kawara）が 入って いる', () => {
    const all = rh(houseRig()).recipes().all;
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size, 'id は 重ならない').toBe(all.length);
    expect(all).toContain('roof_kawara');
  });

  it('1 まい目は かならず roof_kawara（シード・場所に よらない）', () => {
    for (const seed of [1, 77, 20261012, 999]) for (let i = 0; i < 6; i++) expect(pick()({ seed, at: AT(i), learned: [] }), `seed ${seed} 場所 ${i}`).toBe('roof_kawara');
  });

  it('まだの 物から 1 まい。同じ 物は 2 回 出ない。表の ぜんぶを おぼえるまで 1 まいずつ ちがう 物が 出て、そのあとは null', () => {
    const all = allRecipes();
    const learned: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const got = pick()({ seed: 77, at: AT(i), learned });
      expect(got, `${i} まい目`).not.toBeNull();
      expect(all, `${i} まい目は 表に ある`).toContain(got);
      expect(learned, `${i} まい目は まだの 物`).not.toContain(got);
      learned.push(got!);
    }
    expect(new Set(learned).size).toBe(all.length);
    expect(pick()({ seed: 77, at: AT(99), learned }), 'ぜんぶ おぼえた あとは null（かみ 3 まいに なる）').toBeNull();
  });

  it('同じ 世界・同じ 坑道・同じ おぼえた 物 なら いつも 同じ 答え。おぼえた 物の 並び順は 関係ない', () => {
    const a = pick()({ seed: 77, at: AT(3), learned: ['roof_kawara', 'wall_renga'] });
    expect(pick()({ seed: 77, at: AT(3), learned: ['roof_kawara', 'wall_renga'] })).toBe(a);
    expect(pick()({ seed: 77, at: AT(3), learned: ['wall_renga', 'roof_kawara'] })).toBe(a);
  });

  it('場所が ちがえば ちがう 物が 出る ことも ある（たくさんの 場所で 3 しゅるい いじょう）。シードが ちがっても 同じ 並びに ならない', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(pick()({ seed: 77, at: AT(i), learned: ['roof_kawara'] })!);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const seqA = Array.from({ length: 12 }, (_, i) => pick()({ seed: 1, at: AT(i), learned: ['roof_kawara'] }));
    const seqB = Array.from({ length: 12 }, (_, i) => pick()({ seed: 2, at: AT(i), learned: ['roof_kawara'] }));
    expect(seqA).not.toEqual(seqB);
  });
});

describe('AC2 found（拾った とき: 窓口 house.found）', () => {
  it('1 まい目は roof_kawara。つぎからは まだの 物。ぜんぶ おぼえるまで ちがう 物。そのあとは null で かみ 3 まいずつ', () => {
    const r = houseRig();
    const all = rh(r).recipes().all;
    const got: string[] = [];
    for (let i = 0; i < all.length; i++) got.push(rh(r).found(AT(i))!);
    expect(got[0]).toBe('roof_kawara');
    expect(new Set(got).size, 'ぜんぶ ちがう 物').toBe(all.length);
    expect(rh(r).recipes().learned, 'おぼえた 順').toEqual(got);
    const paper0 = r.bag.count('paper');
    expect(rh(r).found(AT(50)), 'ぜんぶ おぼえた あと').toBeNull();
    expect(r.bag.count('paper'), 'かみ 3 まい').toBe(paper0 + 3);
    expect(rh(r).found(AT(51))).toBeNull();
    expect(r.bag.count('paper')).toBe(paper0 + 6);
    expect(rh(r).recipes().learned, 'おぼえた 物は ふえない').toEqual(got);
  });

  it('拾う 前に 保存して 開きなおしても 同じ 答え', () => {
    const a = houseRig();
    rh(a).found(AT(0));
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    const first = rh(a).found(AT(7));
    const b = houseRig();
    b.sys.load(saved);
    expect(rh(b).recipes().learned).toEqual(['roof_kawara']);
    expect(rh(b).found(AT(7))).toBe(first);
  });
});

describe('AC2 ぜんぶ おぼえた あとの かみ 3 まい: 持ち物に 入らない 分は 足もとに 落とす（仕様 §5）', () => {
  /** 表の ぜんぶを おぼえた 世界。bag は からっぽ */
  function done() {
    const r = houseRig();
    for (const id of rh(r).recipes().all) rh(r).learn(id);
    return r;
  }
  const paperDropped = (r: ReturnType<typeof done>): number => r.drops.filter((d) => d.item === 'paper').reduce((n, d) => n + d.count, 0);

  it('持ち物に 空きが あれば ぜんぶ 持ち物へ。足もとには 落とさない', () => {
    const r = done();
    expect(rh(r).found(AT(1))).toBeNull();
    expect(r.bag.count('paper')).toBe(3);
    expect(paperDropped(r)).toBe(0);
  });

  it('持ち物が いっぱい（かみの 入る 空きも ない）: かみ 3 まいは ぜんぶ 足もとに 落ちる。持ち物は へらない・ふえない', () => {
    const r = done();
    let guard = 0;
    while (r.bag.add('stone', 64) === 0 && guard++ < 1000);
    expect(r.bag.slots().every((s) => s !== null), '持ち物は いっぱい').toBe(true);
    const before = JSON.stringify(r.bag.slots());
    expect(rh(r).found(AT(2))).toBeNull();
    expect(paperDropped(r), '足もとに かみ 3 まい').toBe(3);
    expect(JSON.stringify(r.bag.slots()), '持ち物は かわらない').toBe(before);
    expect(r.drops.filter((d) => d.item !== 'paper'), 'かみ いがいは 落とさない').toEqual([]);
  });

  it('一部だけ 入る（かみの 山に あと 2 まいぶん 空き）: 2 まいは 持ち物・のこりの 1 まいが 足もとに', () => {
    const r = done();
    let guard = 0;
    while (r.bag.add('stone', 64) === 0 && guard++ < 1000);
    const max = itemType('paper')!.maxStack;
    r.bag.setSlot(0, { item: 'paper', count: max - 2 });
    expect(rh(r).found(AT(3))).toBeNull();
    expect(r.bag.count('paper'), '山が いっぱいに なる').toBe(max);
    expect(paperDropped(r), '入らなかった 1 まい').toBe(1);
  });

  it('レシピを おぼえる ときは 持ち物を 使わない ので、足もとにも 何も 落とさない（いっぱいでも）', () => {
    const r = houseRig();
    let guard = 0;
    while (r.bag.add('stone', 64) === 0 && guard++ < 1000);
    expect(rh(r).found(AT(0))).toBe('roof_kawara');
    expect(r.drops).toEqual([]);
  });
});
