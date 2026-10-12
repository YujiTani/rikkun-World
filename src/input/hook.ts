import { ACTIONS } from './actions';
import type { Action, ActionState } from './actions';
import type { LockController, MouseLook } from './lockController';
import type { WheelAccumulator } from './wheel';

/** `lock.*`（M1-02 §6.1） */
export function createLockHook(lock: LockController) {
  return {
    simulate: (locked: boolean) => lock.simulate(!!locked),
    get: () => ({
      locked: lock.locked(),
      overlayVisible: lock.overlayVisible(),
      overlayText: lock.overlayText(),
    }),
  };
}

function toAction(name: string): Action {
  if (!(ACTIONS as readonly string[]).includes(name)) throw new Error(`知らない Action: ${name}`);
  return name as Action;
}

/** `input.*`（M1-02 §6.1, M2 §6.1）。press/release はキーボードと同じ ActionState に入る */
export function createInputHook(actions: ActionState, look: MouseLook, wheel: WheelAccumulator) {
  return {
    press: (action: string) => actions.press(toAction(action)),
    release: (action: string) => actions.release(toAction(action)),
    releaseAll: () => actions.releaseAll(),
    held: (): Action[] => ACTIONS.filter((a) => actions.isHeld(a)),
    look: (dx: number, dy: number) => look.push(dx, dy),
    /** マウスホイールを deltaY 動かしたのと同じ（50 ごとに 1 マス） */
    wheel: (deltaY: number) => wheel.push(deltaY),
  };
}
