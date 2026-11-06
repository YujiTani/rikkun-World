// 2 人で あそぶ（COOP-1 作業 2。#399）: 画面の ようす（1 画面・ルーペ・分割）・2P の カメラ・世界 2 か所・軽くする 工夫を まとめる。
import * as THREE from 'three';
import { DuoLightGate } from '../../duo/light';
import { loupeLayout, type LoupeBox } from '../../duo/loupe';
import { P2Camera, type P2CameraOutput } from '../../duo/p2Camera';
import { p2CameraPose, type P2Pose } from '../../duo/p2Pose';
import { DUO_TUNING } from '../../duo/tuning';
import type { DuoTier, DuoVec3, DuoView, DuoViewport } from '../../duo/types';
import { DuoViewMachine } from '../../duo/view';
import { DuoViewRenderer } from '../../duo/viewRender';
import { viewRects, type Rect, type ViewRects } from '../../duo/viewRects';
import { decideRings } from '../../world/stream/layout';
import { normalizeMicroR } from '../../world/render/voxel/tier';
import type { WorldRenderer } from '../../world/render/WorldRenderer';
import type { ShadowSystem } from '../../world/render/shadow/ShadowSystem';
import type { StreamHost } from '../../world/stream/StreamHost';
import type { Game } from '../Game';
import type { DuoHudView } from '../../ui/duoHud';

export interface DuoViewsDeps {
  game: Game;
  renderer: WorldRenderer;
  host: StreamHost;
  isSolid: (x: number, y: number, z: number) => boolean;
  shadow: () => ShadowSystem | null;
  /** 2 人の カメラの 距離（なめらかに かわる 今の 値。ルーペの 描く 範囲に 足す） */
  cameraDistance: () => number;
}

/** 毎ステップ 渡す 2 人の 状態 */
export interface DuoViewsInput {
  p1: DuoVec3;
  p2: DuoVec3;
  p1YawDeg: number;
  p2PitchDeg: number;
  distance: number;
  padLost: boolean;
}

export class DuoViews {
  readonly p2cam = new P2Camera();
  private machine: DuoViewMachine;
  private gate = new DuoLightGate();
  private readonly vr: DuoViewRenderer;
  private readonly reduced: boolean;
  private from: DuoView = 'one';
  private _tier: DuoTier = 0;
  private _light = false;
  private _rings: 1 | 2 = 1;
  private loupeBox: LoupeBox | null = null;
  private rc: ViewRects = { main: { x: 0, y: 0, w: 1, h: 1 }, second: null, circle: false };
  private active = false;
  private readonly pose: P2Pose = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
  private cam2Yaw = 0;
  private cam2Cam: DuoVec3 = { x: 0, y: 0, z: 0 };
  private readonly v = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private readonly ndc = { x: 0, y: 0 };
  private dirX = 1;
  private dirY = 0;
  private saved: { micro: number; shadow: boolean | null } | null = null;
  private lightOn = false;
  readonly hud: DuoHudView = {
    tier: 0,
    meter: 0,
    distance: 0,
    padLost: false,
    quitGauge: 0,
    panelOpen: false,
    view: 'one',
    loupe: null,
    loupeBorderPx: 4,
    arrowDeg: 0,
    question: null,
  };

  constructor(private readonly d: DuoViewsDeps) {
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.machine = new DuoViewMachine({ reducedMotion: this.reduced });
    this.vr = new DuoViewRenderer(d.game.renderer, d.game.scene, d.game.camera);
    d.game.setViewPass({
      active: () => this.active,
      render: () => this.vr.render({ rc: this.rc, loupeFar: DUO_TUNING.loupeDrawTiles + this.d.cameraDistance() }),
    });
  }

  get view(): DuoView {
    return this.machine.view;
  }
  get tier(): DuoTier {
    return this._tier;
  }
  get light(): boolean {
    return this._light;
  }
  get rings(): 1 | 2 {
    return this._rings;
  }
  /** `duo.state().loupe`（ルーペが 出ている ときの 位置と 直径） */
  loupe(): { x: number; y: number; d: number } | null {
    return this.machine.view === 'loupe' && this.loupeBox ? { x: this.loupeBox.x, y: this.loupeBox.y, d: this.loupeBox.d } : null;
  }

  /** 2P の 向きと 歩く 向き(P2Camera)。PlayerController.update の 前に 呼ぶ */
  camStep(screenYawDeg: number, lookDeltaDeg: number, stickHeld: boolean): P2CameraOutput {
    const out = this.p2cam.step({ view: this.machine.view, screenYawDeg, lookDeltaDeg, stickHeld });
    this.lastCamYaw = out.camYawDeg;
    return out;
  }

  /** 毎ステップ（2P の 更新の あと）。ようす・色の 段・輪・軽くする 工夫・カメラ・HUD の 値を 決める */
  update(inp: DuoViewsInput): void {
    const { game } = this.d;
    const cam = game.camera;
    const W = game.renderer.domElement.clientWidth || window.innerWidth;
    const H = game.renderer.domElement.clientHeight || window.innerHeight;
    cam.updateMatrixWorld();
    this.inv.copy(cam.matrixWorld).invert();
    // 2P の 足もとを 1P の カメラで 映す（外 = ルーペ）
    const inFront = this.project(cam, inp.p2.x, inp.p2.y, inp.p2.z);
    const r = this.machine.step({ distance: inp.distance, p2Ndc: inFront ? this.ndc : null });
    if (r.switched) this.from = this.prevView;
    this.prevView = r.view;
    this._tier = r.tier;
    const view = r.view;
    this.setLight(this.gate.step(view));

    // 2P の いる 方向（画面の まん中から。うしろ・真上下は 下向き）
    const vx = this.v.x;
    const vy = this.v.y;
    this.dirX = inFront ? this.ndc.x : vx;
    this.dirY = inFront ? -this.ndc.y : -vy + 1e-3;
    if (!inFront && Math.abs(vx) < 1e-4 && Math.abs(this.dirY) < 1e-2) this.dirY = 1;
    this.loupeBox = loupeLayout({ width: W, height: H, dirX: this.dirX, dirY: this.dirY, tier: r.tier });

    // 区画
    const t = this.machine.transition();
    const loupeRect: Rect = { x: this.loupeBox.x - this.loupeBox.d / 2, y: this.loupeBox.y - this.loupeBox.d / 2, w: this.loupeBox.d, h: this.loupeBox.d };
    this.rc = viewRects(this.from, view, t.active ? t.progress : 1, W, H, loupeRect);
    this.active = view !== 'one' || t.active;

    // 2P の カメラ: 分割が からむ あいだは 自分の カメラ、ルーペは 大きい 画面を 2P の 位置へ ずらした 物
    const cam2 = this.vr.camera2;
    cam2.fov = cam.fov;
    cam2.near = cam.near;
    cam2.far = cam.far;
    const splitPose = view === 'split' || (t.active && this.from === 'split');
    if (splitPose) {
      p2CameraPose(inp.p2, this.lastCamYaw, inp.p2PitchDeg, DUO_TUNING.cameraSplit, this.d.isSolid, this.pose);
      cam2.position.set(this.pose.x, this.pose.y, this.pose.z);
      cam2.rotation.order = 'YXZ';
      cam2.rotation.set((this.pose.pitchDeg * Math.PI) / 180, (-this.pose.yawDeg * Math.PI) / 180, 0);
      this.cam2Yaw = this.pose.yawDeg;
    } else {
      cam2.position.set(cam.position.x + (inp.p2.x - inp.p1.x), cam.position.y + (inp.p2.y - inp.p1.y), cam.position.z + (inp.p2.z - inp.p1.z));
      cam2.quaternion.copy(cam.quaternion);
      this.cam2Yaw = inp.p1YawDeg;
    }
    cam2.updateMatrixWorld();
    this.cam2Cam.x = cam2.position.x;
    this.cam2Cam.y = cam2.position.y;
    this.cam2Cam.z = cam2.position.z;

    // 世界: 輪の 数と 2P の 列
    this._rings = decideRings(this._rings, inp.distance);
    this.d.host.setSecond(this._rings === 2 ? { cx: Math.floor(inp.p2.x) >> 4, cz: Math.floor(inp.p2.z) >> 4 } : null);
    this.d.renderer.setViewer2({ x: inp.p2.x, z: inp.p2.z });

    // HUD
    const h = this.hud;
    h.tier = r.tier;
    h.view = view;
    const sec = this.rc.second;
    if (this.rc.circle && sec) {
      h.loupe = { x: sec.x + sec.w / 2, y: sec.y + sec.h / 2, d: sec.w };
      h.loupeBorderPx = DUO_TUNING.loupeBorderPx[r.tier];
      h.arrowDeg = (Math.atan2(this.dirY, this.dirX) * 180) / Math.PI;
    } else h.loupe = null;
    h.question = inp.padLost ? this.questionAt(inp, W, H) : null;
  }

  private prevView: DuoView = 'one';

  /** 分割の カメラの 向き: 直前の camStep の 結果 */
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
    return { x: Math.min(W - 30, Math.max(30, x)), y };
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

  /** いま 描いている 区画（`duo.viewports()`。CSS px） */
  viewports(p1Yaw: number): DuoViewport[] {
    const cam = this.d.game.camera.position;
    const out: DuoViewport[] = [{ who: 1, ...this.rc.main, camera: { x: cam.x, y: cam.y, z: cam.z }, yawDeg: p1Yaw }];
    if (this.rc.second) out.push({ who: 2, ...this.rc.second, camera: { ...this.cam2Cam }, yawDeg: this.cam2Yaw });
    return out;
  }

  /** 2P が いなく なった: 1 人の 見た目へ もどす（輪・軽くする 工夫・カメラ） */
  reset(): void {
    this.setLight(false);
    this.machine = new DuoViewMachine({ reducedMotion: this.reduced });
    this.gate = new DuoLightGate();
    this.from = 'one';
    this.prevView = 'one';
    this._tier = 0;
    this._rings = 1;
    this.active = false;
    this.loupeBox = null;
    this.rc = { main: { x: 0, y: 0, w: 1, h: 1 }, second: null, circle: false };
    this.d.host.setSecond(null);
    this.d.renderer.setViewer2(null);
    this.hud.loupe = null;
    this.hud.question = null;
    this.hud.view = 'one';
  }
}
