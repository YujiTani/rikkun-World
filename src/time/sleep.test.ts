import { describe, expect, it } from 'vitest';
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { createTimeSettings } from './config';
import { NOT_NIGHT_TEXT, SleepSystem } from './sleep';
import { TimeOfDayImpl } from './TimeOfDay';

/** ITEM-FX-1 AC6・AC7: ふとんでねる。約束は docs/tickets/ITEM-FX-1-contract.md §4 */

const S = createTimeSettings();
const DAWN_START = S.dayTicks + S.duskTicks + S.nightTicks;

function at(tick: number) {
  const time = new TimeOfDayImpl();
  time.set(tick);
  return { time, sleep: new SleepSystem(time) };
}

describe('TimeOfDayImpl.sleepToMorning', () => {
  it('あさ（dawn）の始まりになり、日付が 1 進む', () => {
    const time = new TimeOfDayImpl();
    time.set(S.dayTicks + S.duskTicks + 100); // よる
    const day = time.day();
    time.sleepToMorning();
    expect(time.phase()).toBe('dawn');
    expect(time.dayTick()).toBe(DAWN_START);
    expect(time.day()).toBe(day + 1);
  });
});

describe('ふとんでねる（AC6）', () => {
  for (const [name, tick] of [['ゆうがた', S.dayTicks + 10], ['よる', S.dayTicks + S.duskTicks + 500]] as const) {
    it(`${name}に使うと ねはじめる。表の長さ（${GADGET_TUNING.futon.sleepSteps} ステップ）のあいだ動けず、画面が暗くなって明るくなる。おわると あさ`, () => {
      const { time, sleep } = at(tick);
      const day = time.day();
      expect(sleep.sleeping()).toBe(false);
      expect(sleep.use()).toBe('start');
      expect(sleep.sleeping()).toBe(true);
      expect(sleep.blocksInput()).toBe(true);
      expect(sleep.use()).toBe('busy'); // ねている間は もう一度つかえない
      const fades: number[] = [];
      const n = GADGET_TUNING.futon.sleepSteps;
      let steps = 0;
      while (sleep.sleeping() && steps < n + 5) {
        sleep.update();
        steps++;
        fades.push(sleep.fade());
      }
      expect(steps).toBe(n); // ちょうど 表の長さ
      expect(sleep.sleeping()).toBe(false);
      expect(sleep.blocksInput()).toBe(false);
      expect(sleep.fade()).toBe(0);
      expect(Math.max(...fades)).toBeCloseTo(1, 1); // いちばん暗いとき ほぼ真っ暗
      const peak = fades.indexOf(Math.max(...fades));
      for (let i = 1; i <= peak; i++) expect(fades[i]!, `up ${i}`).toBeGreaterThanOrEqual(fades[i - 1]!); // 少しずつ暗く
      for (let i = peak + 1; i < fades.length; i++) expect(fades[i]!, `down ${i}`).toBeLessThanOrEqual(fades[i - 1]!); // 少しずつ明るく
      expect(time.phase()).toBe('dawn');
      expect(time.day()).toBe(day + 1);
    });
  }
  it('時刻が変わるのは 真っ暗のとき（見えている間には 変わらない）', () => {
    const { time, sleep } = at(S.dayTicks + S.duskTicks + 500);
    const before = time.dayTick();
    sleep.use();
    const n = GADGET_TUNING.futon.sleepSteps;
    for (let i = 0; i < Math.floor(n / 4); i++) sleep.update();
    expect(time.dayTick()).toBe(before); // まだ明るさが残っているあいだは そのまま
    for (let i = Math.floor(n / 4); i < n; i++) sleep.update();
    expect(time.phase()).toBe('dawn');
  });
});

describe('ひる・あさは ねられない（AC7）', () => {
  for (const [name, tick] of [['ひる', 100], ['あさ', DAWN_START + 10]] as const) {
    it(`${name}: 'notNight'。時刻も日付も変わらず、ねない。文は「よる に ねようね」`, () => {
      const { time, sleep } = at(tick);
      const day = time.day();
      const t0 = time.dayTick();
      expect(sleep.use()).toBe('notNight');
      expect(sleep.sleeping()).toBe(false);
      expect(sleep.fade()).toBe(0);
      expect(time.dayTick()).toBe(t0);
      expect(time.day()).toBe(day);
      expect(NOT_NIGHT_TEXT).toBe('よる に ねようね');
    });
  }
});

describe('ねた日づけの 保存（印）', () => {
  it('ねたあと 区切りの 前に 保存 → 読みこみ しても 日づけは 合計 +1 のまま', () => {
    const a = new TimeOfDayImpl();
    a.set(S.dayTicks + S.duskTicks + 500);
    const day = a.day();
    a.sleepToMorning();
    const saved = { day: a.day(), dayTick: a.dayTick(), slept: a.sleptMark() };
    const b = new TimeOfDayImpl();
    b.setDay(saved.day);
    b.set(saved.dayTick);
    b.setSleptMark(saved.slept);
    for (let i = 0; i < S.dawnTicks + 5; i++) b.update();
    expect(b.day()).toBe(day + 1);
  });
});
