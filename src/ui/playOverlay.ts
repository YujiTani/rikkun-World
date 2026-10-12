import { HELP_CAPTIONS, INPUT_CONFIG } from '../input/config';
import type { LockController } from '../input/lockController';
import { escapeHtml } from './text';
import './playOverlay.css';

const KEY = (k: string) => `<span class="po-key">${escapeHtml(k)}</span>`;

/** 操作の絵 4 つ（絵が主役。字は ひらがな・カタカナ のみ） */
function helpItem(art: string, caption: string): string {
  return `<div class="po-help-item"><div class="po-art">${art}</div><div class="po-caption">${escapeHtml(caption)}</div></div>`;
}

/** 案内画面の HTML（DOM なしでテストできる） */
export function buildOverlayHtml(text: string): string {
  const [walk, jump, look, view] = HELP_CAPTIONS;
  const wasd =
    `<div class="po-keys">${KEY('W')}<br>${KEY('A')}${KEY('S')}${KEY('D')}</div>` +
    `<div class="po-keys">${KEY('↑')}<br>${KEY('←')}${KEY('↓')}${KEY('→')}</div>`;
  const space = `<div class="po-space">${KEY('スペース')}</div><div class="po-emoji" aria-hidden="true">🧍⬆</div>`;
  const mouse = `<div class="po-emoji" aria-hidden="true">⬅🖱➡</div>`;
  const vkey = `<div class="po-keys">${KEY('V')}</div><div class="po-emoji" aria-hidden="true">👀</div>`;
  return (
    `<div class="po-panel">` +
    `<button type="button" class="po-button"><span class="po-mouse" aria-hidden="true">🖱</span><span class="po-text">${escapeHtml(text)}</span></button>` +
    `<div class="po-help">${helpItem(wasd, walk)}${helpItem(space, jump)}${helpItem(mouse, look)}${helpItem(vkey, view)}</div>` +
    `</div>`
  );
}

/**
 * 「クリックして あそぼう！」の案内画面。
 * ロックが外れているあいだ出し、クリック（画面のどこでも）でロックを要求する。
 */
export class PlayOverlay {
  readonly el: HTMLDivElement;
  private textEl: HTMLElement;

  constructor(parent: HTMLElement, lock: LockController, requestLock: () => void) {
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
    parent.appendChild(this.el);

    this.el.addEventListener('click', () => requestLock());
    lock.onChange(() => this.sync(lock));
    this.sync(lock);
  }

  private sync(lock: LockController): void {
    this.textEl.textContent = lock.overlayText();
    this.el.hidden = !lock.overlayVisible();
  }
}
