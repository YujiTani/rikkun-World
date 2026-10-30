import type { ItemId, ItemStack } from '../contracts';
import { rarityTier } from '../drops/rarity';
import { anyIconUrl, itemIconUrl } from './itemIcon';
import { withRuby } from './text';
import { buildTooltip, rarityCss, starText, type TooltipData, type TooltipDeps } from './tooltipModel';
import './tooltip.css';

/**
 * カーソルの右下に出す。右にはみ出すなら左へ、下にはみ出すならカーソルの上へ。
 * それでも入らなければ 画面の中に押し込む（はしから 4px）。
 */
export function placeNear(mx: number, my: number, w: number, h: number, vw: number, vh: number): { x: number; y: number } {
  const m = 4;
  let x = mx + 18;
  let y = my + 18;
  if (x + w > vw - m) x = mx - w - 12;
  if (y + h > vh - m) y = my - h - 12;
  x = Math.min(Math.max(m, x), Math.max(m, vw - w - m));
  y = Math.min(Math.max(m, y), Math.max(m, vh - h - m));
  return { x, y };
}

/** 合わせた場所: マス番号 0〜35・'head'・'body'・'card:<レシピ id>'・'material:<レシピ id>:<item>'・'fuel:<item>' */
export type HoverTarget = number | string;

export interface TooltipOptions extends TooltipDeps {
  /** 場所にあるアイテム（空なら null） */
  resolve(target: HoverTarget): ItemId | null;
  /** WEAPON-2: へった 量つきの 中身（あれば たいきゅうの 行に 使う） */
  resolveStack?(target: HoverTarget): ItemStack | null;
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
  private readonly onWheel: (e: WheelEvent) => void;
  private readonly head: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly starsEl: HTMLDivElement;
  private readonly wordEl: HTMLDivElement;
  private readonly wordText: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private readonly descEl: HTMLDivElement;
  private readonly specialEl: HTMLDivElement;
  private readonly specialText: HTMLDivElement;
  private readonly specialHead: HTMLDivElement;
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
    this.wordEl = document.createElement('div');
    this.wordEl.className = 'tip-word';
    this.wordText = document.createElement('span');
    this.wordEl.append(this.wordText);
    this.descEl = document.createElement('div');
    this.descEl.className = 'tip-desc rk-tooltip__desc';
    // NINJA-1: 虹色の「とくべつな ちから」の 行（レジェンダリーの 物だけ。「なにに」の 下）
    this.specialEl = document.createElement('div');
    this.specialEl.className = 'tip-special';
    this.specialEl.hidden = true;
    const specialHead = document.createElement('div');
    specialHead.className = 'tip-special-head rk-special-head';
    this.specialText = document.createElement('div');
    this.specialText.className = 'tip-special-text';
    this.specialEl.append(specialHead, this.specialText);
    this.specialHead = specialHead;
    this.body = document.createElement('div');
    this.body.className = 'tip-lines';
    this.el.append(this.head, this.starsEl, this.wordEl, this.descEl, this.specialEl, this.body);
    parent.append(this.el);
    this.onMove = (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
      this.place();
    };
    window.addEventListener('mousemove', this.onMove);
    // ツールチップは マウスを通さないので、長いときは ホイールで中を動かす
    this.onWheel = (e) => {
      if (this.el.hidden || this.el.scrollHeight <= this.el.clientHeight) return;
      this.el.scrollTop += e.deltaY;
    };
    window.addEventListener('wheel', this.onWheel, { passive: true });
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
    return buildTooltip(item, this.o, this.o.resolveStack?.(this.target));
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
    const key = `${t.item}|${t.rarity}|${t.desc}|${t.special ?? ''}|${t.lines.join('/')}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      const col = rarityCss(t.rarity);
      this.el.style.borderColor = col;
      this.headIcon.src = itemIconUrl(t.item);
      this.nameEl.innerHTML = withRuby(t.name); // 名前は ［漢字｜よみ］ → ふりがなつき（WEAPON-7 §2.7）
      this.nameEl.style.color = col; // 7 段目は 下で はずす
      this.starsEl.textContent = starText(t.stars);
      this.starsEl.style.color = col;
      const tier = rarityTier(t.rarity);
      this.wordText.textContent = tier.word;
      this.wordEl.style.color = col;
      // 7 段目は 名前を にじ色に（案 A）
      this.nameEl.classList.toggle('tip-name--rainbow', tier.index === 6);
      this.starsEl.classList.toggle('tip-stars--rainbow', tier.index === 6);
      if (tier.index === 6) {
        this.nameEl.style.removeProperty('color');
        this.starsEl.style.removeProperty('color');
      }
      this.descEl.innerHTML = withRuby(t.desc);
      this.descEl.hidden = t.desc === '';
      this.specialEl.hidden = t.special === null;
      this.specialHead.textContent = t.specialHead;
      this.specialText.innerHTML = t.special === null ? '' : withRuby(t.special);
      this.body.replaceChildren();
      t.lines.forEach((text, i) => {
        const row = document.createElement('div');
        row.className = 'tip-line';
        const img = document.createElement('img');
        img.alt = '';
        img.src = anyIconUrl(t.icons[i]);
        const span = document.createElement('span');
        span.innerHTML = withRuby(text);
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
    const p = placeNear(this.mx, this.my, w, h, window.innerWidth, window.innerHeight);
    const x = p.x;
    const y = p.y;
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('wheel', this.onWheel);
    this.el.remove();
  }
}
