import { GADGET_TUNING } from '../content/items/gadgetTuning';
import type { DayPhase, TimeOfDay } from '../contracts';
import { START_DAY_TICK, createTimeSettings, type TimeSettings } from './config';
import { dayLength, hexString, lookAt, phaseAt } from './dayCycle';

/** 1 日の時刻。ゲームの更新から毎ステップ update() を呼ぶ。開いた直後は ひる の 9000 ステップめ（START_DAY_TICK） */
export class TimeOfDayImpl implements TimeOfDay {
  private tick = START_DAY_TICK;
  private dayNo = 0;
  private lastPhase: DayPhase = 'day';
  private readonly listeners = new Set<(phase: DayPhase) => void>();

  constructor(readonly settings: TimeSettings = createTimeSettings()) {}

  dayTick(): number {
    return this.tick;
  }
  day(): number {
    return this.dayNo;
  }
  phase(): DayPhase {
    return phaseAt(this.tick, this.settings);
  }
  skyColor(): string {
    return hexString(lookAt(this.tick, this.settings).color);
  }
  /** 空の色（数）。Three.js の Color に渡す用 */
  skyColorValue(): number {
    return lookAt(this.tick, this.settings).color;
  }
  brightness(): number {
    return lookAt(this.tick, this.settings).brightness;
  }
  dollBrightness(): number {
    return lookAt(this.tick, this.settings).dollBrightness;
  }

  /** 1 日の中の時刻をすぐ変える（`day` は変えない） */
  set(dayTick: number): void {
    const len = dayLength(this.settings);
    const t = Math.floor(dayTick);
    this.tick = ((t % len) + len) % len;
    this.notify();
  }

  /** 何日目かをすぐ変える（読みこみ用） */
  setDay(day: number): void {
    this.dayNo = Math.max(0, Math.floor(day));
  }

  /**
   * ふとんで ねた: 起きる 時刻（1 日の中の ステップ。表 GADGET_TUNING.futon.wakeDayTick = ひるの はじまり）に すぐ とぶ。
   * 日づけは ちょうど 1 進む（ねた 夜から 次の ひる）。起きる 時刻が 今より 前なら 次の 日、後なら 同じ 日の ままに 数える
   */
  sleepToMorning(wakeDayTick: number = GADGET_TUNING.futon.wakeDayTick): void {
    if (wakeDayTick <= this.tick) this.dayNo++;
    this.tick = wakeDayTick;
    this.notify();
  }

  update(): void {
    this.tick++;
    if (this.tick >= dayLength(this.settings)) {
      this.tick = 0;
      this.dayNo++;
    }
    this.notify();
  }

  onPhaseChange(fn: (phase: DayPhase) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const p = this.phase();
    if (p === this.lastPhase) return;
    this.lastPhase = p;
    for (const fn of [...this.listeners]) fn(p);
  }
}
