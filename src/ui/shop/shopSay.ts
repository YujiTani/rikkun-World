import { SHOP_TEXT } from '../../town/shop/shopText';
import { withRuby } from '../text';

/**
 * よろずやさんの ふきだし（画面を とじた あと。TOWN-1-shop §2.7 の 6「おみせの まえに おいたよ！」）。
 * 話した 人の 区画（1 人 ＝ 全面・2 人 ＝ その 人の 半分）の 上の ほうに 出す。出す 間だけ DOM に ある。
 * TOWN-1 1E: かじやさん・やたいの 人・おふだの ふきだしも 同じ 部品（名前と testid を わたす。名前 '' ＝ 名前なし）。
 */
export class ShopSay {
  private readonly el: HTMLDivElement;
  private shown: string | null = null;

  constructor(
    private readonly parent: HTMLElement,
    owner: 1 | 2,
    private readonly name: () => string = () => SHOP_TEXT.keeper,
    testid = 'shop-say',
  ) {
    this.el = document.createElement('div');
    this.el.className = 'shop-say';
    this.el.dataset.testid = testid;
    this.el.dataset.owner = String(owner);
  }

  /** text ＝ いま 出す 文（null ＝ 出さない）。half ＝ 2 人の 半分。変わらなければ 何も しない */
  sync(text: string | null, half: boolean): void {
    const name = this.name();
    const k = text === null ? null : `${half ? 1 : 0}|${name}|${text}`;
    if (k === this.shown) return;
    this.shown = k;
    if (text === null) {
      this.el.remove();
      return;
    }
    this.el.dataset.layout = half ? 'half' : 'full';
    this.el.innerHTML = `${name ? `<span class="shop-say-name">${withRuby(name)}</span>` : ''}<span class="shop-say-text">${withRuby(text)}</span>`;
    if (!this.el.isConnected) this.parent.append(this.el);
  }
}
