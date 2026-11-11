import { halfId } from './duoHalfIds';
import { DEATH_VIEW, homeTextOf } from './deathScreenModel';
import './homeNotice.css';

/**
 * `スタートに もどったよ` を 2 秒出す文字（復活のあと）。show() と、毎ステップ update(dt)。
 * who = 2: 2 人の とき 2P の 半分に 出す もう 1 つ（COOP-1 5f-2 #14）。文面は `homeTextOf(who)`（ui/deathScreenModel.ts の 1 か所）
 */
export class HomeNotice {
  readonly el: HTMLDivElement;
  /** のこりの秒（0 = 出していない） */
  left = 0;

  constructor(parent: HTMLElement, private readonly who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'home-notice' : 'home-notice-p2';
    if (who === 2) this.el.className = 'home-notice--p2';
    this.el.textContent = homeTextOf(who);
    this.el.hidden = true;
    parent.append(this.el);
  }

  /** 2 人の あいだ だけ UI 検査の 目印を つける */
  mark(on: boolean): void {
    if (on) this.el.setAttribute('data-testid', halfId('homeNotice', this.who));
    else this.el.removeAttribute('data-testid');
  }

  show(): void {
    this.left = DEATH_VIEW.homeNoticeSeconds;
    this.el.hidden = false;
  }

  /** すぐ 消す（2P が やめた とき） */
  clear(): void {
    this.left = 0;
    this.el.hidden = true;
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
