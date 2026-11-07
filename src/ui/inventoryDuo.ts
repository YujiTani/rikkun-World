import type { DuoInvPage } from '../duo/invRules';
import { createTab, setTabState } from './theme';
import './inventoryDuo.css';

/**
 * COOP-1 4a（docs/design/COOP-1.md §3.3・§9.8）: 2 人用の もちもの・クラフト画面の 上の 帯（P バッジ・タブ・✕）と
 * 2P の「ながおし で やめる」。画面の 本体は `InventoryScreen`（1 人の ときと 同じ 部品）。ここは 2 人用の 見た目に だけ 要る 部品を 足す。
 */

/** 帯が 画面に 頼む こと */
export interface DuoChromeHost {
  head: HTMLElement;
  frame: HTMLElement;
  page(): DuoInvPage;
  setPage(page: DuoInvPage): void;
}

export interface DuoChrome {
  /** タブの えらび（今の ページ）を 合わせる */
  update(): void;
  /** 「やめる」の ボタン（2P の 画面だけ） */
  quit: HTMLButtonElement | null;
  /** 「やめる」の ゲージ 0〜1 */
  setGauge(g: number): void;
  dispose(): void;
}

/** 4a で 出す タブ。「やく」「たんす」は 4c で 足す */
const TABS: ReadonlyArray<{ page: DuoInvPage; label: string }> = [
  { page: 'items', label: 'もちもの' },
  { page: 'craft', label: 'つくる' },
];

/** 2 人用に 出せる ページか（4a は もちもの・つくる だけ） */
export const duoPageShown = (page: DuoInvPage): boolean => TABS.some((t) => t.page === page);

export function mountDuoChrome(host: DuoChromeHost, who: 1 | 2, onClose: () => void): DuoChrome {
  const bar = document.createElement('div');
  bar.className = 'inv-duo-bar';
  const badge = document.createElement('span');
  badge.className = 'inv-duo-badge';
  badge.setAttribute('data-testid', 'duo-inv-badge');
  badge.textContent = `P${who}`;
  const tabs = document.createElement('div');
  tabs.className = 'inv-duo-tabs';
  tabs.setAttribute('role', 'tablist');
  const buttons = new Map<DuoInvPage, HTMLButtonElement>();
  for (const t of TABS) {
    const b = createTab({ text: t.label, onClick: () => host.setPage(t.page) });
    b.setAttribute('data-testid', `duo-inv-tab-${t.page}`);
    b.addEventListener('click', (e) => e.stopPropagation());
    buttons.set(t.page, b);
    tabs.append(b);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'inv-duo-close';
  close.setAttribute('data-testid', 'duo-inv-close');
  close.setAttribute('aria-label', 'とじる');
  close.textContent = '✕';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose();
  });
  bar.append(badge, tabs, close);
  host.head.prepend(bar);

  let quit: HTMLButtonElement | null = null;
  if (who === 2) {
    quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'duo-quit inv-duo-quit';
    quit.setAttribute('data-testid', 'duo-quit');
    const fill = document.createElement('span');
    fill.className = 'duo-quit-fill';
    const text = document.createElement('span');
    text.className = 'duo-quit-text';
    text.textContent = 'ながおし で やめる';
    quit.append(fill, text);
    host.frame.append(quit);
  }

  let gauge = -1;
  const update = (): void => {
    for (const [page, b] of buttons) setTabState(b, { selected: page === host.page(), dot: false });
  };
  update();
  return {
    update,
    quit,
    setGauge(g: number): void {
      if (!quit || g === gauge) return;
      gauge = g;
      quit.style.setProperty('--duo-quit', g.toFixed(2));
    },
    dispose(): void {
      bar.remove();
      quit?.remove();
    },
  };
}

/** `duo.inv(who).focus` の 名前（§12.0）: 押せる 物を 文字に する。名前の ない 物は null（十字では えらばない） */
export function focusName(el: HTMLElement | null): string | null {
  if (!el) return null;
  const d = el.dataset;
  if (el.classList.contains('equip-slot')) return `equip:${d.slot ?? ''}`;
  if (el.classList.contains('inv-slot') && d.index !== undefined) return `slot:${d.index}`;
  if (el.classList.contains('cp-tile') && d.id !== undefined) return `tile:${d.id}`;
  if (d.tansu !== undefined) return `tansu:${d.tansu}`;
  const tid = el.getAttribute('data-testid') ?? '';
  if (tid.startsWith('duo-inv-tab-')) return `tab:${tid.slice('duo-inv-tab-'.length)}`;
  if (tid === 'duo-quit') return 'quit';
  if (tid === 'duo-inv-close') return 'close';
  if (el.closest('.cp-detail')) {
    if (el.classList.contains('cp-prev')) return 'page-prev';
    if (el.classList.contains('cp-next')) return 'page-next';
    if (el.classList.contains('cp-press')) return 'craft';
  }
  return null;
}
