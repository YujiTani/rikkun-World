// main.ts の 流れ 9: 2 人で あそぶ（COOP-1 作業 1。docs/design/COOP-1.md）。
// 作業 3d から: 2 本目の ＋・`duo.join()`・つかう コントローラーは ふつうの URL でも 効く。`?duo=dev` は E2E 用（`duo.place()` と 3a の 口だけ）。
import * as THREE from 'three';
import { DuoBody } from '../../duo/body';
import { hearFrom } from '../../duo/hearing';
import { distanceMeter } from '../../duo/meter';
import { DuoJoinHint } from '../../duo/joinHint';
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

const DEG = Math.PI / 180;
/** 角度の 差を -180〜180 に */
const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
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
  const { shared, game, world, controller, lighting, hud, lock, gamepadApi, charCtl, blockDollOnly, combatUi, hotbar, worldReady, host, renderer, sprite } = deps;
  const dev = new URLSearchParams(location.search).get('duo') === 'dev';
  const router = gamepadApi.router;
  const p2Actions = gamepadApi.slots.get(1);
  const p2 = shared.p2;

  let panelOpen = false;
  let distance = 0;
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
  function noticeStep(active: boolean): void {
    const joined = session.joined;
    joinHint.step({ candidate: router.joinCandidate() !== null, joined, active, anyButton: router.joinPadPressed() });
    notices.setJoinHint(joinHint.visible());
    notices.setWait(duoWaitNotice({ joined, inventoryOpen: shared.screen.mode() === 'inventory', modal: deps.book.active() || shared.houseFrozen() }));
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

  const views = new DuoViews({
    game,
    renderer,
    host,
    isSolid: (x, y, z) => world.isSolid(x, y, z),
    shadow: () => shared.shadowSystem,
    beforePane: (c) => {
      sprite?.render(c);
      body.faceCamera(c);
    },
  });
  const view = views.hud;
  /** views.update に 毎ステップ 渡す 入力（使いまわす） */
  const viewIn: DuoViewsInput = { p1: controller.state.position, p2: controller.state.position, p1YawDeg: 0, p2PitchDeg: 0, distance: 0, padLost: false, panelOpen: false };

  const session = new DuoSession({
    p2,
    saveP2: (s) => {
      shared.p2Store.saved = s;
      shared.requestSave();
    },
    loadP2: () => shared.p2Store.saved,
    onLeft: () => {
      router.setJoined(false);
      panelOpen = false;
      distance = 0;
      pendingLook = 0;
      views.reset();
      views.p2cam.reset();
      play.onLeave();
      splitSound.onLeft();
      body.hide();
      ui.setJoined(false);
      shared.duoCamDistance = session.cameraDistance() === DUO_TUNING.cameraSolo ? null : session.cameraDistance();
    },
  });
  shared.duoJoined = () => session.joined;
  shared.leaveDuo = (reason) => session.leave(reason);

  const lock2: LockStatus = {
    locked: () => lock.locked(),
    overlayVisible: () => lock.overlayVisible(),
    realtimeAllowed: () => lock.realtimeAllowed(),
    // 倒れている あいだは 2P の 入力を ぜんぶ はなす（歩く・ほる・おく・こうげき）
    playInputEnabled: () => lock.playInputEnabled() && !panelOpen && !play.down(),
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
    joined: () => session.joined,
    padPresent: () => !router.padLost(),
    joinSpot,
    dev,
  });

  function controller2(): PlayerController {
    ctl2 ??= new PlayerController(world, p2Actions, gamepadApi.look2, lock2, () => ({ ...joinSpot(), yawDeg: controller.state.yawDeg, pitchDeg: 0 }));
    return ctl2;
  }

  function join(): boolean {
    if (!session.join()) return false;
    const spot = joinSpot();
    const c = controller2();
    c.set({ position: spot, velocity: { x: 0, y: 0, z: 0 }, yawDeg: controller.state.yawDeg, pitchDeg: 0, facingDeg: controller.state.facingDeg });
    router.setJoined(true);
    ui.setJoined(true);
    body.show();
    body.step(c.state);
    play.onJoin();
    splitSound.onJoined();
    return true;
  }
  // 2 本目の ＋: ふつうの URL でも 参加できる（作業 3d・AC64）
  gamepadApi.duo.onJoinRequested = () => {
    join();
  };
  gamepadApi.duo.menuOpen2 = () => session.joined && panelOpen;

  function leave(reason: DuoLeaveReason): void {
    session.leave(reason);
  }

  /** 毎ステップ（固定）。1P の 更新（createStep）の あとに 呼ばれる */
  function step(dt: number): void {
    noticeStep(true);
    if (session.joined) {
      // 2P の もちもの画面（Y・＋で ひらく / B で とじる）と ホットバーの 切りかえ。本・建築士さん・とりごや・たんすは 開かない（AC15）
      if (!play.down() && p2Actions.wasPressed('toggleInventory')) panelOpen = !panelOpen;
      if (p2Actions.wasPressed('closeMenu')) panelOpen = false;
      if (!panelOpen && !play.down()) {
        const inv = p2.inventory;
        if (p2Actions.wasPressed('hotbarNext')) inv.selectNext(1);
        if (p2Actions.wasPressed('hotbarPrev')) inv.selectNext(-1);
        for (let i = 0; i < HOTBAR_KEYS.length; i++) if (p2Actions.wasPressed(HOTBAR_KEYS[i]!)) inv.select(i);
      }
    }
    session.step({ padPresent: !router.padLost(), quitHeld: panelOpen && p2Actions.isHeld('confirm') });
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
      body.step(ctl2.state);
      play.step(dt);
      const vi = viewIn;
      vi.p1 = a;
      vi.p2 = b;
      vi.p1YawDeg = controller.state.yawDeg;
      vi.p2PitchDeg = ctl2.state.pitchDeg;
      vi.distance = distance;
      vi.padLost = session.padLost();
      vi.panelOpen = panelOpen;
      views.update(vi);
      view.meter = distanceMeter(distance);
      view.distance = distance;
      view.padLost = session.padLost();
      view.quitGauge = session.quitGauge();
      view.panelOpen = panelOpen;
      ui.update(view);
    } else {
      // 2P が いなくても ようす・軽くする 工夫・矢印の 数えは すすめる（やめた あとも 120 ステップ 軽いまま）
      views.update(null);
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
    viewports: () => (session.joined ? views.viewports(controller.state.yawDeg) : [fullViewport()]),
    arrow: (who) => (session.joined ? views.arrow(who) : null),
    // 作業 2.5（#401）: 型だけの スタブ(developer が ルーターに つなぐ)
    padChoice: () => router.choice(),
    setPadChoice: (c) => router.setChoice(c),
    padIndex: (who) => router.padIndex(who),
    // 作業 3c（#417）: 場所の ある 音を 聞く 人（近い 方）
    hearFrom: (pos) => hearFrom(controller.state.position, session.joined && ctl2 ? ctl2.state.position : null, pos),
  };
  return { duo: hook, duoSession: session, leaveDuo: leave };
}

export type WiredDuo = WiredLoop & ReturnType<typeof wireDuo>;
