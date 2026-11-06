import type { ActionState } from '../../input/actions';
import type { LockController } from '../../input/lockController';
import type { DialogStack } from './choiceDialog';

interface ScreenLike {
  inventoryOpen(): boolean;
  closeToGuide(): void;
}

export interface PauseSettings {
  isOpen(): boolean;
  close(): void;
  isCapturing(): boolean;
  cancelCapture(): void;
}

/**
 * ＋ はスタートメニュー。Esc / みぎの面は ひとつもどる。
 * 画面のリスナーは ScreenController より先に付く（在庫を閉じる処理は両方から呼んでも安全）。
 */
export function bindPauseMenu(opts: {
  actions: ActionState;
  lock: LockController;
  getScreen: () => ScreenLike | null;
  bookOpen: () => boolean;
  houseOpen: () => boolean;
  coopOpen: () => boolean;
  settings: PauseSettings;
  dialogs: DialogStack;
}): void {
  const focusPlay = (): void => {
    queueMicrotask(() => document.querySelector<HTMLElement>('.play-overlay .po-button')?.focus());
  };
  const openPause = (): void => {
    opts.lock.setPauseMenu(true);
    opts.actions.releaseAll();
    focusPlay();
  };

  // ロックが「いま掛かった」ときだけメニューをしまう。
  // すでにロック中にメニューを開いても、変化の通知で閉じない。
  let wasLocked = opts.lock.locked();
  opts.lock.onChange((locked) => {
    if (locked && !wasLocked) opts.lock.setPauseMenu(false);
    wasLocked = opts.lock.locked();
  });

  opts.actions.onPress((action) => {
    if (action === 'openStartMenu') {
      opts.dialogs.closeAll();
      if (opts.settings.isOpen()) opts.settings.close();
      const screen = opts.getScreen();
      if (screen?.inventoryOpen()) {
        screen.closeToGuide();
        openPause();
        return;
      }
      if (opts.lock.isPauseMenu() || opts.lock.overlayVisible()) {
        opts.lock.setPauseMenu(false);
        return;
      }
      openPause();
      return;
    }
    if (action !== 'closeMenu') return;
    if (opts.settings.isCapturing()) {
      opts.settings.cancelCapture();
      return;
    }
    if (opts.dialogs.cancelTop()) return;
    if (opts.settings.isOpen()) {
      opts.settings.close();
      return;
    }
    if (opts.bookOpen() || opts.houseOpen() || opts.coopOpen()) return;
    const screen = opts.getScreen();
    if (screen?.inventoryOpen()) {
      screen.closeToGuide();
      openPause();
      return;
    }
    if (opts.lock.isPauseMenu()) {
      opts.lock.setPauseMenu(false);
      return;
    }
    if (!opts.lock.overlayVisible()) openPause();
  });
}
