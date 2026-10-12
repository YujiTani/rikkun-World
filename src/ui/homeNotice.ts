import { DEATH_VIEW, HOME_TEXT } from './deathScreenModel';
import './homeNotice.css';

/** `スタートに もどったよ` を 2 秒出す文字（復活のあと）。show() と、毎ステップ update(dt) */
export class HomeNotice {
  readonly el: HTMLDivElement;
  /** のこりの秒（0 = 出していない） */
  left = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'home-notice';
    this.el.textContent = HOME_TEXT;
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(): void {
    this.left = DEATH_VIEW.homeNoticeSeconds;
    this.el.hidden = false;
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) {
      this.left = 0;
      this.el.hidden = true;
    }
  }
}
