import { SHAKE, shakeAngles } from '../fx/impact';
import { STEPS_PER_SECOND } from '../tools/config';
import type { P2Pose } from './p2Pose';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md §3.6「手ごたえ」・§8 の `duoCamFx(who)`・§9.10・AC97）: 2 人の とき、その人の 半分の カメラだけ
 * 止める・ゆらす・きょりを かえる。世界は 止めない。three を 使わない。テストは camFx.test.ts。
 * 数は `IMPACT`・`SHAKE`（fx/impact.ts）。乱数は つかわない。
 */

/** その人の カメラの 口（§8 の `shared.duoCamFx(who)`） */
export interface DuoCamFx {
  /** ゆれを 足す（0〜1 に おさめる） */
  addTrauma(a: number): void;
  /** このステップの 次から ticks ステップ その人の カメラを 止める（長い 方 1 回。小数は 切りすて） */
  freeze(ticks: number): void;
  /** きょりを d（マス）に する。null で ふだん。「今の 値」で、なめらかに する のは 呼ぶ 側 */
  setDistance(d: number | null): void;
  /** 止めの のこり ステップ（`duo.impact(who).stopLeft`） */
  stopLeft(): number;
  /** ゆれの 量 0〜1（`duo.impact(who).trauma`） */
  trauma(): number;
  /** 今の きょり（マス。`duo.camDistance(who)`）。setDistance が なければ ふだんの きょり */
  distance(): number;
}

/** 1 ステップの 秒（ゆれの 時間と へり方） */
const DT = 1 / STEPS_PER_SECOND;

/** 止め・ゆれ・きょりの 数え（1P と 2P で 同じ）。カメラの 動かし方は 子が 決める */
abstract class CamFxCore implements DuoCamFx {
  protected stop = 0;
  protected frozen = false;
  private dist: number | null = null;

  constructor(private readonly base: () => number) {}

  abstract addTrauma(a: number): void;
  abstract trauma(): number;

  freeze(ticks: number): void {
    const n = Math.floor(ticks);
    if (n > this.stop) this.stop = n;
  }
  setDistance(d: number | null): void {
    this.dist = d;
  }
  stopLeft(): number {
    return this.stop;
  }
  /** 直前の 更新が 止めの ステップだったか */
  frozenNow(): boolean {
    return this.frozen;
  }
  /** `setDistance` で 決めた 値（なければ null。1P は step.ts が 優先の 順で 使う） */
  override(): number | null {
    return this.dist;
  }
  distance(): number {
    return this.dist ?? this.base();
  }

  /** 止めの のこりを 見て このステップが 止めの ステップか 決める（のこりを 1 へらす） */
  protected beginStep(): void {
    this.frozen = this.stop > 0;
    if (this.frozen) this.stop--;
  }
}

/** 2P の カメラの ポーズ ＋ ゆれの 角度（ラジアン。カメラの 回転に そのまま 足す） */
export type P2CamView = P2Pose & { shakeYaw: number; shakePitch: number; shakeRoll: number };

/** 2P の カメラ用。ポーズは 呼ぶ 側が 毎ステップ 作り（`p2CameraPose`）、`apply` が 止め・ゆれを かける */
export class P2CamFx extends CamFxCore {
  private tr = 0;
  private t = 0;
  private readonly sh = { yaw: 0, pitch: 0, roll: 0 };
  private readonly held: P2Pose = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
  private hasHeld = false;

  constructor(o: { baseDistance: () => number }) {
    super(o.baseDistance);
  }

  addTrauma(a: number): void {
    this.tr = Math.min(1, this.tr + a);
  }
  trauma(): number {
    return this.tr;
  }

  /** 固定ステップごとに 1 回。当たりを 出す flush より「前」（当たった ステップは 止めの のこりが そのまま 見える） */
  step(): void {
    this.beginStep();
    this.t += DT;
    this.tr = Math.max(0, this.tr - SHAKE.decayPerSecond * DT);
    shakeAngles(this.tr, this.t, this.sh);
  }

  /** 画面に つかう ポーズを out に 書いて 返す。止めの ステップは 止まる 直前の ポーズ、ふつうの ステップは fresh */
  apply(fresh: P2Pose, out: P2CamView): P2CamView {
    const h = this.held;
    if (!(this.frozen && this.hasHeld)) {
      h.x = fresh.x;
      h.y = fresh.y;
      h.z = fresh.z;
      h.yawDeg = fresh.yawDeg;
      h.pitchDeg = fresh.pitchDeg;
      this.hasHeld = true;
    }
    out.x = h.x;
    out.y = h.y;
    out.z = h.z;
    out.yawDeg = h.yawDeg;
    out.pitchDeg = h.pitchDeg;
    out.shakeYaw = this.sh.yaw;
    out.shakePitch = this.sh.pitch;
    out.shakeRoll = this.sh.roll;
    return out;
  }

  /** 2P が やめた・参加した: 止め・ゆれ・きょりを ぜんぶ 消す */
  reset(): void {
    this.stop = 0;
    this.frozen = false;
    this.tr = 0;
    this.t = 0;
    this.sh.yaw = 0;
    this.sh.pitch = 0;
    this.sh.roll = 0;
    this.hasHeld = false;
    this.setDistance(null);
  }
}

/** CameraRig が 満たす 小さい 口（CameraRig に `shakeNow()` を 足してある） */
export interface P1RigPort {
  /** 肩の 点・ねらい・カメラの 位置と 向き（ゆれ 入り）を 進める。ゆれの 時間と trauma も ここで 進む */
  update(dt: number): void;
  addTrauma(a: number): void;
  traumaNow(): number;
  /** いまの ゆれの 角度（ラジアン） */
  shakeNow(): { yaw: number; pitch: number; roll: number };
  /** step.ts が 毎ステップ 書く */
  distanceOverride: number | null;
}

/** game.camera（THREE の Vector3・Euler で そのまま 満たす）。書きかえるだけ */
export interface P1CamPort {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

/** 1P の カメラ用。CameraRig を 包む。2 人の ときだけ 止めを 使う（1 人の ときは 世界が 止まる → 今の `updateFrozen`） */
export class P1CamFx extends CamFxCore {
  private readonly rig: P1RigPort;
  private readonly camera: P1CamPort;
  private readonly joined: () => boolean;
  /** 止める 直前の 位置と、ゆれを 引いた 向き */
  private readonly hp = { x: 0, y: 0, z: 0 };
  private readonly hr = { x: 0, y: 0, z: 0 };
  private hasHeld = false;

  constructor(o: { rig: P1RigPort; camera: P1CamPort; baseDistance: () => number; joined: () => boolean }) {
    super(o.baseDistance);
    this.rig = o.rig;
    this.camera = o.camera;
    this.joined = o.joined;
  }

  addTrauma(a: number): void {
    this.rig.addTrauma(a);
  }
  trauma(): number {
    return this.rig.traumaNow();
  }
  /** 壁で 止まる 前の きょり（step.ts が 書いた 値 ?? ふだん） */
  override distance(): number {
    return this.rig.distanceOverride ?? super.distance();
  }

  /**
   * 毎ステップ 1 回。`rig.update(dt)` の かわり（当たりを 出す flush より 前）。
   * 2 人の とき 止めの ステップは、体・ねらい（rig.update）は 進めて から カメラの 位置・向きを 止める 直前の 値に もどす（ゆれだけ 動く）。
   */
  update(dt: number): void {
    const joined = this.joined();
    if (joined) this.beginStep();
    else {
      this.stop = 0;
      this.frozen = false;
    }
    this.rig.update(dt);
    const c = this.camera;
    const sh = this.rig.shakeNow();
    if (this.frozen && this.hasHeld) {
      c.position.x = this.hp.x;
      c.position.y = this.hp.y;
      c.position.z = this.hp.z;
      c.rotation.x = this.hr.x + sh.pitch;
      c.rotation.y = this.hr.y + sh.yaw;
      c.rotation.z = this.hr.z + sh.roll;
    } else {
      this.hp.x = c.position.x;
      this.hp.y = c.position.y;
      this.hp.z = c.position.z;
      this.hr.x = c.rotation.x - sh.pitch;
      this.hr.y = c.rotation.y - sh.yaw;
      this.hr.z = c.rotation.z - sh.roll;
      this.hasHeld = true;
    }
  }
}
