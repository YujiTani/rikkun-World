// GAMEPAD-1: パッド読み・確認画面・ロック連携
import type { Game } from '../Game';
import type { LockController, MouseLook } from '../../input';
import { AlwaysLook, CombinedLook, DuoPadRouter, PlayerInputSlots } from '../../input/gamepad';
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
  const padLook2 = new AlwaysLook(); // COOP-1: 2P の 右スティック
  const look = new CombinedLook(opts.mouseLook, padLook);
  const slots = new PlayerInputSlots(opts.actions, 1); // slot 0 = 1P（キー・マウスと 同じ）、slot 1 = 2P（COOP-1）
  // COOP-1: パッドは ルーターが 1P・2P に 振り分ける。1P の 読み（reader）は 今までと 同じ
  // 開発用 `?duo=dev&pad=2p`: 1 本目の パッドを 2P に する（1P は キーボード＋マウス。ロックは 1P の パッドの 有無で 決まる）
  const query = new URLSearchParams(location.search);
  const firstPadIs2P = query.get('duo') === 'dev' && query.get('pad') === '2p';
  const router = new DuoPadRouter({ p1: slots.get(0), p2: slots.get(1), look1: padLook, look2: padLook2, storage: typeof localStorage !== 'undefined' ? localStorage : null, firstPadIs2P });
  const reader = router.reader1;
  router.bootstrap();
  opts.lock.setPadActive(reader.hasPad());

  const onConn = (e: Event) => {
    const ge = e as GamepadEvent;
    const idx = ge.gamepad?.index ?? 0;
    router.onConnected(idx);
    opts.lock.setPadActive(reader.hasPad());
  };
  const onDisc = (e: Event) => {
    const ge = e as GamepadEvent;
    const idx = ge.gamepad?.index ?? 0;
    router.onDisconnected(idx);
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
  /** COOP-1: 参加の 求め（2 本目の ＋）と 2P の もちもの画面は wireDuo が つなぐ */
  const duo = { onJoinRequested: (): void => undefined, menuOpen2: (): boolean => false };
  const step = (active: boolean): void => {
    reader.setMenuOpen(opts.menuOpen());
    reader.setHanging(opts.hanging());
    router.setMenuOpen2(duo.menuOpen2());
    if (router.poll(performance.now(), active).joinRequested) duo.onJoinRequested();
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
  opts.game.onUpdate(() => step(true));
  opts.game.onIdle(() => step(false));

  return {
    reader,
    router,
    duo,
    look,
    slots,
    setPump(fn: () => void): void {
      pumpUi = fn;
    },
    look2: padLook2,
    /** E2E: 偽パッドを差し込む */
    injectPad(pad: Gamepad | null): void {
      router.getPads = () => (pad ? [pad] : []);
      if (pad) {
        reader.onConnected(pad.index);
        opts.lock.setPadActive(true);
      } else {
        reader.onDisconnected(0);
        opts.lock.setPadActive(reader.hasPad());
      }
    },
    /** E2E: 偽パッドを 何本でも（null は ぬけた）。injectPad(pad) は injectPads([pad]) と 同じ 動き */
    injectPads(pads: Array<Gamepad | null>): void {
      router.getPads = () => pads;
      router.bootstrap();
      opts.lock.setPadActive(reader.hasPad());
    },
    dispose: () => {
      window.removeEventListener('gamepadconnected', onConn);
      window.removeEventListener('gamepaddisconnected', onDisc);
    },
  };
}
