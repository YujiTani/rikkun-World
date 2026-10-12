import * as THREE from 'three';
import type { ArmorSlot, CombatEvent, CraftEvent, ItemId, PlayerState, SwingAnim, VoxelWorld } from '../contracts';
import type { ActionState } from '../input/actions';
import { BlockDoll } from './BlockDoll';
import {
  DEFAULT_CAMERA_CONFIG,
  DOLL_HIDE_DISTANCE,
  OVERVIEW_POSITION,
  OVERVIEW_TARGET,
  RAY_STEP,
  WALL_MARGIN,
  WALL_RECOVER_SECONDS,
  type CameraConfig,
} from './config';

const DEG = Math.PI / 180;

export type ViewMode = 'first' | 'third';

/** 一人称／三人称／見下ろしのカメラ。プレイヤーの更新のあとに update(dt) を呼ぶ。 */
export class CameraRig {
  /** 数値。settings.set で書きかえてよい */
  readonly config: CameraConfig;
  readonly doll = new BlockDoll();
  private view: ViewMode = 'first';
  private overviewOn = false;
  /** 壁よけ後の今のカメラまでの距離（目から）。-1 = 次の更新でぴったり合わせる */
  private current = -1;
  private fogBackup: THREE.Scene['fog'] = null;
  private fogStashed = false;
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private distToEye = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    private readonly world: VoxelWorld,
    private readonly getState: () => PlayerState,
    private readonly actions: ActionState,
    config: Partial<CameraConfig> = {},
  ) {
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };
    this.camera.rotation.order = 'YXZ';
    scene.add(this.doll.group);
    this.doll.setMode('hidden');
    this.apply(0);
  }

  private shakeYaw = 0;
  private shakePitch = 0;
  /** 画面のごく弱いゆれ（ラジアン。演出用。0 で元に戻る）。次の更新から効く */
  setShake(yaw: number, pitch: number): void {
    this.shakeYaw = yaw;
    this.shakePitch = pitch;
  }

  private heldProvider: (() => ItemId | null) | null = null;
  private readonly tmpHeld = new THREE.Vector3();

  /** 右手に持つアイテムを返す関数（持ち物の held()）。毎ステップ読む */
  setHeldProvider(fn: () => ItemId | null): void {
    this.heldProvider = fn;
  }

  /** 今、右手に持っているアイテム */
  heldItemNow(): ItemId | null {
    if (this.heldProvider) this.doll.setHeld(this.heldProvider());
    return this.doll.heldItem;
  }

  /** 持ったブロックの中心の画面上の位置（左上 0・右下 1。画面の外なら範囲外）。持っていなければ null */
  heldScreen(): { x: number; y: number } | null {
    if (this.heldProvider) this.doll.setHeld(this.heldProvider());
    const p = this.doll.heldWorldPosition(this.tmpHeld);
    if (!p) return null;
    this.camera.updateMatrixWorld(true);
    p.project(this.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  private swingSource: (() => { anim: SwingAnim; tick: number }[]) | null = null;
  private armorProvider: ((slot: ArmorSlot) => ItemId | null) | null = null;

  /** うでの動きの合図を返す関数（ToolSystem.drainSwings）。毎ステップ呼ぶ */
  setSwingSource(fn: () => { anim: SwingAnim; tick: number }[]): void {
    this.swingSource = fn;
  }
  /** 着ている防具を返す関数（ArmorSystem.equipped）。変わったら人形に着せて「カシャ」 */
  setArmorProvider(fn: (slot: ArmorSlot) => ItemId | null): void {
    this.armorProvider = fn;
    this.doll.setArmor(fn('head'), fn('body'));
  }
  /** つくれた・焼けた出来事を人形に伝える（呼ぶ側が drain した出来事をそのまま渡す） */
  onCraftEvent(e: CraftEvent): void {
    if (e.type === 'craft') this.doll.play('banzai');
    else if (e.type === 'bakeDone') this.doll.play('cheer');
  }
  /** ダメージ（ふせがなかったとき）・おとしもの ぶくろ を拾った出来事を人形に伝える */
  onCombatEvent(e: CombatEvent): void {
    if (e.type === 'playerHit') {
      if (e.amount > 0 && (e as { blocked?: boolean }).blocked !== true) this.doll.hurt();
    } else if (e.type === 'pickup') this.doll.play('pickup');
  }

  private pumpSwings(): void {
    if (!this.swingSource) return;
    for (const sw of this.swingSource()) {
      switch (sw.anim) {
        case 'whiff':
          this.doll.play('punch');
          break;
        case 'dig':
          // ほるのは setDigging がくりかえす。すでに dig なら つくりなおさない
          if (this.doll.armAnim !== 'dig') this.doll.play('dig');
          break;
        default:
          this.doll.play(sw.anim);
      }
    }
  }

  private pumpArmor(): void {
    if (!this.armorProvider) return;
    const head = this.armorProvider('head');
    const body = this.armorProvider('body');
    const prevH = this.doll.armorWorn('head');
    const prevB = this.doll.armorWorn('body');
    if (head === prevH && body === prevB) return;
    this.doll.setArmor(head, body);
    if ((head !== null && head !== prevH) || (body !== null && body !== prevB)) this.doll.play('equip');
  }

  getView(): ViewMode {
    return this.view;
  }
  isOverview(): boolean {
    return this.overviewOn;
  }
  /** ＋の印を出すか（見下ろしでは出さない） */
  crosshairVisible(): boolean {
    return !this.overviewOn;
  }

  toggleView(): void {
    this.view = this.view === 'first' ? 'third' : 'first';
    this.current = -1;
    this.apply(0);
  }

  overview(on: boolean): void {
    if (on === this.overviewOn) return;
    this.overviewOn = on;
    if (on) {
      if (!this.fogStashed) {
        this.fogBackup = this.scene.fog;
        this.fogStashed = true;
      }
      this.scene.fog = null;
    } else if (this.fogStashed) {
      this.scene.fog = this.fogBackup;
      this.fogBackup = null;
      this.fogStashed = false;
    }
    this.current = -1;
    // 見下ろしは霧がなく遠くまで見えるので、海のふちが切れないよう far を伸ばす
    const far = on ? 1500 : 500;
    if (this.camera.far !== far) {
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    this.apply(0);
  }

  update(dt: number): void {
    if (this.actions.wasPressed('toggleView')) this.toggleView();
    this.pumpSwings();
    this.pumpArmor();
    this.apply(dt);
  }

  getInfo() {
    return {
      view: this.view,
      overview: this.overviewOn,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      eye: { x: this.eye.x, y: this.eye.y, z: this.eye.z },
      distanceToEye: this.distToEye,
    };
  }

  private apply(dt: number): void {
    const s = this.getState();
    const cfg = this.config;
    if (this.camera.fov !== cfg.fov) {
      this.camera.fov = cfg.fov;
      this.camera.updateProjectionMatrix();
    }
    this.eye.set(s.position.x, s.position.y + cfg.eyeHeight, s.position.z);

    const yaw = s.yawDeg * DEG;
    const pitch = s.pitchDeg * DEG;
    // 見ている向き D（yaw 0 = 北 -Z、上から見て時計回り）
    this.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

    if (this.overviewOn) {
      this.camera.position.set(OVERVIEW_POSITION.x, OVERVIEW_POSITION.y, OVERVIEW_POSITION.z);
      this.camera.lookAt(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z);
      this.camPos.copy(this.camera.position);
    } else {
      this.camera.rotation.set(pitch + this.shakePitch, -yaw + this.shakeYaw, 0);
      if (this.view === 'first') {
        this.camPos.copy(this.eye);
      } else {
        this.placeThird(dt);
      }
      this.camera.position.copy(this.camPos);
    }
    this.distToEye = this.camPos.distanceTo(this.eye);

    if (this.heldProvider) this.doll.setHeld(this.heldProvider());
    if (this.overviewOn) this.doll.setMode('hidden');
    else if (this.view === 'first') this.doll.setMode('first');
    else this.doll.setMode(this.distToEye >= DOLL_HIDE_DISTANCE ? 'third' : 'hidden');
    this.doll.update(dt, s.position, s.yawDeg, s.pitchDeg, s.moving && s.onGround, s.onGround);
  }

  private placeThird(dt: number): void {
    const cfg = this.config;
    // 回転の中心 P = 目 + (0, 0.5, 0)。カメラ = P - 距離 × D
    const cx = this.eye.x - cfg.thirdPersonDistance * this.dir.x;
    const cy = this.eye.y + cfg.thirdPersonHeight - cfg.thirdPersonDistance * this.dir.y;
    const cz = this.eye.z - cfg.thirdPersonDistance * this.dir.z;
    const dx = cx - this.eye.x;
    const dy = cy - this.eye.y;
    const dz = cz - this.eye.z;
    const full = Math.hypot(dx, dy, dz);

    // 目からカメラへの線分で最初にぶつかるブロック
    let allowed = full;
    if (full > 1e-6) {
      const hit = this.firstSolidDistance(dx / full, dy / full, dz / full, full);
      if (hit !== null) allowed = Math.max(0, hit - WALL_MARGIN);
    }
    if (this.current < 0 || allowed < this.current) {
      this.current = allowed; // 寄せるのは一瞬
    } else {
      this.current = Math.min(allowed, this.current + (full / WALL_RECOVER_SECONDS) * dt);
    }
    const k = full > 1e-6 ? this.current / full : 0;
    this.camPos.set(this.eye.x + dx * k, this.eye.y + dy * k, this.eye.z + dz * k);
  }

  /** 目から (ux,uy,uz) の向きへ進んで、固いブロックに入る最初の距離。なければ null */
  private firstSolidDistance(ux: number, uy: number, uz: number, maxLen: number): number | null {
    const w = this.world;
    const solidAt = (t: number) =>
      w.isSolid(
        Math.floor(this.eye.x + ux * t),
        Math.floor(this.eye.y + uy * t),
        Math.floor(this.eye.z + uz * t),
      );
    if (solidAt(0)) return 0;
    for (let t = RAY_STEP; t < maxLen; t += RAY_STEP) {
      if (solidAt(t)) return t - RAY_STEP / 2;
    }
    return solidAt(maxLen) ? maxLen : null;
  }

  dispose(): void {
    this.scene.remove(this.doll.group);
    this.doll.dispose();
  }
}
