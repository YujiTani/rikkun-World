import { yakataMotion } from '../fx/yakataMotion';
import { drawPixels } from './itemIcon';
import { nickIconPixels } from './itemArtBal';
import './yakataLeft.css';

/**
 * のこりの 札（MINE-1F §3.6・F15）: 挑戦の 間だけ 画面の 上の まん中に「[おやぶんの バッジ] のこり 7」。`[data-testid="yakata-left"]`。
 * 文字は ひらがな〔漢字なし〕。たおす たびに 数が へり、小さく はねる〔`yakataMotion(reduce).labelHop`。動きを へらす では はねない〕。0 に なったら 消える。
 *
 * つなぎ込みの 使い方: `show(n)` で 出す〔挑戦の はじまり〕・`set(n, reduce)` で 数を かえる〔1 ぴき たおす たび〕・`hide()` で 消す〔かち・まけ・とじた〕。
 * 2 人あそびは who = 2 で もう 1 つ〔挑戦して いる 人の 半分の 上の まん中。`html[data-duo]` の とき左右の 半分の まん中〕。
 */
/** 札の 文字 */
export function yakataLeftText(n: number): string {
  return `のこり ${Math.max(0, Math.floor(n))}`;
}

export class YakataLeft {
  readonly el: HTMLDivElement;
  private readonly textEl: HTMLSpanElement;
  private left = 0;

  constructor(parent: HTMLElement, who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'yakata-left' : 'yakata-left-p2';
    this.el.className = who === 2 ? 'yakata-left yakata-left--p2' : 'yakata-left';
    this.el.dataset.testid = who === 1 ? 'yakata-left' : 'yakata-left-p2';
    this.el.hidden = true;
    const icon = document.createElement('canvas');
    icon.className = 'yakata-left-icon';
    icon.setAttribute('aria-hidden', 'true');
    drawPixels(icon, nickIconPixels('oyabun'));
    this.textEl = document.createElement('span');
    this.el.append(icon, this.textEl);
    parent.append(this.el);
  }

  /** 数を 出す〔はじまり〕。0 いかなら 消す */
  show(n: number): void {
    this.left = n;
    this.sync();
  }

  /** 数を かえる〔1 ぴき たおす たび〕。へった ときだけ はねる。0 に なったら 消える */
  set(n: number, reduce: boolean): void {
    const dropped = n < this.left;
    this.left = n;
    this.sync();
    if (dropped && n > 0) this.hop(reduce);
  }

  hide(): void {
    this.left = 0;
    this.el.hidden = true;
  }

  /** 今 出て いる 数 */
  count(): number {
    return this.el.hidden ? 0 : this.left;
  }

  private sync(): void {
    if (this.left <= 0) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    const t = yakataLeftText(this.left);
    if (this.textEl.textContent !== t) this.textEl.textContent = t;
  }

  /** はねる: 上へ upFrames コマ・もどる backFrames コマ〔60 コマ ＝ 1 秒〕 */
  private hop(reduce: boolean): void {
    const h = yakataMotion(reduce).labelHop;
    if (h.hopPoints <= 0 || typeof this.el.animate !== 'function') return;
    const total = h.upFrames + h.backFrames;
    this.el.animate(
      [{ translate: '0 0' }, { translate: `0 ${-h.hopPoints}px`, offset: h.upFrames / total }, { translate: '0 0' }],
      { duration: (total / 60) * 1000, easing: 'ease-out' },
    );
  }
}
