/**
 * #293 少女の ポーズを 骨に かける 小さな 道具（決めポーズ・うなだれポーズ）。数・名前は gashaGirlTuning.ts、ポーズの データは gashaGirlPoseData.ts。
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

/**
 * ぺたん座り(女の子座り): ひざは 前で 少し ひらき、すねと 足は 外向きに 後ろへ たたむ(M 字)。お尻が 地面に のり、頭は 少し うなだれる。
 * 骨の 回転(度 x y z。もとの 休みの 姿勢に かける)。足の 骨は 休みの 姿勢が 上下 さかさ なので、ももは -70°(ひざが 前へ)、ひざは +140°(すねを たたむ)、
 * ももを 60° ねじって すねを 外へ。ねじりを 大きく すると 絵が くずれる ので、小さい 回転で 形を 優先した(測った 形は gashaGirlPose.test.ts)。
 */
export const PETAN_DELTA: Record<string, readonly [number, number, number]> = {
  LeftUpLeg: [-70, 60, -15], RightUpLeg: [-70, -60, 15],
  LeftLeg: [140, 0, 0], RightLeg: [140, 0, 0],
  Spine: [3, 0, 0], Spine01: [4, 0, 0], Spine02: [4, 0, 0], neck: [14, 0, 0], Head: [16, 0, 0],
};

/** 地面に つく 点(つま先・足首・ひざ)の 骨の 名前。お尻は 腰の 骨から buttDrop 下 */
export const PETAN_CONTACT: readonly string[] = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot', 'LeftLeg', 'RightLeg'];

/** いちばん 低い 接地点の 高さ(骨の 世界の 高さ y と 腰の 高さ から)。体を この 分 さげると お尻・足が 地面に つく */
export function lowestContactY(ys: readonly number[], hipsY: number, buttDrop: number): number {
  return Math.min(hipsY - buttDrop, ...ys);
}
