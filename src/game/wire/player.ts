// main.ts の 流れ 2: 入力・案内画面・プレイヤー・カメラ・キャラ。
import { CameraRig } from '../../camera/CameraRig';
import { disposeMergedHeldGeometry } from '../../camera/heldTools';
import { useBlockDoll } from '../../debug/glbDoll';
import { createCharSprite } from '../../char';
import { createCharController } from '../../char/charPref';
import { AimMarks } from '../../ui/aimMarks';
import { createCrosshair } from '../../camera/crosshair';
import { Book } from '../../ui/book/Book';
import { playBook } from '../../fx/bookSounds';
import { nearestEar } from '../../duo/hearing';
import { createLiquidSounds } from '../../fx/liquidSounds';
import { FX_SETTINGS } from '../../fx/config';
import { P1CamFx, P2CamFx } from '../../duo/camFx';
import { createImpactRoute } from '../../duo/impactRoute';
import { baseCamDistance } from '../../duo/rules';
import { DUO_TUNING } from '../../duo/tuning';
import { type BgmSceneInput, screenLevel } from '../../fx/bgm/scene';
import { createSettingsPanel } from '../../ui/settings/settingsPanel';
import { bindPauseMenu } from '../../ui/menu/bindPause';
import { createDialogStack, mountChoiceDialog } from '../../ui/menu/choiceDialog';
import { TITLE_RETURN_STAY } from '../../ui/menu/titleReturn';
import { ruby } from '../../ui/text';
import { isBodyPlaceable } from '../../save';
import { bindKeyboardAndMouse } from '../../input/actions';
import { wireGamepad } from './gamepad';
import { createGameModal } from './modalTick';
import { createBookInput } from './modalOwner';
import { LockController, WheelAccumulator, MouseLook, bindPointerLock } from '../../input';
import { PlayerController } from '../../player/PlayerController';
import { PlayOverlay } from '../../ui/playOverlay';
import { BlobShadow, BLOB } from '../../fx/blobShadow';
import { START_PITCH_DEG } from '../../player/config';
import type { WiredRender } from './world';

/** キャラの 板の 絵の 置き場（?charsheets=orig は 開発サーバーだけ。2P の 体も 同じ 絵を 読む） */
export function charBasePath(kind: 'girl' | 'boy'): string {
  return `${import.meta.env.DEV && new URLSearchParams(location.search).get('charsheets') === 'orig' ? './__char-orig/' : './models/char/'}${kind}/`;
}

export function wireInput(deps: WiredRender) {
  const {
    shared, game, fxSound, hud, startPlan, audioSettings, mixer, audioPersist, bgm, bgmScene, yakataScene, time,
  } = deps;

  // 入力・スタート画面
  const lock = new LockController();
  const wheel = new WheelAccumulator(game.input, () => lock.playInputEnabled());
  // 本（BOOK-1）が 出ている間だけ Backspace を 止める（ブラウザの「前のページへ」にならないように）
  let bookRef: Book | null = null;
  bindKeyboardAndMouse(window, game.input, wheel, { preventExtra: () => bookRef?.active() === true });
  const mouseLook = new MouseLook(lock);
  const pointerLock = bindPointerLock(document, window, game.renderer.domElement, lock, mouseLook, game.input);
  // GAMEPAD-1: パッド＋合成 look（下で panel を案内に載せるため playOverlay のあとで wire）
  let look: import('../../contracts').LookSource = mouseLook;
  let gamepadApi: ReturnType<typeof wireGamepad> | null = null;
  // BOOK-1: あそびかたの 3D の 本。出ている間は 世界が 止まり、景色は 描きなおさない
  const book = new Book({
    parent: document.body,
    sound: (name) => playBook(fxSound, name),
    beforeOpen: () => game.flushRender(),
  });
  bookRef = book;
  // 世界を 止める 画面は 2 つ: 本と、建築士さんの メニュー（HOUSE-1A。時刻・妖怪も 止まる）。建築士さんは HTML なので 描く 物は ない。
  // もちもの画面は 2 人の ときも 世界を 止めない（COOP-1 4a）
  game.setModal(createGameModal({
    bookActive: () => book.active(),
    bookTick: () => book.tick(),
    bookRender: () => book.render(),
    houseFrozen: () => shared.houseFrozen(),
    houseTick: () => shared.houseModal.tick(),
    houseRender: () => shared.houseModal.render(),
    duoModalTick: () => shared.duoModalTick(),
  }));
  // 本の 入力: 動かせるのは 開いた 人の パッドだけ（1P の キー・パッド → p1、2P の パッド → p2。COOP-1 5d）
  const bookInput = createBookInput(shared.modalOwner, book);
  game.input.onPress(bookInput.p1);
  // 2P が やめた・パッドが ぬけた: 開いて いる 本か 建築士さんを その ステップで しまう（modalOwner.step が 呼ぶ）
  shared.modalCloseNow = () => {
    if (book.active()) book.closeNow();
    else shared.house?.close();
  };
  // 案内画面の 本の ボタンも 開いた 人の 取り合いを 通す（1P だけ）
  const playOverlay = new PlayOverlay(hud, lock, () => pointerLock.request(), () => {
    if (shared.modalOwner.claim(1)) book.open();
  });
  startPlan.close(); // スタートメニューを 消す（今の「じゅんびちゅう」→「あそぼう」の 案内画面へ）
  const settingsGate = { open: () => false };
  gamepadApi = wireGamepad({
    game,
    lock,
    mouseLook,
    actions: game.input,
    menuOpen: () => {
      const settingsOn = settingsGate.open();
      try {
        return settingsOn || lock.overlayVisible() || shared.screen.inventoryOpen() || book.active() || shared.houseFrozen();
      } catch {
        return settingsOn || lock.overlayVisible() || book.active() || shared.houseFrozen();
      }
    },
    hanging: () => shared.controller?.tetherBody.hanging === true,
    onToggleView: () => { /* rig は wirePlayer で繋ぐ */ },
  });
  look = gamepadApi.look;
  gamepadApi.slots.get(1).onPress(bookInput.p2);
  const dialogs = createDialogStack();
  let goTitle: () => Promise<'reload' | 'stay'> = async () => 'stay';
  const returnDialog = mountChoiceDialog({
    testId: 'return-title-dialog',
    questionHtml: `${ruby('本当', 'ほんとう')}にタイトル${ruby('画面', 'がめん')}にもどりますか？`,
    yesLabel: 'もどる',
    yesTestId: 'return-title-yes',
    noTestId: 'return-title-no',
    onYes: () => {
      void goTitle().then((d) => {
        if (d === 'stay') returnDialog.showNote(TITLE_RETURN_STAY);
      });
    },
  });
  dialogs.add(returnDialog);
  const settingsUi = createSettingsPanel(
    {
      reader: gamepadApi.reader,
      audio: audioSettings,
      fx: FX_SETTINGS,
      onAudio: () => audioSync(),
      dialogs,
      router: gamepadApi.router,
      onClosed: () => shared.settingsClosed(),
    },
    playOverlay.el,
  );
  settingsGate.open = () => settingsUi.isOpen();
  gamepadApi.setPump((active, dt) => settingsUi.pump(active, dt));
  playOverlay.addButton(`タイトル${ruby('画面', 'がめん')}にもどる`, 'return-title', () => returnDialog.open());
  bindPauseMenu({
    actions: game.input,
    lock,
    getScreen: () => (shared as { screen?: { inventoryOpen(): boolean; closeToGuide(): void } }).screen ?? null,
    bookOpen: () => book.active(),
    houseOpen: () => shared.houseFrozen(),
    coopOpen: () => shared.coopMenuIsOpen(),
    settings: settingsUi,
    dialogs,
  });
  // 最初のクリック・キーで音が使えるようになる（ブラウザのきまり）
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => mixer.unlock(), true);
  document.addEventListener('visibilitychange', () => mixer.setHidden(document.hidden));
  mixer.setHidden(document.hidden);
  let audioKey = '';
  let audioYokai: BgmSceneInput['yokai'] = [];
  /** 設定が変わっていたら ミキサーに反映・保存・画面を合わせる */
  function audioSync(): void {
    const k = `${audioSettings.masterVolume}|${audioSettings.bgmVolume}|${audioSettings.audioMuted}|${FX_SETTINGS.fxVolume}`;
    if (k === audioKey) return;
    audioKey = k;
    mixer.apply();
    audioPersist.sync();
    settingsUi.refreshAudio();
  }
  /** 毎ステップ: 場面 → BGM、画面の倍率、おめでとう画面のあいだ BGM を下げたまま */
  function audioStep(): void {
    audioSync();
    if (game.tick % 10 === 0) audioYokai = (['waiting', 'challenge'] as string[]).includes(yakataScene.state().scene) ? [] : shared.yokaiM.list().map((y) => ({ state: y.state, position: y.position })); // MINE-1F: やかたの 場面の 間は たたかいの 曲に しない
    const dead = shared.combat.dead();
    if (shared.girlBgmOn) bgm.play(null, shared.gashaBgmFade); // #293 試作: 少女の 間は ふだんの BGM を 止める（「災厄」を 流す）
    else { bgm.play(bgmScene.update({ tick: game.tick, phase: time.phase(), player: shared.controller.state.position, yokai: audioYokai, dead }), shared.gashaBgmFade); if (bgm.current() !== null) shared.gashaBgmFade = {}; }
    const mode = shared.screen.mode();
    mixer.setScreenLevel(screenLevel(mode, dead));
    // 実績の おしらせ（上の 帯）が 出ている 間は BGM を さげる（ファンファーレを 聞かせる）
    mixer.holdDuck(shared.celebrate.bandModel.toast.isOpen());
    if (mode !== 'guide' && settingsUi.isOpen()) settingsUi.close();
  }
  return {
    lock, wheel, look, pointerLock, book, playOverlay, audioStep, gamepadApi,
    setTitleReturn(fn: () => Promise<'reload' | 'stay'>) {
      goTitle = fn;
    },
  };
}

type WiredInput = WiredRender & ReturnType<typeof wireInput>;

export function wirePlayer(deps: WiredInput) {
  const { shared, island, world, game, look, lock, lighting, startPlan, hud } = deps;
  // プレイヤーとカメラ
  // スタート・やり直し・セーブの読みこみでは pitch は START_PITCH_DEG（CHAR-1 第 5.2 版 §4.1）
  // スタートへ もどす。スタートのまわりが 読みこまれていなければ、そろうまで その場で まつ（VOX-D「遠くへ もどる」）
  const spawnPlain = () => ({ ...island.spawn(), pitchDeg: START_PITCH_DEG });
  /** 地形だけで決まる立ち位置の y を、置いたブロックの上まで 上げる（石を置いた上に立つ）。列が読みこまれていなければ そのまま */
  const raiseAboveBlocks = (x: number, y: number, z: number): number => {
    let yy = y;
    for (let i = 0; i < 64 && world.isLoaded(Math.floor(x), Math.floor(z)) && !isBodyPlaceable(world, { x, y: yy, z }); i++) yy++;
    return yy;
  };
  const startPoint = () => {
    const sp = island.spawn();
    const y = raiseAboveBlocks(sp.x, sp.y, sp.z);
    shared.streamHost?.goTo({ x: sp.x, y, z: sp.z });
    return { ...sp, y, pitchDeg: START_PITCH_DEG };
  };
  const controller = new PlayerController(world, game.input, look, lock, startPoint);
  deps.water.setFocus(() => controller.state.position); // MAGMA-SPAWN: 遠い わきどころは 休む
  deps.water.setSound(createLiquidSounds(deps.fxSound, () => game.tick, (at) => nearestEar(controller.state.position, shared.duoMate()?.position ?? null, at))); // WAKIDOKORO §11。COOP-1 3c: 2P が いれば 近い 方の 人から の 距離
  shared.controller = controller;
  // CHAR-1 第 5 版: 一人称（V）はなくなった。CameraRig は受け取るだけの ActionState を使う
  // #276 手ごたえ: ヒットストップと 画面の ゆれ（ゆれは FX_SETTINGS.fxShake が 0 なら なし）
  const titleOfYokai = (id: number) => shared.yokaiManager?.list().find((q) => q.id === id)?.title ?? 'none';
  const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, game.input);
  // COOP-1 4d-0: 1 人の ときは 世界を 止めて 1P の カメラが ゆれる（今の まま）。2 人の ときは 世界は 止めず、その人の 半分の カメラだけ 止める・ゆらす
  const camFx1 = new P1CamFx({ rig, camera: game.camera, baseDistance: () => baseCamDistance(shared.duoCamDistance), joined: () => shared.duoJoined() });
  const camFx2 = new P2CamFx({ baseDistance: () => DUO_TUNING.cameraSplit });
  shared.duoCamFx = (who) => (who === 1 ? camFx1 : camFx2);
  const impactRoute = createImpactRoute({
    joined: () => shared.duoJoined(),
    worldStop: (n) => game.hitStop(n),
    worldStopLeft: () => game.hitStopLeft(),
    camFx: shared.duoCamFx,
    shakeOn: () => !!FX_SETTINGS.fxShake,
    tick: () => game.tick,
  });
  shared.impactFor = impactRoute.impactFor;
  shared.impactFlush = impactRoute.flush;
  shared.impactView = impactRoute.view;
  const impactBus = impactRoute.impactFor(1);
  // GAMEPAD-1: V / パッド上面 → toggleView（本体は CameraRig 内 TODO no-op）
  game.input.onPress((action) => {
    if (action === 'toggleView') rig.toggleView();
  });
  lighting.registerTree(rig.doll.group, 'doll');
  // キャラは 8 方向のドット絵の板。?char=block のときだけ 箱人形（描画回数を比べるため）
  const blockDollOnly = useBlockDoll(location.search);
  // CHAR-5: キャラの 決め方（?char=・おぼえた値）と 窓口 char.get / char.set
  // ?charsheets=orig（開発サーバーだけ）: 切りつめる前の 格子の絵を 読む（AC34 の くらべ用）
  const charBase = charBasePath;
  let sprite: ReturnType<typeof createCharSprite> | null = null;
  const charCtl = createCharController({
    search: location.search,
    store: window.localStorage,
    initial: startPlan.char ?? undefined, // メニューで えらんだ キャラ（START-1。URL で 始めたときは CHAR-5 の 決め方）
    onSwitch: (kind) => sprite?.setChar(kind, charBase(kind)),
  });
  const startKind = charCtl.get().kind;
  sprite =
    blockDollOnly || startKind === 'block'
      ? null
      : createCharSprite({
          parent: rig.doll.group,
          camera: game.camera,
          lighting,
          kind: startKind,
          basePath: charBase(startKind),
          initTexture: (t) => game.renderer.initTexture(t),
        });
  rig.doll.setBoxBody(blockDollOnly);
  // TEX-A: キャラの足もとの丸い影。影（renderOrder 1）の あとに キャラの板（renderOrder 2）を描く
  const blobShadow = new BlobShadow();
  game.scene.add(blobShadow.mesh);
  window.addEventListener("pagehide", () => { disposeMergedHeldGeometry(); game.scene.remove(blobShadow.mesh); blobShadow.dispose(); });
  rig.doll.group.traverse((o) => {
    if (o.name === 'charSprite') o.renderOrder = BLOB.spriteRenderOrder;
  });
  const crosshair = createCrosshair(hud);
  const aimMarks = new AimMarks(hud);
  crosshair.setVisible(rig.crosshairVisible());
  return {
    spawnPlain, raiseAboveBlocks, startPoint, controller, impactBus, camFx1, camFx2, titleOfYokai, rig, blockDollOnly,
    sprite, charCtl, blobShadow, crosshair, aimMarks,
  };
}

export type WiredPlayer = WiredInput & ReturnType<typeof wirePlayer>;
