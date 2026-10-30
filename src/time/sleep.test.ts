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
  it('ひる（day）の始まり（表の起きる時刻）になり、日付が ちょうど 1 進む。そのまま 進めても 日づけは ふえない', () => {
    const time = new TimeOfDayImpl();
    time.set(S.dayTicks + S.duskTicks + 100); // よる
    const day = time.day();
    time.sleepToMorning();
    expect(time.phase()).toBe('day');
    expect(time.dayTick()).toBe(GADGET_TUNING.futon.wakeDayTick);
    expect(time.day()).toBe(day + 1);
    const t2 = new TimeOfDayImpl();
    t2.set(S.dayTicks + S.duskTicks + 100);
    const d2 = t2.day();
    t2.sleepToMorning();
    for (let i = 0; i < S.dayTicks + S.duskTicks + S.nightTicks + S.dawnTicks - 1; i++) t2.update(); // 次の 日の おわりの 1 つ前まで: 日づけは +1 のまま
    expect(t2.day()).toBe(d2 + 1);
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
      expect(time.phase()).toBe('day');
      expect(time.dayTick()).toBe(GADGET_TUNING.futon.wakeDayTick);
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
    expect(time.phase()).toBe('day');
  });
});

describe('宿屋のように 暗くなる', () => {
  it('表の 秒数で 真っ暗に → 曲の あいだ 真っ暗 → おわりに ゆっくり 明るく', () => {
    const { sleep } = at(S.dayTicks + S.duskTicks + 500);
    const T = GADGET_TUNING.futon;
    sleep.use();
    const fades: number[] = [];
    while (sleep.sleeping()) {
      sleep.update();
      fades.push(sleep.fade());
    }
    expect(fades).toHaveLength(T.sleepSteps);
    expect(fades[T.fadeInSteps - 1]).toBe(1); // 暗くなりきった
    expect(fades[T.fadeInSteps - 2]!).toBeLessThan(1);
    for (let i = T.fadeInSteps - 1; i < T.sleepSteps - T.fadeOutSteps; i++) expect(fades[i], `hold ${i}`).toBe(1); // 真っ暗のまま
    expect(fades[T.sleepSteps - T.fadeOutSteps]!).toBeLessThan(1); // そこから 明るく
    expect(fades[T.sleepSteps - 1]).toBe(0);
    expect(T.fadeInSteps).toBeLessThan(T.fadeOutSteps); // 暗くなるのは はやく、明るくなるのは ゆっくり
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
