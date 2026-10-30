import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { withRuby } from './text';
import './gadgetUi.css';

/**
 * 小物（ITEM-FX-1）の画面: ふとんで ねている 間の 暗い板と、「よる に ねようね」の 文字。
 * 毎ステップ update(dt, fade) を呼ぶ（dt は 秒）。文は show() から 表の秒数（GADGET_TUNING.futon.noticeSeconds）だけ 出る。
 */
export class GadgetUi {
  readonly fadeEl: HTMLDivElement;
  readonly noticeEl: HTMLDivElement;
  private left = 0;
  private text: string | null = null;

  constructor(parent: HTMLElement) {
    this.fadeEl = document.createElement('div');
    this.fadeEl.id = 'sleep-fade';
    this.fadeEl.setAttribute('aria-hidden', 'true');
    this.fadeEl.hidden = true;
    this.noticeEl = document.createElement('div');
    this.noticeEl.id = 'sleep-notice';
    this.noticeEl.hidden = true;
    parent.append(this.fadeEl, this.noticeEl);
  }

  /** いま 出している 文（なければ null） */
  notice(): string | null {
    return this.text;
  }

  show(text: string): void {
    this.text = text;
    this.left = GADGET_TUNING.futon.noticeSeconds;
    this.noticeEl.innerHTML = withRuby(text);
    this.noticeEl.hidden = false;
  }

  update(dt: number, fade: number): void {
    this.fadeEl.hidden = fade <= 0;
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, fade)));
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) {
      this.left = 0;
      this.text = null;
      this.noticeEl.hidden = true;
    }
  }
}
