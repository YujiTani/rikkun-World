// GAMEPAD-1: パッド読み・確認画面・ロック連携
import type { Game } from '../Game';
import type { LockController, MouseLook } from '../../input';
import { AlwaysLook, CombinedLook, GamepadReader, PlayerInputSlots } from '../../input/gamepad';
import { createGamepadPanel } from '../../ui/gamepad/gamepadPanel';
import type { ActionState } from '../../input/actions';

export function wireGamepad(opts: {
  game: Game;
  lock: LockController;
  mouseLook: MouseLook;
  actions: ActionState;
  overlayParent: HTMLElement;
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

  const onConn = (e: GamepadEvent) => {
    reader.onConnected(e.gamepad.index);
    opts.lock.setPadActive(reader.hasPad());
  };
  const onDisc = (e: GamepadEvent) => {
    reader.onDisconnected(e.gamepad.index);
    opts.lock.setPadActive(reader.hasPad());
  };
  window.addEventListener('gamepadconnected', onConn);
  window.addEventListener('gamepaddisconnected', onDisc);
  window.addEventListener('keydown', () => reader.noteKeyboard(), true);
  window.addEventListener('mousemove', () => reader.noteMouse(), true);

  const panel = createGamepadPanel(reader, opts.overlayParent);

  opts.actions.onPress((action) => {
    if (action === 'toggleView') opts.onToggleView();
  });

  const step = (): void => {
    reader.setMenuOpen(opts.menuOpen());
    reader.setHanging(opts.hanging());
    reader.poll(performance.now());
    const on = reader.hasPad();
    if (on !== opts.lock.isPadActive()) opts.lock.setPadActive(on);
  };
  opts.game.onUpdate(step);

  // メニュー: 十字でフォーカス移動（簡易）
  opts.game.onUpdate(() => {
    if (!opts.menuOpen()) return;
    const root = document.querySelector<HTMLElement>('[data-testid="inventory-root"], .inv-root, .inventory-screen') ?? document.body;
    const focusables = [...root.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (focusables.length === 0) return;
    const cur = document.activeElement as HTMLElement | null;
    let i = Math.max(0, focusables.indexOf(cur as HTMLElement));
    if (opts.actions.wasPressed('moveRight') || opts.actions.wasPressed('pageNext')) {
      i = (i + 1) % focusables.length;
      focusables[i]?.focus();
    } else if (opts.actions.wasPressed('moveLeft') || opts.actions.wasPressed('pagePrev')) {
      i = (i - 1 + focusables.length) % focusables.length;
      focusables[i]?.focus();
    } else if (opts.actions.wasPressed('moveForward')) {
      i = (i - 4 + focusables.length) % focusables.length;
      focusables[i]?.focus();
    } else if (opts.actions.wasPressed('moveBack')) {
      i = (i + 4) % focusables.length;
      focusables[i]?.focus();
    } else if (opts.actions.wasPressed('confirm')) {
      (document.activeElement as HTMLElement | null)?.click?.();
    }
  });

  return {
    reader,
    look,
    slots,
    panel,
    dispose: () => {
      window.removeEventListener('gamepadconnected', onConn);
      window.removeEventListener('gamepaddisconnected', onDisc);
      panel.dispose();
    },
  };
}
