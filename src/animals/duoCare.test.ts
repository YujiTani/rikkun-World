import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalView } from '../contracts';
import { BUG_CATCH_UPDATES, MEAT_SAY_AT, MEAT_SAY_FADE } from './animalConsts';
import { OFFSET, setupDuo, type DuoS, type Who } from './duoKit';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§8・§9.11・§10・§12.0、AC136・AC154・AC155・AC156 の ねらい・AC158・AC139）の 先行テスト（赤）。
 * あみの むし・すばこの たまご・こたつ・いただきます・ねらって いる 子 を 人ごとに。にわとり・小屋・こたつ・たまごの 数・なつき度は 世界に 1 つ。
 * 数は 設定（createLiveSettings）・定数（animalConsts）から 読む。
 *
 * ---- 実装への 約束（仕様 §8「5c（1.15）」。道具の 側は src/animals/duoKit.ts の 頭）----
 *   swingNet(block, who = 1)         … 出来事 swing・bugCatch に by（2P のみ）。むしは ふった ステップから BUG_CATCH_UPDATES の あと `deps.addItem('mushi', who)`。入らなければ toInventory false。
 *                                       あみの くじ（BugNet）は 世界に 1 つ（2 人で 1 つの 流れ。乱数の 順は かわらない）。
 *   collectCoop(coopId, who = 1)     … `deps.tryAddItem(item, who)` で その人の もちものへ。入らない 分は すばこに のこる。出来事 coopCollect に by。
 *   meat(coopId, id, who = 1)        … えらんだ 人。おわると `tryAddItem('momo_nama', who)`、入らなければ えらんだ 人の 足もと（`deps.dropItem`）。
 *                                       演出の とちゅうで その人が いなく なったら（playerOf(who) が null・leave）1P。meatStart に by。
 *   meatSay(who = 1)                 … 【足りない 口】その人の 半分に 出す 一言の ふわっと 度。演出を はじめた 人だけに 出る（もう 1 人は null）。
 *   setTargeted(id, who = 1)         … 【人ごと】ねらって いる 子。しるし（forEachVisible の targeted）は どちらかが ねらって いれば true。
 *                                       natsukiReady は その子を ねらって いる 人が いれば 出る（2P が ねらった 子の「もう いいよ」も）。
 *   leave(who, at)                   … 【足りない 口】2P が やめた とき（保存の 前）: だっこを at に おろす・届いて いない むしを at に 落とす（`deps.dropItem`）。
 *   kitIcons(aimed, holdingEgg)      … 天板の 3 わくは 2 人の どちらかから KIT_ICON_DIST 以内の こたつにも 出る。
 */

const ev = (s: DuoS) => s.m.events();

describe('AC136 あみ（2P）', () => {
  const tree = (i: number) => ({ x: 10 + (i % 8) * 10, y: 12, z: 10 + Math.floor(i / 8) * 5 });

  it('2P が ふると 出来事 swing（by: 2）。むしは BUG_CATCH_UPDATES の あと 2P の もちもの（addItem の who が 2）。bugCatch も by: 2', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    const r = s.m.swingNet(tree(0), 2);
    expect(r).toEqual({ caught: true, reason: 'chance' });
    expect(ev(s).filter((e) => e.type === 'swing')).toEqual([{ type: 'swing', ...tree(0), caught: true, reason: 'chance', by: 2 }]);
    s.step(BUG_CATCH_UPDATES - 1);
    expect(s.added).toHaveLength(0);
    s.step(1);
    expect(s.added).toEqual([{ item: 'mushi', who: 2 }]);
    expect(ev(s).filter((e) => e.type === 'bugCatch')).toEqual([{ type: 'bugCatch', toInventory: true, by: 2 }]);
  });

  it('2P の もちものが いっぱい: toInventory false（落とすのは 入れ先の しごと）。そのとき 1P の むしは ふつうに 1P へ', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    s.bag[2].full = true;
    s.m.swingNet(tree(0), 2);
    s.m.swingNet(tree(1), 1);
    s.step(BUG_CATCH_UPDATES + 2);
    const catches = ev(s).filter((e): e is Extract<AnimalEvent, { type: 'bugCatch' }> => e.type === 'bugCatch');
    expect(catches).toHaveLength(2);
    expect(catches.find((e) => 'by' in e)).toEqual({ type: 'bugCatch', toInventory: false, by: 2 });
    expect(catches.find((e) => !('by' in e))).toEqual({ type: 'bugCatch', toInventory: true });
    expect(s.added).toEqual([{ item: 'mushi', who: 1 }]);
  });

  it('1P の ふりは 今までどおり（addItem の who は 省くか 1。出来事に by は ない）', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    s.m.swingNet(tree(0));
    s.step(BUG_CATCH_UPDATES);
    expect(s.added).toHaveLength(1);
    expect(s.added[0]).toEqual({ item: 'mushi', who: 1 });
    for (const e of ev(s)) expect('by' in e, e.type).toBe(false);
  });

  it('くじ（BugNet）は 世界に 1 つ: 2 人が ばらばらに ふっても 当たりの 並びは 1 人で ふった ときと 同じ（乱数の 順は かわらない）', () => {
    const N = 40;
    const solo = setupDuo({ seed: 5 });
    const a: boolean[] = [];
    for (let i = 0; i < N; i++) {
      a.push(solo.m.swingNet(tree(i)).caught);
      solo.step(1800);
    }
    const duo = setupDuo({ seed: 5 });
    const b: boolean[] = [];
    for (let i = 0; i < N; i++) {
      b.push(duo.m.swingNet(tree(i), (i % 2 === 0 ? 1 : 2) as Who).caught);
      duo.step(1800);
    }
    expect(b).toEqual(a);
    expect(a.some((x) => x)).toBe(true);
  });

  it('同じ 木を 続けて ふる と「から」（おやすみ）は 人に よらず 世界で 1 つ', () => {
    const s = setupDuo();
    s.settings.bugChance = 1;
    expect(s.m.swingNet(tree(0), 1).caught).toBe(true);
    expect(s.m.swingNet(tree(0), 2)).toEqual({ caught: false, reason: 'empty' });
  });
});

describe('AC154 すばこの たまご・こたつ（2P）', () => {
  const nest = (s: DuoS, egg: number, gold = 0) => {
    const c = s.coop(50 + OFFSET, 50);
    const list = (s.m as unknown as { coopList: { egg: number; gold: number }[] }).coopList;
    list[0]!.egg = egg;
    list[0]!.gold = gold;
    return c;
  };

  it('collectCoop(id, 2): たまごは 2P の もちものへ（tryAddItem の who が 2）・1P は かわらない・出来事 coopCollect は by: 2', () => {
    const s = setupDuo();
    const c = nest(s, 5, 1);
    s.m.events();
    expect(s.m.collectCoop(c.id, 2)).toEqual({ egg: 5, gold: 1 });
    expect(s.tried.filter((x) => x.who === 2)).toHaveLength(6);
    expect(s.tried.filter((x) => x.who === 1)).toHaveLength(0);
    expect(s.m.coops()[0]!.nest).toEqual({ egg: 0, gold: 0 });
    expect(ev(s).filter((e) => e.type === 'coopCollect')).toEqual([{ type: 'coopCollect', egg: 5, gold: 1, by: 2 }]);
  });

  it('入らない 分は すばこに のこる（2P の あきだけ 見る。1P の あきは 関係ない）', () => {
    const s = setupDuo();
    const c = nest(s, 5);
    s.bag[2].room = 3;
    expect(s.m.collectCoop(c.id, 2)).toEqual({ egg: 3, gold: 0 });
    expect(s.m.coops()[0]!.nest.egg).toBe(2);
    s.bag[2].full = true;
    expect(s.m.collectCoop(c.id, 2)).toEqual({ egg: 0, gold: 0 });
    expect(s.m.coops()[0]!.nest.egg).toBe(2);
    expect(s.m.collectCoop(c.id, 1)).toEqual({ egg: 2, gold: 0 });
  });

  it('同じ ステップに 2 人が あつめる: 先に 呼ばれた 1P が ぜんぶ、2P は 何も 取れない', () => {
    const s = setupDuo();
    const c = nest(s, 4);
    expect(s.m.collectCoop(c.id, 1)).toEqual({ egg: 4, gold: 0 });
    expect(s.m.collectCoop(c.id, 2)).toEqual({ egg: 0, gold: 0 });
    expect(s.tried.every((x) => x.who === 1)).toBe(true);
  });

  it('1P の あつめかたは 今までどおり（who を 省く）: tryAddItem の who は 省くか 1', () => {
    const s = setupDuo();
    const c = nest(s, 2);
    expect(s.m.collectCoop(c.id)).toEqual({ egg: 2, gold: 0 });
    expect(s.tried.map((x) => x.who)).toEqual([1, 1]);
  });

  it('こたつの 天板の 3 わくは 2P から KIT_ICON_DIST 以内の こたつにも 出る（1P だけでは 遠い）。2P が いなければ 出ない', () => {
    const s = setupDuo();
    const x = 20 + OFFSET + 3;
    s.world.setBlock(x, 9, 20, 'nukunuku');
    expect(s.m.useKit(x, 9, 20, 'egg')).toBe('put');
    const rows = s.m.kitIcons(null, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ x, y: 9, z: 20 });
    const t = setupDuo({ p2: false });
    t.world.setBlock(x, 9, 20, 'nukunuku');
    expect(t.m.useKit(x, 9, 20, 'egg')).toBe('put');
    expect(t.m.kitIcons(null, false)).toHaveLength(0);
  });
});

describe('AC155 いただきます（2P）', () => {
  /** 小屋の 外から 2P が えらぶ。小屋は 2P の 近く（OFFSET） */
  const farm = (s: DuoS, n = 2) => {
    const c = s.coop(50 + OFFSET, 50);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) ids.push(s.kid(c, {}, (i % 3) - 1, 1));
    s.stand(2, 46.5 + OFFSET, 50.5);
    s.step(2);
    return { c, ids };
  };

  it('2P が えらぶ: meatStart は by: 2。おわると momo_nama が meatPerBird こ 2P の もちもの（tryAddItem の who が 2）・1P は かわらない', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    s.m.events();
    expect(s.m.meat(c.id, ids[0]!, 2)).toEqual({ ok: true, reason: null });
    expect(ev(s).filter((e) => e.type === 'meatStart')).toEqual([{ type: 'meatStart', id: ids[0], coop: c.id, by: 2 }]);
    s.step(s.settings.meatTicks);
    const got = s.tried.filter((x) => x.item === 'momo_nama');
    expect(got).toHaveLength(Math.round(s.settings.meatPerBird));
    expect(got.every((x) => x.who === 2)).toBe(true);
    expect(s.m.list().some((a) => a.id === ids[0])).toBe(false);
  });

  it('2P の もちものが いっぱい: お にくは 2P の 足もとに 落ちる（1P の 足もとでは ない）', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    s.bag[2].full = true;
    s.m.meat(c.id, ids[0]!, 2);
    s.step(s.settings.meatTicks);
    expect(s.dropped).toHaveLength(Math.round(s.settings.meatPerBird));
    for (const d of s.dropped) {
      expect(d.item).toBe('momo_nama');
      expect(Math.hypot(d.at.x - s.pl2.cur!.position.x, d.at.z - s.pl2.cur!.position.z)).toBeLessThan(1);
    }
    expect(s.tried).toHaveLength(0);
  });

  it('とちゅうで 2P が やめたら（leave）お にくは 1P へ（もちもの・足もと とも 1P）', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    s.m.meat(c.id, ids[0]!, 2);
    s.step(30);
    s.m.leave(2, { ...s.pl2.cur!.position });
    s.pl2.cur = null;
    s.step(s.settings.meatTicks);
    const got = s.tried.filter((x) => x.item === 'momo_nama');
    expect(got).toHaveLength(Math.round(s.settings.meatPerBird));
    expect(got.every((x) => x.who === 1)).toBe(true);
  });

  it('保存の 前の finishMeat: 2P の 演出は 2P の もちものへ', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    s.m.meat(c.id, ids[0]!, 2);
    s.step(40);
    s.m.finishMeat();
    expect(s.tried.filter((x) => x.item === 'momo_nama').every((x) => x.who === 2)).toBe(true);
    expect(s.tried.length).toBeGreaterThan(0);
  });

  it('同じ 小屋で 演出中は もう 1 人の おにく は busy（1P の 押しも 2P の 押しも）', () => {
    const s = setupDuo();
    const { c, ids } = farm(s, 3);
    expect(s.m.meat(c.id, ids[0]!, 2).ok).toBe(true);
    expect(s.m.meat(c.id, ids[1]!, 1)).toEqual({ ok: false, reason: 'busy' });
    expect(s.m.meat(c.id, ids[1]!, 2)).toEqual({ ok: false, reason: 'busy' });
  });

  it('一言（meatSay）は えらんだ 人の 半分だけ: 2P が えらべば meatSay(2) だけ、1P が えらべば meatSay() だけ', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    expect(s.m.meatSay(2)).toBeNull();
    s.m.meat(c.id, ids[0]!, 2);
    s.step(MEAT_SAY_AT + MEAT_SAY_FADE);
    expect(s.m.meatSay(2)).toBeGreaterThan(0.99);
    expect(s.m.meatSay(1)).toBeNull();
    expect(s.m.meatSay()).toBeNull();
    const t = setupDuo();
    const f = farm(t);
    t.m.meat(f.c.id, f.ids[0]!);
    t.step(MEAT_SAY_AT + MEAT_SAY_FADE);
    expect(t.m.meatSay()).toBeGreaterThan(0.99);
    expect(t.m.meatSay(1)).toBeGreaterThan(0.99);
    expect(t.m.meatSay(2)).toBeNull();
  });

  it('1P が えらんだ 演出は 今までどおり（tryAddItem の who は 省くか 1。meatStart に by は ない）', () => {
    const s = setupDuo();
    const { c, ids } = farm(s);
    s.m.events();
    s.m.meat(c.id, ids[0]!);
    expect('by' in ev(s).find((e) => e.type === 'meatStart')!).toBe(false);
    s.step(s.settings.meatTicks);
    expect(s.tried.every((x) => x.who === 1)).toBe(true);
  });
});

describe('ねらって いる 子は 人ごと（AC156 の もと。natsukiReady・しるし）', () => {
  const targeted = (s: DuoS): number[] => {
    const out: number[] = [];
    s.m.forEachVisible((v: AnimalView) => {
      if (v.targeted) out.push(v.id);
    });
    return out;
  };

  it('setTargeted(id, 2) と setTargeted(id2, 1): しるしは 2 羽に 出る。2P の ねらいを 外しても 1P の ねらいは のこる', () => {
    const s = setupDuo();
    const a = s.friend(1);
    const b = s.friend(2);
    s.m.setTargeted(a, 1);
    s.m.setTargeted(b, 2);
    expect(targeted(s).sort()).toEqual([a, b].sort());
    s.m.setTargeted(null, 2);
    expect(targeted(s)).toEqual([a]);
    s.m.setTargeted(b, 2);
    s.m.setTargeted(null);
    expect(targeted(s)).toEqual([b]);
  });

  it('setTargeted(id)（who なし）は 1P の ねらい。今までどおり しるしが 出る', () => {
    const s = setupDuo();
    const a = s.friend(1);
    s.m.setTargeted(a);
    expect(targeted(s)).toEqual([a]);
  });

  it('natsukiReady（もう いいよ）は ねらって いる 子に だけ: 2P が ねらった 子の 分も 出る。だれも ねらって いない 子は 出ない', () => {
    const s = setupDuo();
    s.settings.natsukiBugWaitTicks = 100;
    const a = s.friend(1, -1, 0, { stage: 'adult', natsuki: 10, natsukiBugWait: 9 });
    const b = s.friend(2, -1, 0, { stage: 'adult', natsuki: 10, natsukiBugWait: 9 });
    const c = s.friend(2, -2, 1, { stage: 'adult', natsuki: 10, natsukiBugWait: 9 });
    s.m.setTargeted(a, 1);
    s.m.setTargeted(b, 2);
    s.m.events();
    s.step(10);
    const ready = ev(s).filter((e): e is Extract<AnimalEvent, { type: 'natsukiReady' }> => e.type === 'natsukiReady');
    expect(ready.map((e) => e.id).sort()).toEqual([a, b].sort());
    expect(ready.some((e) => e.id === c)).toBe(false);
  });
});
