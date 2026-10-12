import { createTab, setTabState } from './theme';

/** もちもの画面の上のタブ（もちもの／じっせき の切りかえだけ。M6 §2.7）。`InventoryScreen` の口の形 */
export interface InventoryTabsHost {
  tabsEl: HTMLElement;
  setTab(tab: 'items' | 'achievements'): void;
  tab(): 'items' | 'achievements';
}

export interface InventoryTabs {
  /** 毎ステップ（見た目を いまのタブに合わせる） */
  update(): void;
  buttons: { items: HTMLButtonElement; achievements: HTMLButtonElement };
}

/**
 * 上の 2 つのタブを `tabsEl` に入れる。じっせき ページの中身は C。
 * dot: じっせき タブの赤い点を出すか（C の「あたらしい」）。onSwitch: 切りかえた音など。
 */
export function mountInventoryTabs(host: InventoryTabsHost, opts: { dot?: () => boolean; onSwitch?: (tab: 'items' | 'achievements') => void } = {}): InventoryTabs {
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
  const buttons = { items: mk('items', 'もちもの'), achievements: mk('achievements', 'じっせき') };
  const update = () => {
    const now = host.tab();
    setTabState(buttons.items, { selected: now === 'items', dot: false });
    setTabState(buttons.achievements, { selected: now === 'achievements', dot: opts.dot?.() ?? false });
  };
  update();
  return { update, buttons };
}
