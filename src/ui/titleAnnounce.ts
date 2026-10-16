import type { YokaiTitle } from '../contracts';
import './titleAnnounce.css';

export interface AnnounceState {
  text: string;
  icon: Exclude<YokaiTitle, 'none' | 'oyabun'>;
  ticksLeft: number;
}

/** 仮のアイコン（BAL-C のバーと同じ ★ の数。本物は #115 で入れかえる） */
export const ANNOUNCE_STARS: Record<AnnounceState['icon'], string> = { taisho: '★★', nushi: '★★★' };

/** 登場のおしらせ（画面の上のまん中）。毎ステップ sync(state) を呼ぶ */
export class TitleAnnounce {
  readonly el: HTMLDivElement;
  private readonly iconEl: HTMLSpanElement;
  private readonly textEl: HTMLSpanElement;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'title-announce';
    this.el.hidden = true;
    this.iconEl = document.createElement('span');
    this.iconEl.className = 'title-announce-icon';
    this.iconEl.setAttribute('aria-hidden', 'true');
    this.textEl = document.createElement('span');
    this.el.append(this.iconEl, this.textEl);
    parent.append(this.el);
  }

  sync(s: AnnounceState | null): void {
    if (!s) {
      if (!this.el.hidden) this.el.hidden = true;
      this.shown = '';
      return;
    }
    const key = `${s.icon}|${s.text}`;
    if (key !== this.shown) {
      this.shown = key;
      this.iconEl.textContent = ANNOUNCE_STARS[s.icon];
      this.textEl.textContent = s.text;
    }
    if (this.el.hidden) this.el.hidden = false;
  }
}
