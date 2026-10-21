import type { Inventory, ScreenMode, ScreenSettings, ScreenState } from '../contracts';
import type { ActionState } from '../input/actions';
import type { LockController } from '../input/lockController';

/** ブラウザのポインターロックを動かす係（本物は bindPointerLock の戻り値） */
export interface LockPlatform {
  /** ロックをかけ直す（返事は LockController.setReal / endRelock で返ってくる） */
  request(): void;
  /** ロックを外す */
  release(): void;
}

/**
 * 画面の状態（あそぶ・もちもの・案内）。M2 §2.5。
 * toggleInventory / closeMenu は「押された瞬間」に効く（時間が止まっていても 0.2 秒以内）。
 */
export class ScreenController implements ScreenState {
  private open = false;
  /** WEAPON-9: false の あいだ もちもの画面を 開けない（シャイニング F1〜240） */
  canOpen: () => boolean = () => true;
  private closeListeners: Array<() => void> = [];

  constructor(
    private readonly lock: LockController,
    private readonly inventory: Pick<Inventory, 'returnCursor'>,
    private readonly actions: ActionState,
    private readonly settings: ScreenSettings,
    private readonly platform: LockPlatform,
  ) {
    actions.onPress((action) => {
      if (action === 'toggleInventory') this.toggle();
      else if (action === 'closeMenu') this.closeToGuide();
    });
  }

  mode(): ScreenMode {
    if (this.lock.overlayVisible()) return 'guide';
    return this.open ? 'inventory' : 'play';
  }

  inventoryOpen(): boolean {
    return this.open;
  }

  timeScale(): number {
    switch (this.mode()) {
      case 'guide':
        return 0;
      case 'inventory':
        return this.settings.inventoryTimeScale;
      default:
        return 1;
    }
  }

  /** 画面を閉じたときに呼ばれる（自動セーブなど） */
  onClose(fn: () => void): void {
    this.closeListeners.push(fn);
  }

  /** E と「とじる」ボタン用 */
  toggle(): void {
    if (this.open) this.closeAndRelock();
    else this.openInventory();
  }

  /** Esc: 閉じて案内画面を出す（ロックはかけ直さない。Esc ではかけ直せないブラウザの決まり） */
  closeToGuide(): void {
    if (!this.open) return;
    this.inventory.returnCursor();
    this.open = false;
    if (this.lock.isSimulated()) this.lock.simulate(false);
    this.platform.release();
    this.lock.setInventoryOpen(false);
    this.afterClose();
  }

  private openInventory(): void {
    // 案内画面が出ているあいだ・ロックがないときは無視
    if (this.open || !this.lock.playInputEnabled() || !this.canOpen()) return;
    this.open = true;
    // 先に「開いた」と伝えてから外す（案内画面が一瞬出ないように）
    this.lock.setInventoryOpen(true);
    this.actions.releaseAll(); // ほっている途中なら primary をはなしたのと同じ
    if (this.lock.isSimulated()) this.lock.simulate(false);
    this.platform.release();
  }

  private closeAndRelock(): void {
    this.inventory.returnCursor();
    this.open = false;
    if (this.lock.isSimulated()) {
      // テスト中: かならず成功して「ロック中」になる
      this.lock.simulate(true);
      this.lock.setInventoryOpen(false);
    } else {
      // 返事が来るまで案内画面は出さない。だめだったら LockController.endRelock で出る
      this.lock.beginRelock();
      this.lock.setInventoryOpen(false);
      this.platform.request();
    }
    this.afterClose();
  }

  private afterClose(): void {
    this.actions.releaseAll();
    for (const fn of this.closeListeners) fn();
  }
}
