// main.ts の 流れ 9: 2 人で あそぶ（COOP-1 作業 1。docs/design/COOP-1.md）。
// 作業 3d から: 2 本目の ＋・`duo.join()`・つかう コントローラーは ふつうの URL でも 効く。`?duo=dev` は E2E 用（`duo.place()` と 3a の 口だけ）。
import * as THREE from 'three';
import { DuoBody } from '../../duo/body';
import { hearFrom } from '../../duo/hearing';
import { distanceMeter } from '../../duo/meter';
import { closeInvHand } from '../../duo/invClose';
import { invCloseReason, invLayoutFor, invPadCommand, invQuitHeld, type InvLayout } from '../../duo/invRules';
import { PanelOrder, panelOpDeferred } from '../../duo/panelOrder';
import { createDuoFlash } from '../../duo/flash';
import { DuoJoinHint, type DuoJoinHintInput } from '../../duo/joinHint';
import { createSelectLock } from '../../legend/selectLock';
import { pressEquip } from '../../duo/p2Equip';
import { createParryViews, parryDollOf } from '../../duo/p2ParryView';
import { duoWaitNotice } from '../../duo/rules';
import { DuoSession } from '../../duo/session';
import { createSplitSound } from '../../duo/splitSound';
import { DUO_TUNING } from '../../duo/tuning';
import type { DuoHook, DuoLeaveReason, DuoState, DuoVec3, DuoViewport } from '../../duo/types';
import type { LockStatus } from '../../contracts';
import { PlayerController } from '../../player/PlayerController';
import { isBodyPlaceable } from '../../save';
import { DuoHud } from '../../ui/duoHud';
import { DuoNotices } from '../../ui/duoNotice';
import { charBasePath } from './player';
import type { WiredLoop } from './save';
import { DuoViews, type DuoViewsInput } from './duoView';
import { wireDuoPlay } from './duoPlay';
import { createDuoInventory, type DuoInventory } from './duoInventory';

const DEG = Math.PI / 180;
/** 1P・2P（毎ステップ 配列を 作らない） */
const BOTH = [1, 2] as const;
/** 角度の 差を -180〜180 に */
const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
/** 2 人用 もちもの画面を パッドで うごかす Action（十字・けってい・とじる。毎ステップ 配列を 作らない） */
const INV_PAD_ACTIONS = ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'confirm', 'closeMenu'] as const;
/** `duo.inv(who)` の とじている 値 */
const CLOSED_INV = { open: false, page: null, focus: null } as const;
/** ホットバーの 数字ボタン（毎ステップ 文字を 作らない） */
const HOTBAR_KEYS = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9'] as const;
/** 2P が 出る 所の 順（1P の 向きから 見て）: 右・左・うしろ・前。それぞれ 何マス 先か は DUO_TUNING.joinOffsetTiles */
const JOIN_SIDES = [
  { f: 0, r: 1 },
  { f: 0, r: -1 },
  { f: -1, r: 0 },
  { f: 1, r: 0 },
] as const;

export function wireDuo(deps: WiredLoop) {
  const { shared, game, world, controller, lighting, hud, lock, gamepadApi, charCtl, blockDollOnly, combatUi, hotbar, worldReady, host, renderer, sprite, camFx2, w2 } = deps;
  const dev = new URLSearchParams(location.search).get('duo') === 'dev';
  const router = gamepadApi.router;
  const p2Actions = gamepadApi.slots.get(1);
  const p2 = shared.p2;

  /** 2P の もちもの・クラフト画面（COOP-1 4a。はじめて 参加した とき 作る） */
  let inv2: DuoInventory | null = null;
  const panelOpen = (): boolean => inv2?.isOpen() === true;
  let distance = 0;
  /** `duo.state().fullPass` の 引き算の もと（参加した 時の `game.worldPassFrames`） */
  let fullPassBase = 0;
  /** 分割のとき 2P の 右スティックで 回った 角度（次のステップの P2Camera に 渡す） */
  let pendingLook = 0;
  let ctl2: PlayerController | null = null;

  /** 分割の「しゅっ」（COOP-1 3c）: 参加が 成功して 左右に 分かれた 時だけ 1 回 */
  const splitSound = createSplitSound(deps.fxSound);
  const ui = new DuoHud({ hud, p2Inventory: p2.inventory, hotbar1: hotbar.el, hearts1: combatUi.hearts.el, levelbar1: deps.levelHud.barEl });
  const notices = new DuoNotices(hud);
  const joinHint = new DuoJoinHint();
  /**
   * 「＋で さんか」(AC46・AC64)と 2P の 側の「ちょっと まってね」(AC84)の 出し入れ。active = 世界が 動いている。
   * 世界が 止まっている あいだは updaters が 動かない ので、modal の tick (shared.duoModalTick) と onIdle からも 呼ぶ
   */
  const hintIn: DuoJoinHintInput = { candidate: false, joined: false, active: false, anyButton: false };
  const waitIn = { joined: false, modal: false };
  // 毎ステップ 使いまわす 入力（新しい {…} を 作らない）
  const close2In = { down: false, padLost: false, left: false };
  const quitIn = { open: false, focus: null as string | null, confirmHeld: false };
  const stepIn = { padPresent: true, quitHeld: false };
  function noticeStep(active: boolean): void {
    const joined = session.joined;
    // 候補の 番号・「何か 押している」は gamepad の poll が 出した 物を 読む（ここで パッドの 一覧を 作らない）
    const poll = router.lastPoll();
    hintIn.candidate = poll.candidate >= 0;
    hintIn.joined = joined;
    hintIn.active = active;
    hintIn.anyButton = poll.candidatePressed;
    joinHint.step(hintIn);
    notices.setJoinHint(joinHint.visible());
    waitIn.joined = joined;
    waitIn.modal = deps.book.active() || shared.houseFrozen();
    notices.setWait(duoWaitNotice(waitIn));
  }
  shared.duoModalTick = () => noticeStep(false);
  game.onIdle(() => noticeStep(false));

  /** 参加のとき 1P の 今の キャラを 読む（1P が キャラを かえたら 2P も ついてくる） */
  const kindNow = (): 'girl' | 'boy' | null => (blockDollOnly || charCtl.get().kind === 'block' ? null : (charCtl.get().kind as 'girl' | 'boy'));
  const body = new DuoBody({
    scene: game.scene,
    camera: game.camera,
    lighting,
    kind: kindNow,
    basePath: charBasePath,
    initTexture: (t: THREE.Texture) => game.renderer.initTexture(t),
  });

  // COOP-1 4d-1: パリィの 見せ方（1P と 2P の 両方。よせ・青い ふち）。2 人が 参加している あいだ だけ 動く（1 人の ときは 何も しない。AC113）
  const parryState = { 1: { slowLeft: 0, glowLeft: 0 }, 2: { slowLeft: 0, glowLeft: 0 } };
  const parryHave = { 1: false, 2: false };
  const parryViews = createParryViews({
    joined: () => session.joined,
    fxFor: (who) => shared.duoCamFx(who),
    baseFor: (who) => (who === 1 ? (shared.duoCamDistance ?? DUO_TUNING.cameraSolo) : DUO_TUNING.cameraSplit),
    stateFor: (who) => (parryHave[who] ? parryState[who] : null),
    reducedMotion: () => deps.reducedMotionMq?.matches ?? false,
    settings: w2,
  });
  /** 毎ステップ 1 回: 二人の パリィの のこりを 読む（state() は そのつど 新しい 物を 作る ので 1 回に まとめる） */
  function readParry(): void {
    for (const who of BOTH) {
      const p = shared.parryFor(who);
      parryHave[who] = p !== null;
      if (p) {
        const s = p.state();
        parryState[who].slowLeft = s.slowLeft;
        parryState[who].glowLeft = s.glowLeft;
      }
    }
  }

  // COOP-1 4d-2: わざの うすい 光（出した 人の 半分だけ。全面の 光の かわり）。毎ステップ 使いまわす 入力
  const flash = createDuoFlash({ reducedMotion: () => deps.reducedMotionMq?.matches ?? false });
  const flashIn = { 1: { thunder: false, rainbow: false }, 2: { thunder: false, rainbow: false } };
  /** 2P の シャイニング中の 手の 物の 固定（1P は createStep の selLock。2P の 持ちかえの あとで 呼ぶ） */
  const selLock2 = createSelectLock();

  const views = new DuoViews({
    game,
    renderer,
    host,
    isSolid: (x, y, z) => world.isSolid(x, y, z),
    shadow: () => shared.shadowSystem,
    fx2: camFx2,
    beforePane: (c) => {
      sprite?.render(c);
      body.faceCamera(c);
    },
    // COOP-1 4d-2: 2 人の ときは 全面の 光の 道を 通らない ので、雷の 板（1P の 分と 2P の 分）は 各区画の 世界の すぐ あとに 重ねる
    afterPane: (c) => {
      deps.thunderFx.renderInPane(game.renderer, c);
      play.renderInPane(game.renderer, c);
    },
  });
  const view = views.hud;
  /** views.update に 毎ステップ 渡す 入力（使いまわす） */
  const viewIn: DuoViewsInput = { p1: controller.state.position, p2: controller.state.position, p1YawDeg: 0, p2PitchDeg: 0, distance: 0, padLost: false, panelOpen: false, panel1Open: false };

  const session = new DuoSession({
    p2,
    saveP2: (s) => {
      shared.p2Store.saved = s;
      shared.requestSave();
    },
    loadP2: () => shared.p2Store.saved,
    onLeft: () => {
      router.setJoined(false);
      distance = 0;
      pendingLook = 0;
      views.reset();
      views.p2cam.reset();
      camFx2.reset(); // 2P の 止め・ゆれ・引きは 消える（§10）
      parryViews.reset(); // 1P の パリィの よせも ふだんの きょりへ（1 人の ときは よせを 出さない）
      flash.reset(); // うすい 光も 消える（2 人の ときだけ）
      play.onLeave();
      splitSound.onLeft();
      body.hide();
      ui.setJoined(false);
      shared.duoCamDistance = session.cameraDistance() === DUO_TUNING.cameraSolo ? null : session.cameraDistance();
      // 2P の パネルは 消える。1P の パネルは そのまま（開いている あいだは 半分の まま。AC79）
      inv2?.update();
      syncLayout1();
    },
    // 手に もっている 物は 2P の もちものへ もどしてから 保存（いっぱいなら 足もとへ。§3.3「とじる とき」）
    beforeLeave: () => inv2?.setOpen(false),
  });
  shared.duoJoined = () => session.joined;
  shared.leaveDuo = (reason) => session.leave(reason);

  const lock2: LockStatus = {
    locked: () => lock.locked(),
    overlayVisible: () => lock.overlayVisible(),
    realtimeAllowed: () => lock.realtimeAllowed(),
    // 倒れている あいだは 2P の 入力を ぜんぶ はなす（歩く・ほる・おく・こうげき）
    // もちもの画面は 世界を 止めない: 1P が 画面を 開いていても 2P は 遊べる（lock.playInputEnabled は 1P の 画面で false になる）
    playInputEnabled: () => lock.realtimeAllowed() && !panelOpen() && !play.down(),
  };

  /** 2P が 出る 所: 1P の 右 2 マス。ふさがっていたら 左・うしろ・前。どこも だめなら 1P の 真上 */
  function joinSpot(): DuoVec3 {
    const s = controller.state;
    const yaw = s.yawDeg * DEG;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = Math.sin(yaw);
    const n = DUO_TUNING.joinOffsetTiles;
    for (const side of JOIN_SIDES) {
      const p = { x: s.position.x + (fx * side.f + rx * side.r) * n, y: s.position.y, z: s.position.z + (fz * side.f + rz * side.r) * n };
      if (isBodyPlaceable(world, p)) return p;
    }
    return { x: s.position.x, y: s.position.y + DUO_TUNING.joinAboveTiles, z: s.position.z };
  }

  const play = wireDuoPlay({
    deps,
    ui,
    actions: p2Actions,
    lock: lock2,
    ctl2: () => controller2(),
    lookBy: (deg) => {
      pendingLook += deg;
    },
    joined: () => session.joined,
    padPresent: () => !router.padLost(),
    camera2: () => views.camera2(),
    preloadParry: () => body.preloadParry(),
    joinSpot,
    dev,
    openFurnace: (x, y, z) => inv2?.openFurnace(x, y, z),
    openTansu: (x, y, z) => inv2?.openTansu(x, y, z),
    craft2: () => inv2!.p2Craft.craft,
  });

  function controller2(): PlayerController {
    ctl2 ??= new PlayerController(world, p2Actions, gamepadApi.look2, lock2, () => ({ ...joinSpot(), yawDeg: controller.state.yawDeg, pitchDeg: 0 }));
    return ctl2;
  }

  function join(): boolean {
    if (!session.join()) return false;
    fullPassBase = game.worldPassFrames;
    camFx2.reset();
    const spot = joinSpot();
    const c = controller2();
    inv2 ??= createDuoInventory(deps, () => (ctl2 ?? controller).state.position, () => inv2?.setOpen(false));
    c.set({ position: spot, velocity: { x: 0, y: 0, z: 0 }, yawDeg: controller.state.yawDeg, pitchDeg: 0, facingDeg: controller.state.facingDeg });
    router.setJoined(true);
    ui.setJoined(true);
    body.show();
    body.step(c.state);
    play.onJoin();
    splitSound.onJoined();
    syncLayout1(); // 1P の 画面が 開いていたら、その ステップで 左半分の 2 人用に かわる（AC79）
    return true;
  }
  // 2 本目の ＋: ふつうの URL でも 参加できる（作業 3d・AC64）
  gamepadApi.duo.onJoinRequested = () => {
    join();
  };
  gamepadApi.duo.menuOpen2 = () => session.joined && panelOpen();
  gamepadApi.duo.joined = () => session.joined; // 参加している あいだ だけ ボタンを 実時間の 毎コマ 読む（AC101）
  // たんす・かまどの 中身に かける 操作は ぜんぶ ここへ あずけ、1 ステップに 1 回 1P → 2P の 順に やる（同じ ステップは 1P が 先。COOP-1 4c）。
  // 1 人の ときは あずけず すぐ 実行（今の まま）。1P の マウスは ステップの あいだに 来る ので すぐ 実行で よい
  const order = new PanelOrder();
  gamepadApi.duo.submit1 = (op, active, rootId) => (panelOpDeferred(session.joined, active, rootId) ? order.submit(1, op) : op());

  // ---- 1P の もちもの画面: 2 人の あいだは 左半分の 2 人用（data-layout="duo"）。1P の パッド・キー・マウスは 今の まま（DOM の フォーカス）
  const inv1 = deps.inventoryScreen;
  const layoutIn = { joined: false, open: false, current: 'full' as InvLayout };
  function syncLayout1(): void {
    if (!session.joined && inv1.layout() === 'full') return; // 1 人の ときは 何も しない
    layoutIn.joined = session.joined;
    layoutIn.open = shared.screen.inventoryOpen();
    layoutIn.current = inv1.layout();
    const next = invLayoutFor(layoutIn);
    if (next === inv1.layout()) return;
    if (next === 'duo') {
      if (inv1.tab() !== 'items') deps.toItemsTab(); // じっせき・できごと は 2 人用に ない
    }
    inv1.setLayout(next);
  }
  // 1P が とじる とき（自分で・倒れて）: 手に もっている 物は 1P の もちものへ、いっぱいなら 1P の 足もとへ（AC89）
  shared.screen.onClose(() => {
    if (inv1.layout() === 'duo') closeInvHand(deps.inventory, (st) => deps.drops.scatter(controller.state.position, [st]));
  });

  function leave(reason: DuoLeaveReason): void {
    session.leave(reason);
  }

  /** 2P の もちもの画面を パッドで うごかす（十字は 2P の えらびを うごかす。1P の フォーカスには さわらない。AC88）。操作は PanelOrder へ あずける */
  function padInv2(screen: DuoInventory['screen']): void {
    for (const a of INV_PAD_ACTIONS) {
      if (!p2Actions.wasPressed(a)) continue;
      const cmd = invPadCommand(a);
      if (cmd === null) continue;
      order.submit(2, () => {
        if (cmd === 'close') inv2?.setOpen(false);
        // そうびの マスで 決める → 2P の そうび（p2.armor）へ。ほかは ふつうの 決める（COOP-1 4b）
        else if (cmd === 'press') {
          if (!pressEquip(screen.focusKey(), p2.armor)) screen.padPress();
        } else screen.padMove(cmd);
      });
    }
  }

  /** 毎ステップ（固定）。1P の 更新（createStep）の あとに 呼ばれる */
  function step(dt: number): void {
    noticeStep(true);
    if (session.joined && inv2) {
      const down2 = play.down();
      // 2P の もちもの画面（Y で ひらく / B で とじる）。開いている Y は 何も しない（とじるのは B だけ）。
      // たんすを ねらって Y は「たんす」の ページ（4c）。本・建築士さん・とりごやは 開かない（AC15）
      if (!inv2.isOpen() && play.mayOpenInv() && p2Actions.wasPressed('toggleInventory')) {
        if (!play.tryOpenTansu()) inv2.setOpen(true);
      } else if (inv2.isOpen()) {
        // 倒れた・パッドが ぬけた ステップに とじる（AC89）。やめた ときは session.leave の beforeLeave が とじる
        close2In.down = down2;
        close2In.padLost = session.padLost();
        if (invCloseReason(2, close2In) !== null) inv2.setOpen(false);
        else padInv2(inv2.screen);
      }
      order.flush(); // 預かった パネルの 操作を 1P → 2P の 順に（FurnaceWorld・たんすの update の 前。1 ステップに 1 回）
      if (!inv2.isOpen() && !down2) {
        const inv = p2.inventory;
        if (p2Actions.wasPressed('hotbarNext')) inv.selectNext(1);
        if (p2Actions.wasPressed('hotbarPrev')) inv.selectNext(-1);
        for (let i = 0; i < HOTBAR_KEYS.length; i++) if (p2Actions.wasPressed(HOTBAR_KEYS[i]!)) inv.select(i);
      }
      // 4d-2: シャイニング中は 手の 物を かえさせない（ホットバー操作の あとで 1 回。先に 呼ぶと その ステップの かえが 通る）
      selLock2.step(play.legendLocked(), p2.inventory);
      inv2.step();
    } else order.flush(); // 2P が いなく なった ステップに のこった 1P の 操作
    // 1P が 倒れた ステップの 1P の パネルの とじは combat.die の closeInventory（→ screen.onClose）が する（AC89）
    stepIn.padPresent = !router.padLost();
    if (session.joined) {
      quitIn.open = panelOpen();
      quitIn.focus = inv2?.screen.focusKey() ?? null;
      quitIn.confirmHeld = p2Actions.isHeld('confirm');
      stepIn.quitHeld = invQuitHeld(quitIn);
    } else stepIn.quitHeld = false;
    session.step(stepIn);
    const camNow = session.cameraDistance();
    shared.duoCamDistance = camNow === DUO_TUNING.cameraSolo ? null : camNow;
    if (session.joined && ctl2) {
      // 向き: 2P は いつも 自分の カメラ（右スティックで 回る。左スティック上は その カメラの 奥へ。1P と 同じ。§2.5）
      const cam = views.camStep(controller.state.yawDeg, pendingLook);
      const yaw0 = cam.camYawDeg;
      ctl2.state.yawDeg = yaw0;
      if (worldReady()) ctl2.update(dt);
      pendingLook = wrapDeg(ctl2.state.yawDeg - yaw0);
      const a = controller.state.position;
      const b = ctl2.state.position;
      distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      body.setShown(!play.down());
      // 2P の 人形の パリィの 絵と 青白い 光（1P の step.ts と 同じ 部品。sprite.step の 前に）
      const p2p = shared.p2Parry();
      const doll = p2p ? parryDollOf(p2p.state(), w2) : null;
      body.setParry(doll ? doll.cell : null);
      body.setGlow(doll ? doll.glow : 0);
      body.step(ctl2.state);
      play.step(dt);
      // パリィの よせ（その人の カメラだけ）と 青い ふち（その人の 半分だけ）。2P の カメラの きょりは views.update が 読む ので その 前に
      readParry();
      parryViews.step();
      // 4d-2: 2P の わざ（波・手ごたえ・カメラの 引き）。カメラの 口は よせと 同じ 口なので **よせの あとに** 呼ぶ（わざが 勝つ）
      play.stepLegend();
      shared.impactFlush(); // 2P の 当たりの 手ごたえ（わざの 分も）を この ステップに 出す（1P の 分は createStep の おわりで 出した 後）
      for (const who of BOTH) ui.setParryEdge(who, parryViews.edgeShown(who) ? parryViews.edgeLevel(who) : 0);
      const vi = viewIn;
      vi.p1 = a;
      vi.p2 = b;
      vi.p1YawDeg = controller.state.yawDeg;
      vi.p2PitchDeg = ctl2.state.pitchDeg;
      vi.distance = distance;
      vi.padLost = session.padLost();
      vi.panelOpen = panelOpen();
      vi.panel1Open = shared.screen.inventoryOpen();
      views.update(vi);
      // 4d-2: 2P の わざの 絵（2P の カメラを 決めた あと）と、その人の 半分の うすい 光
      play.stepLegendFx();
      flashIn[1].thunder = deps.thunderFx.active();
      flashIn[1].rainbow = deps.rainbowFx.active();
      const f2 = play.flashSrc();
      flashIn[2].thunder = f2?.thunder ?? false;
      flashIn[2].rainbow = f2?.rainbow ?? false;
      flash.step(flashIn);
      for (const who of BOTH) ui.setFlash(who, flash.alpha(who));
      view.meter = distanceMeter(distance);
      view.distance = distance;
      view.padLost = session.padLost();
      ui.update(view);
    } else {
      // 2P が いなくても ようす・軽くする 工夫・矢印の 数えは すすめる（やめた あとも 120 ステップ 軽いまま）
      views.update(null);
    }
    syncLayout1(); // 1P の 画面の 形（2P が いなくなっても 開いている あいだは 半分の まま。とじた つぎから 全面）
    if (inv2) {
      inv2.screen.setQuitGauge(panelOpen() ? session.quitGauge() : 0);
      inv2.update();
    }
    p2Actions.endFrame();
  }
  game.onUpdate(step);

  /** 持っている 列の 数（読みこみ中も ふくむ。AC27） */
  const columnCount = (): number => {
    const c = host.info().columns;
    return c.loading + c.generated + c.lit + c.meshed;
  };

  const state = (): DuoState => ({
    joined: session.joined,
    view: session.joined ? views.view : 'one',
    distance: session.joined ? distance : 0,
    meter: session.joined ? distanceMeter(distance) : 0,
    rings: session.joined ? views.rings : 1,
    columns: columnCount(),
    light: views.light, // やめた あとも 120 ステップは true（工夫は まとめて 元に もどす）
    padLost: session.padLost(),
    fullPass: session.joined ? game.worldPassFrames - fullPassBase : 0,
  });

  /** 2 人でない とき: 1P の 全面だけ */
  const fullViewport = (): DuoViewport => ({
    who: 1,
    x: 0,
    y: 0,
    w: window.innerWidth,
    h: window.innerHeight,
    camera: { x: game.camera.position.x, y: game.camera.position.y, z: game.camera.position.z },
    yawDeg: controller.state.yawDeg,
  });

  const hook: DuoHook = {
    ...play.hook,
    join,
    place(who, pos) {
      if (!dev) return;
      const target = who === 1 ? controller : session.joined ? ctl2 : null;
      target?.set({ position: pos, velocity: { x: 0, y: 0, z: 0 } });
    },
    state,
    pos(who) {
      if (who === 1) return { ...controller.state.position };
      return session.joined && ctl2 ? { ...ctl2.state.position } : null;
    },
    leave: () => leave('quit'),
    timeScale: () => shared.gameTimeScale(),
    // 4d-0（§12.0）: 手ごたえと カメラの きょり
    impact: (who) => shared.impactView(who),
    // 4d-1（§12.0）: その人の パリィ（1P は 今の parry。2P が いなければ who 2 は null）
    parry: (who) => shared.parryFor(who)?.state() ?? null,
    camDistance: (who) => (who === 1 ? shared.duoCamFx(1).distance() : session.joined ? shared.duoCamFx(2).distance() : null),
    viewports: () => (session.joined ? views.viewports(controller.state.yawDeg) : [fullViewport()]),
    arrow: (who) => (session.joined ? views.arrow(who) : null),
    // 作業 2.5（#401）: 型だけの スタブ(developer が ルーターに つなぐ)
    padChoice: () => router.choice(),
    setPadChoice: (c) => router.setChoice(c),
    padIndex: (who) => router.padIndex(who),
    // COOP-1 4a（§12.0）: その 人の 2 人用 もちもの画面（1 人の ときの 全面は who 1 でも open false）
    inv: (who) => (who === 1 ? inv1 : inv2?.screen)?.snapshot() ?? CLOSED_INV,
    // 作業 3c（#417）: 場所の ある 音を 聞く 人（近い 方）
    gasha: {
      target: () => shared.bigBossHandle?.targetWho?.() ?? null,
      girlTarget: () => {
        const w = (globalThis as unknown as { __gashaGirl?: { info(): Record<string, unknown> } }).__gashaGirl?.info().aimWho;
        return w === 1 || w === 2 ? w : null;
      },
    },
    hearFrom: (pos) => hearFrom(controller.state.position, session.joined && ctl2 ? ctl2.state.position : null, pos),
  };
  return { duo: hook, duoSession: session, leaveDuo: leave };
}

export type WiredDuo = WiredLoop & ReturnType<typeof wireDuo>;
