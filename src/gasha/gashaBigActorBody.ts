/**
 * #308 gashaBigActor.ts を 分けた もの: 体を 世界に 置く 道具（かたむけて 置く・足もとの 地面の 高さ）と、上に のっている 人を いっしょに 動かす 係。
 */
import { Matrix4, Quaternion, Vector3, type Group } from 'three';
import type { BigModel, JointName } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import { DEG, type ActorEnv } from './gashaBigActorBase';
import type { ActorBoxes } from './gashaBigActorBoxes';
import { targetsOf, type GashaTarget } from './gashaTargets';

const AXIS_X = new Vector3(1, 0, 0), AXIS_Y = new Vector3(0, 1, 0), AXIS_Z = new Vector3(0, 0, 1);
const TILT_Q = new Quaternion(), TILT_Q2 = new Quaternion(), TILT_V = new Vector3(), TILT_V2 = new Vector3(), TILT_V3 = new Vector3(), QY = new Quaternion();

/** とどめの あとの かたむき（roll・pitch ラジアン、土台の 上 pivotY、しずむ 分 liftY は 負） */
export interface BodyTilt { roll: number; pitch: number; pivotY: number; liftY: number }

/** 体の 親 Group に 位置・向き・拡大を 入れる（かたむいて いれば 土台の 上 pivotY を 中心に かたむける） */
export function applyBodyTransform(g: Group, pos: Vector3, yaw: number, sc: number, tilt: BodyTilt): void {
  if (tilt.roll === 0 && tilt.pitch === 0) {
    g.position.copy(pos);
    g.position.y += tilt.liftY;
    g.rotation.set(0, yaw, 0);
  } else {
    // 中心 P(土台の 上 tiltPivotY)まわりに かたむける: 位置 = pos + R_yaw · sc · (P − Rt · P)、向き = R_yaw · Rt
    const qy = QY.setFromAxisAngle(AXIS_Y, yaw);
    const rt = TILT_Q.setFromAxisAngle(AXIS_X, tilt.pitch).multiply(TILT_Q2.setFromAxisAngle(AXIS_Z, tilt.roll));
    const p = TILT_V.set(0, tilt.pivotY, 0);
    const d = TILT_V2.copy(p).sub(TILT_V3.copy(p).applyQuaternion(rt)).multiplyScalar(sc).applyQuaternion(qy);
    g.position.set(pos.x + d.x, pos.y + tilt.liftY + d.y, pos.z + d.z);
    g.quaternion.copy(qy).multiply(rt);
  }
  g.scale.setScalar(sc);
}

/** 手・からだの 下の 点から 地面の 高さを 決める（place と おなじ） */
export function groundHeight(model: BigModel, groundY: ActorEnv['groundY'], pos: Vector3, yaw: number): number {
  const s = model.scale;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let best = T.place.groundPick === 'min' ? Infinity : -Infinity;
  for (const q of model.groundPts) {
    // Y 軸まわりに yaw 回した ときの 世界の 位置（three の rotation.y と おなじ）
    const wx = (q.x * c + q.z * sn) * s, wz = (-q.x * sn + q.z * c) * s;
    const h = groundY(Math.floor(pos.x + wx), Math.floor(pos.z + wz)) + 1;
    best = T.place.groundPick === 'min' ? Math.min(best, h) : Math.max(best, h);
    if (T.place.groundPick === 'center') return h;
  }
  return best;
}

/** のっている 1 人ぶんの おぼえ（使いまわす） */
interface Rider {
  t: GashaTarget | null;
  joint: JointName | null;
  m: Matrix4;
  x: number;
  y: number;
  z: number;
}

/** 上に のっている 人（動かす 前の 関節の 行列を おぼえて、動いた あと その ぶんを 人に 足す）。2 人の ときは 人ごとに 運ぶ（COOP-1 4d-3） */
export class RideCarry {
  private readonly dM = new Matrix4();
  private readonly tv = new Vector3();
  private readonly tq = new Quaternion();
  private readonly ts = new Vector3();
  private readonly ts2 = new Vector3();
  private readonly riders: Rider[] = [];
  private count = 0;

  /** 動かす 前: のっている 箱が あれば その 関節の 行列を おぼえる（のせる 口を もつ 人だけ） */
  begin(env: ActorEnv, model: BigModel, boxes: ActorBoxes): void {
    this.count = 0;
    const list = targetsOf(env);
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      if (!t.carry) continue;
      const p = t.pos;
      const bi = boxes.boxUnder(p.x, p.y, p.z);
      if (bi < 0) continue;
      const r = (this.riders[this.count] ??= { t: null, joint: null, m: new Matrix4(), x: 0, y: 0, z: 0 });
      r.t = t;
      const joint = boxes.jointOfBox(bi)!;
      r.joint = joint;
      r.m.copy(model.joints[joint].matrixWorld);
      r.x = p.x; r.y = p.y; r.z = p.z;
      this.count++;
    }
  }

  /** 動かした 後: のっている 点が 関節に ついて 動いた ぶんだけ 人を 動かす */
  end(_env: ActorEnv, model: BigModel): void {
    for (let i = 0; i < this.count; i++) {
      const r = this.riders[i]!;
      const joint = r.joint;
      if (!joint || !r.t?.carry) continue;
      const j = model.joints[joint];
      // T = 新しい 行列 × 古い 行列の 逆。のっている 点が この 関節に ついて 動いた ぶん
      this.dM.copy(r.m).invert().premultiply(j.matrixWorld);
      this.tv.set(r.x, r.y, r.z).applyMatrix4(this.dM);
      this.dM.decompose(this.ts, this.tq, this.ts2);
      const fwd = this.ts.set(0, 0, 1).applyQuaternion(this.tq);
      const dYaw = T.ride.turnWithBody ? Math.atan2(fwd.x, fwd.z) : 0;
      const dx = this.tv.x - r.x, dy = this.tv.y - r.y, dz = this.tv.z - r.z;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-7 || Math.abs(dYaw) > 1e-9) r.t.carry(dx, dy, dz, -dYaw / DEG);
    }
    this.count = 0;
  }
}
