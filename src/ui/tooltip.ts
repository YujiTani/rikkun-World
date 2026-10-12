import type { ItemId } from '../contracts';
import { anyIconUrl, itemIconUrl } from './itemIcon';
import { buildTooltip, rarityCss, starText, type TooltipData, type TooltipDeps } from './tooltipModel';
import './tooltip.css';

/** 合わせた場所: マス番号 0〜35・'head'・'body'・'card:<レシピ id>'・'material:<レシピ id>:<item>'・'fuel:<item>' */
export type HoverTarget = number | string;

export interface TooltipOptions extends TooltipDeps {
  /** 場所にあるアイテム（空なら null） */
  resolve(target: HoverTarget): ItemId | null;
  /** もちもの画面が開いているか */
  isOpen(): boolean;
  /** カーソルに何か持っているか */
  cursorHeld(): boolean;
}

/**
 * マスの ツールチップ（M4 §2.13）。もちもの画面が開いていて、カーソルが空で、合わせた場所に
 * アイテムがあるときだけ出る。マウスの右下に出し、画面の外にはみ出さない。
 */
export class Tooltip {
  readonly el: HTMLDivElement;
  private target: HoverTarget | null = null;
  private shownKey = '';
  private mx = 0;
  private my = 0;
  private readonly onMove: (e: MouseEvent) => void;
  private readonly head: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly starsEl: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly descEl: HTMLDivElement;
  private readonly headIcon: HTMLImageElement;

  constructor(parent: HTMLElement, private readonly o: TooltipOptions) {
    this.el = document.createElement('div');
    this.el.id = 'tooltip';
    this.el.hidden = true;
    this.head = document.createElement('div');
    this.head.className = 'tip-head';
    this.headIcon = document.createElement('img');
    this.headIcon.className = 'tip-head-icon';
    this.headIcon.alt = '';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'tip-name';
    this.head.append(this.headIcon, this.nameEl);
    this.starsEl = document.createElement('div');
    this.starsEl.className = 'tip-stars';
    this.descEl = document.createElement('div');
    this.descEl.className = 'tip-desc rk-tooltip__desc';
    this.body = document.createElement('div');
    this.body.className = 'tip-lines';
    this.el.append(this.head, this.starsEl, this.descEl, this.body);
    parent.append(this.el);
    this.onMove = (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.place();
    };
    window.addEventListener('mousemove', this.onMove);
  }

  /** マウスを合わせた（null で外れた） */
  hover(target: HoverTarget | null): void {
    this.target = target;
    this.update();
  }

  /** 今出ている札（出ていなければ null） */
  data(): TooltipData | null {
    if (this.target === null || !this.o.isOpen() || this.o.cursorHeld()) return null;
    const item = this.o.resolve(this.target);
    if (!item) return null;
    return buildTooltip(item, this.o);
  }

  /** 毎ステップ（持ち物が変わったときも札を直す） */
  update(): void {
    const t = this.data();
    if (!t) {
      if (this.shownKey !== '') {
        this.shownKey = '';
        this.el.hidden = true;
      }
      return;
    }
    const key = `${t.item}|${t.desc}|${t.lines.join('/')}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      const col = rarityCss(t.rarity);
      this.el.style.borderColor = col;
      this.headIcon.src = itemIconUrl(t.item);
      this.nameEl.textContent = t.name;
      this.nameEl.style.color = col;
      this.starsEl.textContent = starText(t.stars);
      this.starsEl.style.color = col;
      this.descEl.textContent = t.desc;
      this.descEl.hidden = t.desc === '';
      this.body.replaceChildren();
      t.lines.forEach((text, i) => {
        const row = document.createElement('div');
        row.className = 'tip-line';
        const img = document.createElement('img');
        img.alt = '';
        img.src = anyIconUrl(t.icons[i]);
        const span = document.createElement('span');
        span.textContent = text;
        row.append(img, span);
        this.body.append(row);
      });
    }
    this.el.hidden = false;
    this.place();
  }

  private place(): void {
    if (this.el.hidden) return;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    let x = this.mx + 18;
    let y = this.my + 18;
    if (x + w > window.innerWidth - 4) x = Math.max(4, this.mx - w - 12);
    if (y + h > window.innerHeight - 4) y = Math.max(4, window.innerHeight - h - 4);
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMove);
    this.el.remove();
  }
}
