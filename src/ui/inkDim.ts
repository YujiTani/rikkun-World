import './inkDim.css';

/**
 * すみで 画面が 少し 暗くなる 黒い 板（TAKO-1）。こさ（0〜1）は YokaiManager.inkDim() が 決める。
 * 変わった ときだけ style を 書く。
 */
export class InkDim {
  readonly el: HTMLDivElement;
  private shown = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'ink-dim';
    this.el.setAttribute('aria-hidden', 'true');
    parent.append(this.el);
  }

  /** こさ 0〜1 */
  set(alpha: number): void {
    const v = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.opacity = String(v);
  }
}
