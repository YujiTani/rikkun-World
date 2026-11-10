import { describe, expect, it } from 'vitest';
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { createTimeSettings } from './config';
import { SleepSystem } from './sleep';
import { TimeOfDayImpl } from './TimeOfDay';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.16 §3.7 (f) の「ふとん（2 人の とき）」・§8 の 5e の つなぎ目・§9.12・§10・AC144・AC170・AC172）: 2 人の ときの ふとんの 先行テスト（赤）。
 * オーナー（2026-11-10）: **2 人の とき 夜を とばせるのは 2 人とも ふとんで ねた とき だけ**。先に ねた 人は 「まち」。1 人の ときは 今の まま（`sleep.test.ts` は 一行も かえない）。
 * 数は 表（GADGET_TUNING・createTimeSettings）から 読む。時間では 待たず ステップの 数で 進める。
 *
 * ---- 実装への 約束（developer が 作る 名前・形。置き場は src/time/sleep.ts の `SleepSystem`。細かい 所は 変えて よいが、変えたら 依頼文と 仕様に 書く）----
 *   new SleepSystem(time, opts?: { steps?: number; ready?: () => number; onStart?: () => void })
 *     ready()＝ 「2 人」に 数えられる 人の 数（参加していて 倒れておらず 2P は パッドが ある 人。渡さない／1 以下 は 1 人の とき）。毎ステップ 読む（呼ぶ たびに いまの 値）。
 *     onStart()＝ **ねむりが 本当に はじまる たびに 1 回**（`use` で すぐ はじまる 時も、待ちが そろって／1 人に もどって はじまる 時も）。ねる 音は これ（`gadgets.ts` の onSleepStart を ここへ わたす）。
 *   use(who: 1 | 2 = 1): 'start' | 'wait' | 'notNight' | 'busy'
 *     ねむり中 → 'busy'（何も かえない）／ひる・あさ（dusk・night でない）→ 'notNight'（待ちにも ならない）／
 *     ready() <= 1 → 今と 同じ 'start'（すぐ ねむり。onStart 1 回）／
 *     ready() >= 2 で 待ちが いない → その 人が 待ちに なって 'wait'（夜は とばない・onStart なし）／待っている のが 同じ 人 → 'wait'（何も かわらない）／
 *     待っている のが もう 1 人 → そろって 'start'（待ちを 消し、その ステップから ねむり。onStart 1 回）。同じ ステップに 2 人が 使えば 1 人目 'wait'・2 人目 'start'。
 *   waiting(): 1 | 2 | null           待っている 人
 *   wake(who: 1 | 2): void            who が 待って いれば 待ちを 消す（歩く・ジャンプ・ひるむ・倒れる・やめる・パッドが ぬける の とき 配線が 呼ぶ）。ほかの 人・待って いない 人は 何も しない
 *   update()                          毎ステップ。今の 動き（ねむり中の 数え・夜を とばす）に 足して、待って いる あいだ:
 *                                     ① 時刻が dusk・night でなくなった（朝）→ 待ちを 消す（自動で 起きる）② ready() <= 1 になった → その ステップから 1 人の ときと 同じ ねむり（待ちを 消して 始める。onStart 1 回）
 *                                     待って いる あいだ time は 進まない（SleepSystem は 時刻を さわらない。世界は 動く）。`blocksInput()` は ねむり中だけ true（待ち中は false）。
 */

const S = createTimeSettings();
const DUSK = S.dayTicks + 10;
const NIGHT = S.dayTicks + S.duskTicks + 500;
const DAY = 100;
const N = GADGET_TUNING.futon.sleepSteps;

function rig(tick: number, ready = 2) {
  const time = new TimeOfDayImpl();
  time.set(tick);
  const state = { ready };
  const starts: number[] = [];
  const sleep = new SleepSystem(time, { ready: () => state.ready, onStart: () => void starts.push(1) });
  return { time, sleep, state, starts };
}

describe('AC144: 1 人の とき（ready が 1 以下・渡さない）は 今の まま', () => {
  for (const ready of [1, 0]) {
    it(`ready=${ready}: ZL で すぐ ねむり。待ちには ならない。ねる 音（onStart）は 1 回`, () => {
      const r = rig(NIGHT, ready);
      const day = r.time.day();
      expect(r.sleep.use(1)).toBe('start');
      expect(r.sleep.sleeping()).toBe(true);
      expect(r.sleep.waiting()).toBeNull();
      expect(r.sleep.stepsLeft()).toBe(N);
      expect(r.starts).toHaveLength(1);
      expect(r.sleep.use(1)).toBe('busy');
      for (let i = 0; i < N + 5 && r.sleep.sleeping(); i++) r.sleep.update();
      expect(r.time.phase()).toBe('day');
      expect(r.time.day()).toBe(day + 1);
      expect(r.starts).toHaveLength(1);
    });
  }
  it('opts を 渡さない SleepSystem も 今の まま（引数なしの use も 同じ）', () => {
    const time = new TimeOfDayImpl();
    time.set(NIGHT);
    const sleep = new SleepSystem(time);
    expect(sleep.waiting()).toBeNull();
    expect(sleep.use()).toBe('start');
    expect(sleep.sleeping()).toBe(true);
  });
});

describe('AC170: 2 人の とき（ready=2）は 2 人とも ねた ときだけ 夜を とばす', () => {
  for (const [name, tick] of [['ゆうがた', DUSK], ['よる', NIGHT]] as const) {
    for (const [first, second] of [[1, 2], [2, 1]] as const) {
      it(`${name}: ${first}P が 先に ZL → まち（夜は とばない・音なし）。${second}P が ZL → そろって その ステップから ねむり。音は 1 回`, () => {
        const r = rig(tick);
        const phase = r.time.phase();
        const dayTick = r.time.dayTick();
        expect(r.sleep.use(first)).toBe('wait');
        expect(r.sleep.waiting()).toBe(first);
        expect(r.sleep.sleeping()).toBe(false);
        expect(r.sleep.blocksInput(), '待ち中は ねむりの 入力止めを かけない（世界は 動く）').toBe(false);
        expect(r.starts, '待ち中は 音なし').toHaveLength(0);
        for (let i = 0; i < 200; i++) r.sleep.update();
        expect(r.sleep.sleeping(), 'いつまで まっても 1 人では ねむらない').toBe(false);
        expect(r.time.phase()).toBe(phase);
        expect(r.time.dayTick(), '時刻は SleepSystem では 動かさない').toBe(dayTick);
        const day = r.time.day();
        expect(r.sleep.use(second)).toBe('start');
        expect(r.sleep.waiting()).toBeNull();
        expect(r.sleep.sleeping()).toBe(true);
        expect(r.sleep.stepsLeft(), 'そろった ステップから 表の 長さ').toBe(N);
        expect(r.sleep.blocksInput()).toBe(true);
        expect(r.starts, 'ねる 音は この ときに 1 回').toHaveLength(1);
        for (let i = 0; i < N + 5 && r.sleep.sleeping(); i++) r.sleep.update();
        expect(r.sleep.sleeping()).toBe(false);
        expect(r.time.phase(), '夜が とんだ').toBe('day');
        expect(r.time.day()).toBe(day + 1);
        expect(r.starts).toHaveLength(1);
      });
    }
  }

  it('同じ ステップに 2 人が 使ったら 1 人目 wait・2 人目 start で すぐ ねむり', () => {
    const r = rig(NIGHT);
    expect([r.sleep.use(1), r.sleep.use(2)]).toEqual(['wait', 'start']);
    expect(r.sleep.sleeping()).toBe(true);
    expect(r.starts).toHaveLength(1);
  });

  it('待っている 人が もう 一度 ZL を 押しても \'wait\' を 返す だけ（起きない・ねむりも はじまらない・音なし）', () => {
    const r = rig(NIGHT);
    r.sleep.use(1);
    for (let i = 0; i < 3; i++) expect(r.sleep.use(1)).toBe('wait');
    expect(r.sleep.waiting()).toBe(1);
    expect(r.sleep.sleeping()).toBe(false);
    expect(r.starts).toHaveLength(0);
  });

  it('ねむり中の ふとんの 押しは 1P も 2P も \'busy\'（ねむりは やりなおしに ならない・音は ふえない）', () => {
    const r = rig(NIGHT);
    r.sleep.use(1);
    r.sleep.use(2);
    for (let i = 0; i < 10; i++) r.sleep.update();
    const left = r.sleep.stepsLeft();
    expect(r.sleep.use(1)).toBe('busy');
    expect(r.sleep.use(2)).toBe('busy');
    expect(r.sleep.stepsLeft()).toBe(left);
    expect(r.starts).toHaveLength(1);
  });

  it('ひる・あさに 使うと \'notNight\'（待ちには ならない）', () => {
    for (const tick of [DAY, S.dayTicks + S.duskTicks + S.nightTicks + 10]) {
      const r = rig(tick);
      expect(r.sleep.use(1)).toBe('notNight');
      expect(r.sleep.use(2)).toBe('notNight');
      expect(r.sleep.waiting()).toBeNull();
      expect(r.sleep.sleeping()).toBe(false);
      expect(r.starts).toHaveLength(0);
    }
  });

  it('待っている あいだに 時刻は 進む（SleepSystem が 止めない）。夜は そのまま', () => {
    const r = rig(NIGHT);
    r.sleep.use(2);
    const t0 = r.time.dayTick();
    for (let i = 0; i < 100; i++) {
      r.time.update();
      r.sleep.update();
    }
    expect(r.time.dayTick()).toBe(t0 + 100);
    expect(r.sleep.waiting()).toBe(2);
  });
});

describe('AC172: ふとんの 戻し方', () => {
  it('① wake(待っている 人) で 待ちが 消える。夜は そのまま。ほかの 人の wake は 何も しない', () => {
    const r = rig(NIGHT);
    r.sleep.use(1);
    r.sleep.wake(2);
    expect(r.sleep.waiting(), '待っていない 2P の wake は 何も しない').toBe(1);
    r.sleep.wake(1);
    expect(r.sleep.waiting()).toBeNull();
    expect(r.sleep.sleeping()).toBe(false);
    expect(r.time.phase()).toBe('night');
    r.sleep.update();
    expect(r.sleep.sleeping(), '起きたあとは 1 人では ねむらない').toBe(false);
    expect(r.sleep.use(2), '今度は 2P が 先に ねた 人（まち）').toBe('wait');
    expect(r.sleep.waiting()).toBe(2);
  });

  it('② 待っている あいだに 朝に なったら 自動で 起きる。もう 夜は とばせない', () => {
    const r = rig(S.dayTicks + S.duskTicks + S.nightTicks - 20);
    expect(r.sleep.use(1)).toBe('wait');
    let guard = 0;
    while ((r.time.phase() === 'night' || r.time.phase() === 'dusk') && guard++ < 100) {
      r.time.update();
      r.sleep.update();
      if (r.time.phase() === 'night') expect(r.sleep.waiting(), '夜の あいだは まって いる').toBe(1);
    }
    r.sleep.update();
    expect(r.time.phase()).not.toBe('night');
    expect(r.sleep.waiting()).toBeNull();
    expect(r.sleep.sleeping()).toBe(false);
    expect(r.sleep.use(2)).toBe('notNight');
    expect(r.starts).toHaveLength(0);
  });

  it('③ 待ち中に もう 1 人が 倒れる／やめる／パッドが ぬける（ready が 1 に）と、その ステップから 1 人の ときと 同じ ねむり。音は 1 回', () => {
    const r = rig(NIGHT);
    const day = r.time.day();
    r.sleep.use(2);
    r.sleep.update();
    expect(r.sleep.sleeping()).toBe(false);
    r.state.ready = 1; // 1P が 倒れた
    r.sleep.update();
    expect(r.sleep.sleeping(), 'その ステップから ねむり').toBe(true);
    expect(r.sleep.waiting()).toBeNull();
    expect(r.sleep.stepsLeft(), 'ねむりの 長さは 表どおり').toBeGreaterThanOrEqual(N - 1);
    expect(r.starts).toHaveLength(1);
    r.state.ready = 2; // 倒れた 人が もどる: ねむりは つづく
    for (let i = 0; i < N + 5 && r.sleep.sleeping(); i++) r.sleep.update();
    expect(r.time.phase()).toBe('day');
    expect(r.time.day()).toBe(day + 1);
    expect(r.starts).toHaveLength(1);
  });

  it('③\' 待っている 人 自身が 倒れた（先に wake が 呼ばれる）→ ready が 1 に なっても ねむりは はじまらない', () => {
    const r = rig(NIGHT);
    r.sleep.use(1);
    r.sleep.wake(1); // A が 倒れた = 起きた のと 同じ
    r.state.ready = 1;
    r.sleep.update();
    expect(r.sleep.sleeping()).toBe(false);
    expect(r.starts).toHaveLength(0);
  });

  it('ねむり中に ready が かわっても（2P が やめた／参加した）ねむりは つづく', () => {
    const r = rig(NIGHT);
    r.sleep.use(1);
    r.sleep.use(2);
    r.state.ready = 1;
    for (let i = 0; i < 20; i++) r.sleep.update();
    expect(r.sleep.sleeping()).toBe(true);
    r.state.ready = 2;
    for (let i = 0; i < 20; i++) r.sleep.update();
    expect(r.sleep.sleeping()).toBe(true);
    expect(r.starts).toHaveLength(1);
  });

  it('⑤ 2P が 一度も 来ない（ready=1）とき waiting() は いつも null', () => {
    const r = rig(NIGHT, 1);
    for (const who of [1, 2] as const) r.sleep.use(who);
    for (let i = 0; i < N + 5; i++) {
      expect(r.sleep.waiting()).toBeNull();
      r.sleep.update();
    }
  });
});
