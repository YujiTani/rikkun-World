import { halfId } from './duoHalfIds';
import './inkDim.css';

/**
 * すみで 画面が 少し 暗くなる 黒い 板（TAKO-1）。こさ（0〜1）は YokaiManager.inkDim() が 決める。
 * 変わった ときだけ style を 書く。who = 2: 2 人の とき 2P の 半分の 板（COOP-1 5f-2 #22b。すみを かぶった 人の 半分だけ 暗い）
 */
export class InkDim {
  readonly el: HTMLDivElement;
  private shown = -1;

  constructor(parent: HTMLElement, private readonly who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'ink-dim' : 'ink-dim-p2';
    if (who === 2) this.el.className = 'ink-dim--p2';
    this.el.setAttribute('aria-hidden', 'true');
    parent.append(this.el);
  }

  /** 2 人の あいだ だけ UI 検査の 目印を つける */
  mark(on: boolean): void {
    if (on) this.el.setAttribute('data-testid', halfId('inkDim', this.who));
    else this.el.removeAttribute('data-testid');
  }

  /** こさ 0〜1 */
  set(alpha: number): void {
    const v = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.opacity = String(v);
  }
}
