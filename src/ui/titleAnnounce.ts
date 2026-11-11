import type { YokaiTitle } from '../contracts';
import type { Rgba } from '../world/blocks/textures';
import { drawPixels } from './itemIcon';
import { halfId } from './duoHalfIds';
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

  /** who = 2: 2 人の とき 2P の 半分に 出す もう 1 つ（COOP-1 5f-2 #13。世界で 1 つの おしらせを 両方に 同じ 物。音は 部品の 外で 1 回） */
  constructor(parent: HTMLElement, private readonly who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'title-announce' : 'title-announce-p2';
    if (who === 2) this.el.className = 'title-announce--p2';
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

  /** 2 人の あいだ だけ UI 検査の 目印（data-testid）を つける。1 人に もどったら はずす */
  mark(on: boolean): void {
    if (on) this.el.setAttribute('data-testid', halfId('titleAnnounce', this.who));
    else this.el.removeAttribute('data-testid');
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
