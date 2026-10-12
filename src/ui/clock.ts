import type { DayPhase } from '../contracts';
import type { TimeSettings } from '../time/config';
import { CLOCK_COLORS, CLOCK_SKY, clockBodyPose } from './clockModel';
import './clock.css';

/** 画面の右上の時計のマーク（字なし）。`#clock[data-phase]`。円の上を おひさま／おつきさま が東から西へ動く */
export class Clock {
  readonly el: HTMLDivElement;
  readonly body: HTMLDivElement;
  private shown: DayPhase | null = null;
  private shownBody = '';
  private shownPos = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'clock';
    this.el.setAttribute('aria-hidden', 'true');
    this.body = document.createElement('div');
    this.body.className = 'clock-body';
    this.el.append(this.body);
    parent.append(this.el);
  }

  set(phase: DayPhase): void {
    if (phase === this.shown) return;
    this.shown = phase;
    this.el.dataset.phase = phase;
    this.el.style.background = CLOCK_SKY[phase];
  }

  /** 1 日の時刻に合わせて絵を動かす（毎ステップ呼んでよい。かわったときだけ DOM を書く） */
  setTime(dayTick: number, settings: TimeSettings): void {
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
