export interface ChoiceDialog {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** やめる（破壊的な方は押さない） */
  cancel(): void;
  showNote(text: string): void;
}

/**
 * はい / やめる。はじめのフォーカスは やめる。
 * questionHtml は呼び出し側が ruby 済みにすること。
 */
export function mountChoiceDialog(opts: {
  testId: string;
  questionHtml: string;
  yesLabel: string;
  yesTestId: string;
  noTestId: string;
  onYes: () => void;
}): ChoiceDialog {
  const root = document.createElement('div');
  root.className = 'choice-dialog';
  root.dataset.testid = opts.testId;
  root.hidden = true;
  root.innerHTML =
    `<div class="choice-card" role="dialog">` +
    `<p class="choice-q">${opts.questionHtml}</p>` +
    `<p class="choice-note" data-note hidden></p>` +
    `<div class="choice-actions">` +
    `<button type="button" class="choice-btn" data-menu-item data-testid="${opts.yesTestId}">${opts.yesLabel}</button>` +
    `<button type="button" class="choice-btn choice-no" data-menu-item data-testid="${opts.noTestId}">やめる</button>` +
    `</div></div>`;
  const note = root.querySelector<HTMLElement>('[data-note]')!;
  const noBtn = root.querySelector<HTMLButtonElement>(`[data-testid="${opts.noTestId}"]`)!;
  const yesBtn = root.querySelector<HTMLButtonElement>(`[data-testid="${opts.yesTestId}"]`)!;
  const stop = (e: Event): void => e.stopPropagation();
  root.addEventListener('click', stop);
  root.addEventListener('pointerdown', stop);
  yesBtn.addEventListener('click', () => opts.onYes());
  noBtn.addEventListener('click', () => {
    root.hidden = true;
  });
  document.body.appendChild(root);
  return {
    open() {
      note.hidden = true;
      note.textContent = '';
      root.hidden = false;
      noBtn.focus();
    },
    close() {
      root.hidden = true;
    },
    isOpen: () => !root.hidden,
    cancel() {
      root.hidden = true;
    },
    showNote(text: string) {
      note.hidden = false;
      note.textContent = text;
      noBtn.focus();
    },
  };
}

export interface DialogStack {
  add(d: { isOpen(): boolean; cancel(): void }): void;
  /** いちばん上の確認を やめる。開いていれば true */
  cancelTop(): boolean;
  closeAll(): void;
}

export function createDialogStack(): DialogStack {
  const list: { isOpen(): boolean; cancel(): void }[] = [];
  return {
    add(d) {
      list.push(d);
    },
    cancelTop() {
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i]!;
        if (d.isOpen()) {
          d.cancel();
          return true;
        }
      }
      return false;
    },
    closeAll() {
      for (const d of list) if (d.isOpen()) d.cancel();
    },
  };
}
