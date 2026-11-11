// 2 人で あそぶ（COOP-1 作業 2。#399・3e。#422）: 画面の ようす（1 人の 全面・左右分割）・2P の カメラ・相手の 向きの 矢印・世界 2 か所・軽くする 工夫を まとめる。
import * as THREE from 'three';
import { DuoArrowTracker, arrowHeightPx, type ArrowStepInput } from '../../duo/arrow';
import { DuoLightGate } from '../../duo/light';
import { P2Camera, type P2CameraInput, type P2CameraOutput } from '../../duo/p2Camera';
import type { P2CamFx, P2CamView } from '../../duo/camFx';
import { p2CameraPose, type P2Pose } from '../../duo/p2Pose';
import { DUO_TUNING } from '../../duo/tuning';
import type { DuoArrow, DuoVec3, DuoView, DuoViewport } from '../../duo/types';
import { DuoViewMachine } from '../../duo/view';
import { DuoViewRenderer, type DuoDrawState } from '../../duo/viewRender';
import { newViewRectsScratch, viewRects, type Rect, type ViewRects } from '../../duo/viewRects';
import { decideRings } from '../../world/stream/layout';
import { getRing } from '../../world/stream/ring';
import { normalizeMicroR } from '../../world/render/voxel/tier';
import type { WorldRenderer } from '../../world/render/WorldRenderer';
import type { ShadowSystem } from '../../world/render/shadow/ShadowSystem';
import type { StreamHost } from '../../world/stream/StreamHost';
import type { Game } from '../Game';
import type { DuoHudView } from '../../ui/duoHud';
import { clockBoxAt } from '../../ui/duoHalves';

export interface DuoViewsDeps {
  game: Game;
  renderer: WorldRenderer;
  host: StreamHost;
  isSolid: (x: number, y: number, z: number) => boolean;
  shadow: () => ShadowSystem | null;
  /** 2P の カメラの 止め・ゆれ・きょり（COOP-1 4d-0） */
  fx2: P2CamFx;
  /** 区画を 描く 前に 呼ぶ（キャラの 板を そのカメラへ 向ける） */
  beforePane: (cam: THREE.Camera, who: 1 | 2, pane: Rect) => void;
  /** 各区画の 世界の 描画の すぐ あとに 呼ぶ（COOP-1 4d-2: 雷の 板を その 区画に 重ねる） */
  afterPane: (cam: THREE.Camera, who: 1 | 2, pane: Rect) => void;
  /** その 半分の 時計の 実測の 大きさ（矢印が よける 箱。COOP-1 5f-2 1.17）。まだ はかれない・2P が いなければ null */
  clockSize: (who: 1 | 2) => { w: number; h: number } | null;
}

/** 毎ステップ 渡す 2 人の 状態 */
export interface DuoViewsInput {
  p1: DuoVec3;
  p2: DuoVec3;
  p1YawDeg: number;
  p2PitchDeg: number;
  /** 2P が すわって いる 間の 目の さがり（マス。立って いれば 0。COOP-1 5e） */
  p2EyeDrop: number;
  distance: number;
  padLost: boolean;
  /** 2P の もちもの パネルが 開いている（2P の 半分の 矢印を 出さない。AC87） */
  panelOpen: boolean;
  /** 1P の もちもの パネルが 開いている（1P の 半分の 矢印を 出さない。COOP-1 4a・AC87） */
  panel1Open: boolean;
}

export class DuoViews {
  readonly p2cam = new P2Camera();
  private readonly machine: DuoViewMachine;
  private readonly gate = new DuoLightGate();
  private readonly vr: DuoViewRenderer;
  private readonly reduced: boolean;
  /** 矢印: [1P の 半分（2P を さす）, 2P の 半分（1P を さす）] */
  private readonly arrows: readonly [DuoArrowTracker, DuoArrowTracker];
  private from: DuoView = 'one';
  private _light = false;
  private _rings: 1 | 2 = 1;
  private readonly scratch = newViewRectsScratch();
  /** 矢印の 置き場に 使う 落ちついた 分割の 四角（切りかえの とちゅうの 四角は 使わない） */
  private readonly settledScratch = newViewRectsScratch();
  private rc: ViewRects = this.scratch.out;
  /** 描く ときの 入れもの(毎コマ 新しく 作らない) */
  private readonly draw: DuoDrawState = { rc: this.scratch.out, fogFar: null };
  private readonly qOut = { x: 0, y: 0 };
  /** 時計の 箱（矢印が よける。毎ステップ 同じ 入れものに 書く） */
  private readonly clockBox: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private active = false;
  private readonly pose: P2Pose = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
  /** 画面に つかう 2P の カメラ（止め・ゆれ 入り。毎ステップ 同じ 入れものに 書く） */
  private readonly view2: P2CamView = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, shakeYaw: 0, shakePitch: 0, shakeRoll: 0 };
  private cam2Yaw = 0;
  private cam2Cam: DuoVec3 = { x: 0, y: 0, z: 0 };
  private readonly v = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly ndc = { x: 0, y: 0 };
  /** 毎ステップ 使いまわす 入力（新しい 物を 作らない） */
  private readonly camIn: P2CameraInput = { screenYawDeg: 0, lookDeltaDeg: 0 };
  private readonly arrowIn: ArrowStepInput = { rel: { right: 0, up: 0, forward: 0 }, distance: 0, pane: { x: 0, y: 0, w: 0, h: 0 }, tanHalfFovY: 1, panelOpen: false };
  private saved: { micro: number; shadow: boolean | null } | null = null;
  private lightOn = false;
  readonly hud: DuoHudView = {
    meter: 0,
    distance: 0,
    padLost: false,
    view: 'one',
    arrows: [
      { x: 0, y: 0, angle: 0, opacity: 0 },
      { x: 0, y: 0, angle: 0, opacity: 0 },
    ],
    arrowHeight: 0,
    question: null,
  };

  constructor(private readonly d: DuoViewsDeps) {
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.machine = new DuoViewMachine({ reducedMotion: this.reduced });
    this.arrows = [new DuoArrowTracker({ who: 1, reducedMotion: this.reduced }), new DuoArrowTracker({ who: 2, reducedMotion: this.reduced })];
    this.vr = new DuoViewRenderer(d.game.renderer, d.game.scene, d.game.camera, d.beforePane, d.afterPane);
    d.game.setViewPass({
      active: () => this.active,
      render: () => {
        const dr = this.draw;
        dr.rc = this.rc;
        // 輪が 2 つの あいだは 描く 範囲に かすみを 合わせる（世界の ふちが 見えない ように）
        dr.fogFar = this._rings === 2 ? (getRing().draw + 1) * 16 : null;
        this.vr.render(dr);
      },
    });
  }

  get view(): DuoView {
    return this.machine.view;
  }
  get light(): boolean {
    return this._light;
  }
  get rings(): 1 | 2 {
    return this._rings;
  }

  /** `duo.arrow(who)`: その 人の 半分に 出ている 相手の 向きの 矢印（コピー）。出ていない → null */
  arrow(who: 1 | 2): DuoArrow | null {
    const a = this.arrows[who - 1]!.arrow();
    return a === null ? null : { x: a.x, y: a.y, angle: a.angle, color: a.color };
  }

  private readonly vs = { w: 0, h: 0 };
  /** 状態機械へ 渡す 入れもの（毎ステップ 新しく 作らない） */
  private readonly machineIn = { joined: false };

  /** 2P の 向きと 歩く 向き(P2Camera)。PlayerController.update の 前に 呼ぶ */
  camStep(screenYawDeg: number, lookDeltaDeg: number): P2CameraOutput {
    const ci = this.camIn;
    ci.screenYawDeg = screenYawDeg;
    ci.lookDeltaDeg = lookDeltaDeg;
    const out = this.p2cam.step(ci);
    this.lastCamYaw = out.camYawDeg;
    return out;
  }

  /**
   * 毎ステップ（2P の 更新の あと）。inp = null は 2P が いない: ようす・軽くする 工夫・矢印の 数えだけ すすめる
   * （やめた あとも 軽くする 工夫は 120 ステップ のこる。作りなおさない）。
   */
  update(inp: DuoViewsInput | null): void {
    this.machineIn.joined = inp !== null;
    const r = this.machine.step(this.machineIn);
    if (r.switched) this.from = this.prevView;
    this.prevView = r.view;
    this.setLight(this.gate.step(r.view));
    if (inp === null) {
      this.active = false;
      this.arrows[0].step(null);
      this.arrows[1].step(null);
      return;
    }
    const { game } = this.d;
    const cam = game.camera;
    const vs = game.viewSize(this.vs);
    const W = vs.w;
    const H = vs.h;
    const view = r.view;

    // 区画
    const t = this.machine.transition();
    this.rc = viewRects(this.from, view, t.active ? t.progress : 1, W, H, this.scratch);
    this.active = view !== 'one' || t.active;

    // 2P の カメラ（いつも 自分の カメラ。1P と 同じ 決まり）
    const cam2 = this.vr.camera2;
    cam2.fov = cam.fov;
    cam2.near = cam.near;
    cam2.far = cam.far;
    // COOP-1 4d-0: きょりは 2P の カメラの 口から（よせ・引き）。止めの ステップは 止まる 直前の ポーズ、ゆれは 向きに 足す
    p2CameraPose(inp.p2, this.lastCamYaw, inp.p2PitchDeg, this.d.fx2.distance(), this.d.isSolid, this.pose, inp.p2EyeDrop);
    const pv = this.d.fx2.apply(this.pose, this.view2);
    cam2.position.set(pv.x, pv.y, pv.z);
    cam2.rotation.order = 'YXZ';
    cam2.rotation.set((pv.pitchDeg * Math.PI) / 180 + pv.shakePitch, (-pv.yawDeg * Math.PI) / 180 + pv.shakeYaw, pv.shakeRoll);
    this.cam2Yaw = pv.yawDeg;
    cam.updateMatrixWorld();
    cam2.updateMatrixWorld();
    this.cam2Cam.x = cam2.position.x;
    this.cam2Cam.y = cam2.position.y;
    this.cam2Cam.z = cam2.position.z;

    // 世界: 輪の 数と 2P の 列
    this._rings = decideRings(this._rings, inp.distance);
    if (this._rings === 2) this.d.host.setSecond(Math.floor(inp.p2.x) >> 4, Math.floor(inp.p2.z) >> 4);
    else this.d.host.clearSecond();
    this.d.renderer.setViewer2(inp.p2.x, inp.p2.z);

    // 相手の 向きの 矢印
    const h = this.hud;
    h.arrowHeight = arrowHeightPx(H);
    this.stepArrows(inp, W, H);
    h.view = view;
    h.question = inp.padLost ? this.questionAt(inp, W, H) : null;
  }

  /** 1P の 半分は 2P を、2P の 半分は 1P を 自分の カメラで 映して 矢印を すすめる。四角は 落ちついた 分割（切りかえの とちゅうでも かえない） */
  private stepArrows(inp: DuoViewsInput, W: number, H: number): void {
    const split = viewRects('split', 'split', 1, W, H, this.settledScratch);
    const ai = this.arrowIn;
    ai.distance = inp.distance;
    const body = DUO_TUNING.arrowBodyCenterTiles;
    for (let who = 1; who <= 2; who++) {
      const cam: THREE.PerspectiveCamera = who === 1 ? this.d.game.camera : this.vr.camera2;
      const from = who === 1 ? inp.p2 : inp.p1;
      this.inv.copy(cam.matrixWorld).invert();
      const v = this.v.set(from.x, from.y + body, from.z).applyMatrix4(this.inv);
      ai.rel.right = v.x;
      ai.rel.up = v.y;
      ai.rel.forward = -v.z;
      const pane = who === 1 ? split.main : split.second!;
      ai.pane.x = pane.x;
      ai.pane.y = pane.y;
      ai.pane.w = pane.w;
      ai.pane.h = pane.h;
      ai.tanHalfFovY = Math.tan((cam.fov * Math.PI) / 360);
      ai.panelOpen = who === 2 ? inp.panelOpen : inp.panel1Open;
      // 1.17: 矢印は その 半分の 時計の 箱を よける（時計は 各半分の 外がわの 上すみ）
      const size = this.d.clockSize(who as 1 | 2);
      ai.avoid = size ? clockBoxAt(split, who as 1 | 2, size, this.clockBox) : null;
      const tr = this.arrows[who - 1]!;
      tr.step(ai);
      const ha = this.hud.arrows[who - 1]!;
      const last = tr.last();
      ha.x = last.x;
      ha.y = last.y;
      ha.angle = last.angle;
      ha.opacity = tr.opacity();
    }
  }

  private prevView: DuoView = 'one';

  /** 2P の カメラの 向き: 直前の camStep の 結果 */
  private lastCamYaw = 0;

  /** 2P の 頭の 上の「？」の 画面の 位置。2P を 映す 区画の 中に おさめる */
  private questionAt(inp: DuoViewsInput, W: number, H: number): { x: number; y: number } | null {
    const cam: THREE.PerspectiveCamera = this.rc.second && this.rc.second.w > 0 && this.machine.view !== 'one' ? this.vr.camera2 : this.d.game.camera;
    const pane: Rect = this.machine.view !== 'one' && this.rc.second ? this.rc.second : this.rc.main;
    const aspect0 = cam.aspect;
    cam.aspect = pane.w / Math.max(1, pane.h);
    cam.updateProjectionMatrix();
    this.inv.copy(cam.matrixWorld).invert();
    const ok = this.project(cam, inp.p2.x, inp.p2.y + DUO_TUNING.questionHeightTiles, inp.p2.z);
    cam.aspect = aspect0;
    cam.updateProjectionMatrix();
    let x = pane.x + pane.w / 2;
    let y = pane.y + pane.h * 0.4;
    if (ok) {
      x = pane.x + ((this.ndc.x + 1) / 2) * pane.w;
      y = pane.y + ((1 - this.ndc.y) / 2) * pane.h;
    }
    // おさめる: 左右は 区画の 中、上下は メーターの 下 〜 ホットバーの 上
    x = Math.min(pane.x + pane.w - 30, Math.max(pane.x + 30, x));
    y = Math.min(H * 0.6, Math.max(H * 0.2, y));
    this.qOut.x = Math.min(W - 30, Math.max(30, x));
    this.qOut.y = y;
    return this.qOut;
  }

  /** 世界の 点を cam で 映す。前にあれば true で this.ndc に -1〜1。うしろなら false（this.v に カメラ空間の 点） */
  private project(cam: THREE.PerspectiveCamera, x: number, y: number, z: number): boolean {
    const v = this.v;
    v.set(x, y, z).applyMatrix4(this.inv);
    if (v.z >= 0) return false;
    const cx = v.x;
    const cy = v.y;
    v.applyMatrix4(cam.projectionMatrix);
    this.ndc.x = v.x;
    this.ndc.y = v.y;
    v.x = cx;
    v.y = cy;
    return true;
  }

  /** 軽くする 工夫（分割の あいだだけ。§7.2）: 小ブロックは 近い 16 マスだけ・影を 切る。元に 戻すときは 元の 値 */
  private setLight(on: boolean): void {
    this._light = on;
    if (on === this.lightOn) return;
    this.lightOn = on;
    const cfg = this.d.renderer.config;
    const sys = this.d.shadow();
    if (on) {
      this.saved = { micro: cfg.microRadius, shadow: sys ? sys.enabled : null };
      if (cfg.microRadius > DUO_TUNING.lightMicroRadiusTiles) cfg.microRadius = normalizeMicroR(DUO_TUNING.lightMicroRadiusTiles);
      if (sys) sys.enabled = false;
    } else if (this.saved) {
      if (cfg.microRadius === normalizeMicroR(DUO_TUNING.lightMicroRadiusTiles)) cfg.microRadius = this.saved.micro;
      if (sys && this.saved.shadow !== null) sys.enabled = this.saved.shadow;
      this.saved = null;
    }
  }

  /** 2P の カメラ（小太刀の 斬撃の 向き・2P の パリィの 火花の 向きを 2P の 画面で 決める ため。いつも 同じ 1 つ） */
  camera2(): THREE.PerspectiveCamera {
    return this.vr.camera2;
  }

  /** 2P の 半分の 区画（CSS px。ふきだしを おさめる 所。COOP-1 5d）。落ちついた 左右の 2 つ目。使いまわしの 入れ物を 返す（毎回 作らない） */
  pane2(): { x: number; y: number; w: number; h: number } {
    const vs = this.d.game.viewSize(this.vs);
    return viewRects('split', 'split', 1, vs.w, vs.h, this.settledScratch).second ?? this.settledScratch.second;
  }

  /** 2P が いる あいだの 区画（`duo.viewports()`。CSS px）: 参加した ステップから いつも 落ちついた 左右（見せ方の とちゅうの 四角ではなく） */
  viewports(p1Yaw: number): DuoViewport[] {
    const cam = this.d.game.camera.position;
    // 参加した 直後は まだ stepArrows が 回っていない: ここで 落ちついた 左右を その場で 出す
    const vs = this.d.game.viewSize(this.vs);
    const sp = viewRects('split', 'split', 1, vs.w, vs.h, this.settledScratch);
    return [
      { who: 1, ...sp.main, camera: { x: cam.x, y: cam.y, z: cam.z }, yawDeg: p1Yaw },
      { who: 2, ...sp.second!, camera: { ...this.cam2Cam }, yawDeg: this.cam2Yaw },
    ];
  }

  /**
   * 2P が いなく なった: 1 人の 見た目へ もどす（輪・2P の 区画・矢印）。軽くする 工夫と ようすの 状態機械は 作りなおさない
   * （工夫は 120 ステップ あとに もどる。つぎの update(null) で ようすが 1 人の 全面に なる）。
   */
  reset(): void {
    this._rings = 1;
    this.active = false;
    this.d.host.clearSecond();
    this.d.renderer.clearViewer2();
    this.hud.question = null;
    this.hud.view = 'one';
    for (const a of this.hud.arrows) a.opacity = 0;
  }
}
