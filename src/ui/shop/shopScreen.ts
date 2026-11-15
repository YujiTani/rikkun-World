import type { ItemId } from '../../contracts';
import { itemType } from '../../inventory/items';
import { boxSample, type ShopRow } from '../../town/shop/shop';
import type { ShopView } from '../../town/shop/shopSession';
import { SHOP_BOXES, isShopBox, shopGood, type ShopItemId } from '../../town/shop/shopTable';
import { SHOP_TEXT } from '../../town/shop/shopText';
import { drawPixels, itemIconUrl } from '../itemIcon';
import { escapeHtml, withRuby } from '../text';
import { getTilePixels } from '../../world/blocks/textures';
import './shopScreen.css';

/**
 * よろずやの 画面（TOWN-1-shop §2.6・§2.7・§3.2。ならべ方は オーナー決定 11-15: 左に 品の 一覧〔しなもの／たからばこ〕・右に えらんだ 品の 大きな 絵・名前・説明・「こうかん する」）。
 * 1 人 ＝ 画面の まん中（全面）、2 人 ＝ 開いた 人の 半分（1P 左・2P 右）。1P も 2P も 同じ 部品・同じ data-testid（e2e/town1c.spec.ts の 頭）。
 * カードには 字を 書かない（絵と ねだん だけ。AC19）。一覧は スクロールしない。漢字は ruby。
 */

export interface ShopScreenPorts {
  /** いまの 状態（開いて いなければ open false） */
  view(): ShopView;
  /** 変わった 目印（ふえたら 書きなおす） */
  version(): number;
  rows(): ShopRow[];
  dama(): number;
  /** 2 人 あそびの 半分か */
  half(): boolean;
  /** 動きを へらす（中身の ぽんを 止める） */
  reduced(): boolean;
  select(id: ShopItemId): void;
  buy(): void;
  close(): void;
  closeResult(): void;
}

const boxIcons = new Map<string, string>();
/** たからばこの 絵（坑道の 宝箱の 絵: こばこ ＝ 木・おおばこ ＝ ミラクル） */
function boxIconUrl(box: 'kobako' | 'obako'): string {
  let u = boxIcons.get(box);
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, getTilePixels(box === 'kobako' ? 'chest_1' : 'chest_4'));
    u = c.toDataURL();
    boxIcons.set(box, u);
  }
  return u;
}

const img = (src: string, cls: string): string => `<img class="${cls}" src="${src}" alt="" draggable="false">`;
const orb = (cls: string): string => img(itemIconUrl('yokai_orb' as ItemId), cls);

/** 品の 名前（［漢字｜よみ］）。1 しゅるいの 品は アイテムの 名前 */
function nameOf(id: ShopItemId): string {
  if (isShopBox(id)) return SHOP_BOXES[id].name;
  const g = shopGood(id)!;
  if ('name' in g) return g.name;
  return itemType(g.give[0]!.item)?.name ?? g.id;
}

/** カード・大きな 絵の 絵（組の 品は 1 つ目の 物。2 つ目は 小さく かさねる） */
function iconsOf(id: ShopItemId): { main: string; sub: string | null } {
  if (isShopBox(id)) return { main: boxIconUrl(id), sub: null };
  const g = shopGood(id)!;
  return { main: itemIconUrl(g.give[0]!.item), sub: g.give.length > 1 ? itemIconUrl(g.give[1]!.item) : null };
}

export class ShopScreen {
  readonly el: HTMLDivElement;
  private shown = '';

  constructor(
    private readonly parent: HTMLElement,
    owner: 1 | 2,
    private readonly p: ShopScreenPorts,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'shop';
    this.el.dataset.testid = 'shop-screen';
    this.el.dataset.owner = String(owner);
    // 開いて いる 間だけ DOM に 入れる（2 人の ときは 開いた 人の 画面だけ。e2e の 約束）
    // 画面の 上の クリックは ゲームの 操作（こうげき・おく）に しない（入力は window で 受けて いる）
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('mouseup', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  /** 1 行の カードの 数（パッドの 上下） */
  cols(): number {
    return this.p.half() ? 4 : 6;
  }

  /** 変わって いれば 書きなおす（毎ステップ よんで よい。変わらなければ 何も しない） */
  sync(): void {
    const v = this.p.view();
    if (!v.open) {
      if (this.el.isConnected) {
        this.el.remove();
        this.el.innerHTML = '';
        this.shown = '';
      }
      return;
    }
    const rows = this.p.rows();
    const key = `${this.p.version()}|${this.p.dama()}|${this.p.half() ? 1 : 0}|${rows.map((r) => (r.canBuy ? 1 : 0) + (r.soldOut ? 2 : 0)).join('')}`;
    if (key === this.shown && this.el.isConnected) return;
    this.shown = key;
    if (!this.el.isConnected) this.parent.append(this.el);
    this.el.dataset.layout = this.p.half() ? 'half' : 'full';
    this.el.innerHTML = this.html(v, rows);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-testid]');
    const id = t?.dataset.testid;
    if (!id) return;
    if (id.startsWith('shop-card-')) this.p.select(id.slice('shop-card-'.length) as ShopItemId);
    else if (id === 'shop-buy') this.p.buy();
    else if (id === 'shop-close') this.p.close();
    else if (id === 'shop-result-close') this.p.closeResult();
    else return;
    this.sync();
  }

  private card(r: ShopRow, selected: boolean): string {
    const ic = iconsOf(r.id);
    const cls = `shop-card${isShopBox(r.id) ? ' shop-card--box' : ''}${selected ? ' is-on' : ''}${r.canBuy ? '' : ' is-off'}`;
    return (
      `<button type="button" class="${cls}" data-testid="shop-card-${r.id}" data-can="${r.canBuy ? 1 : 0}" data-sold="${r.soldOut ? 1 : 0}">` +
      `<span class="shop-card-art">${img(ic.main, 'shop-card-icon')}${ic.sub ? img(ic.sub, 'shop-card-sub') : ''}</span>` +
      `<span class="shop-price">${orb('shop-orb')}<span>${r.price}</span></span></button>`
    );
  }

  private html(v: ShopView, rows: ShopRow[]): string {
    const goods = rows.filter((r) => !isShopBox(r.id));
    const boxes = rows.filter((r) => isShopBox(r.id));
    const head =
      `<div class="shop-head"><div class="shop-titles"><h2 class="shop-title">${SHOP_TEXT.title}</h2>` +
      (v.bubble ? `<p class="shop-bubble" data-testid="shop-bubble">${withRuby(v.bubble)}</p>` : '') +
      `</div><div class="shop-dama" data-testid="shop-dama"><span class="shop-dama-label">${SHOP_TEXT.have}</span>` +
      `<span class="shop-dama-num">${orb('shop-orb shop-orb--big')}<b>${this.p.dama()}</b></span></div>` +
      `<button type="button" class="shop-close" data-testid="shop-close" aria-label="${SHOP_TEXT.close}">✕</button></div>`;
    const list =
      `<div class="shop-list"><h3 class="shop-group">${SHOP_TEXT.goods}</h3><div class="shop-grid">${goods.map((r) => this.card(r, r.id === v.selected)).join('')}</div>` +
      `<h3 class="shop-group">${SHOP_TEXT.boxes} ★</h3><div class="shop-boxes">${boxes.map((r) => this.card(r, r.id === v.selected)).join('')}</div></div>`;
    const sel = v.selected === null ? null : (rows.find((r) => r.id === v.selected) ?? null);
    const detail = `<div class="shop-side">${sel ? this.detail(sel) : `<p class="shop-pick">${SHOP_TEXT.pick}</p>`}</div>`;
    return head + `<div class="shop-body">${list}${detail}</div>` + (v.result ? this.result(v.result) : '');
  }

  private detail(r: ShopRow): string {
    const ic = iconsOf(r.id);
    let info = '';
    if (isShopBox(r.id)) {
      const stars = boxSample(r.id)
        .map((s) => `<span class="shop-star" style="--rk-rarity: var(--rk-rarity-${s - 1})">★${s}</span>`)
        .join('');
      info = `<div class="shop-sample" data-testid="shop-sample"><span>${SHOP_TEXT.sample}</span><span class="shop-stars">${stars}</span></div>`;
    } else {
      const g = shopGood(r.id)!;
      if (g.give.length > 1) info = `<p class="shop-amount">${SHOP_TEXT.kinds(g.give.length)}</p><div class="shop-kinds">${g.give.map((s) => img(itemIconUrl(s.item), 'shop-kind')).join('')}</div>`;
      else info = `<p class="shop-amount">${g.give[0]!.count} ${'unit' in g ? g.unit : ''}</p>`;
    }
    const note = r.soldOut ? `<p class="shop-note">${SHOP_TEXT.soldOut}</p>` : `<p class="shop-pay">${orb('shop-orb')}${escapeHtml(SHOP_TEXT.pay(r.price))}</p>`;
    return (
      `<div class="shop-detail" data-testid="shop-detail"><div class="shop-big">${img(ic.main, 'shop-big-icon')}${ic.sub ? img(ic.sub, 'shop-big-sub') : ''}</div>` +
      `<p class="shop-name">${withRuby(nameOf(r.id))}</p>${info}<div class="shop-fill"></div>${note}` +
      `<button type="button" class="shop-buy" data-testid="shop-buy" aria-disabled="${r.canBuy ? 'false' : 'true'}">${SHOP_TEXT.buy}</button></div>`
    );
  }

  private result(res: NonNullable<ShopView['result']>): string {
    const calm = this.p.reduced();
    const cards = res.items
      .map(
        (it, i) =>
          `<div class="shop-rcard" data-testid="shop-result-card" data-item="${it.item}" data-rarity="${it.rarity}" style="--rk-rarity: var(--rk-rarity-${it.rarity - 1}); --i: ${i}">` +
          `${img(itemIconUrl(it.item), 'shop-rcard-icon')}<span class="shop-rcard-star">★${it.rarity}</span>${it.count > 1 ? `<span class="shop-rcard-n">×${it.count}</span>` : ''}</div>`,
      )
      .join('');
    return (
      `<div class="shop-result${calm ? ' is-calm' : ''}${res.box === 'obako' ? ' is-big' : ''}" data-testid="shop-result"><div class="shop-result-box">${img(boxIconUrl(res.box), 'shop-result-lid')}</div>` +
      `<div class="shop-result-cards">${cards}</div><button type="button" class="shop-result-close" data-testid="shop-result-close">${SHOP_TEXT.close}</button></div>`
    );
  }

  dispose(): void {
    this.el.remove();
  }
}
