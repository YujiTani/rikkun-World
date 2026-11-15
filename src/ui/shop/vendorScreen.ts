import type { ItemId } from '../../contracts';
import type { VendorView } from '../../town/vendor/vendorDesk';
import { VENDOR_TEXT } from '../../town/vendor/vendorText';
import { itemIconUrl } from '../itemIcon';
import { escapeHtml, withRuby } from '../text';
import './shopScreen.css';
import './vendorScreen.css';

/**
 * かじやさん・かいとりの やたいの 画面（TOWN-1-shop §2.11・§2.12・§3.2。PO 決め: よろずやと 同じ ならべ方 ＝ 左に 一覧・右に えらんだ 物の 大きな 絵と 大きな ボタン、
 * たりない ときは ボタンの 上に 大きな 色つきの 帯）。よろずやの 画面の 部品（shopScreen.css の .shop-*）を そのまま つかう。
 * 1 人 ＝ 全面、2 人 ＝ 開いた 人の 半分。data-testid は `<prefix>-screen` など（e2e/town1e.spec.ts の 頭）。カードが 多い ときは 一覧だけ たてに スクロール。
 */

export type VendorPrefix = 'smith' | 'stall';

/** カード 1 まい（body ＝ 絵の 下の 中身の html。字は 数だけ） */
export interface VendorCardView {
  id: string;
  icon: string;
  can: boolean;
  body: string;
}

/** 右の えらんだ 物（name は ［漢字｜よみ］。info・pay は html） */
export interface VendorDetailView {
  icon: string;
  name: string;
  info: string;
  pay: string;
  can: boolean;
}

export interface VendorScreenText {
  title: string;
  list: string;
  pick: string;
  buy: string;
  empty: string;
}

export interface VendorScreenPorts {
  view(): VendorView;
  /** 変わった 目印（ちがえば 書きなおす。毎ステップ よむ ので 物を 作らずに 数を つなぐ） */
  key(): string;
  dama(): number;
  half(): boolean;
  cards(): VendorCardView[];
  detail(id: string): VendorDetailView | null;
  select(id: string): void;
  buy(): void;
  close(): void;
}

const img = (src: string, cls: string): string => `<img class="${cls}" src="${src}" alt="" draggable="false">`;
export const orbImg = (cls: string): string => img(itemIconUrl('yokai_orb' as ItemId), cls);

export class VendorScreen {
  readonly el: HTMLDivElement;
  private shown = '';

  constructor(
    private readonly parent: HTMLElement,
    owner: 1 | 2,
    private readonly prefix: VendorPrefix,
    private readonly text: VendorScreenText,
    private readonly p: VendorScreenPorts,
  ) {
    this.el = document.createElement('div');
    this.el.className = `shop vendor vendor--${prefix}`;
    this.el.dataset.testid = `${prefix}-screen`;
    this.el.dataset.owner = String(owner);
    // 画面の 上の クリックは ゲームの 操作（こうげき・おく）に しない（入力は window で 受けて いる）
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('mouseup', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  /** 1 行の カードの 数（パッドの 上下） */
  cols(): number {
    return this.p.half() ? 4 : 6; // shopScreen.css の .shop-grid の れつ
  }

  /** 開いて いれば 書きなおす（変わらなければ 何も しない。毎ステップ よんで よい） */
  sync(open: boolean): void {
    if (!open) {
      if (this.el.isConnected) {
        this.el.remove();
        this.el.innerHTML = '';
        this.shown = '';
      }
      return;
    }
    const key = this.p.key();
    if (key === this.shown && this.el.isConnected) return;
    this.shown = key;
    if (!this.el.isConnected) this.parent.append(this.el);
    this.el.dataset.layout = this.p.half() ? 'half' : 'full';
    this.el.innerHTML = this.html(this.p.view());
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-testid]');
    const id = t?.dataset.testid;
    if (!id) return;
    const card = `${this.prefix}-card-`;
    if (id.startsWith(card)) this.p.select(id.slice(card.length));
    else if (id === `${this.prefix}-buy`) this.p.buy();
    else if (id === `${this.prefix}-close`) this.p.close();
    else return;
    this.shown = '';
    this.sync(true);
  }

  private html(v: VendorView): string {
    const P = this.prefix;
    const cards = this.p.cards();
    const sel = v.selected === null ? null : (cards.find((c) => c.id === v.selected) ?? null);
    const warn = v.warn && v.bubble !== null && !(sel?.can ?? false) ? v.bubble : null; // 足りる ように なったら 帯は けす
    const headBubble = v.bubble !== null && (warn === null || sel === null);
    const head =
      `<div class="shop-head"><div class="shop-titles"><h2 class="shop-title">${withRuby(this.text.title)}</h2>` +
      (headBubble ? `<p class="shop-bubble${warn ? ' is-warn' : ''}" data-testid="${P}-bubble">${withRuby(v.bubble!)}</p>` : '') +
      `</div><div class="shop-dama" data-testid="${P}-dama"><span class="shop-dama-label">${VENDOR_TEXT.have}</span>` +
      `<span class="shop-dama-num">${orbImg('shop-orb shop-orb--big')}<b>${this.p.dama()}</b></span></div>` +
      `<button type="button" class="shop-close" data-testid="${P}-close" aria-label="${VENDOR_TEXT.close}">✕</button></div>`;
    const grid = cards.length > 0 ? `<div class="shop-grid vendor-grid">${cards.map((c) => this.card(c, c.id === v.selected)).join('')}</div>` : `<p class="vendor-empty">${withRuby(this.text.empty)}</p>`;
    const list = `<div class="shop-list vendor-list"><h3 class="shop-group">${withRuby(this.text.list)}</h3>${grid}</div>`;
    const d = sel ? this.p.detail(sel.id) : null;
    const side = `<div class="shop-side">${d ? this.detail(d, warn) : `<p class="shop-pick">${withRuby(this.text.pick)}</p>`}</div>`;
    return head + `<div class="shop-body">${list}${side}</div>`;
  }

  private card(c: VendorCardView, selected: boolean): string {
    const cls = `shop-card vendor-card${selected ? ' is-on' : ''}${c.can ? '' : ' is-off'}`;
    return (
      `<button type="button" class="${cls}" data-testid="${this.prefix}-card-${escapeHtml(c.id)}" data-can="${c.can ? 1 : 0}">` +
      `<span class="shop-card-art">${img(c.icon, 'shop-card-icon')}</span>${c.body}</button>`
    );
  }

  private detail(d: VendorDetailView, warn: string | null): string {
    const P = this.prefix;
    const note = warn ? `<p class="shop-warn" data-testid="${P}-bubble" role="status">${orbImg('shop-orb shop-warn-orb')}<span>${withRuby(warn)}</span></p>` : `<p class="shop-pay">${d.pay}</p>`;
    return (
      `<div class="shop-detail" data-testid="${P}-detail"><div class="shop-big">${img(d.icon, 'shop-big-icon')}</div>` +
      `<p class="shop-name">${withRuby(d.name)}</p>${d.info}<div class="shop-fill"></div>${note}` +
      `<button type="button" class="shop-buy" data-testid="${P}-buy" aria-disabled="${d.can ? 'false' : 'true'}">${withRuby(this.text.buy)}</button></div>`
    );
  }

  dispose(): void {
    this.el.remove();
  }
}
