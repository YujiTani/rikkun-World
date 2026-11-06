// GAMEPAD-1: パッド読み・確認画面・ロック連携
import type { Game } from '../Game';
import type { LockController, MouseLook } from '../../input';
import { AlwaysLook, CombinedLook, GamepadReader, PlayerInputSlots } from '../../input/gamepad';
import type { ActionState } from '../../input/actions';
import { activeMenuRoot, clickFocused, handleMenuDir } from '../../ui/menu/focusNav';

export function wireGamepad(opts: {
  game: Game;
  lock: LockController;
  mouseLook: MouseLook;
  actions: ActionState;
  /** もちものなどが開いているか */
  menuOpen: () => boolean;
  /** ロープぶら下がり */
  hanging: () => boolean;
  /** みかた切替（本体は後続。今は no-op 呼び出し） */
  onToggleView: () => void;
}) {
  const padLook = new AlwaysLook();
  const look = new CombinedLook(opts.mouseLook, padLook);
  const slots = new PlayerInputSlots(opts.actions);
  const reader = new GamepadReader(slots.get(0), padLook, typeof localStorage !== 'undefined' ? localStorage : null);
  reader.bootstrap();
  opts.lock.setPadActive(reader.hasPad());

  const onConn = (e: Event) => {
    const ge = e as GamepadEvent;
    const idx = ge.gamepad?.index ?? 0;
    reader.onConnected(idx);
    opts.lock.setPadActive(reader.hasPad());
  };
  const onDisc = (e: Event) => {
    const ge = e as GamepadEvent;
    const idx = ge.gamepad?.index ?? 0;
    reader.onDisconnected(idx);
    opts.lock.setPadActive(reader.hasPad());
  };
  window.addEventListener('gamepadconnected', onConn);
  window.addEventListener('gamepaddisconnected', onDisc);
  window.addEventListener('keydown', () => reader.noteKeyboard(), true);
  window.addEventListener('mousemove', () => reader.noteMouse(), true);

  opts.actions.onPress((action) => {
    if (action === 'toggleView') opts.onToggleView();
  });

  let pumpUi = (): void => {};
  const step = (): void => {
    reader.setMenuOpen(opts.menuOpen());
    reader.setHanging(opts.hanging());
    reader.poll(performance.now());
    pumpUi();
    const on = reader.hasPad();
    if (on !== opts.lock.isPadActive()) opts.lock.setPadActive(on);
    if (!opts.menuOpen() || reader.isCapturing()) return;
    const root = activeMenuRoot();
    if (!root) return;
    const a = opts.actions;
    if (a.wasPressed('focusUp')) handleMenuDir(root, 'up');
    else if (a.wasPressed('focusDown')) handleMenuDir(root, 'down');
    else if (a.wasPressed('focusLeft')) handleMenuDir(root, 'left');
    else if (a.wasPressed('focusRight')) handleMenuDir(root, 'right');
    else if (a.wasPressed('confirm')) clickFocused(root);
  };
  // 案内中（realtime オフ）でもパッドを読んで padActive にできるように idle でも回す
  opts.game.onUpdate(step);
  opts.game.onIdle(step);

  return {
    reader,
    look,
    slots,
    setPump(fn: () => void): void {
      pumpUi = fn;
    },
    /** E2E: 偽パッドを差し込む */
    injectPad(pad: Gamepad | null): void {
      reader.getPads = () => (pad ? [pad] : []);
      if (pad) {
        reader.onConnected(pad.index);
        opts.lock.setPadActive(true);
      } else {
        reader.onDisconnected(0);
        opts.lock.setPadActive(reader.hasPad());
      }
    },
    dispose: () => {
      window.removeEventListener('gamepadconnected', onConn);
      window.removeEventListener('gamepaddisconnected', onDisc);
    },
  };
}
