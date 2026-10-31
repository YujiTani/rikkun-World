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
import { FX_SETTINGS } from '../../fx/config';
import { ImpactBus } from '../../fx/impact';
import { type BgmSceneInput, screenLevel } from '../../fx/bgm/scene';
import { createSoundSettings } from '../../ui/soundSettings';
import { isBodyPlaceable } from '../../save';
import { bindKeyboardAndMouse } from '../../input/actions';
import { LockController, WheelAccumulator, MouseLook, bindPointerLock } from '../../input';
import { PlayerController } from '../../player/PlayerController';
import { PlayOverlay } from '../../ui/playOverlay';
import { BlobShadow, BLOB } from '../../fx/blobShadow';
import { START_PITCH_DEG } from '../../player/config';
import type { WiredRender } from './world';

export function wireInput(deps: WiredRender) {
  const {
    shared, game, fxSound, hud, startPlan, audioSettings, mixer, audioPersist, bgm, bgmScene, time,
  } = deps;

  // 入力・スタート画面
  const lock = new LockController();
  const wheel = new WheelAccumulator(game.input, () => lock.playInputEnabled());
  // 本（BOOK-1）が 出ている間だけ Backspace を 止める（ブラウザの「前のページへ」にならないように）
  let bookRef: Book | null = null;
  bindKeyboardAndMouse(window, game.input, wheel, { preventExtra: () => bookRef?.active() === true });
  const look = new MouseLook(lock);
  const pointerLock = bindPointerLock(document, window, game.renderer.domElement, lock, look, game.input);
  // BOOK-1: あそびかたの 3D の 本。出ている間は 世界が 止まり、景色は 描きなおさない
  const book = new Book({
    parent: document.body,
    sound: (name) => playBook(fxSound, name),
    beforeOpen: () => game.flushRender(),
  });
  bookRef = book;
  // 世界を 止める 画面は 2 つ: 本と、建築士さんの メニュー（HOUSE-1A。時刻・妖怪も 止まる）。建築士さんの 画面は HTML なので 描く 物は ない
  game.setModal({
    active: () => book.active() || shared.houseFrozen(),
    tick: () => {
      if (book.active()) book.tick();
      else shared.houseModal.tick();
    },
    render: () => {
      if (book.active()) book.render();
      else shared.houseModal.render();
    },
  });
  game.input.onPress((action) => book.onAction(action));
  const playOverlay = new PlayOverlay(hud, lock, () => pointerLock.request(), () => book.open());
  startPlan.close(); // スタートメニューを 消す（今の「じゅんびちゅう」→「あそぼう」の 案内画面へ）
  const soundSettingsUi = createSoundSettings({ audio: audioSettings, fx: FX_SETTINGS, onChange: () => audioSync() }, playOverlay.el);
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
    soundSettingsUi.refresh();
  }
  /** 毎ステップ: 場面 → BGM、画面の倍率、おめでとう画面のあいだ BGM を下げたまま */
  function audioStep(): void {
    audioSync();
    if (game.tick % 10 === 0) audioYokai = shared.yokaiM.list().map((y) => ({ state: y.state, position: y.position }));
    const dead = shared.combat.dead();
    if (shared.girlBgmOn) bgm.play(null, shared.gashaBgmFade); // #293 試作: 少女の 間は ふだんの BGM を 止める（「災厄」を 流す）
    else { bgm.play(bgmScene.update({ tick: game.tick, phase: time.phase(), player: shared.controller.state.position, yokai: audioYokai, dead }), shared.gashaBgmFade); if (bgm.current() !== null) shared.gashaBgmFade = {}; }
    const mode = shared.screen.mode();
    mixer.setScreenLevel(screenLevel(mode, dead));
    // 実績の おしらせ（上の 帯）が 出ている 間は BGM を さげる（ファンファーレを 聞かせる）
    mixer.holdDuck(shared.celebrate.bandModel.toast.isOpen());
    if (mode !== 'guide' && soundSettingsUi.isOpen()) soundSettingsUi.close();
  }
  return { lock, wheel, look, pointerLock, book, playOverlay, soundSettingsUi, audioStep };
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
  shared.controller = controller;
  // CHAR-1 第 5 版: 一人称（V）はなくなった。CameraRig は受け取るだけの ActionState を使う
  // #276 手ごたえ: ヒットストップと 画面の ゆれ（ゆれは FX_SETTINGS.fxShake が 0 なら なし）
  const impactBus = new ImpactBus({
    stop: (n) => game.hitStop(n),
    shake: (a) => {
      if (FX_SETTINGS.fxShake) rig.addTrauma(a);
    },
    tick: () => game.tick,
  });
  const titleOfYokai = (id: number) => shared.yokaiManager?.list().find((q) => q.id === id)?.title ?? 'none';
  const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, game.input);
  lighting.registerTree(rig.doll.group, 'doll');
  // キャラは 8 方向のドット絵の板。?char=block のときだけ 箱人形（描画回数を比べるため）
  const blockDollOnly = useBlockDoll(location.search);
  // CHAR-5: キャラの 決め方（?char=・おぼえた値）と 窓口 char.get / char.set
  // ?charsheets=orig（開発サーバーだけ）: 切りつめる前の 格子の絵を 読む（AC34 の くらべ用）
  const charBase = (kind: 'girl' | 'boy'): string =>
    `${import.meta.env.DEV && new URLSearchParams(location.search).get('charsheets') === 'orig' ? './__char-orig/' : './models/char/'}${kind}/`;
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
    spawnPlain, raiseAboveBlocks, startPoint, controller, impactBus, titleOfYokai, rig, blockDollOnly,
    sprite, charCtl, blobShadow, crosshair, aimMarks,
  };
}

export type WiredPlayer = WiredInput & ReturnType<typeof wirePlayer>;
