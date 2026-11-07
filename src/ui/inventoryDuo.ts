import { duoQuitShown, type DuoInvPage } from '../duo/invRules';
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
  /** その ページの タブを 出して よいか（やく = かまどを 開いている・たんす = たんすを 開いている。もちもの・つくる は いつも） */
  available(page: DuoInvPage): boolean;
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

/** 上の タブ（3 つ目は かまどか たんすを 開いている ときだけ 出る。4c） */
const TABS: ReadonlyArray<{ page: DuoInvPage; label: string }> = [
  { page: 'items', label: 'もちもの' },
  { page: 'craft', label: 'つくる' },
  { page: 'furnace', label: 'やく' },
  { page: 'tansu', label: 'たんす' },
];

/** 2 人用に 出せる ページか（4c から 4 つぜんぶ） */
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
    // 出せない タブは 要素ごと ない（4c: 「やく」と「たんす」は 同時に 並ばない。hidden では 数に 入ってしまう）
    const shown: HTMLButtonElement[] = [];
    for (const [page, b] of buttons) {
      if (!host.available(page)) continue;
      setTabState(b, { selected: page === host.page(), dot: false });
      shown.push(b);
    }
    tabs.replaceChildren(...shown);
    // 2P の「やめる」は「もちもの」の ページ だけ（つくる・やく・たんす には 出さない。§3.3）
    if (quit) quit.style.display = duoQuitShown(host.page()) ? '' : 'none';
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
  if (d.tansu !== undefined && el.closest('.tansu-grid')) return `tansu:${d.tansu}`;
  if (d.tansuAct !== undefined) return `tansu-act:${d.tansuAct}`;
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

/** 2 人用の 形に する / もどす（画面の 目印: data-layout・data-testid。1P の 全面に もどす ときは 位置も 消す） */
export function setDuoAttrs(el: HTMLElement, frame: HTMLElement, who: 1 | 2, on: boolean): void {
  if (on) {
    el.dataset.layout = 'duo';
    el.setAttribute('data-testid', `duo-inv-p${who}`);
    return;
  }
  delete el.dataset.layout;
  el.style.top = '';
  el.removeAttribute('data-testid');
  frame.style.transform = '';
}

/**
 * 2 人用は ちぢめない（マス・ボタン・字は 1 人の ときと 同じ。§3.3）。上は 高さの 12%（メーター・お知らせ）。
 * 右上の 時計と かさなる ときは 時計の 下 ＋8px まで 下げる（1P・2P そろえる。§9.8）
 */
export function fitDuo(el: HTMLElement, frame: HTMLElement): void {
  frame.style.transform = '';
  frame.style.removeProperty('--rk-fit');
  const clock = document.getElementById('clock');
  const cb = clock && !clock.hidden ? clock.getBoundingClientRect().bottom : 0;
  el.style.top = `${Math.round(Math.max(window.innerHeight * 0.12, cb > 0 ? cb + 8 : 0))}px`;
}

/**
 * 手に もっている 物を 出す 場所（§3.3）: えらんでいる マスの 右上。パネルの そとへ はみ出さない。
 * 場所の 計算（getBoundingClientRect）は えらびが かわった とき・描きなおした とき・大きさが かわった ときだけ（毎コマ 読まない）
 */
export class CursorAnchor {
  /** `place` の 結果（使いまわす） */
  x = 0;
  y = 0;
  private el: HTMLElement | null = null;
  private stale = true;

  /** 描きなおした・大きさが かわった */
  invalidate(): void {
    this.stale = true;
  }

  /** 目じるしの 要素。無ければ false（マウスの 場所に 出す） */
  place(anchor: HTMLElement | null, frame: HTMLElement): boolean {
    if (!anchor) {
      this.el = null;
      return false;
    }
    if (anchor !== this.el || this.stale) {
      this.el = anchor;
      this.stale = false;
      const r = anchor.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      this.x = Math.min(Math.max(r.right - 24, f.left), f.right - 48);
      this.y = Math.min(Math.max(r.top - 24, f.top), f.bottom - 48);
    }
    return true;
  }
}
