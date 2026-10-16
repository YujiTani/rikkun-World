import type { DayPhase } from '../contracts';
import type { TimeSettings } from '../time/config';
import { clockSceneUrl } from './clockArt';
import { CLOCK_PHASES, CLOCK_WORDS, clockScene, clockShouldFade, type ClockPhases, type ClockScene } from './clockModel';
import './clock.css';

/**
 * 画面の右上の時計（C のかたまり）。いまの時間帯の絵 1 つ＋ことば＋`N にちめ`（M6-clock）。
 * DOM: `#clock[data-phase=day|dusk|night|dawn][data-scene=sunrise|morning|noon|afternoon|sunset|night]`
 * 絵が変わるときは 0.5 秒で ふわっと入れかわる（点滅しない）。
 */
export class Clock {
  readonly el: HTMLDivElement;
  readonly pic: HTMLDivElement;
  readonly wordEl: HTMLSpanElement;
  /** `3 にちめ`（日の数がわかるとき） */
  readonly dayEl: HTMLSpanElement;
  private readonly back: HTMLImageElement;
  private readonly front: HTMLImageElement;
  private shown: DayPhase | null = null;
  private shownScene: ClockScene | null = null;
  private shownDay = -1;
  private prevTick: number | null = null;

  constructor(parent: HTMLElement, private readonly phases: ClockPhases = CLOCK_PHASES) {
    this.el = document.createElement('div');
    this.el.id = 'clock';
    this.el.setAttribute('aria-hidden', 'true');
    this.pic = document.createElement('div');
    this.pic.className = 'clock-pic';
    this.back = document.createElement('img');
    this.front = document.createElement('img');
    for (const i of [this.back, this.front]) {
      i.className = 'clock-img';
      i.alt = '';
      this.pic.append(i);
    }
    this.wordEl = document.createElement('span');
    this.wordEl.className = 'clock-word';
    this.dayEl = document.createElement('span');
    this.dayEl.className = 'clock-day';
    this.dayEl.hidden = true;
    this.el.append(this.pic, this.wordEl, this.dayEl);
    parent.append(this.el);
  }

  set(phase: DayPhase): void {
    if (phase === this.shown) return;
    this.shown = phase;
    this.el.dataset.phase = phase;
  }

  /** 1 日の時刻に合わせて絵とことばを変える（毎ステップ呼んでよい）。day は `N にちめ` の N（1 から） */
  setTime(dayTick: number, settings: TimeSettings, day?: number): void {
    if (day !== undefined && day !== this.shownDay) {
      this.shownDay = day;
      this.dayEl.textContent = `${day} にちめ`;
      this.dayEl.hidden = false;
    }
    const scene = clockScene(dayTick, settings, this.phases);
    const fade = clockShouldFade(this.prevTick, dayTick, settings);
    this.prevTick = dayTick;
    if (scene === this.shownScene) return;
    const first = this.shownScene === null;
    if (!first && fade) this.back.src = this.front.src;
    this.shownScene = scene;
    this.el.dataset.scene = scene;
    this.front.src = clockSceneUrl(scene);
    this.wordEl.textContent = CLOCK_WORDS[scene];
    if (!fade) {
      // とんだとき・最初は すぐ入れかえ（走っている ふわっも止める）
      this.front.classList.remove('is-fade');
    } else if (!first) {
      // 0.5 秒で ふわっと入れかえ（1 回だけ）
      this.front.classList.remove('is-fade');
      void this.front.offsetWidth;
      this.front.classList.add('is-fade');
    }
  }
}
