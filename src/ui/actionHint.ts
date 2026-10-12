import type { ActionHintItem, ActionHintLines } from './actionHintModel';
import { itemIconUrl } from './itemIcon';
import './actionHint.css';

/**
 * 照準（＋）の すぐ下の ヒント（FIX-action-hint）。左 = 左クリック、右 = 右クリック を横にならべる。
 * 1 つ = マウスの絵（L か R が光る）＋ すること の絵 ＋ 小さな 1 語。毎ステップ update(lines) を呼ぶ。DOM: `#action-hint`
 */
export class ActionHint {
  readonly el: HTMLDivElement;
  private readonly cells: { left: HTMLDivElement; right: HTMLDivElement };
  private shown: ActionHintLines = {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'action-hint';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.cells = { left: this.makeCell('left'), right: this.makeCell('right') };
    this.el.append(this.cells.left, this.cells.right);
    parent.append(this.el);
  }

  private makeCell(side: 'left' | 'right'): HTMLDivElement {
    const c = document.createElement('div');
    c.className = `action-hint__cell action-hint__cell--${side}`;
    c.hidden = true;
    c.innerHTML =
      `<span class="action-hint__mouse"><i class="action-hint__btn action-hint__btn--l"></i><i class="action-hint__btn action-hint__btn--r"></i></span>` +
      `<img class="action-hint__art" alt=""><span class="action-hint__word"></span>`;
    c.querySelector('.action-hint__mouse')!.classList.add(`action-hint__mouse--${side}`);
    return c;
  }

  update(lines: ActionHintLines): void {
    if (same(lines.left, this.shown.left) && same(lines.right, this.shown.right)) return;
    this.shown = { left: lines.left && { ...lines.left }, right: lines.right && { ...lines.right } };
    this.set(this.cells.left, lines.left);
    this.set(this.cells.right, lines.right);
    this.el.hidden = !lines.left && !lines.right;
  }

  /** いま出している 絵と 語 */
  current(): ActionHintLines {
    return { left: this.shown.left && { ...this.shown.left }, right: this.shown.right && { ...this.shown.right } };
  }

  private set(cell: HTMLDivElement, it: ActionHintItem | undefined): void {
    cell.hidden = !it;
    if (!it) return;
    (cell.querySelector('.action-hint__art') as HTMLImageElement).src = itemIconUrl(it.icon);
    cell.querySelector('.action-hint__word')!.textContent = it.word;
  }
}

function same(a: ActionHintItem | undefined, b: ActionHintItem | undefined): boolean {
  return a?.icon === b?.icon && a?.word === b?.word;
}
