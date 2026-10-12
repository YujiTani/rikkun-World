import { createChip } from './theme/parts';
import { actionHintHtml, type ActionHintLines } from './actionHintModel';
import './actionHint.css';

/**
 * 照準（＋）の すぐ下に「みぎクリック: 〇〇」を出す小さなチップ（FIX-action-hint）。
 * 文は previewRightClick（実行と同じ判定）から作る。毎ステップ update(lines) を呼ぶ。DOM: `#action-hint`
 */
export class ActionHint {
  readonly el: HTMLDivElement;
  private readonly rightEl: HTMLDivElement;
  private readonly leftEl: HTMLDivElement;
  private shown: ActionHintLines = {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'action-hint';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.rightEl = createChip({ text: '' });
    this.rightEl.classList.add('action-hint__right');
    this.leftEl = createChip({ text: '' });
    this.leftEl.classList.add('action-hint__left');
    this.rightEl.hidden = true;
    this.leftEl.hidden = true;
    this.el.append(this.rightEl, this.leftEl);
    parent.append(this.el);
  }

  update(lines: ActionHintLines): void {
    if (lines.right === this.shown.right && lines.left === this.shown.left) return;
    this.shown = lines;
    this.set(this.rightEl, lines.right);
    this.set(this.leftEl, lines.left);
    this.el.hidden = !lines.right && !lines.left;
  }

  /** いま出している文 */
  current(): ActionHintLines {
    return { ...this.shown };
  }

  private set(chip: HTMLDivElement, text: string | undefined): void {
    chip.hidden = !text;
    const label = chip.querySelector('.rk-chip__text');
    if (label) label.innerHTML = text ? actionHintHtml(text) : '';
  }
}
