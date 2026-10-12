/**
 * 入力の変換層。
 * キーボード・マウス・（将来の）ゲームコントローラーの入力を、
 * ゲームの「行動（Action）」に変換する。ゲーム側は Action だけを見る。
 */

export const ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'primary', // 掘る・攻撃
  'secondary', // 置く・食べる
  'toggleView', // 一人称 / 三人称
  'toggleDebug', // 性能表示
] as const;

export type Action = (typeof ACTIONS)[number];

/** KeyboardEvent.code → Action */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'moveForward',
  ArrowUp: 'moveForward',
  KeyS: 'moveBack',
  ArrowDown: 'moveBack',
  KeyA: 'moveLeft',
  ArrowLeft: 'moveLeft',
  KeyD: 'moveRight',
  ArrowRight: 'moveRight',
  Space: 'jump',
  KeyV: 'toggleView',
  F3: 'toggleDebug',
};

/** MouseEvent.button → Action */
export const DEFAULT_MOUSE_BINDINGS: Readonly<Record<number, Action>> = {
  0: 'primary',
  2: 'secondary',
};

/**
 * 押されている行動と「このフレームで押された」行動を管理する。
 * 入力の種類（キー・マウス・コントローラー）を問わず press/release を呼ぶ。
 */
export class ActionState {
  private held = new Map<Action, number>();
  private pressedThisFrame = new Set<Action>();

  press(action: Action): void {
    const count = this.held.get(action) ?? 0;
    if (count === 0) this.pressedThisFrame.add(action);
    this.held.set(action, count + 1);
  }

  release(action: Action): void {
    const count = this.held.get(action) ?? 0;
    if (count <= 1) this.held.delete(action);
    else this.held.set(action, count - 1);
  }

  /** 押しっぱなしか（移動など） */
  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** このフレームで押されたか（切り替えなど） */
  wasPressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  /** 1 回の更新が終わったら呼ぶ */
  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  releaseAll(): void {
    this.held.clear();
    this.pressedThisFrame.clear();
  }
}

/** キーボードとマウスを ActionState につなぐ。戻り値で解除できる。 */
export function bindKeyboardAndMouse(target: Window, state: ActionState): () => void {
  const downKeys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    const action = DEFAULT_KEY_BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    if (downKeys.has(e.code)) return; // キーリピートは無視
    downKeys.add(e.code);
    state.press(action);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = DEFAULT_KEY_BINDINGS[e.code];
    if (!action || !downKeys.delete(e.code)) return;
    state.release(action);
  };
  const onMouseDown = (e: MouseEvent) => {
    const action = DEFAULT_MOUSE_BINDINGS[e.button];
    if (action) state.press(action);
  };
  const onMouseUp = (e: MouseEvent) => {
    const action = DEFAULT_MOUSE_BINDINGS[e.button];
    if (action) state.release(action);
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  const onBlur = () => {
    downKeys.clear();
    state.releaseAll();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('contextmenu', onContextMenu);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousedown', onMouseDown);
    target.removeEventListener('mouseup', onMouseUp);
    target.removeEventListener('contextmenu', onContextMenu);
    target.removeEventListener('blur', onBlur);
  };
}
