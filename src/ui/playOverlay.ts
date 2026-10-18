import { INPUT_CONFIG } from '../input/config';
import type { LockController } from '../input/lockController';
import { fillMouseSrc, mouseHtml } from './craftPanel.art';
import { escapeHtml } from './text';
import { mountPrep, syncPrep } from './prep';
import './playOverlay.css';

/**
 * 案内画面の HTML（DOM なしでテストできる）。「あそぼう」ボタンと、その下に「あそびかたの ほん」ボタン。
 * あそびかたは 3D の本（BOOK-1）。タブと カードは ない。
 */
export function buildOverlayHtml(text: string): string {
  return (
    `<div class="po-panel">` +
    `<button type="button" class="po-button"><span class="po-mouse" aria-hidden="true">${mouseHtml('left')}</span><span class="po-text">${escapeHtml(text)}</span></button>` +
    `<button type="button" class="po-book" data-book-open><span class="po-gem" aria-hidden="true"></span><span class="po-book-text">あそびかたの ほん</span></button>` +
    `</div>`
  );
}

/**
 * 「クリックして あそぼう！」の案内画面。
 * ロックが外れているあいだ出し、クリック（画面のどこでも）でロックを要求する。
 * ただし「あそびかたの ほん」ボタンを押したときは あそびを始めない（ロックをかけない）。
 */
export class PlayOverlay {
  readonly el: HTMLDivElement;
  private textEl: HTMLElement;
  /** 起動の「じゅんびちゅう」を出している間 true（押しても あそびは始めない） */
  private prepOn = false;
  private lockRef: LockController;

  constructor(
    parent: HTMLElement,
    lock: LockController,
    requestLock: () => void,
    /** 「あそびかたの ほん」を押した */
    private readonly onOpenBook?: () => void,
  ) {
    this.lockRef = lock;
    this.el = document.createElement('div');
    this.el.className = 'play-overlay';
    this.el.style.setProperty('--po-dim', String(INPUT_CONFIG.dimOpacity));
    this.el.style.setProperty('--po-pulse', `${INPUT_CONFIG.pulseSeconds}s`);
    this.el.style.setProperty('--po-btn-w', `${INPUT_CONFIG.buttonWidthVw}vw`);
    this.el.style.setProperty('--po-btn-minw', `${INPUT_CONFIG.buttonMinWidthPx}px`);
    this.el.style.setProperty('--po-btn-minh', `${INPUT_CONFIG.buttonMinHeightPx}px`);
    this.el.style.setProperty('--po-btn-font', `${INPUT_CONFIG.buttonFontPx}px`);
    this.el.style.setProperty('--po-cap-font', `${INPUT_CONFIG.captionFontPx}px`);
    this.el.innerHTML = buildOverlayHtml(lock.overlayText());
    this.textEl = this.el.querySelector('.po-text') as HTMLElement;
    fillMouseSrc(this.el);
    this.el.querySelector<HTMLButtonElement>('[data-book-open]')!.addEventListener('click', (e) => {
      e.stopPropagation(); // あそびは始めない
      this.onOpenBook?.();
    });
    parent.appendChild(this.el);

    this.el.addEventListener('click', () => {
      if (this.prepOn) return; // 起動中は あそびを始めない（ロックしない・音なし）
      requestLock();
    });
    lock.onChange(() => this.sync(lock));
    this.sync(lock);
  }

  /**
   * おとな向けの小さな入り口（VOX-F）: ほぞんを ファイル（.rikkun.gz）に だす・よみこむ。
   * Safari が 7 日で 保存を消すことに そなえる。子どもの目に 入りにくい 右下のすみ。
   */
  mountAdult(adult: { exportSave(): Promise<void>; importSave(file: File): Promise<void> }): void {
    const box = document.createElement('details');
    box.className = 'po-adult';
    box.innerHTML =
      `<summary>おとなの ひと</summary>` +
      `<button type="button" data-adult="export">ほぞんを ファイルに かきだす</button>` +
      `<label class="po-adult-load">ファイルから よみこむ<input type="file" accept=".gz,.rikkun.gz" hidden></label>`;
    box.addEventListener('click', (e) => e.stopPropagation()); // あそびは始めない
    box.querySelector<HTMLButtonElement>('[data-adult="export"]')!.addEventListener('click', () => void adult.exportSave());
    const input = box.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.value = '';
      if (f) void adult.importSave(f);
    });
    this.el.appendChild(box);
  }

  /**
   * 起動の「じゅんびちゅう」（VOX-D）。progress（0〜1）を渡すと ボタンの字が「じゅんびちゅう」と ブロック 5 こになる。
   * null で ふつうの字（lock.overlayText()）にもどる。
   */
  setPrep(progress: number | null, nowMs: number): void {
    if (progress === null) {
      if (!this.prepOn) return;
      this.prepOn = false;
      this.el.classList.remove('po-prep');
      this.textEl.textContent = this.lockRef.overlayText();
      return;
    }
    if (!this.prepOn) {
      this.prepOn = true;
      this.el.classList.add('po-prep');
      mountPrep(this.textEl);
    }
    syncPrep(this.textEl, progress, nowMs);
  }

  private sync(lock: LockController): void {
    if (!this.prepOn) this.textEl.textContent = lock.overlayText();
    this.el.hidden = !lock.overlayVisible();
  }
}
