import * as THREE from 'three';
import type { Vec3, WeaponVisualSource, ArmorSlot, CombatEvent, CraftEvent, ItemId, PlayerState, SwingAnim, VoxelWorld } from '../contracts';
import type { ActionState } from '../input/actions';
import { aimPivot } from './pivot';
import { SHAKE, shakeAngles } from '../fx/impact';
import { BlockDoll } from './BlockDoll';
import { bladePoseAt, bowDollAt, bowHandAt, newBladePose } from './weaponPose';
import {
  DEFAULT_CAMERA_CONFIG,
  BODY_CENTER_HEIGHT,
  DOLL_HIDE_DISTANCE,
  OVERVIEW_POSITION,
  OVERVIEW_TARGET,
  RAY_STEP,
  SHOULDER_DROP,
  SHOULDER_OFFSET,
  SHOULDER_RECOVER_SECONDS,
  SHOULDER_WALL_MARGIN,
  WALL_MARGIN,
  WALL_RECOVER_SECONDS,
  type CameraConfig,
} from './config';

const DEG = Math.PI / 180;

/** CHAR-1 第 5 版: 一人称はなくなった。いつも 'third' */
export type ViewMode = 'third';

/** 三人称／見下ろしのカメラ（CHAR-1 §4.1）。プレイヤーの更新のあとに update(dt) を呼ぶ。 */
export class CameraRig {
  /** 数値。settings.set で書きかえてよい */
  readonly config: CameraConfig;
  readonly doll = new BlockDoll();
  private readonly view: ViewMode = 'third';
  private overviewOn = false;
  /** スクショ・テスト用: キャラ を かくす（`camera.hideDoll`）。ふだん は false */
  private dollForcedHidden = false;
  /** 壁よけ後の今のカメラまでの距離（P から）。-1 = 次の更新でぴったり合わせる */
  private current = -1;
  private fogBackup: THREE.Scene['fog'] = null;
  private fogStashed = false;
  private readonly eye = new THREE.Vector3();
  private readonly pivot = { x: 0, y: 0, z: 0 };
  private readonly dir = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  /** 肩の点 S（カメラの回転の中心・ねらいの線の出どころ）。固定ステップで決める */
  private readonly shoulder = { x: 0, y: 0, z: 0 };
  /** 壁ぎわで s に かける上限（壁がなければ 十分大きい値）。小さくなるのは一瞬・もどりは 0.25 秒 */
  private shoulderCap = Infinity;
  private shoulderS = SHOULDER_OFFSET;
  private distToEye = 0;
  private distToPivot = 0;
  private distToBody = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    private readonly world: VoxelWorld,
    private readonly getState: () => PlayerState,
    /** 受け取るだけ（V キーはなくなった）。呼ぶ側の形を変えないために残す */
    readonly actions: ActionState,
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

  /** #276 画面の ゆれ（0〜1）。当たるたびに 足し、毎秒 SHAKE.decayPerSecond ずつ へる。カメラの 向きだけ ゆらす */
  private trauma = 0;
  private shakeT = 0;
  private baseYaw = 0;
  private basePitch = 0;
  private readonly shakeOut = { yaw: 0, pitch: 0, roll: 0 };

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  traumaNow(): number {
    return this.trauma;
  }
  /** ゆれの 時間を 進めて trauma を へらす（ヒットストップ中も 呼ぶ） */
  private stepShake(dt: number): void {
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - SHAKE.decayPerSecond * dt);
    shakeAngles(this.trauma, this.shakeT, this.shakeOut);
  }
  /** ヒットストップで 世界が 止まっている ステップ: カメラの 向きの ゆれだけ 動かす（位置・人形・ねらいは そのまま） */
  updateFrozen(dt: number): void {
    this.stepShake(dt);
    if (this.overviewOn) return;
    const o = this.shakeOut;
    this.camera.rotation.set(this.basePitch + this.shakePitch + o.pitch, this.baseYaw + this.shakeYaw + o.yaw, o.roll);
  }

  private heldProvider: (() => ItemId | null) | null = null;

  /** 右手に持つアイテムを返す関数（持ち物の held()）。毎ステップ読む */
  setHeldProvider(fn: () => ItemId | null): void {
    this.heldProvider = fn;
  }

  /** 今、右手に持っているアイテム */
  heldItemNow(): ItemId | null {
    if (this.heldProvider) this.doll.setHeld(this.heldProvider());
    return this.doll.heldItem;
  }

  /** 一人称がなくなったので いつも null（窓口の形だけ残す） */
  heldScreen(): { x: number; y: number } | null {
    return null;
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
    this.doll.setArmor(fn('head'), fn('body'), fn('arms'), fn('legs'));
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
    } else if (e.type === 'fallHurt') this.doll.hurt();
    else if (e.type === 'pickup') this.doll.play('pickup');
  }

  private weaponSource: WeaponVisualSource | null = null;
  private readonly bladeScratch = newBladePose();
  private readonly bowScratch = { rx: 0, rz: 0, lx: 0, lz: 0, twist: 0 };
  private readonly handScratch = { x: 0, y: 0 };

  /** 刀・弓の今の形を返すもの（つなぎ込みが `{ blade: () => blade.state(), bowPose: () => bow.pose() }` をわたす） */
  setWeaponSource(src: WeaponVisualSource | null): void {
    this.weaponSource = src;
  }

  private bladeNow() {
    const s = this.weaponSource?.blade();
    return s && s.item !== null ? s : null;
  }

  /** 人形の今の形（度）。刀・弓のときは表の値 */
  dollPose() {
    const s = this.bladeNow();
    if (s) {
      const p = bladePoseAt(s, this.bladeScratch)!;
      return {
        rx: p.rx, rz: p.rz, lx: p.lx, lz: p.lz, swordPitch: p.swordPitch, twist: p.twist,
        legFront: { right: p.legFront.right, left: p.legFront.left }, knee: p.knee,
      };
    }
    const w = this.weaponSource?.bowPose();
    if (w && (w.stage > 0 || w.pull > 0.001) && (this.doll.heldItem === 'yumi' || this.doll.heldItem === 'kin_yumi')) {
      const p = bowDollAt(w, this.bowScratch);
      return { rx: p.rx, rz: p.rz, lx: p.lx, lz: p.lz, swordPitch: 0, twist: p.twist, legFront: { right: 0, left: 0 }, knee: 0 };
    }
    const d = this.doll.dollPose;
    return { ...d, legFront: { ...d.legFront } };
  }
  /** 一人称がなくなったので いつも null（窓口の形だけ残す） */
  firstPersonTip(): { x: number; y: number } | null {
    return null;
  }
  bowPose() {
    const w = this.weaponSource?.bowPose();
    return w ? { stage: w.stage, pull: w.pull, bendDeg: w.bendDeg } : { stage: 0 as const, pull: 0, bendDeg: 0 };
  }
  bowHand(): { x: number; y: number } {
    const w = this.weaponSource?.bowPose();
    const h = bowHandAt(w ?? { stage: 0, pull: 0, bendDeg: 0 }, this.handScratch);
    return { x: h.x, y: h.y };
  }
  fov(): number {
    return this.camera.fov;
  }

  private pumpSwings(): void {
    if (!this.swingSource) return;
    const bladeHeld = this.bladeNow() !== null;
    for (const sw of this.swingSource()) {
      // 刀は 形を weaponSource からきめる（わざ・かまえの合図では何もしない）
      if (bladeHeld && sw.anim !== 'throw') continue;
      switch (sw.anim) {
        case 'whiff':
          this.doll.play('punch');
          break;
        case 'dig':
          // ほるのは setDigging がくりかえす。すでに dig なら つくりなおさない
          if (this.doll.armAnim !== 'dig') this.doll.play('dig');
          break;
        case 'kesa':
        case 'kiriage':
        case 'stance':
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
    const arms = this.armorProvider('arms');
    const legs = this.armorProvider('legs');
    const prevH = this.doll.armorWorn('head');
    const prevB = this.doll.armorWorn('body');
    const prevA = this.doll.armorWorn('arms');
    const prevL = this.doll.armorWorn('legs');
    if (head === prevH && body === prevB && arms === prevA && legs === prevL) return;
    this.doll.setArmor(head, body, arms, legs);
    if ((head !== null && head !== prevH) || (body !== null && body !== prevB) || (arms !== null && arms !== prevA) || (legs !== null && legs !== prevL)) {
      this.doll.play('equip');
    }
  }

  getView(): ViewMode {
    return this.view;
  }
  /** スクショ・テスト用: キャラ（人形）を かくす／もどす */
  hideDoll(on: boolean): void {
    this.dollForcedHidden = on;
  }
  isOverview(): boolean {
    return this.overviewOn;
  }
  /** ＋の印を出すか（見下ろしでは出さない） */
  crosshairVisible(): boolean {
    return !this.overviewOn;
  }

  /** 古い呼び出しのために残す。何もしない（一人称はなくなった） */
  toggleView(): void {}

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
    this.pumpSwings();
    this.pumpArmor();
    this.apply(dt);
  }

  /**
   * ねらいの線の出どころ S を `out` に入れる（DigSystem.aimOrigin に `(p, out) => rig.aimOrigin(out)` で渡す）。
   * 値は update() で決めたもの（同じステップの S）。
   */
  aimOrigin(out: Vec3): Vec3 {
    out.x = this.shoulder.x;
    out.y = this.shoulder.y;
    out.z = this.shoulder.z;
    return out;
  }

  getInfo() {
    return {
      view: this.view,
      overview: this.overviewOn,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      eye: { x: this.eye.x, y: this.eye.y, z: this.eye.z },
      /** 回転の中心 P（CHAR-1 §4.1） */
      pivot: { x: this.pivot.x, y: this.pivot.y, z: this.pivot.z },
      /** 肩の点 S（第 5.2 版 §4.1）。ねらいの線の出どころ。カメラはここから 4.0 うしろ */
      shoulder: { x: this.shoulder.x, y: this.shoulder.y, z: this.shoulder.z },
      /** 肩ごしのずらし s（右へ。0.70 × cos(pitch)、壁ぎわでは小さくなる） */
      shoulderOffset: this.shoulderS,
      distanceToEye: this.distToEye,
      distanceToPivot: this.distToPivot,
      /** カメラと からだの中心（足もと + 1.0）の距離。1.2 未満でキャラをかくす */
      distanceToBody: this.distToBody,
      /** キャラ（板・箱人形）をかくす決まりに当たっているか */
      hideChar: this.distToBody < DOLL_HIDE_DISTANCE,
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
    aimPivot(this.world, s.position, this.pivot, cfg.eyeHeight + cfg.thirdPersonHeight, cfg.eyeHeight);

    const yaw = (s.yawDeg + this.testYawOffsetDeg) * DEG;
    const pitch = s.pitchDeg * DEG;
    // 見ている向き D（yaw 0 = 北 -Z、上から見て時計回り）
    this.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

    this.placeShoulder(dt, yaw, pitch);

    if (this.overviewOn) {
      this.camera.position.set(OVERVIEW_POSITION.x, OVERVIEW_POSITION.y, OVERVIEW_POSITION.z);
      this.camera.lookAt(OVERVIEW_TARGET.x, OVERVIEW_TARGET.y, OVERVIEW_TARGET.z);
      this.camPos.copy(this.camera.position);
    } else {
      this.stepShake(dt);
      this.basePitch = pitch;
      this.baseYaw = -yaw;
      const o = this.shakeOut;
      this.camera.rotation.set(pitch + this.shakePitch + o.pitch, -yaw + this.shakeYaw + o.yaw, o.roll);
      this.placeThird(dt);
      this.camera.position.copy(this.camPos);
      if (this.testFixed) {
        const f = this.testFixed;
        this.camera.position.set(f.x, f.y, f.z);
        this.camera.lookAt(f.tx, f.ty, f.tz);
        this.camPos.copy(this.camera.position);
      }
    }
    this.distToEye = this.camPos.distanceTo(this.eye);
    this.distToPivot = Math.hypot(
      this.camPos.x - this.pivot.x,
      this.camPos.y - this.pivot.y,
      this.camPos.z - this.pivot.z,
    );
    this.distToBody = Math.hypot(
      this.camPos.x - s.position.x,
      this.camPos.y - (s.position.y + BODY_CENTER_HEIGHT),
      this.camPos.z - s.position.z,
    );

    if (this.heldProvider) this.doll.setHeld(this.heldProvider());
    if (this.overviewOn) this.doll.setMode('hidden');
    else this.doll.setMode(!this.dollForcedHidden && this.distToBody >= DOLL_HIDE_DISTANCE ? 'third' : 'hidden');
    this.doll.setWeapon(this.weaponSource ? this.bladeNow() : null, this.weaponSource ? this.weaponSource.bowPose() : null);
    this.doll.update(dt, s.position, s.yawDeg, s.pitchDeg, s.moving && s.onGround, s.onGround);
    this.doll.placeFirstPerson(this.camera);
  }

  /** S = P の 0.72 下から カメラの右 R へ s ずらした点。壁ぎわでは s を小さくする（§4.1） */
  private placeShoulder(dt: number, yaw: number, pitch: number): void {
    const P = this.pivot;
    const by = P.y - SHOULDER_DROP;
    const rx = Math.cos(yaw);
    const rz = Math.sin(yaw); // yaw 0 で +X、yaw 90 で +Z
    const full = SHOULDER_OFFSET * Math.cos(pitch);
    const base = { x: P.x, y: by, z: P.z };
    const reachLen = full + SHOULDER_WALL_MARGIN;
    const hit = this.firstSolidDistance(base, rx, 0, rz, reachLen);
    const target = hit !== null ? Math.max(0, hit - SHOULDER_WALL_MARGIN) : Infinity;
    if (target < this.shoulderCap) {
      this.shoulderCap = target; // 小さくするのは一瞬
    } else if (this.shoulderCap !== Infinity) {
      this.shoulderCap += (SHOULDER_OFFSET / SHOULDER_RECOVER_SECONDS) * dt; // もどりは 0.25 秒
      if (this.shoulderCap >= target) this.shoulderCap = target;
    }
    const sOff = Math.max(0, Math.min(full, this.shoulderCap));
    this.shoulderS = sOff;
    this.shoulder.x = P.x + rx * sOff;
    this.shoulder.y = by;
    this.shoulder.z = P.z + rz * sOff;
  }

  /** WEAPON-9: シャイニング中の 三人称の きょり（null = ふだんの thirdPersonDistance）。壁の ときは 今の きまりどおり 手前で 止まる */
  distanceOverride: number | null = null;
  /** テスト用: カメラだけ 体の 向きから この 角度 ずらす（遊びでは 0 のまま。斬撃の 横・うしろの 絵を 撮り分ける） */
  testYawOffsetDeg = 0;
  /** テスト用: 三人称の きょりを きめうちに する（null = きめない。スクショ用） */
  testDistance: number | null = null;
  /** テスト用: カメラを 場所に 固定する（遊びでは null。プレイヤーが はじかれる 所を 動かない 絵で 撮る） */
  testFixed: { x: number; y: number; z: number; tx: number; ty: number; tz: number } | null = null;

  private placeThird(dt: number): void {
    const cfg = this.config;
    const P = this.shoulder;
    // カメラ = S - 距離 × D（真ん中の線は いつも S を通る）
    const dist = this.testDistance ?? this.distanceOverride ?? cfg.thirdPersonDistance;
    const dx = -dist * this.dir.x;
    const dy = -dist * this.dir.y;
    const dz = -dist * this.dir.z;
    const full = Math.hypot(dx, dy, dz);

    // S からカメラへの線分で最初にぶつかるブロック
    let allowed = full;
    if (full > 1e-6) {
      const hit = this.firstSolidDistance(P, dx / full, dy / full, dz / full, full);
      if (hit !== null) allowed = Math.max(0, hit - WALL_MARGIN);
    }
    if (this.current < 0 || allowed < this.current) {
      this.current = allowed; // 寄せるのは一瞬
    } else {
      this.current = Math.min(allowed, this.current + (full / WALL_RECOVER_SECONDS) * dt);
    }
    const k = full > 1e-6 ? this.current / full : 0;
    this.camPos.set(P.x + dx * k, P.y + dy * k, P.z + dz * k);
  }

  /** o から (ux,uy,uz) の向きへ進んで、固いブロックに入る最初の距離。なければ null */
  private firstSolidDistance(o: Vec3, ux: number, uy: number, uz: number, maxLen: number): number | null {
    const w = this.world;
    const solidAt = (t: number) =>
      w.isSolid(Math.floor(o.x + ux * t), Math.floor(o.y + uy * t), Math.floor(o.z + uz * t));
    if (solidAt(0)) return 0;
    for (let t = RAY_STEP; t < maxLen; t += RAY_STEP) {
      if (solidAt(t)) {
        // 刻みのあいだを 二分して 面の位置を細かく出す
        let lo = t - RAY_STEP;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          if (solidAt(mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
    }
    return solidAt(maxLen) ? maxLen : null;
  }

  dispose(): void {
    this.scene.remove(this.doll.group);
    this.doll.dispose();
  }
}
