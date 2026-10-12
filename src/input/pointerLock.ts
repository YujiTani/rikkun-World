import type { ActionState } from './actions';
import { WHEEL_CONFIG } from './config';
import type { LockController, MouseLook } from './lockController';

/**
 * 本物のポインターロックとマウスの動きを LockController / MouseLook につなぐ（DOM 用）。
 * ロックが変わったら ActionState.releaseAll() する。
 */
export function bindPointerLock(
  doc: Document,
  win: Window,
  element: Element,
  lock: LockController,
  look: MouseLook,
  actions: ActionState,
): { request(): void; release(): void; dispose(): void } {
  const onLockChange = () => lock.setReal(doc.pointerLockElement === element);
  // かけ直しに失敗した（ブラウザの都合）: 案内画面を出す
  const onLockError = () => lock.endRelock();
  const onMove = (e: MouseEvent) => {
    if (doc.pointerLockElement === element) look.push(e.movementX, e.movementY);
  };
  // フォーカスを失ったらロックが外れたのと同じ扱い
  const onBlur = () => {
    if (doc.pointerLockElement) doc.exitPointerLock();
    lock.setReal(false);
  };
  const onVisibility = () => {
    if (doc.hidden) onBlur();
  };
  const offLock = lock.onChange(() => {
    actions.releaseAll();
    look.reset();
  });

  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('pointerlockerror', onLockError);
  doc.addEventListener('mousemove', onMove);
  win.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    request() {
      try {
        // 失敗しても（Esc 直後など）ボタンは出したままにする
        const r = element.requestPointerLock() as unknown;
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(onLockError);
      } catch {
        onLockError();
      }
      // 返事が来ないときの保険（かけ直し中の案内画面を出しっぱなしにしない）
      win.setTimeout(() => lock.endRelock(), WHEEL_CONFIG.relockTimeoutMs);
    },
    /** ゲームが自分でロックを外す（もちもの画面を開くとき） */
    release() {
      if (doc.pointerLockElement) doc.exitPointerLock();
    },
    dispose() {
      offLock();
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.removeEventListener('pointerlockerror', onLockError);
      doc.removeEventListener('mousemove', onMove);
      win.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
