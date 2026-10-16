import type { YokaiTitle } from '../contracts';
import type { Rgba } from '../world/blocks/textures';
import { drawPixels } from './itemIcon';
import { nickIconPixels } from './itemArtBal';
import './titleAnnounce.css';

export interface AnnounceState {
  text: string;
  icon: Exclude<YokaiTitle, 'none' | 'oyabun'>;
  ticksLeft: number;
}

/** おしらせの アイコンの 大きさ（px）。16 × 3。ドットのまま 拡大（ぼかさない） */
export const ANNOUNCE_ICON_PX = 48;

/** おしらせの アイコンの 絵（DESIGN 13.3 の 丸いバッジ） */
export function announceIconPixels(icon: AnnounceState['icon']): Rgba[] {
  return nickIconPixels(icon);
}

/** 登場のおしらせ（画面の上のまん中）。毎ステップ sync(state) を呼ぶ */
export class TitleAnnounce {
  readonly el: HTMLDivElement;
  private readonly iconEl: HTMLCanvasElement;
  private readonly textEl: HTMLSpanElement;
  private shown = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'title-announce';
    this.el.hidden = true;
    this.iconEl = document.createElement('canvas');
    this.iconEl.style.width = `${ANNOUNCE_ICON_PX}px`;
    this.iconEl.style.height = `${ANNOUNCE_ICON_PX}px`;
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
      drawPixels(this.iconEl, announceIconPixels(s.icon));
      this.textEl.textContent = s.text;
    }
    if (this.el.hidden) this.el.hidden = false;
  }
}
