import type { DayPhase } from '../contracts';
import { clockBackground } from './clockModel';
import './clock.css';

/** 画面の右上の時計のマーク（字なし）。`#clock[data-phase]` */
export class Clock {
  readonly el: HTMLDivElement;
  private shown: DayPhase | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'clock';
    this.el.setAttribute('aria-hidden', 'true');
    parent.append(this.el);
  }

  set(phase: DayPhase): void {
    if (phase === this.shown) return;
    this.shown = phase;
    this.el.dataset.phase = phase;
    this.el.style.background = clockBackground(phase);
  }
}
