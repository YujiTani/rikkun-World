import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { addPerson, type Person } from '../stockKit';
import { SCROLL, ed, fillBag, openEd, rh, scrolls, squash, type Who } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3.3 版）AC1b の 2P（COOP-1）: 持ち物は 1P・2P 別々。まきものは 手に 入れた 人の 持ち物に 入り、その 人が 使う。
 * おぼえた 物は 世界に 1 つの 記録 なので、だれが 使っても 1P の エディターでも 出る。テロップ・紙ふぶきは **使った 人の 半分**（COOP-1 §3.7 (g)）。
 * 窓口（e2e/helpers/house.ts の「2A の 約束」）: found(at, who) ・read(who)・HouseSystem の deps `bagOf(who)`・`drop(item, count, who)`・`recipeBand(text, who)`（houseRig が rig.drops・rig.bands に ためる）。
 */

const AT = { x: 100, y: 43, z: -300 };

function rig2() {
  let person!: Person;
  const r = houseRig({
    extraDeps: (st) => {
      person = addPerson(st, { x: st.player.x + 2, y: st.player.y, z: st.player.z });
      return { bagOf: (who: Who) => (who === 1 ? st.bag : person.bag) };
    },
  });
  return { r, get p2() { return person; } };
}

describe('AC1 2P が 手に 入れる（found(at, 2)）', () => {
  it('2P の 持ち物に 入る。1P の 持ち物は かわらない。おぼえない。はじめての テロップは 2P の 半分', () => {
    const { r, p2 } = rig2();
    rh(r).found(AT, 2);
    expect(scrolls(r, p2.bag), '2P の 持ち物').toBe(1);
    expect(scrolls(r), '1P の 持ち物は かわらない').toBe(0);
    expect(rh(r).recipes().learned).toEqual([]);
    expect(r.bands.map((b) => b.who), 'テロップは 2P の 半分').toEqual([2]);
    expect(squash(r.bands[0]!.text)).toBe('レシピのまきものをてにいれた！てにもってみぎクリックでよもう');
  });

  it('2P の 持ち物が いっぱい: 2P の 足もとに 落ちる（1P の 持ち物には 入らない）', () => {
    const { r, p2 } = rig2();
    fillBag(r, p2.bag);
    rh(r).found(AT, 2);
    expect(r.drops).toEqual([{ item: SCROLL, count: 1, who: 2 }]);
    expect(scrolls(r)).toBe(0);
  });
});

describe('AC1b 2P が 使う（read(2)）', () => {
  it('2P の 持ち物の まきもの が 1 へり、おぼえた 物は 1 ふえる。1P の 持ち物は かわらない。テロップ・音は 使った 2P の 半分', () => {
    const { r, p2 } = rig2();
    p2.bag.add(SCROLL, 2);
    r.bag.add(SCROLL, 3); // 1P の まきもの（へらない）
    expect(rh(r).read(2)).toBe(true);
    expect(scrolls(r, p2.bag), '2P の まきもの 1 へる').toBe(1);
    expect(scrolls(r), '1P の まきものは かわらない').toBe(3);
    expect(rh(r).recipes().learned, '1 つ おぼえた').toEqual(['roof_kawara']);
    expect(r.bands.at(-1)!.who, 'テロップは 2P の 半分').toBe(2);
    expect(squash(r.bands.at(-1)!.text)).toMatch(/^.+のレシピをおぼえた！けんちくしさんのせっけいずでえらべるよ$/);
    expect(r.sfx.filter((e) => (e as { k: string }).k === 'recipe')).toHaveLength(1);
  });

  it('2P が おぼえた 物は 1P の エディターでも 出る（世界に 1 つの 記録）', () => {
    const { r, p2 } = rig2();
    p2.bag.add(SCROLL, 1);
    rh(r).read(2);
    openEd(r); // 1P が 建築士さんに 話して エディターを 開く
    expect(ed(r).marks, '1P の エディターに「あたらしい！」').toContain('part-roof');
    r.sys.press('part-roof');
    expect(ed(r).popupRows.flat(), 'かわらの やねが ならぶ').toEqual(expect.arrayContaining(rh(r).recipeKinds('roof_kawara')));
  });

  it('自分の 持ち物に まきものが なければ 使えない（1P は 2P の まきものを 使えない・2P は 1P の まきものを 使えない）。何も おきない', () => {
    const { r, p2 } = rig2();
    p2.bag.add(SCROLL, 1);
    expect(rh(r).read(1), '1P は 持って いない').toBe(false);
    expect(rh(r).read(), '引数なしは 1P').toBe(false);
    expect(scrolls(r, p2.bag)).toBe(1);
    expect(rh(r).recipes().learned).toEqual([]);
    r.bag.add(SCROLL, 1);
    p2.bag.remove(SCROLL, 1);
    expect(rh(r).read(2), '2P は 持って いない').toBe(false);
    expect(scrolls(r), '1P の まきものは そのまま').toBe(1);
    expect(rh(r).recipes().learned).toEqual([]);
    expect(r.bands, 'テロップなし').toEqual([]);
  });

  it('2P が 1P と 交互に 使っても おぼえる 順は 1 本（1P が 使った 2 つ目は 2P が 使っても 同じ）', () => {
    const a = rig2();
    const b = rig2();
    a.r.bag.add(SCROLL, 2);
    b.p2.bag.add(SCROLL, 1);
    b.r.bag.add(SCROLL, 1);
    rh(a.r).read(1);
    rh(a.r).read(1);
    rh(b.r).read(2);
    rh(b.r).read(1);
    expect(rh(b.r).recipes().learned).toEqual(rh(a.r).recipes().learned);
  });

  it('ぜんぶ おぼえた あとに 2P が 使う: 2P の まきもの 1 まい へって 2P の 持ち物に かみ 3 まい。入らなければ 2P の 足もとへ', () => {
    const { r, p2 } = rig2();
    for (const id of rh(r).recipes().all) rh(r).learn(id);
    p2.bag.add(SCROLL, 1);
    expect(rh(r).read(2)).toBe(true);
    expect(p2.bag.count('paper'), '2P に かみ 3 まい').toBe(3);
    expect(r.bag.count('paper'), '1P には 入らない').toBe(0);
    p2.bag.remove('paper', 3); // かみの 山の 空きを なくす
    p2.bag.add(SCROLL, 2);
    fillBag(r, p2.bag);
    expect(rh(r).read(2)).toBe(true);
    expect(r.drops.filter((d) => d.item === 'paper').map((d) => d.who), '足もとは 2P').toEqual([2]);
    expect(r.drops.filter((d) => d.item === 'paper')[0]!.count).toBe(3);
  });
});
