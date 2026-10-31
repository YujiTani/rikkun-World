import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { MSG } from './build/tuning';
import { PAD, houseRig } from './houseRig';

/**
 * HOUSE-1E〔#374〕材料は もちもの＋近くの たんす（くらは ない）。AC9・AC9b・AC18・AC20・AC20b・AC51・AC34 ⑤。
 * たんすは 本物（StorageSystem ＋ CraftSystemImpl ＝「つくる」と 同じ 数え方・きょり）。約束は e2e/helpers/house.ts の「1E の 約束」〔材料〕と src/house/stockKit.ts。
 * 材料は ぜんぶ もちもの か たんすに 入れる（rig.bag.add・rig.st.putTansu）。
 */

type Rig = ReturnType<typeof houseRig>;
const FUTON = [{ op: 'place', kind: 'futon', x: 0, z: 0 }];
const row = <T extends { item: string }>(rows: T[], item: string): T | undefined => rows.find((r) => r.item === item);
/** 一覧の カード slot の enabled（「けんちくを はじめる」を 開いて しらべ、とじる） */
function enabledInList(r: Rig, slot: number): boolean | undefined {
  r.talk();
  r.sys.press('build');
  const on = r.sys.menu().buttons.find((b) => b.id === `pick-${slot}`)?.enabled;
  r.sys.press('close');
  return on;
}
/** もう 1 けん 建て はじめた 世界（はじめての 家の おまけは もう ない。AC51） */
const notFirst = (r: Rig): void => r.sys.build.builder.load({ v: 1, active: null, pending: [], bonusUsed: true });

describe('AC9 ひつような もの（need）: ある ＝ もちもの ＋ 近くの たんす', () => {
  it('もちものに き 10・いし 25（たんすには ない）。5×5・窓 0・ふとん 1 → き {24, 10, 14}・いし {25, 25, 0}・ぬの {3, 0, 3}・いと {1, 0, 1}。何度 よんでも 同じ', () => {
    const r = houseRig();
    notFirst(r);
    r.bag.add('log', 10);
    r.bag.add('stone', 25);
    r.talk();
    r.sys.press('editor');
    expect(r.hook.edit(FUTON[0])).toBe(true);
    const rows = r.hook.need();
    expect(rows.map((x) => x.item)).toEqual(['log', 'stone', 'cloth', 'string']);
    expect(row(rows, 'log')).toMatchObject({ need: 24, have: 10, short: 14, bonus: 0 });
    expect(row(rows, 'stone')).toMatchObject({ need: 25, have: 25, short: 0, bonus: 0 });
    expect(row(rows, 'cloth')).toMatchObject({ need: 3, have: 0, short: 3, bonus: 0 });
    expect(row(rows, 'string')).toMatchObject({ need: 1, have: 0, short: 1, bonus: 0 });
    expect(r.hook.need()).toEqual(rows);
    expect(r.hook.need()).toEqual(rows);
  });

  it('たんす・craft を わたさない（もちものだけ）でも 同じ 数。くらの 数は どこにも 出ない', () => {
    const r = houseRig({ stock: false });
    notFirst(r);
    r.bag.add('log', 10);
    r.bag.add('stone', 25);
    r.talk();
    r.sys.press('editor');
    r.hook.edit(FUTON[0]);
    expect(row(r.hook.need(), 'log')).toMatchObject({ need: 24, have: 10, short: 14 });
    expect(row(r.hook.need(), 'stone')).toMatchObject({ need: 25, have: 25, short: 0 });
  });
});

describe('AC9b ある ＝ もちもの ＋ craftTansuRange（40）の 中の たんす', () => {
  /** もちもの き 3・30 マスの たんす き 2・50 マスの たんす き 9 */
  function withTansu(): Rig {
    const r = houseRig();
    r.bag.add('log', 3);
    r.st.putTansu(30, 0, { log: 2 });
    r.st.putTansu(0, 50, { log: 9 });
    return r;
  }
  const haveLog = (r: Rig): number | undefined => row(r.hook.need(), 'log')?.have;

  it('き の have は 5（50 マスの たんすは 範囲の 外で 数えない）。craftTansuRange を 60 に すると 14', () => {
    const r = withTansu();
    r.talk();
    r.sys.press('editor');
    r.hook.edit(FUTON[0]);
    expect(haveLog(r)).toBe(5);
    r.st.range.v = 60;
    expect(haveLog(r), '範囲を ひろげると 50 マスの たんすも').toBe(14);
    r.st.range.v = 25;
    expect(haveLog(r), '25 マスまで なら 30 マスの たんすも 外').toBe(3);
  });

  it('エディター（need()）でも「けんちくを はじめる」（need(slot)・buildNeedRows）でも 同じ 数。開くたびに 数えなおす（たんすの 中身が かわれば かわる）', () => {
    const r = withTansu();
    r.talk();
    const slot = r.make(FUTON);
    expect(row(r.hook.need(slot), 'log')).toMatchObject({ have: 5 });
    expect(row(r.hook.need(), 'log'), 'エディターの 今の 形').toMatchObject({ have: 5 });
    r.sys.press('close');
    r.talk();
    r.sys.press('build');
    r.sys.press('pick', slot); // たりない ので ひつような もの
    expect(r.sys.menu()).toMatchObject({ page: 'need', build: true });
    expect(row(r.sys.buildNeedRows(), 'log')).toMatchObject({ have: 5 });
    const near = r.st.storage.list().find((p) => Math.abs(p.x - (Math.floor(r.player.x) + 30)) === 0)!;
    expect(r.st.storage.takeItem(near.x, near.y, near.z, 'log', 2)).toBe(2);
    expect(row(r.hook.need(slot), 'log'), 'たんすから 出せば へる').toMatchObject({ have: 3 });
  });

  it('プレイヤーが 動くと 近い たんすが かわる（足もとから はかる）', () => {
    const r = withTansu();
    r.talk();
    const slot = r.make(FUTON);
    expect(row(r.hook.need(slot), 'log')).toMatchObject({ have: 5 });
    r.player.z += 50; // 50 マスの たんすの すぐ そばへ（30 マスの たんすは 80 マス はなれる）
    expect(row(r.hook.need(slot), 'log')).toMatchObject({ have: 3 + 9 });
  });
});

describe('AC18 一覧: 材料が そろって いる か（もちもの ＋ たんす の 合計）', () => {
  /** ふとん 1 つ（5×5・窓 0）＝ き 24・いし 25。はじめての 家なので ぬの・いとは おまけ。せっけいずを 1 まい 作って 返す */
  function planned(r: Rig): number {
    r.talk();
    const slot = r.make(FUTON);
    r.sys.press('close');
    return slot;
  }

  it('もちもの だけでは たりなくても、たんすと 合わせて そろえば enabled: true。たりない ときは false（押すと page need・short ≧ 1）', () => {
    const r = houseRig();
    const slot = planned(r);
    r.bag.add('log', 10);
    r.bag.add('stone', 25);
    expect(enabledInList(r, slot), 'き 14 たりない').toBe(false);
    r.st.putTansu(10, 0, { log: 13 });
    expect(enabledInList(r, slot), 'あと 1 つ たりない').toBe(false);
    r.st.putTansu(0, 12, { log: 1 });
    expect(enabledInList(r, slot), 'もちもの 10 ＋ たんす 14 ＝ 24').toBe(true);
    // たんす だけ でも そろう
    const t = houseRig();
    const slotT = planned(t);
    t.st.putTansu(5, 5, { log: 24, stone: 25 });
    expect(enabledInList(t, slotT), 'もちものに 何も なくても たんす だけで そろう').toBe(true);
  });

  it('範囲の 外（50 マス）の たんすの 材料は 数えない。範囲を ひろげると そろう', () => {
    const r = houseRig();
    const slot = planned(r);
    r.st.putTansu(0, 50, { log: 24, stone: 25 });
    expect(enabledInList(r, slot)).toBe(false);
    r.talk();
    r.sys.press('build');
    r.sys.press('pick', slot);
    expect(r.sys.menu()).toMatchObject({ page: 'need', bubble: MSG.short, build: true });
    expect(r.sys.buildNeedRows().filter((x) => x.short > 0).length).toBeGreaterThan(0);
    r.sys.press('close');
    r.st.range.v = 60;
    expect(enabledInList(r, slot)).toBe(true);
  });
});

describe('AC20・AC20b ［ここに たてる］: たんす（近い 順）→ もちもの の 順に へらす', () => {
  /** ふとん 1 つの せっけいず（き 24・いし 25・ぬの／いとは おまけ）と 場所を 用意して、［ここに たてる］の 確かめの まど（yes の 前）まで */
  function ready(r: Rig, put: () => void): { slot: number; yes: () => void } {
    r.sys.settings.houseBuildTicks = 120;
    r.talk();
    const slot = r.make(FUTON);
    put();
    r.pad();
    r.sys.press('build');
    r.sys.press('pick', slot);
    r.sys.skyDecide();
    expect(r.hook.cursor()?.confirm, '確かめの まど').toBe(true);
    return { slot, yes: () => r.sys.press('yes') };
  }
  const tansuLog = (r: Rig, at: { x: number; y: number; z: number }): number => r.st.inTansu(at, 'log' as ItemId);

  it('き 24 が いる。10 マスの たんす A き 20・20 マスの たんす B き 20・もちもの き 10 → A 0・B 16・もちもの 10（近い たんすから。もちものは へらない）', () => {
    const r = houseRig();
    let a!: { x: number; y: number; z: number };
    let b!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      a = r.st.putTansu(10, 0, { log: 20 });
      b = r.st.putTansu(0, 20, { log: 20 });
      r.bag.add('log', 10);
      r.bag.add('stone', 25);
    });
    expect([tansuLog(r, a), tansuLog(r, b), r.bag.count('log')], '決定の 前は まだ へらない').toEqual([20, 20, 10]);
    yes();
    expect(r.hook.building()).not.toBeNull();
    expect([tansuLog(r, a), tansuLog(r, b), r.bag.count('log')]).toEqual([0, 16, 10]);
    expect(r.bag.count('stone'), 'いしは もちものから').toBe(0);
  });

  it('A を 20 マス・B を 10 マスに すると B 0・A 16（近い 順）', () => {
    const r = houseRig();
    let a!: { x: number; y: number; z: number };
    let b!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      a = r.st.putTansu(20, 0, { log: 20 });
      b = r.st.putTansu(0, 10, { log: 20 });
      r.bag.add('log', 10);
      r.bag.add('stone', 25);
    });
    yes();
    expect([tansuLog(r, a), tansuLog(r, b), r.bag.count('log')]).toEqual([16, 0, 10]);
  });

  it('A き 5・B き 5・もちもの き 20 なら A 0・B 0・もちもの 6（たんすを 先に つかいきる）', () => {
    const r = houseRig();
    let a!: { x: number; y: number; z: number };
    let b!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      a = r.st.putTansu(10, 0, { log: 5 });
      b = r.st.putTansu(0, 20, { log: 5 });
      r.bag.add('log', 20);
      r.bag.add('stone', 25);
    });
    yes();
    expect([tansuLog(r, a), tansuLog(r, b), r.bag.count('log')]).toEqual([0, 0, 6]);
  });

  it('50 マスの たんす（craftTansuRange 40 の 外）は 数えない・へらさない。範囲の 中の たんす ＋ もちもの で ちょうど', () => {
    const r = houseRig();
    let near!: { x: number; y: number; z: number };
    let far!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      near = r.st.putTansu(10, 0, { log: 20 });
      far = r.st.putTansu(0, 50, { log: 20 });
      r.bag.add('log', 4);
      r.bag.add('stone', 25);
    });
    yes();
    expect(r.hook.building()).not.toBeNull();
    expect([tansuLog(r, near), tansuLog(r, far), r.bag.count('log')]).toEqual([0, 20, 0]);
  });

  it('いしも 同じ 順（たんす → もちもの）。たんすだけで そろう 材料は もちものを へらさない', () => {
    const r = houseRig();
    let t!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      t = r.st.putTansu(8, 8, { log: 24, stone: 30 });
      r.bag.add('log', 3);
      r.bag.add('stone', 3);
    });
    yes();
    expect([tansuLog(r, t), r.st.inTansu(t, 'stone'), r.bag.count('log'), r.bag.count('stone')]).toEqual([0, 5, 3, 3]);
  });

  it('［ここに たてる］の 時に たりなく なって いれば 何も へらず ふきだし「ざいりょうが たりないよ」・page は need・建築は はじまらない', () => {
    const r = houseRig();
    let t!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      t = r.st.putTansu(8, 8, { log: 24, stone: 25 });
      r.bag.add('log', 2);
    });
    expect(r.st.storage.takeItem(t.x, t.y, t.z, 'log', 3), '確かめの まどが 出て いる 間に たんすから 出した').toBe(3);
    const bagBefore = [r.bag.count('log'), r.bag.count('stone')];
    const tansuBefore = [tansuLog(r, t), r.st.inTansu(t, 'stone')];
    yes();
    expect(r.hook.building()).toBeNull();
    expect(r.sys.menu()).toMatchObject({ page: 'need', bubble: MSG.short, build: true });
    expect([r.bag.count('log'), r.bag.count('stone')], 'もちものは そのまま').toEqual(bagBefore);
    expect([tansuLog(r, t), r.st.inTansu(t, 'stone')], 'たんすも そのまま').toEqual(tansuBefore);
  });

  it('数えるのも へらすのも プレイヤーを うつす 前の 位置で: 場所の 中に 立って いて 外へ うつっても、足もとの たんす（範囲 2）から へる', () => {
    const r = houseRig({ range: 2 });
    r.player.x = PAD.x + 3.5;
    r.player.z = PAD.z + 3.5; // 場所（7×7 ＋ かべ）の まん中
    let t!: { x: number; y: number; z: number };
    const { yes } = ready(r, () => {
      t = r.st.putTansu(0, 0, { log: 24, stone: 25 });
    });
    yes();
    expect(r.hook.building()).not.toBeNull();
    expect(r.player.z, '戸の 前の 外へ うつった').toBeGreaterThanOrEqual(PAD.z + 7);
    expect([tansuLog(r, t), r.st.inTansu(t, 'stone')], 'うつる 前の 位置で 数えて へらした').toEqual([0, 0]);
  });
});

describe('AC51 はじめての 家の ふとんの おまけ', () => {
  it('まだ 1 けんも 建て はじめて いない: ふとん 1 の need は ぬの {0, bonus 3}・いと {0, bonus 1}。もちもの・たんすに 0 でも 一覧で enabled。決定で ぬの・いとは どこからも へらず firstBonus が false', () => {
    const r = houseRig();
    r.sys.settings.houseBuildTicks = 120;
    r.talk();
    const slot = r.make(FUTON);
    expect(r.hook.firstBonus()).toBe(true);
    expect(row(r.hook.need(slot), 'cloth')).toMatchObject({ need: 0, bonus: 3 });
    expect(row(r.hook.need(slot), 'string')).toMatchObject({ need: 0, bonus: 1 });
    r.sys.press('close');
    r.bag.add('log', 24);
    r.bag.add('stone', 25);
    expect(enabledInList(r, slot), 'ぬの・いとが 0 でも ほかが そろえば').toBe(true);
    // ぬの・いとが あっても へらさない（たんす・もちもの とも）
    const t = r.st.putTansu(6, 0, { cloth: 5, string: 4 });
    r.bag.add('cloth', 2);
    r.bag.add('string', 1);
    r.pad();
    r.talk();
    r.startBuild(slot);
    expect(r.hook.building()).not.toBeNull();
    expect(r.hook.firstBonus()).toBe(false);
    expect([r.st.inTansu(t, 'cloth'), r.st.inTansu(t, 'string'), r.bag.count('cloth'), r.bag.count('string')]).toEqual([5, 4, 2, 1]);
    expect([r.bag.count('log'), r.bag.count('stone')]).toEqual([0, 0]);
  });

  it('2 けん目から ぬの 3・いと 1 が いる（たんす・もちもの の 合計で そろえば enabled。へる 順は たんす → もちもの）', () => {
    const r = houseRig();
    notFirst(r);
    r.talk();
    const slot = r.make(FUTON);
    r.sys.press('close');
    expect(row(r.hook.need(slot), 'cloth')).toMatchObject({ need: 3, bonus: 0 });
    expect(row(r.hook.need(slot), 'string')).toMatchObject({ need: 1, bonus: 0 });
    r.bag.add('log', 24);
    r.bag.add('stone', 25);
    expect(enabledInList(r, slot), 'ぬの・いとが ない').toBe(false);
    const t = r.st.putTansu(6, 0, { cloth: 2 });
    r.bag.add('cloth', 1);
    r.bag.add('string', 1);
    r.sys.settings.houseBuildTicks = 120;
    r.pad();
    r.talk();
    r.startBuild(slot);
    expect(r.hook.building()).not.toBeNull();
    expect([r.st.inTansu(t, 'cloth'), r.bag.count('cloth'), r.bag.count('string')], 'ぬの 3 ＝ たんす 2 ＋ もちもの 1。いと 1').toEqual([0, 0, 0]);
  });

  it('ふとん 2 の せっけいずでも おまけは 1 つぶん（ぬの need 3・bonus 3 ／ いと need 1・bonus 1）', () => {
    const r = houseRig();
    r.talk();
    const slot = r.make([{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'futon', x: 2, z: 0 }]);
    expect(row(r.hook.need(slot), 'cloth')).toMatchObject({ need: 3, bonus: 3 });
    expect(row(r.hook.need(slot), 'string')).toMatchObject({ need: 1, bonus: 1 });
  });
});

describe('AC34 ⑤ 材料を 数える 回数: ふえるのは 画面を 開いた とき・押した とき だけ', () => {
  /** 本物の 数える 口（craft.total・tansuInRange・たんすを 読む storage の 口）が 呼ばれた 回数を 数える */
  function counting(r: Rig): () => number {
    let n = 0;
    const wrap = (o: object, names: string[]): void => {
      for (const name of names) {
        const f = (o as Record<string, (...a: unknown[]) => unknown>)[name]!;
        (o as Record<string, unknown>)[name] = (...a: unknown[]) => {
          n++;
          return f.apply(o, a);
        };
      }
    };
    wrap(r.st.craft, ['total', 'tansuInRange', 'refreshTansu']);
    wrap(r.st.storage, ['list', 'countItem', 'takeItem']);
    return () => n;
  }

  it('エディター・一覧・ひつような もの・建築中が 開いて いても とじて いても、何も 押さずに 600 ステップ すすめる 間は 0 回', () => {
    const r = houseRig();
    r.sys.settings.houseBuildTicks = 5000;
    r.st.putTansu(10, 0, { log: 30, stone: 30 });
    r.bag.add('log', 5);
    const calls = counting(r);
    const quiet = (what: string): void => {
      const before = calls();
      r.run(600);
      expect(calls() - before, `${what}: 600 ステップ`).toBe(0);
    };
    quiet('とじて いる');
    r.talk();
    quiet('メニュー');
    r.sys.press('editor');
    r.hook.edit(FUTON[0]);
    quiet('エディター');
    r.sys.press('need');
    quiet('ひつような もの（エディター）');
    r.sys.press('needClose');
    r.sys.press('next');
    quiet('エディター ②');
    r.sys.press('close');
    r.talk();
    r.sys.press('build');
    quiet('一覧');
    r.sys.press('close');
  });

  it('数えるのは need()・一覧を 開く・［ここに たてる］の とき だけ（1 回 以上）。できた！は かみを たんすから 取る ときだけ読む（もちものに あれば 読まなくて よい）', () => {
    const r = houseRig();
    r.sys.settings.houseBuildTicks = 5000;
    r.st.putTansu(10, 0, { log: 30, stone: 30 });
    r.bag.add('log', 5);
    r.talk();
    const slot = r.make(FUTON);
    r.sys.press('close');
    const calls = counting(r);
    let before = calls();
    r.hook.need(slot);
    expect(calls() - before, 'need(slot)').toBeGreaterThan(0);
    before = calls();
    r.hook.need();
    expect(calls() - before, 'need()').toBeGreaterThan(0);
    r.talk();
    before = calls();
    r.sys.press('build');
    expect(calls() - before, '一覧を 開く').toBeGreaterThan(0);
    r.sys.press('close');
    r.pad();
    r.talk();
    r.sys.press('build');
    r.sys.press('pick', slot);
    r.sys.skyDecide();
    before = calls();
    r.sys.press('yes');
    expect(calls() - before, '［ここに たてる］').toBeGreaterThan(0);
    before = calls();
    r.run(600);
    expect(calls() - before, '建築中の 600 ステップ').toBe(0);
  });
});
