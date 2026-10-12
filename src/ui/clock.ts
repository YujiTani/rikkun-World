import type { DayPhase } from '../contracts';
import type { TimeSettings } from '../time/config';
import { CLOCK_COLORS, CLOCK_SKY, clockBodyPose } from './clockModel';
import './clock.css';

/** 画面の右上の時計のマーク（字なし）。`#clock[data-phase]`。円の上を おひさま／おつきさま が東から西へ動く */
export class Clock {
  readonly el: HTMLDivElement;
  readonly body: HTMLDivElement;
  /** まるい文字盤（空の色の円）。`#clock` は C「時計」のかたまり全体 */
  readonly dial: HTMLDivElement;
  /** `3 にちめ`（日の数がわかるとき） */
  readonly dayEl: HTMLSpanElement;
  private shownDay = -1;
  private shown: DayPhase | null = null;
  private shownBody = '';
  private shownPos = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'clock';
    this.el.setAttribute('aria-hidden', 'true');
    this.dial = document.createElement('div');
    this.dial.className = 'clock-dial';
    this.body = document.createElement('div');
    this.body.className = 'clock-body';
    this.dial.append(this.body);
    this.dayEl = document.createElement('span');
    this.dayEl.className = 'clock-day';
    this.dayEl.hidden = true;
    this.el.append(this.dial, this.dayEl);
    parent.append(this.el);
  }

  set(phase: DayPhase): void {
    if (phase === this.shown) return;
    this.shown = phase;
    this.el.dataset.phase = phase;
    this.dial.style.background = CLOCK_SKY[phase];
  }

  /** 1 日の時刻に合わせて絵を動かす。day は `N にちめ` の N（1 から。つなぎ込みが time.day()+1 を渡す）（毎ステップ呼んでよい。かわったときだけ DOM を書く） */
  setTime(dayTick: number, settings: TimeSettings, day?: number): void {
    if (day !== undefined && day !== this.shownDay) {
      this.shownDay = day;
      this.dayEl.textContent = `${day} にちめ`;
      this.dayEl.hidden = false;
    }
    const p = clockBodyPose(dayTick, settings);
    if (p.body !== this.shownBody) {
      this.shownBody = p.body;
      this.body.dataset.body = p.body;
      this.body.style.background = CLOCK_COLORS[p.body];
    }
    // 円の中（内がわ 40px）で、中心から半径 14px の弧の上をうごく
    const r = 14;
    const tx = (p.x * r).toFixed(1);
    const ty = (-p.y * r + 6).toFixed(1);
    const pos = `${tx},${ty}`;
    if (pos === this.shownPos) return;
    this.shownPos = pos;
    this.body.style.transform = `translate(${tx}px, ${ty}px)`;
  }
}
