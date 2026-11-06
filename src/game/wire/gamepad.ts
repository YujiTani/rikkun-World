// GAMEPAD-1: パッド読み・確認画面・ロック連携
import type { Game } from '../Game';
import type { LockController, MouseLook } from '../../input';
import { AlwaysLook, CombinedLook, DuoPadRouter, PlayerInputSlots } from '../../input/gamepad';
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

  const panel = createGamepadPanel(reader, opts.overlayParent);

  opts.actions.onPress((action) => {
    if (action === 'toggleView') opts.onToggleView();
  });

  /** COOP-1: 参加の 求め（2 本目の ＋）と 2P の もちもの画面は wireDuo が つなぐ */
  const duo = { onJoinRequested: (): void => undefined, menuOpen2: (): boolean => false };
  const step = (active: boolean): void => {
    reader.setMenuOpen(opts.menuOpen());
    reader.setHanging(opts.hanging());
    router.setMenuOpen2(duo.menuOpen2());
    if (router.poll(performance.now(), active).joinRequested) duo.onJoinRequested();
    const on = reader.hasPad();
    if (on !== opts.lock.isPadActive()) opts.lock.setPadActive(on);
  };
  // 案内中（realtime オフ）でもパッドを読んで padActive にできるように idle でも回す
  opts.game.onUpdate(() => step(true));
  opts.game.onIdle(() => step(false));

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
    router,
    duo,
    look,
    slots,
    look2: padLook2,
    panel,
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
      panel.dispose();
    },
  };
}
