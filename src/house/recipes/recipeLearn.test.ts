import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { SCROLL, bandOut, fillBag, rh, scrolls, squash, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3.3 版）AC1（まきものを 手に 入れる 側）・AC1b（使うまで おぼえない・使うと 1 まい）: 仕様 docs/design/HOUSE-2.md §2.1・§2.2・§5。
 * 3.3 版で かわった こと（yuzu 2026-11-11 09:45「アイテムは 使わないと 効果が 出ない」）: 拾った 場では おぼえない。持ち物に アイテム `recipe_scroll` が 入る だけ。
 * 手に もって 右クリックで 1 まい へって 1 つ おぼえる。テロップ・音・紙ふぶきは 使った その場。
 * 窓口（約束は e2e/helpers/house.ts の「2A の 約束」・recipeKit.ts）:
 *   found(at, who?)  手に 入れた（宝箱の わく・まきもの）。who の 持ち物に recipe_scroll 1 まい（入らなければ 足もとへ）。おぼえない。はじめての 1 回だけ 使い方の テロップ
 *   read(who?)       手に もって 右クリック 1 回の 本体。持って いれば 1 まい へらして 1 つ おぼえる（true）。持って いなければ false で 何も おきない
 *   recipes()  recipeBand()  celebrate().confetti  音は rig.sfx（{ k: 'recipe' }・{ k: 'recipeAll' }）。`learn(id)` は テスト用の 近道 なので ここ〔AC1b〕では 使わない
 * 「右クリックの はたらきが ある ブロックが 先」「手に もって いない」「持ち物の 画面」「長押しで 続けない」は 右クリックの 判定 src/dig/rightClickScroll.test.ts、
 * アイテムの 登録は src/content/items/recipeScroll.test.ts、坑道 側は src/world/gen/mineRecipe.test.ts、2P は recipeRead2p.test.ts、画面を 通した 流れは e2e/house2.spec.ts。
 */

const BAND = /^.+のレシピをおぼえた！けんちくしさんのせっけいずでえらべるよ$/;
/** はじめて 手に 入れた ときの テロップ（仕様 §2.1） */
const HOWTO = 'レシピのまきものをてにいれた！てにもってみぎクリックでよもう';
const count = (r: Rig, k: string): number => r.sfx.filter((e) => (e as { k: string }).k === k).length;
const AT = { x: 100, y: 43, z: -300 };

describe('AC1 手に 入れる（found）: 持ち物に 入る だけ。まだ おぼえない', () => {
  it('持ち物に recipe_scroll が 1 まい ふえる。learned・fresh・nextPick は かわらない。音も 紙ふぶきも ない', () => {
    const r = houseRig();
    const confetti = r.hook.celebrate().confetti;
    rh(r).found(AT);
    expect(scrolls(r), '持ち物に まきもの 1 まい').toBe(1);
    expect(rh(r).recipes(), 'まだ おぼえて いない').toMatchObject({ learned: [], fresh: [], nextPick: 'roof_kawara' });
    expect(r.sfx, '拾った とき 音を 足さない（仕様 §2.2）').toEqual([]);
    expect(r.hook.celebrate().confetti).toBe(confetti);
  });

  it('何まい 拾っても おぼえない。時間が たっても おぼえない（持って いる だけ・ステップを 進めるだけ では かわらない）', () => {
    const r = houseRig();
    for (let i = 0; i < 3; i++) rh(r).found({ ...AT, x: AT.x + i * 211 });
    expect(scrolls(r), '重ねて 3 まい').toBe(3);
    r.run(600);
    expect(rh(r).recipes().learned).toEqual([]);
    expect(scrolls(r)).toBe(3);
  });

  it('持ち物が いっぱい: 足もとに 落ちた 物に なる（recipe_scroll 1 まい）。持ち物は かわらない。おぼえない', () => {
    const r = houseRig();
    fillBag(r);
    const before = JSON.stringify(r.bag.slots());
    rh(r).found(AT);
    expect(r.drops, '足もとに まきもの 1 まい').toEqual([{ item: SCROLL, count: 1, who: 1 }]);
    expect(JSON.stringify(r.bag.slots()), '持ち物は かわらない').toBe(before);
    expect(rh(r).recipes().learned).toEqual([]);
  });

  it('たんすに 入れても・持ち物から なくなっても おぼえない（ほかの 物を 持って いても おなじ）', () => {
    const r = houseRig();
    rh(r).found(AT);
    r.bag.remove(SCROLL, 1); // たんすに しまった・落とした つもり
    const tansu = r.st.putTansu(2, 0, { [SCROLL]: 3 });
    r.run(300);
    expect(r.st.inTansu(tansu, SCROLL)).toBe(3);
    expect(rh(r).recipes().learned).toEqual([]);
    expect(rh(r).read(), '持ち物には ない（たんすの 中は 使えない）').toBe(false);
    expect(rh(r).recipes().learned).toEqual([]);
  });
});

describe('AC1 はじめて 手に 入れた ときだけ 使い方の テロップ', () => {
  it('はじめて: テロップ「レシピの まきもの を てに いれた！ てに もって みぎクリック で よもう」が 出る。時間が たつと 消える。音は 鳴らさない', () => {
    const r = houseRig();
    expect(rh(r).recipeBand(), '拾う 前は 出て いない').toBeNull();
    rh(r).found(AT);
    const band = rh(r).recipeBand();
    expect(band, 'テロップ').not.toBeNull();
    expect(squash(band!.text)).toBe(HOWTO);
    expect(band!.ticksLeft).toBeGreaterThan(0);
    expect(r.sfx, 'おぼえた 音では ない').toEqual([]);
    bandOut(r);
  });

  it('2 まい目からは 出ない（同じ 世界で 何回 拾っても）。まきものを 使った あとの 拾いでも 出ない', () => {
    const r = houseRig();
    rh(r).found(AT);
    bandOut(r);
    rh(r).found({ ...AT, x: AT.x + 300 });
    expect(rh(r).recipeBand(), '2 まい目').toBeNull();
    expect(rh(r).read()).toBe(true);
    bandOut(r);
    rh(r).found({ ...AT, x: AT.x + 600 });
    expect(rh(r).recipeBand(), '使った あとの 3 まい目').toBeNull();
  });

  it('保存して 開きなおしても 出ない（「はじめて」の 記録は 保存に 入る）。新しい 世界では また 出る', () => {
    const a = houseRig();
    rh(a).found(AT);
    bandOut(a);
    const saved = JSON.parse(JSON.stringify(a.sys.serialize()));
    const b = houseRig();
    b.sys.load(saved);
    rh(b).found(AT);
    expect(rh(b).recipeBand(), '開きなおした 世界では 出ない').toBeNull();
    const c = houseRig();
    c.sys.load(null); // 新しい 世界
    rh(c).found(AT);
    expect(squash(rh(c).recipeBand()!.text), '新しい 世界では はじめて').toBe(HOWTO);
  });

  it('持ち物が いっぱいで 足もとに 落ちた ときも、はじめての テロップは 1 回 出る（6 歳が「何も おきない」と 思わない ため）', () => {
    const r = houseRig();
    fillBag(r);
    rh(r).found(AT);
    expect(squash(rh(r).recipeBand()!.text)).toBe(HOWTO);
    bandOut(r);
    rh(r).found(AT);
    expect(rh(r).recipeBand(), '2 回目は 出ない').toBeNull();
  });
});

describe('AC1b 使うと 1 まい へって 1 つ おぼえる（read）', () => {
  it('手に もって 右クリック 1 回: まきもの 1 まい へる・learned が 1 ふえる（ふえる 物は その 直前の nextPick・はじめは roof_kawara）・「あたらしい！」', () => {
    const r = houseRig();
    rh(r).found(AT);
    bandOut(r);
    const next = rh(r).recipes().nextPick;
    expect(next).toBe('roof_kawara');
    expect(scrolls(r)).toBe(1);
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r), '1 まい へった').toBe(0);
    expect(rh(r).recipes(), '1 つ おぼえた').toMatchObject({ learned: [next], fresh: [next] });
    expect(rh(r).recipes().nextPick, 'つぎは ちがう 物').not.toBe(next);
  });

  it('3 まい 持って 1 回 使うと のこり 2 まい・おぼえた 物 1', () => {
    const r = houseRig();
    r.bag.add(SCROLL, 3);
    expect(rh(r).read()).toBe(true);
    expect(scrolls(r)).toBe(2);
    expect(rh(r).recipes().learned).toHaveLength(1);
  });

  it('使った その コマに テロップ「<名前>の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ」と 音 { k: recipe } が ちょうど 1 回。時間が たつと 消える', () => {
    const r = houseRig();
    r.bag.add(SCROLL, 1);
    expect(rh(r).recipeBand(), '使う 前は 出て いない').toBeNull();
    expect(count(r, 'recipe'), '使う 前は 音 なし').toBe(0);
    expect(rh(r).read()).toBe(true);
    const band = rh(r).recipeBand();
    expect(band, 'テロップ').not.toBeNull();
    expect(squash(band!.text)).toMatch(BAND);
    expect(squash(band!.text), 'レシピの 名前（形の 名前。案の 名前は つかない）').toContain('かわらのやね');
    for (const style of ['むら', 'おしろ', 'こうざん']) expect(squash(band!.text), `${style}の は つけない`).not.toContain(`${style}の`);
    expect(band!.ticksLeft).toBeGreaterThan(0);
    expect(count(r, 'recipe'), '音').toBe(1);
    expect(count(r, 'recipeAll')).toBe(0);
    bandOut(r);
  });

  it('1 回の 右クリックで 1 まい: read() を 1 回 よぶと ちょうど 1 まい（2 まい 持って いても 2 つは おぼえない）', () => {
    const r = houseRig();
    r.bag.add(SCROLL, 2);
    rh(r).read();
    expect(rh(r).recipes().learned, '1 つだけ').toHaveLength(1);
    expect(scrolls(r)).toBe(1);
  });

  it('持って いなければ 何も おきない: false・learned・持ち物・テロップ・音は そのまま（持っている 物が ほかの 物でも 同じ）', () => {
    const r = houseRig();
    r.bag.add('stone', 5);
    const slots = JSON.stringify(r.bag.slots());
    expect(rh(r).read()).toBe(false);
    expect(rh(r).recipes()).toMatchObject({ learned: [], fresh: [], nextPick: 'roof_kawara' });
    expect(JSON.stringify(r.bag.slots())).toBe(slots);
    expect(rh(r).recipeBand()).toBeNull();
    expect(r.sfx).toEqual([]);
  });

  it('持ち物が いっぱいでも 使える（まきものを へらす だけ。かみ いがいは 何も 落とさない）', () => {
    const r = houseRig();
    r.bag.add(SCROLL, 1);
    fillBag(r);
    expect(rh(r).read()).toBe(true);
    expect(rh(r).recipes().learned).toEqual(['roof_kawara']);
    expect(r.drops, 'レシピの ときは 何も 落とさない').toEqual([]);
  });

  it('ぜんぶ おぼえた とき（さいごの 1 まい）だけ「レシピを ぜんぶ おぼえた！」・紙ふぶき +1・音 { k: recipeAll }。ほかの レシピでは 紙ふぶきは ふえない', () => {
    const r = houseRig();
    const total = rh(r).recipes().all.length;
    const c0 = r.hook.celebrate().confetti;
    for (let i = 0; i < total - 1; i++) {
      r.bag.add(SCROLL, 1);
      expect(rh(r).read(), `${i + 1} まい目`).toBe(true);
      expect(squash(rh(r).recipeBand()!.text), `${i + 1} まい目`).toMatch(BAND);
      expect(r.hook.celebrate().confetti, `${i + 1} まい目: 紙ふぶきは まだ`).toBe(c0);
    }
    expect(count(r, 'recipeAll'), 'まだ 大きい 音は ない').toBe(0);
    r.bag.add(SCROLL, 1);
    expect(rh(r).read(), 'さいごの 1 まい').toBe(true);
    expect(rh(r).recipes().nextPick).toBeNull();
    expect(squash(rh(r).recipeBand()!.text)).toBe('レシピをぜんぶおぼえた！');
    expect(r.hook.celebrate().confetti, 'ぜんぶ おぼえた とき ちょうど +1').toBe(c0 + 1);
    expect(count(r, 'recipeAll')).toBe(1);
    expect(count(r, 'recipe'), 'ふつうの 音は ぜんぶ-1 まいぶん').toBe(total - 1);
    expect(scrolls(r)).toBe(0);
    expect(r.bag.count('paper'), 'ぜんぶ おぼえた とき かみは もらえない（さいごの 1 まいは レシピに なった）').toBe(0);
  });
});

describe('近道 learn(id)（テスト用。まきものを 使わずに おぼえる。AC1b では 使わない）', () => {
  it('まだの 物は true・learned と fresh に おぼえた 順で ふえる。もう おぼえた・知らない id は false で かわらない。持ち物は 使わない（いっぱいでも おぼえる）', () => {
    const r = houseRig();
    const [a, b] = rh(r).recipes().all as [string, string];
    fillBag(r);
    const before = JSON.stringify(r.bag.slots());
    expect(rh(r).learn(b)).toBe(true);
    expect(rh(r).learn(a)).toBe(true);
    expect(rh(r).recipes()).toMatchObject({ learned: [b, a], fresh: [b, a] });
    expect(rh(r).learn(a), 'もう おぼえた').toBe(false);
    expect(rh(r).learn('nothing_here'), '知らない id').toBe(false);
    expect(rh(r).recipes()).toMatchObject({ learned: [b, a], fresh: [b, a] });
    expect(JSON.stringify(r.bag.slots()), '持ち物は かわらない').toBe(before);
  });
});
