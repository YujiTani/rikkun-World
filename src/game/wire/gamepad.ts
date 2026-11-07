// GAMEPAD-1: パッド読み・確認画面・ロック連携
import type { Game } from '../Game';
import type { LockController, MouseLook } from '../../input';
import { AlwaysLook, CombinedLook, DuoPadRouter, PlayerInputSlots } from '../../input/gamepad';
import type { ActionState } from '../../input/actions';
import { activeMenuRoot, clickFocused, handleMenuDir, SliderRepeat } from '../../ui/menu/focusNav';

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
  // 「つかう コントローラー」は いつも つかえる（保存を 読む。作業 3d・AC65）
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  const router = new DuoPadRouter({ p1: slots.get(0), p2: slots.get(1), look1: padLook, look2: padLook2, storage, choiceStorage: storage });
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

  let pumpUi: (active: boolean, dt: number) => boolean = () => false;
  /**
   * COOP-1: 参加の 求め（2 本目の ＋）と 2P の もちもの画面は wireDuo が つなぐ。
   * submit1 = 1P の パッドの けってい（けってい で たんす・かまどの 中身が かわる）を 預ける 口（4c。2 人の とき PanelOrder へ。1 人の ときは すぐ 実行）
   */
  const duo = { onJoinRequested: (): void => undefined, menuOpen2: (): boolean => false, joined: (): boolean => false, submit1: (op: () => void, _active: boolean, _rootId: string): void => op() };
  const sliderRepeat = new SliderRepeat();
  const step = (active: boolean, dt: number): void => {
    reader.setMenuOpen(opts.menuOpen());
    reader.setHanging(opts.hanging());
    router.setMenuOpen2(duo.menuOpen2());
    if (router.poll(performance.now(), active).joinRequested) duo.onJoinRequested();
    const padEnded = pumpUi(active, dt); // 1P の パッドで 待ちを やめた 回は フォーカスを 動かさない
    const on = reader.hasPad();
    if (on !== opts.lock.isPadActive()) opts.lock.setPadActive(on);
    if (padEnded || !opts.menuOpen() || reader.isCapturing()) {
      sliderRepeat.reset();
      return;
    }
    const root = activeMenuRoot();
    if (!root) return;
    const a = opts.actions;
    const pressed = a.wasPressed('focusUp') || a.wasPressed('focusDown') || a.wasPressed('focusLeft') || a.wasPressed('focusRight');
    if (pressed) sliderRepeat.reset();
    else if (a.isHeld('focusLeft') !== a.isHeld('focusRight')) sliderRepeat.tick(root, a.isHeld('focusLeft') ? 'left' : 'right', dt);
    else sliderRepeat.reset();
    if (a.wasPressed('focusUp')) handleMenuDir(root, 'up');
    else if (a.wasPressed('focusDown')) handleMenuDir(root, 'down');
    else if (a.wasPressed('focusLeft')) handleMenuDir(root, 'left');
    else if (a.wasPressed('focusRight')) handleMenuDir(root, 'right');
    else if (a.wasPressed('confirm')) duo.submit1(() => clickFocused(root), active, root.id);
  };
  // 案内中（realtime オフ）でもパッドを読んで padActive にできるように idle でも回す
  opts.game.onUpdate(() => step(true, 1 / 60));
  // 実時間の コマは modal の あいだも idle が 毎コマ 1 回 読む。modal.tick は 0〜N 回 回る ので、そこでは 読まない
  opts.game.onIdle((dt) => step(false, dt));
  // COOP-1 4d-1（AC101）: パリィの ゆっくりの あいだは 固定ステップが 0 回の コマが ある。ステップの あいだに 押して はなした ボタンを 取りこぼさない ように、
  // 2 人が 参加している あいだ だけ ボタンを 実時間の 毎コマ 読む（1 人の ときは 今までの poll だけ。AC113）。スティック・look は 1 ステップ 1 回の まま
  opts.game.onFrame((_dt, worldRuns) => {
    if (duo.joined()) router.pollButtons(performance.now(), worldRuns);
  });

  return {
    reader,
    router,
    duo,
    look,
    slots,
    setPump(fn: (active: boolean, dt: number) => boolean): void {
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
