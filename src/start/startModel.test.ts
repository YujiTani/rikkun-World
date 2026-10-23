// START-1 AC7〜AC11: スタートメニューの 動き（画面の しくみ。DOM に よらない 状態の 機械）。
// 窓口の 名前（実装は これに 合わせる）: src/start/startModel.ts の
//   createStartModel(deps: StartModelDeps): StartModel
//
//   interface StartModelDeps {
//     search: string;                                   // location.search
//     store: KeyValueStore | null;                      // localStorage（?nosave=1 や 使えない ときは null にして 渡してよい。
//                                                       //  モデルも search の nosave=1 を 見て 書かない）
//     findContinue(): Promise<{ seed: number; strength: StrengthLevel } | null>;   // lastWorld.findContinue を 包んだ物
//     findSaved(seed: number): Promise<{ strength: StrengthLevel } | null>;        // lastWorld.findSavedWorld を 包んだ物
//     random(): number;                                 // [0,1)。ランダム ボタンは randomSeed(random) を 使う
//     sound(name: 'tab' | 'dry' | 'sparkle'): void;     // 鳴らす 合図
//     shake(): void;                                    // シードの まどを ゆらす 合図（10 けた目）
//     begin(choice: StartChoice): void;                 // 始める（1 回だけ 呼ぶ）
//   }
//   interface StartChoice {
//     kind: 'continue' | 'new';
//     seed: number;                                     // 空のシードは 20261012
//     strength: StrengthLevel;                          // continue は 保存の つよさ。new で 同じ シードの 保存が あれば その 保存の つよさ
//     char: CharMode;                                   // 'girl' | 'boy' | 'block'
//     weight: Weight;
//   }
//   type StartButton =
//     | 'continue' | 'new' | 'back' | 'go' | 'random'
//     | 'char-girl' | 'char-boy'
//     | 'weight-light' | 'weight-normal' | 'weight-fine'
//     | 'strength-easy' | 'strength-normal' | 'strength-hard'
//     | 'key-0' | 'key-1' | 'key-2' | 'key-3' | 'key-4' | 'key-5' | 'key-6' | 'key-7' | 'key-8' | 'key-9' | 'key-back'
//   interface StartModel {
//     press(button: StartButton): void;                 // 画面の ボタンを 押した（クリック）
//     key(key: string): void;                           // キーボード。KeyboardEvent.key: 'Enter' | 'Escape' | 'Backspace' | '0'〜'9' | ほか
//     state(): StartViewState;
//   }
//   interface StartViewState {
//     screen: 'menu' | 'new';
//     checking: boolean;                // 「つづきから」を 調べている あいだ true
//     continue: { seed: number; strength: StrengthLevel } | null;   // 明るい とき だけ（暗いときは null）
//     focus: 'continue' | 'new';        // 1 枚目で キーボードの 選択が ある ボタン
//     seedText: string;                 // 2 枚目の まど（空 = ''）
//     existing: boolean;                // 今の シード（空なら 20261012）の 保存が ある
//     existingChecking: boolean;        // その 保存を 調べている あいだ true
//     strength: StrengthLevel;          // 押された 方。existing の ときは その 保存の つよさ
//     strengthLocked: boolean;          // existing の とき true（3 つとも 押せない）
//     char: CharMode;                   // 押された 方。'block' は 行を 出さない
//     charRow: boolean;                 // char !== 'block'
//     weight: Weight;
//     started: boolean;                 // begin を 呼んだ
//   }
//   「つづきから」の 調べは createStartModel の 中で はじめる（deps.findContinue を 1 回 呼ぶ）。
//   同じ シードの 調べは 作った とき 1 回（今の シードの 文字で。空は 20261012）と、seedText が かわる たびに deps.findSaved(今の 数) を 呼ぶ。
//   古い 調べの 返事（シードが かわった あとに 返った物）は 捨てる。
import { describe, expect, it } from 'vitest';
import { createStartModel, type StartButton, type StartChoice, type StartModelDeps } from './startModel';
import { START_STORAGE_KEY } from './lastWorld';
import { WEIGHT_STORAGE_KEY } from './weightPref';
import { CHAR_STORAGE_KEY } from '../char/charPref';
import type { StrengthLevel } from '../yokai/stats';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

class Store {
  data = new Map<string, string>();
  writes: string[] = [];
  throws = false;
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => {
    if (this.throws) throw new Error('quota');
    this.writes.push(`${k}=${v}`);
    this.data.set(k, v);
  };
}

type Cont = { seed: number; strength: StrengthLevel } | null;
type Saved = { strength: StrengthLevel } | null;

function setup(o: { search?: string; cont?: Cont | 'pending'; saved?: Record<number, Saved>; store?: Store | null; findSaved?: (seed: number) => Promise<Saved> } = {}) {
  const store = o.store === undefined ? new Store() : o.store;
  const contD = deferred<Cont>();
  if (o.cont !== 'pending') contD.resolve(o.cont ?? null);
  const savedD = new Map<number, Deferred<Saved>>();
  const findSavedCalls: number[] = [];
  const sounds: string[] = [];
  const begins: StartChoice[] = [];
  const shakes: number[] = [];
  const deps: StartModelDeps = {
    search: o.search ?? '?menu=1',
    store,
    findContinue: () => contD.promise,
    findSaved: (seed) => {
      findSavedCalls.push(seed);
      if (o.findSaved) return o.findSaved(seed);
      const hit = o.saved?.[seed];
      if (hit !== undefined || !savedD.has(seed)) return Promise.resolve(hit ?? null);
      return savedD.get(seed)!.promise;
    },
    random: () => 0.5,
    sound: (n) => sounds.push(n),
    shake: () => shakes.push(1),
    begin: (c) => begins.push(c),
  };
  const model = createStartModel(deps);
  const press = (...bs: StartButton[]) => bs.forEach((b) => model.press(b));
  const type = (digits: string) => [...digits].forEach((d) => model.press(`key-${d}` as StartButton));
  return { model, deps, store, contD, findSavedCalls, sounds, begins, shakes, press, type, s: () => model.state() };
}

/** 作って、はじめの 調べ（つづきから・同じ シード）が おわるまで 待つ */
async function ready(o: Parameters<typeof setup>[0] = {}) {
  const t = setup(o);
  await flush();
  return t;
}

describe('AC8 1 枚目 ― はじめの 状態', () => {
  it('作った 直後: 1 枚目・調べている・つづきから 暗い・フォーカスは はじめから', async () => {
    const t = setup({ cont: 'pending' });
    expect(t.s()).toMatchObject({ screen: 'menu', checking: true, continue: null, focus: 'new', started: false });
  });
  it('保存が なければ 調べおわっても 暗い・フォーカスは はじめから のまま', async () => {
    const t = setup({ cont: null });
    await flush();
    expect(t.s()).toMatchObject({ checking: false, continue: null, focus: 'new' });
  });
  it('はじめの キャラ・おもさ: 何も おぼえていなければ 女の子・きれい', () => {
    const t = setup();
    expect(t.s()).toMatchObject({ char: 'girl', charRow: true, weight: 'fine' });
  });
  it('おぼえた キャラ・おもさ（boy・light）が はじめの 値', () => {
    const store = new Store();
    store.data.set(CHAR_STORAGE_KEY, 'boy');
    store.data.set(WEIGHT_STORAGE_KEY, 'light');
    expect(setup({ store }).s()).toMatchObject({ char: 'boy', weight: 'light' });
  });
  it('?menu=1&char=boy → boy が はじめの 値。?menu=1&char=block → 行を 出さない', () => {
    expect(setup({ search: '?menu=1&char=boy' }).s()).toMatchObject({ char: 'boy', charRow: true });
    expect(setup({ search: '?menu=1&char=block' }).s()).toMatchObject({ char: 'block', charRow: false });
  });
  it('?menu=1&nosave=1: おぼえた 値を 読まない（女の子・きれい）', () => {
    const store = new Store();
    store.data.set(CHAR_STORAGE_KEY, 'boy');
    store.data.set(WEIGHT_STORAGE_KEY, 'light');
    expect(setup({ search: '?menu=1&nosave=1', store: null }).s()).toMatchObject({ char: 'girl', weight: 'fine' });
  });
  it('?menu=1&seed=5 → 2 枚目の まどに はじめから 5、?strength=hard → つよい（ほかの URL 指定も はじめの 値）', () => {
    expect(setup({ search: '?menu=1&seed=5' }).s().seedText).toBe('5');
    expect(setup({ search: '?menu=1&strength=hard' }).s().strength).toBe('hard');
    expect(setup({ search: '?menu=1' }).s()).toMatchObject({ seedText: '', strength: 'normal' });
  });
});

describe('AC8 1 枚目 ― フォーカスと Enter', () => {
  it('調べている あいだは Enter が きかない（2 枚目へ 行かない）・クリックは きく', () => {
    const t = setup({ cont: 'pending' });
    t.model.key('Enter');
    t.model.key('Enter');
    t.model.key('Enter');
    expect(t.s().screen).toBe('menu');
    expect(t.begins).toEqual([]);
    t.press('new');
    expect(t.s().screen).toBe('new');
  });
  it('調べおわって つづきから が ある → 何も 押していなければ フォーカスが つづきから へ 移る', async () => {
    const t = setup({ cont: 'pending' });
    expect(t.s().focus).toBe('new');
    t.contD.resolve({ seed: 5, strength: 'hard' });
    await flush();
    expect(t.s()).toMatchObject({ checking: false, continue: { seed: 5, strength: 'hard' }, focus: 'continue' });
  });
  it('調べているあいだに 何か 押していれば（クリック）フォーカスは 移さない', async () => {
    const t = setup({ cont: 'pending' });
    t.press('char-boy');
    t.contD.resolve({ seed: 5, strength: 'normal' });
    await flush();
    expect(t.s()).toMatchObject({ continue: { seed: 5, strength: 'normal' }, focus: 'new' });
  });
  it('おもさを 押していても 移さない', async () => {
    const t = setup({ cont: 'pending' });
    t.press('weight-light');
    t.contD.resolve({ seed: 5, strength: 'normal' });
    await flush();
    expect(t.s().focus).toBe('new');
  });
  it('調べおわった あと Enter: フォーカスが つづきから なら その 続きで 始まる', async () => {
    const t = setup({ cont: { seed: 5, strength: 'easy' } });
    await flush();
    t.model.key('Enter');
    expect(t.begins).toEqual([{ kind: 'continue', seed: 5, strength: 'easy', char: 'girl', weight: 'fine' }]);
  });
  it('調べおわった あと Enter: フォーカスが はじめから（保存なし）なら 2 枚目へ', async () => {
    const t = setup({ cont: null });
    await flush();
    t.model.key('Enter');
    expect(t.s().screen).toBe('new');
    expect(t.begins).toEqual([]);
  });
  it('調べているあいだに Enter を 連打しても 調べおわった とたんに「はじめから」へ 入らない', async () => {
    const t = setup({ cont: 'pending' });
    for (let i = 0; i < 10; i++) t.model.key('Enter');
    t.contD.resolve({ seed: 5, strength: 'normal' });
    await flush();
    expect(t.s().screen).toBe('menu');
    expect(t.begins).toEqual([]);
  });
  it('つづきから が 暗いとき 押しても 始まらない（dry）', async () => {
    const t = setup({ cont: null });
    await flush();
    t.press('continue');
    expect(t.begins).toEqual([]);
    expect(t.s().screen).toBe('menu');
    expect(t.sounds).toEqual(['dry']);
  });
  it('1 枚目で 数字キーは 何もしない（まどは 空のまま・音もなし）', async () => {
    const t = setup({ cont: null });
    await flush();
    for (const k of '0123456789') t.model.key(k);
    t.model.key('Backspace');
    expect(t.s()).toMatchObject({ screen: 'menu', seedText: '' });
    expect(t.sounds).toEqual([]);
  });
  it('1 枚目で Escape は 何もしない', async () => {
    const t = setup({ cont: null });
    await flush();
    t.model.key('Escape');
    expect(t.s().screen).toBe('menu');
  });
});

describe('AC8 1 枚目 ― キャラ・おもさ', () => {
  it('キャラ: おとこのこ → 押された 方が かわる', () => {
    const t = setup();
    t.press('char-boy');
    expect(t.s().char).toBe('boy');
    t.press('char-girl');
    expect(t.s().char).toBe('girl');
  });
  it('おもさ: かるい・ふつう・きれい', () => {
    const t = setup();
    t.press('weight-light');
    expect(t.s().weight).toBe('light');
    t.press('weight-normal');
    expect(t.s().weight).toBe('normal');
    t.press('weight-fine');
    expect(t.s().weight).toBe('fine');
  });
  it('char=block の とき キャラの ボタンを 押しても かわらない・書かない', () => {
    const t = setup({ search: '?menu=1&char=block' });
    t.press('char-boy');
    expect(t.s().char).toBe('block');
    expect(t.store!.writes.filter((w) => w.startsWith(CHAR_STORAGE_KEY))).toEqual([]);
  });
});

describe('AC9 2 枚目', () => {
  it('はじめは まどが 空・つよさ ふつう', () => {
    const t = setup();
    t.press('new');
    expect(t.s()).toMatchObject({ screen: 'new', seedText: '', strength: 'normal', existing: false, strengthLocked: false });
  });
  it('数字キーと 画面の 数字ボタンが 同じ 結果', () => {
    const a = setup();
    const b = setup();
    a.press('new');
    b.press('new');
    for (const d of '4207') {
      a.model.key(d);
      b.press(`key-${d}` as StartButton);
    }
    expect(a.s().seedText).toBe('4207');
    expect(b.s().seedText).toBe(a.s().seedText);
  });
  it('Backspace と ⌫ が 同じ。空で けしても 空', () => {
    const a = setup();
    const b = setup();
    a.press('new');
    b.press('new');
    a.type('12');
    b.type('12');
    a.model.key('Backspace');
    b.press('key-back');
    expect(a.s().seedText).toBe('1');
    expect(b.s().seedText).toBe('1');
    a.model.key('Backspace');
    a.model.key('Backspace');
    expect(a.s().seedText).toBe('');
  });
  it('先の 0 は のこさない。9 けた まで', () => {
    const t = setup();
    t.press('new');
    t.type('0');
    expect(t.s().seedText).toBe('0');
    t.type('5');
    expect(t.s().seedText).toBe('5');
    t.type('12345678912');
    expect(t.s().seedText).toBe('512345678');
  });
  it('つよさの 3 つ: 押すと かわる', () => {
    const t = setup();
    t.press('new', 'strength-easy');
    expect(t.s().strength).toBe('easy');
    t.press('strength-hard');
    expect(t.s().strength).toBe('hard');
    t.press('strength-normal');
    expect(t.s().strength).toBe('normal');
  });
  it('ランダム: 1〜9999 の 数が 入る（random を 渡した 値から）', () => {
    const t = setup();
    t.press('new', 'random');
    const n = Number(t.s().seedText);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(9999);
  });
  it('Esc・もどる で 1 枚目へ。入れた シード・つよさは のこる', () => {
    const t = setup();
    t.press('new', 'strength-hard');
    t.type('42');
    t.model.key('Escape');
    expect(t.s().screen).toBe('menu');
    t.press('new');
    expect(t.s()).toMatchObject({ screen: 'new', seedText: '42', strength: 'hard' });
    t.press('back');
    expect(t.s().screen).toBe('menu');
    t.press('new');
    expect(t.s()).toMatchObject({ seedText: '42', strength: 'hard' });
  });
  it('Enter・スタート で 始まる（その シード・つよさ・キャラ・おもさ）', async () => {
    const a = await ready();
    a.press('char-boy', 'weight-light', 'new', 'strength-easy');
    a.type('42');
    await flush(); // 入れた 数の 保存を 調べおわるまで スタートは 暗い
    a.model.key('Enter');
    expect(a.begins).toEqual([{ kind: 'new', seed: 42, strength: 'easy', char: 'boy', weight: 'light' }]);
    const b = await ready();
    b.press('new');
    b.type('7');
    await flush();
    b.press('go');
    expect(b.begins).toEqual([{ kind: 'new', seed: 7, strength: 'normal', char: 'girl', weight: 'fine' }]);
  });
  it('何も 変えずに スタート: ふだんの 世界（20261012）・ふつう', async () => {
    const t = await ready();
    t.press('new', 'go');
    expect(t.begins).toEqual([{ kind: 'new', seed: 20261012, strength: 'normal', char: 'girl', weight: 'fine' }]);
  });
  it('char=block のまま 始める → char は block のまま', async () => {
    const t = await ready({ search: '?menu=1&char=block' });
    t.press('new', 'go');
    expect(t.begins[0]?.char).toBe('block');
  });
});

describe('AC9 同じ シードの 保存', () => {
  it('作った とき（空 = 20261012）に 調べる', async () => {
    const t = setup({ saved: { 20261012: { strength: 'hard' } } });
    expect(t.findSavedCalls).toEqual([20261012]);
    await flush();
    t.press('new');
    expect(t.s()).toMatchObject({ existing: true, strength: 'hard', strengthLocked: true });
  });
  it('保存の ある 数に すると start-existing が 出て、つよさは その 保存の 値で 押せない。ほかの 数に すると もどる', async () => {
    const t = setup({ saved: { 1234: { strength: 'easy' } } });
    t.press('new', 'strength-hard');
    t.type('1234');
    await flush();
    expect(t.s()).toMatchObject({ existing: true, strength: 'easy', strengthLocked: true });
    t.press('key-5');
    await flush();
    expect(t.s()).toMatchObject({ seedText: '12345', existing: false, strengthLocked: false, strength: 'hard' }); // えらんでいた つよい に もどる
    t.press('key-back');
    await flush();
    expect(t.s()).toMatchObject({ seedText: '1234', existing: true, strength: 'easy' });
  });
  it('入れた 数が かわる たびに 調べる（deps.findSaved に 今の 数）', async () => {
    const t = setup();
    t.press('new');
    t.findSavedCalls.length = 0;
    t.type('42');
    await flush();
    expect(t.findSavedCalls).toEqual([4, 42]);
    t.press('key-back');
    t.press('key-back');
    await flush();
    expect(t.findSavedCalls.at(-1)).toBe(20261012);
  });
  it('つよさが 押せない とき 押すと dry。かわらない', async () => {
    const t = setup({ saved: { 1234: { strength: 'easy' } } });
    t.press('new');
    t.type('1234');
    await flush();
    t.sounds.length = 0;
    t.press('strength-hard');
    expect(t.s().strength).toBe('easy');
    expect(t.sounds).toEqual(['dry']);
  });
  it('スタート: 同じ シードの 保存の つよさで 始まる（えらんでいた つよさは 使わない）', async () => {
    const t = setup({ saved: { 1234: { strength: 'easy' } } });
    t.press('new', 'strength-hard');
    t.type('1234');
    await flush();
    t.press('go');
    expect(t.begins).toHaveLength(1);
    expect(t.begins[0]).toMatchObject({ kind: 'new', seed: 1234, strength: 'easy' });
  });
  it('シードが 空で スタート: vox-main が あれば その 続き（20261012・その 保存の つよさ）', async () => {
    const t = setup({ saved: { 20261012: { strength: 'hard' } } });
    await flush();
    t.press('new', 'go');
    expect(t.begins[0]).toMatchObject({ seed: 20261012, strength: 'hard' });
  });
  it('調べている とちゅうに スタート → 始まらない（dry）。調べおわって もう 一度 押すと 始まる', async () => {
    const d = deferred<Saved>();
    const t = setup({ cont: null, findSaved: (seed) => (seed === 20261012 ? Promise.resolve(null) : d.promise) });
    await flush();
    t.press('new');
    t.type('9');
    expect(t.s().existingChecking).toBe(true);
    t.sounds.length = 0;
    t.press('go');
    t.model.key('Enter');
    expect(t.begins).toEqual([]);
    expect(t.sounds).toEqual(['dry', 'dry']);
    d.resolve(null);
    await flush();
    expect(t.s().existingChecking).toBe(false);
    t.press('go');
    expect(t.begins).toHaveLength(1);
    expect(t.begins[0]?.seed).toBe(9);
  });
  it('古い 調べの 返事は 捨てる（シードが かわったあとに 返った 物）', async () => {
    const ds = new Map<number, Deferred<Saved>>();
    const t = setup({
      findSaved: (seed) => {
        if (seed === 20261012) return Promise.resolve(null);
        const d = deferred<Saved>();
        ds.set(seed, d);
        return d.promise;
      },
    });
    t.press('new');
    t.type('1'); // 調べ(1)
    t.type('2'); // 調べ(12)
    ds.get(12)!.resolve(null);
    await flush();
    ds.get(1)!.resolve({ strength: 'hard' }); // 遅れて 返った 古い 返事
    await flush();
    expect(t.s()).toMatchObject({ seedText: '12', existing: false, existingChecking: false, strengthLocked: false });
  });
});

describe('AC7 おぼえる', () => {
  it('おとこのこ → rikkun.char.v1 = boy。かるい → rikkun.weight.v1 = light（押した とき すぐ）', async () => {
    const t = await ready();
    t.press('char-boy');
    expect(t.store!.data.get(CHAR_STORAGE_KEY)).toBe('boy');
    t.press('weight-light');
    expect(t.store!.data.get(WEIGHT_STORAGE_KEY)).toBe('light');
  });
  it('スタート → rikkun.start.v1 の lastSeed = その シード（4・2 → 42）', async () => {
    const t = await ready();
    t.press('new');
    t.type('42');
    await flush();
    t.press('go');
    expect(JSON.parse(t.store!.data.get(START_STORAGE_KEY)!).lastSeed).toBe(42);
  });
  it('つづきから でも lastSeed を 書く', async () => {
    const t = await ready({ cont: { seed: 5, strength: 'normal' } });
    await flush();
    t.press('continue');
    expect(JSON.parse(t.store!.data.get(START_STORAGE_KEY)!).lastSeed).toBe(5);
  });
  it('空の シードで スタート → lastSeed 20261012', async () => {
    const t = await ready();
    t.press('new', 'go');
    expect(JSON.parse(t.store!.data.get(START_STORAGE_KEY)!).lastSeed).toBe(20261012);
  });
  it('始める 前には 書かない（シードを 入れただけ では lastSeed なし）', async () => {
    const t = await ready();
    t.press('new');
    t.type('42');
    expect(t.store!.data.has(START_STORAGE_KEY)).toBe(false);
  });
  it('?nosave=1 のときは どれも 書かない（store が null でも search だけでも）', async () => {
    const t = await ready({ search: '?menu=1&nosave=1', store: null });
    t.press('char-boy', 'weight-light', 'new');
    t.type('42');
    await flush();
    expect(() => t.press('go')).not.toThrow();
    expect(t.begins).toHaveLength(1);
    const s = new Store();
    const t2 = await ready({ search: '?menu=1&nosave=1', store: s });
    t2.press('char-boy', 'weight-light', 'new', 'go');
    expect(s.writes).toEqual([]);
  });
  it('書くと 例外でも 止まらない（それでも 始まる）', async () => {
    const s = new Store();
    s.throws = true;
    const t = await ready({ store: s });
    expect(() => t.press('char-boy', 'weight-light', 'new', 'go')).not.toThrow();
    expect(t.begins).toHaveLength(1);
    expect(t.s().char).toBe('boy');
  });
  it('?menu=1&char=block: おぼえた キャラは 書きかえない', async () => {
    const s = new Store();
    s.data.set(CHAR_STORAGE_KEY, 'boy');
    const t = await ready({ search: '?menu=1&char=block', store: s });
    t.press('new', 'go');
    expect(s.data.get(CHAR_STORAGE_KEY)).toBe('boy');
  });
});

describe('AC10 音', () => {
  it('えらぶ（キャラ・おもさ・つよさ）・数字・ランダム = tab', async () => {
    const t = await ready();
    t.press('char-boy');
    t.press('weight-light');
    t.press('new');
    t.sounds.length = 0;
    t.press('strength-easy');
    t.press('key-1');
    t.press('random');
    expect(t.sounds).toEqual(['tab', 'tab', 'tab']);
  });
  it('1 枚目の キャラ・おもさも tab', async () => {
    const t = await ready();
    t.press('char-boy', 'weight-normal');
    expect(t.sounds).toEqual(['tab', 'tab']);
  });
  it('10 けた目 = dry ＋ ゆれ 1 回。9 けたまでは tab', async () => {
    const t = await ready();
    t.press('new');
    t.sounds.length = 0;
    t.type('123456789');
    expect(t.sounds).toEqual(Array(9).fill('tab'));
    expect(t.shakes).toEqual([]);
    t.sounds.length = 0;
    t.press('key-1');
    expect(t.sounds).toEqual(['dry']);
    expect(t.shakes).toHaveLength(1);
    expect(t.s().seedText).toBe('123456789');
  });
  it('10 けた目を キーボードで 打っても dry', async () => {
    const t = await ready();
    t.press('new');
    t.type('123456789');
    t.sounds.length = 0;
    t.model.key('5');
    expect(t.sounds).toEqual(['dry']);
  });
  it('スタート = sparkle 1 回。つづきから = sparkle 1 回', async () => {
    const a = await ready();
    a.press('new');
    a.sounds.length = 0;
    a.press('go');
    expect(a.sounds).toEqual(['sparkle']);
    const b = await ready({ cont: { seed: 5, strength: 'normal' } });
    await flush();
    b.sounds.length = 0;
    b.press('continue');
    expect(b.sounds).toEqual(['sparkle']);
  });
  it('スタートを 3 回 すばやく 押しても 始まりは 1 回だけ・sparkle は 1 回', async () => {
    const t = await ready();
    t.press('new');
    t.sounds.length = 0;
    t.press('go', 'go', 'go');
    t.model.key('Enter');
    expect(t.begins).toHaveLength(1);
    expect(t.sounds.filter((s) => s === 'sparkle')).toHaveLength(1);
    expect(t.s().started).toBe(true);
  });
  it('つづきから を 3 回 すばやく → 1 回', async () => {
    const t = await ready({ cont: { seed: 5, strength: 'normal' } });
    await flush();
    t.press('continue', 'continue', 'continue');
    expect(t.begins).toHaveLength(1);
  });
  it('始まった あとは なにも 受けつけない（ボタン・キー・シード）', async () => {
    const t = await ready();
    t.press('new', 'go');
    t.sounds.length = 0;
    t.press('char-boy', 'key-1', 'back');
    t.model.key('Escape');
    t.model.key('5');
    expect(t.sounds).toEqual([]);
    expect(t.store!.data.get(CHAR_STORAGE_KEY), '始まった あとに 押した おとこのこは おぼえない').not.toBe('boy');
  });
  it('押せない つづきから = dry', async () => {
    const t = await ready({ cont: null });
    await flush();
    t.press('continue');
    expect(t.sounds).toEqual(['dry']);
  });
});
