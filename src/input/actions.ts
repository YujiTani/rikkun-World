/**
 * 入力の変換層。
 * キーボード・マウス・（将来の）ゲームコントローラーの入力を、
 * ゲームの「行動（Action）」に変換する。ゲーム側は Action だけを見る。
 */

import type { WheelAccumulator } from './wheel';

export const ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'primary', // 掘る・攻撃
  'secondary', // 置く・食べる
  'toggleView', // 一人称 / 三人称（CHAR-1 第 5 版で割り当てをなくした。名前は後始末まで残す）
  'run', // 走る（シフト。CHAR-1）
  'toggleDebug', // 性能表示
  'cycleMicroR', // 性能表示 (F3) を出しているとき: 小ブロックの半径 16 → 24 → 32（F4。VOX-E）
  'hotbar1', // ホットバーのマスをえらぶ（数字キー 1〜9）
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
  'hotbarNext', // となりのマスへ（ホイール 下）
  'hotbarPrev', // となりのマスへ（ホイール 上）
  'toggleInventory', // もちもの画面を ひらく・とじる（E）
  'closeMenu', // もちもの画面を とじる（Esc）
  'drop', // 手に持っているものを 1 こ すてる（Q。M6）
  'dropStack', // そのマスの ぜんぶ をすてる（Shift＋Q。M6）
  'stanceNext', // 刀の かまえを かえる（R。WEAPON-2）
  'openLog', // できごと を ひらく・とじる（L。CRAFT-2）
  'pagePrev', // 本の ◀（←。BOOK-1。遊びの moveLeft にも なる）
  'pageNext', // 本の ▶（→。BOOK-1。遊びの moveRight にも なる）
  'bookBack', // 本の もどる（Backspace。BOOK-1）
  'confirm', // きめる（Enter。上空の 視点の 決定。HOUSE-1C PR-2）
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
  ShiftLeft: 'run',
  ShiftRight: 'run',
  F3: 'toggleDebug',
  F4: 'cycleMicroR',
  Digit1: 'hotbar1',
  Digit2: 'hotbar2',
  Digit3: 'hotbar3',
  Digit4: 'hotbar4',
  Digit5: 'hotbar5',
  Digit6: 'hotbar6',
  Digit7: 'hotbar7',
  Digit8: 'hotbar8',
  Digit9: 'hotbar9',
  KeyE: 'toggleInventory',
  Escape: 'closeMenu',
  KeyQ: 'drop',
  KeyR: 'stanceNext',
  KeyL: 'openLog',
};

/**
 * 本（BOOK-1）の キー。主な Action に くわえて、同じ キーで もう 1 つ Action が 押される。
 * 本が 出ていない ときは 受けとる 側（Book.onAction）が 何もしない。
 */
export const EXTRA_KEY_BINDINGS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'pagePrev',
  ArrowRight: 'pageNext',
  Backspace: 'bookBack',
  // 上空の 視点の 決定（HOUSE-1C PR-2）。主な Action では ない ので ふだんは ブラウザの Enter〔ボタンを 押す〕を 止めない
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

/**
 * 修飾キーつきの割り当て（M6）。キーは 'Shift+' ＋ KeyboardEvent.code。
 * 書いてあるキーだけが Shift つきで別の Action になる。ほかのキーは Shift を見ない（今までどおり）。
 */
export const MODIFIER_KEY_BINDINGS: Readonly<Record<string, Action>> = {
  'Shift+KeyQ': 'dropStack',
};

/** キーの押され方（code と Shift）から Action を決める。Shift＋Q は dropStack だけ（drop は出さない） */
export function actionForKey(code: string, shift: boolean): Action | undefined {
  if (shift) {
    const m = MODIFIER_KEY_BINDINGS[`Shift+${code}`];
    if (m) return m;
  }
  return DEFAULT_KEY_BINDINGS[code];
}

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
  private pressListeners: Array<(action: Action) => void> = [];

  /**
   * 押された瞬間に呼ばれる（ゲームの時間が止まっていても届く）。
   * もちもの画面の開け閉めのように、時間が止まっていても効かせたい Action 用。
   */
  onPress(fn: (action: Action) => void): void {
    this.pressListeners.push(fn);
  }

  press(action: Action): void {
    const count = this.held.get(action) ?? 0;
    if (count === 0) this.pressedThisFrame.add(action);
    this.held.set(action, count + 1);
    if (count === 0) for (const fn of this.pressListeners) fn(action);
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
export interface KeyboardBindOptions {
  /** 主な Action の ない キー（Backspace など）で、ブラウザの 動き（前のページへ）を 止めるか。ふだんは 止めない */
  preventExtra?: (action: Action) => boolean;
}

/** 字を 入れる らん か */
function isTextField(t: EventTarget | null): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
}

export function bindKeyboardAndMouse(target: Window, state: ActionState, wheel?: WheelAccumulator, opts: KeyboardBindOptions = {}): () => void {
  // 押しているキー → 押したときに決めた Action（Shift を先にはなしても、同じ Action をはなす）
  const downKeys = new Map<string, Action[]>();
  const onKeyDown = (e: KeyboardEvent) => {
    // ZUKAN-1: 字を 入れる らん（ずかんの さがす）では Esc いがい ゲームの キーに しない
    if (isTextField(e.target) && e.code !== 'Escape') return;
    const main = actionForKey(e.code, e.shiftKey);
    const extra = EXTRA_KEY_BINDINGS[e.code];
    if (!main && !extra) return;
    if (main || (extra && opts.preventExtra?.(extra))) e.preventDefault();
    if (e.repeat || downKeys.has(e.code)) return; // キーリピートは無視
    const list = [main, extra].filter((a): a is Action => !!a);
    downKeys.set(e.code, list);
    for (const a of list) state.press(a);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const list = downKeys.get(e.code);
    if (!list) return;
    downKeys.delete(e.code);
    for (const a of list) state.release(a);
  };
  const onMouseDown = (e: MouseEvent) => {
    const action = DEFAULT_MOUSE_BINDINGS[e.button];
    if (action) state.press(action);
  };
  const onMouseUp = (e: MouseEvent) => {
    const action = DEFAULT_MOUSE_BINDINGS[e.button];
    if (action) state.release(action);
  };
  const onWheel = (e: WheelEvent) => {
    if (!wheel) return;
    // ゲームが使わないとき（もちもの画面など）は止めない。じっせき の一覧がスクロールできるように
    if (wheel.isActive()) e.preventDefault();
    wheel.pushEvent(e.deltaY, e.deltaMode);
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
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onContextMenu);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousedown', onMouseDown);
    target.removeEventListener('mouseup', onMouseUp);
    target.removeEventListener('wheel', onWheel);
    target.removeEventListener('contextmenu', onContextMenu);
    target.removeEventListener('blur', onBlur);
  };
}
