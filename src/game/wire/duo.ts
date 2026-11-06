// main.ts の 流れ 9: 2 人で あそぶ（COOP-1 作業 1。docs/design/COOP-1.md）。
// 作業 1・2 の あいだ 2P は ふだんの 遊びに 出さない: 参加できるのは `?duo=dev` の ときの テストの 口と 2 本目の ＋ だけ。
import * as THREE from 'three';
import { DuoBody } from '../../duo/body';
import { distanceMeter, nextTier } from '../../duo/meter';
import { DuoSession } from '../../duo/session';
import { DUO_TUNING } from '../../duo/tuning';
import type { DuoHook, DuoLeaveReason, DuoState, DuoTier, DuoVec3 } from '../../duo/types';
import { WalkRelativeActions } from '../../duo/walkActions';
import type { LockStatus } from '../../contracts';
import { PlayerController } from '../../player/PlayerController';
import { isBodyPlaceable } from '../../save';
import { DuoHud, type DuoHudView } from '../../ui/duoHud';
import { charBasePath } from './player';
import type { WiredLoop } from './save';

const DEG = Math.PI / 180;
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
  const { shared, game, world, controller, lighting, hud, lock, gamepadApi, charCtl, blockDollOnly, combatUi, hotbar, worldReady, host } = deps;
  const dev = new URLSearchParams(location.search).get('duo') === 'dev';
  const router = gamepadApi.router;
  const p2Actions = gamepadApi.slots.get(1);
  const p2 = shared.p2;

  let panelOpen = false;
  let tier: DuoTier = 0;
  let distance = 0;
  let ctl2: PlayerController | null = null;
  const walk = new WalkRelativeActions(p2Actions);
  const view: DuoHudView = { tier: 0, meter: 0, distance: 0, padLost: false, quitGauge: 0, panelOpen: false };

  const ui = new DuoHud({ hud, p2Inventory: p2.inventory, hotbar1: hotbar.el, hearts1: combatUi.hearts.el });
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
      tier = 0;
      distance = 0;
      body.hide();
      ui.setJoined(false);
      shared.duoCamDistance = session.cameraDistance() === DUO_TUNING.cameraSolo ? null : session.cameraDistance();
    },
  });
  shared.duoJoined = () => session.joined;

  const lock2: LockStatus = {
    locked: () => lock.locked(),
    overlayVisible: () => lock.overlayVisible(),
    realtimeAllowed: () => lock.realtimeAllowed(),
    playInputEnabled: () => lock.playInputEnabled() && !panelOpen,
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

  function controller2(): PlayerController {
    ctl2 ??= new PlayerController(world, walk, gamepadApi.look2, lock2, () => ({ ...joinSpot(), yawDeg: controller.state.yawDeg, pitchDeg: 0 }));
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
    return true;
  }
  // 2 本目の ＋: 作業 3 までは ?duo=dev の ときだけ 参加できる
  gamepadApi.duo.onJoinRequested = () => {
    if (dev) join();
  };
  gamepadApi.duo.menuOpen2 = () => session.joined && panelOpen;

  function leave(reason: DuoLeaveReason): void {
    session.leave(reason);
  }

  /** 毎ステップ（固定）。1P の 更新（createStep）の あとに 呼ばれる */
  function step(dt: number): void {
    if (session.joined) {
      // 2P の もちもの画面（Y・＋で ひらく / B で とじる）と ホットバーの 切りかえ。本・建築士さん・とりごや・たんすは 開かない（AC15）
      if (p2Actions.wasPressed('toggleInventory')) panelOpen = !panelOpen;
      if (p2Actions.wasPressed('closeMenu')) panelOpen = false;
      if (!panelOpen) {
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
      walk.sync(controller.state.yawDeg);
      const heading = walk.heading();
      if (heading !== null) ctl2.state.yawDeg = heading;
      if (worldReady()) ctl2.update(dt);
      const a = controller.state.position;
      const b = ctl2.state.position;
      distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      tier = nextTier(tier, distance);
      body.step(ctl2.state);
      view.tier = tier;
      view.meter = distanceMeter(distance);
      view.distance = distance;
      view.padLost = session.padLost();
      view.quitGauge = session.quitGauge();
      view.panelOpen = panelOpen;
      ui.update(view);
    }
    p2Actions.endFrame();
  }
  game.onUpdate(step);

  const state = (): DuoState => ({
    joined: session.joined,
    view: 'one',
    tier: session.joined ? tier : 0,
    distance: session.joined ? distance : 0,
    meter: session.joined ? distanceMeter(distance) : 0,
    loupe: null,
    rings: 1,
    columns: host.info().columns.generated,
    light: false,
    padLost: session.padLost(),
  });

  const hook: DuoHook = {
    join: () => dev && join(),
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
  };
  return { duo: hook, duoSession: session, leaveDuo: leave };
}

export type WiredDuo = WiredLoop & ReturnType<typeof wireDuo>;
