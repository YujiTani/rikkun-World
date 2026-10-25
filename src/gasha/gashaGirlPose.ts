/**
 * #293 少女の ポーズを 骨に かける 小さな 道具（決めポーズ・肩に 座る ポーズ）。数・名前は gashaGirlTuning.ts、ポーズの データは gashaGirlPoseData.ts。
 */
import { Euler, Quaternion, type Object3D } from 'three';
import type { PoseBones } from './gashaGirlPoseData';

/** もとの 姿勢(骨と その ときの 回転) */
export interface BaseBone { bone: Object3D; q: Quaternion }

const tq = new Quaternion();
const te = new Euler();

/** 骨ごとに もとの 回転 → ポーズの 回転へ k(0〜1)の ぶん 近づける。ポーズに ない 骨は もとの まま */
export function blendPose(base: readonly BaseBone[], pose: PoseBones, k: number): void {
  for (const s of base) {
    const p = pose[s.bone.name];
    if (!p) { s.bone.quaternion.copy(s.q); continue; }
    tq.set(p[0], p[1], p[2], p[3]);
    s.bone.quaternion.copy(s.q).slerp(tq, k);
  }
}

/** 骨ごとに もとの 回転に「ローカルの 軸まわりの 回転(度 x y z)」を k 倍 かける。表に ない 骨は もとの まま */
export function applyDelta(base: readonly BaseBone[], delta: Record<string, readonly [number, number, number]>, k: number): void {
  const d = Math.PI / 180;
  for (const s of base) {
    const e = delta[s.bone.name];
    s.bone.quaternion.copy(s.q);
    if (!e) continue;
    tq.setFromEuler(te.set(e[0] * d * k, e[1] * d * k, e[2] * d * k));
    s.bone.quaternion.multiply(tq);
  }
}

/** 肩に 座る: ももを 前へ 90°、ひざを 90° まげて 足を ぶらさげる(少し 前かがみ・首を かしげる) */
export const SIT_DELTA: Record<string, readonly [number, number, number]> = {
  LeftUpLeg: [90, 0, -4], RightUpLeg: [90, 0, 4],
  LeftLeg: [-90, 0, 0], RightLeg: [-90, 0, 0],
  Spine: [4, 0, 0], Spine01: [4, 0, 0], neck: [6, 0, 0], Head: [4, 0, 10],
};
