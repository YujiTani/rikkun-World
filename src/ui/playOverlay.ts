import { GUIDE_TABS, GUIDE_TAB_IDS, INPUT_CONFIG, type GuideTabId } from '../input/config';
import type { LockController } from '../input/lockController';
import { fillMouseSrc, mouseHtml } from './craftPanel.art';
import { anyIconUrl } from './itemIcon';
import { escapeHtml } from './text';
import './playOverlay.css';

const KEY = (k: string) => `<span class="po-key">${escapeHtml(k)}</span>`;
const EMOJI = (e: string) => `<div class="po-emoji" aria-hidden="true">${e}</div>`;
/** ドット絵（src は DOM に入れたあとで PlayOverlay が入れる） */
const ICON = (id: string) => `<img class="po-icon" data-icon="${id}" alt="">`;

/** 操作の絵（絵が主役。字は ひらがな・カタカナ のみ） */
function helpItem(art: string, caption: string): string {
  return `<div class="po-help-item"><div class="po-art">${art}</div><div class="po-caption">${escapeHtml(caption)}</div></div>`;
}

const LEFT = () => `<div class="po-emoji po-mouse-big">${mouseHtml('left')}</div>`;
const RIGHT = () => `<div class="po-emoji po-mouse-big">${mouseHtml('right')}</div>`;

/** タブごとの絵（captions と同じ順） */
function tabArts(): Record<GuideTabId, string[]> {
  const wasd =
    `<div class="po-keys">${KEY('W')}<br>${KEY('A')}${KEY('S')}${KEY('D')}</div>` +
    `<div class="po-keys">${KEY('↑')}<br>${KEY('←')}${KEY('↓')}${KEY('→')}</div>`;
  return {
    move: [
      wasd,
      `<div class="po-space">${KEY('スペース')}</div>${EMOJI('🧍⬆')}`,
      EMOJI('⬅🖱➡'),
      `<div class="po-keys">${KEY('V')}</div>${EMOJI('👀')}`,
    ],
    dig: [
      `${LEFT()}${EMOJI('⛏')}`,
      `${LEFT()}${EMOJI('💥')}`,
      `${RIGHT()}${EMOJI('🧱')}`,
      `<div class="po-keys">${KEY('1')}${KEY('〜')}${KEY('9')}</div>${EMOJI('🖱↕')}`,
      `<div class="po-keys">${KEY('E')}</div>${EMOJI('🎒')}`,
    ],
    fight: [
      `${LEFT()}${ICON('katana')}`,
      `${ICON('naginata')}${EMOJI('↔')}`,
      `${ICON('yumi')}${ICON('ya')}`,
      `${ICON('kabuto')}${ICON('yoroi')}${ICON('kote')}${ICON('suneate')}${RIGHT()}`,
      `${EMOJI('🏠')}${EMOJI('🌙')}`,
    ],
    craft: [
      `<div class="po-keys">${KEY('E')}</div><div class="po-glow-card">${ICON('katana')}</div>`,
      `<div class="po-glow-card">${ICON('bokuto')}</div>${EMOJI('👆')}`,
      ICON('hammer'),
      `${RIGHT()}${ICON('furnace')}${EMOJI('🔥')}`,
      `${ICON('coal_ore')}${ICON('oil')}${ICON('log')}`,
      `<div class="po-keys">${KEY('Q')}</div>${ICON('dirt')}`,
      `${ICON('tansu')}`,
    ],
  };
}

/** 案内画面の HTML（DOM なしでテストできる）。4 つのタブのページをぜんぶ入れ、えらんだ 1 ページだけ見せる */
export function buildOverlayHtml(text: string, tab: GuideTabId = 'move'): string {
  const arts = tabArts();
  const tabs = GUIDE_TAB_IDS.map(
    (id) =>
      `<button type="button" class="po-tab" data-tab="${id}" data-icon="${GUIDE_TABS[id].icon}" data-selected="${id === tab}">${escapeHtml(GUIDE_TABS[id].label)}</button>`,
  ).join('');
  const pages = GUIDE_TAB_IDS.map((id) => {
    const items = GUIDE_TABS[id].captions.map((c, i) => helpItem(arts[id][i], c)).join('');
    return `<div class="po-help" data-page="${id}"${id === tab ? '' : ' hidden'}>${items}</div>`;
  }).join('');
  return (
    `<div class="po-panel">` +
    `<button type="button" class="po-button"><span class="po-mouse" aria-hidden="true">${mouseHtml('left')}</span><span class="po-text">${escapeHtml(text)}</span></button>` +
    `<div class="po-tabs">${tabs}</div>` +
    `<div class="po-pages">${pages}</div>` +
    `</div>`
  );
}

/** 今のタブ（その遊びのあいだ、案内画面を出し直しても同じタブ） */
let lastTab: GuideTabId = 'move';

/**
 * 「クリックして あそぼう！」の案内画面。
 * ロックが外れているあいだ出し、クリック（画面のどこでも）でロックを要求する。
 * ただし あそびかた のタブを押したときは あそびを始めない（ロックをかけない）。
 */
export class PlayOverlay {
  readonly el: HTMLDivElement;
  private textEl: HTMLElement;
  private tab_: GuideTabId = lastTab;

  constructor(
    parent: HTMLElement,
    lock: LockController,
    requestLock: () => void,
    /** タブを押した（音「ポン」用） */
    private readonly onTab?: (tab: GuideTabId) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'play-overlay';
    this.el.style.setProperty('--po-dim', String(INPUT_CONFIG.dimOpacity));
    this.el.style.setProperty('--po-pulse', `${INPUT_CONFIG.pulseSeconds}s`);
    this.el.style.setProperty('--po-btn-w', `${INPUT_CONFIG.buttonWidthVw}vw`);
    this.el.style.setProperty('--po-btn-minw', `${INPUT_CONFIG.buttonMinWidthPx}px`);
    this.el.style.setProperty('--po-btn-minh', `${INPUT_CONFIG.buttonMinHeightPx}px`);
    this.el.style.setProperty('--po-btn-font', `${INPUT_CONFIG.buttonFontPx}px`);
    this.el.style.setProperty('--po-cap-font', `${INPUT_CONFIG.captionFontPx}px`);
    this.el.innerHTML = buildOverlayHtml(lock.overlayText(), this.tab_);
    this.textEl = this.el.querySelector('.po-text') as HTMLElement;
    fillMouseSrc(this.el);
    for (const img of this.el.querySelectorAll<HTMLImageElement>('img[data-icon]')) {
      img.src = anyIconUrl(img.dataset.icon as never);
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.po-tab')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // あそびは始めない
        this.setTab(b.dataset.tab as GuideTabId);
      });
    }
    parent.appendChild(this.el);

    this.el.addEventListener('click', () => requestLock());
    lock.onChange(() => this.sync(lock));
    this.sync(lock);
  }

  tab(): GuideTabId {
    return this.tab_;
  }

  /** タブの名前（ひらがな）。ならびは GUIDE_TAB_IDS と同じ */
  tabs(): string[] {
    return GUIDE_TAB_IDS.map((id) => GUIDE_TABS[id].label);
  }

  /** 今のタブの中身の数 */
  itemCount(): number {
    return this.el.querySelectorAll(`.po-help[data-page="${this.tab_}"] .po-help-item`).length;
  }

  setTab(tab: GuideTabId): void {
    if (!GUIDE_TAB_IDS.includes(tab)) return;
    const changed = tab !== this.tab_;
    this.tab_ = tab;
    lastTab = tab;
    for (const b of this.el.querySelectorAll<HTMLElement>('.po-tab')) b.dataset.selected = String(b.dataset.tab === tab);
    for (const p of this.el.querySelectorAll<HTMLElement>('.po-help')) p.hidden = p.dataset.page !== tab;
    if (changed) this.onTab?.(tab);
  }

  private sync(lock: LockController): void {
    this.textEl.textContent = lock.overlayText();
    this.el.hidden = !lock.overlayVisible();
  }
}

/** `lock.get()` に足す項目と `lock.tab(name)`（M4 §6.1）。つなぎ込みが lock の窓口とまぜる */
export function createGuideHook(overlay: Pick<PlayOverlay, 'tab' | 'tabs' | 'itemCount' | 'setTab'>) {
  return {
    tab: (name: string) => overlay.setTab(name as GuideTabId),
    state: () => ({
      guideTab: overlay.tab(),
      guideTabs: overlay.tabs(),
      guideTabIds: [...GUIDE_TAB_IDS],
      guideItems: overlay.itemCount(),
    }),
  };
}
