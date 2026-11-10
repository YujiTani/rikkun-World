import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { rh } from './recipeKit';

/**
 * HOUSE-2A（#364）AC1（おぼえる 側）・AC2・仕様 §2.2: おぼえた 記録・「あたらしい！」・テロップ・音・ぜんぶの 紙ふぶき。
 * 窓口: house.recipes()・learn(id)・recipeBand()・celebrate().confetti、音は rig.sfx（{ k: 'recipe' }・{ k: 'recipeAll' }）。約束は e2e/helpers/house.ts の「2A の 約束」。
 * 坑道の 宝箱・まきものから 拾う 側は src/world/gen/mineRecipe.test.ts、画面を 通した 流れは e2e/house2.spec.ts。
 */

const squash = (s: string): string => s.replace(/\s+/g, '');
const BAND = /^.+のレシピをおぼえた！けんちくしさんのせっけいずでえらべるよ$/;

describe('おぼえた 記録', () => {
  it('はじめは 何も おぼえて いない（learned・fresh は 空）。all は 表の ぜんぶ', () => {
    const r = houseRig();
    const x = rh(r).recipes();
    expect(x.learned).toEqual([]);
    expect(x.fresh).toEqual([]);
    expect(x.all.length).toBeGreaterThan(0);
  });

  it('learn(id): まだの 物は true・learned と fresh に おぼえた 順で ふえる。もう おぼえた・知らない id は false で かわらない', () => {
    const r = houseRig();
    const [a, b] = rh(r).recipes().all as [string, string];
    expect(rh(r).learn(b)).toBe(true);
    expect(rh(r).learn(a)).toBe(true);
    expect(rh(r).recipes()).toMatchObject({ learned: [b, a], fresh: [b, a] });
    expect(rh(r).learn(a), 'もう おぼえた').toBe(false);
    expect(rh(r).learn('nothing_here'), '知らない id').toBe(false);
    expect(rh(r).recipes()).toMatchObject({ learned: [b, a], fresh: [b, a] });
  });

  it('持ち物は 使わない: いっぱいでも おぼえる。持ち物は へらない・ふえない', () => {
    const r = houseRig();
    const before = JSON.stringify(r.bag.slots());
    expect(rh(r).learn(rh(r).recipes().all[0]!)).toBe(true);
    expect(JSON.stringify(r.bag.slots())).toBe(before);
  });
});

describe('おぼえた テロップと 音', () => {
  it('おぼえると テロップ「<名前>の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ」と 音 { k: recipe } が ちょうど 1 回。時間が たつと 消える', () => {
    const r = houseRig();
    expect(rh(r).recipeBand(), 'おぼえる 前は 出て いない').toBeNull();
    rh(r).learn('roof_kawara');
    const band = rh(r).recipeBand();
    expect(band, 'テロップ').not.toBeNull();
    expect(squash(band!.text)).toMatch(BAND);
    expect(squash(band!.text), 'レシピの 名前').toContain('かわらのやね');
    expect(band!.ticksLeft).toBeGreaterThan(0);
    expect(r.sfx.filter((e) => (e as { k: string }).k === 'recipe')).toHaveLength(1);
    let n = 0;
    while (rh(r).recipeBand() && n++ < 5000) r.run(1);
    expect(rh(r).recipeBand(), '長さが 来たら 消える').toBeNull();
  });

  it('ぜんぶ おぼえた とき（さいごの 1 まい）だけ「レシピを ぜんぶ おぼえた！」・紙ふぶき +1・音 { k: recipeAll }。ほかの レシピでは 紙ふぶきは ふえない', () => {
    const r = houseRig();
    const all = rh(r).recipes().all;
    const c0 = r.hook.celebrate().confetti;
    for (const id of all.slice(0, -1)) {
      expect(rh(r).learn(id)).toBe(true);
      expect(squash(rh(r).recipeBand()!.text), id).toMatch(BAND);
      expect(r.hook.celebrate().confetti, `${id}: 紙ふぶきは まだ`).toBe(c0);
    }
    expect(r.sfx.filter((e) => (e as { k: string }).k === 'recipeAll'), 'まだ 大きい 音は ない').toHaveLength(0);
    expect(rh(r).learn(all.at(-1)!)).toBe(true);
    expect(squash(rh(r).recipeBand()!.text)).toBe('レシピをぜんぶおぼえた！');
    expect(r.hook.celebrate().confetti, 'ぜんぶ おぼえた とき ちょうど +1').toBe(c0 + 1);
    expect(r.sfx.filter((e) => (e as { k: string }).k === 'recipeAll')).toHaveLength(1);
    expect(r.sfx.filter((e) => (e as { k: string }).k === 'recipe'), 'ふつうの 音は ぜんぶ-1 まいぶん').toHaveLength(all.length - 1);
  });
});
