import { createTab, setTabState } from './theme';
import { createLogTab } from './log/logPage';

type Tab = 'items' | 'achievements' | 'log';

/** もちもの画面の上のタブ（もちもの／じっせき の切りかえだけ。M6 §2.7）。`InventoryScreen` の口の形 */
export interface InventoryTabsHost {
  tabsEl: HTMLElement;
  setTab(tab: Tab): void;
  tab(): Tab;
}

export interface InventoryTabs {
  /** 毎ステップ（見た目を いまのタブに合わせる） */
  update(): void;
  buttons: { items: HTMLButtonElement; achievements: HTMLButtonElement; log: HTMLButtonElement };
}

/**
 * 上の 2 つのタブを `tabsEl` に入れる。じっせき ページの中身は C。
 * dot: じっせき タブの赤い点を出すか（C の「あたらしい」）。onSwitch: 切りかえた音など。
 */
export function mountInventoryTabs(host: InventoryTabsHost, opts: { dot?: () => boolean; onSwitch?: (tab: Tab) => void } = {}): InventoryTabs {
  const mk = (tab: 'items' | 'achievements', label: string) => {
    const b = createTab({
      text: label,
      onClick: () => {
        if (host.tab() === tab) return;
        host.setTab(tab);
        opts.onSwitch?.(tab);
      },
    });
    b.dataset.tab = tab;
    b.addEventListener('click', (e) => e.stopPropagation());
    host.tabsEl.append(b);
    return b;
  };
  const items = mk('items', 'もちもの');
  const achievements = mk('achievements', 'じっせき');
  // CRAFT-2: できごと タブ（まきものの絵つき。高さ 56px 以上）
  const log = createLogTab(() => {
    if (host.tab() === 'log') return;
    host.setTab('log');
    opts.onSwitch?.('log');
  });
  log.addEventListener('click', (e) => e.stopPropagation());
  host.tabsEl.append(log);
  const buttons = { items, achievements, log };
  const update = () => {
    const now = host.tab();
    setTabState(buttons.items, { selected: now === 'items', dot: false });
    setTabState(buttons.achievements, { selected: now === 'achievements', dot: opts.dot?.() ?? false });
    setTabState(buttons.log, { selected: now === 'log', dot: false });
  };
  update();
  return { update, buttons };
}
