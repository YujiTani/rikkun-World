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
  // かけ直しの保険タイマー。成功したら・次の request のときに取り消す（古いタイマーが新しい待ちを早く終えないように）
  let relockTimer: number | undefined;
  const clearRelockTimer = () => {
    if (relockTimer !== undefined) win.clearTimeout(relockTimer);
    relockTimer = undefined;
  };
  const onLockChange = () => {
    const on = doc.pointerLockElement === element;
    if (on) clearRelockTimer();
    lock.setReal(on);
  };
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
      clearRelockTimer();
      relockTimer = win.setTimeout(() => {
        relockTimer = undefined;
        lock.endRelock();
      }, WHEEL_CONFIG.relockTimeoutMs);
    },
    /** ゲームが自分でロックを外す（もちもの画面を開くとき） */
    release() {
      if (doc.pointerLockElement) doc.exitPointerLock();
    },
    dispose() {
      clearRelockTimer();
      offLock();
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.removeEventListener('pointerlockerror', onLockError);
      doc.removeEventListener('mousemove', onMove);
      win.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
