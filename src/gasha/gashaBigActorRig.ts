/**
 * #308 gashaBigActor.ts を 分けた もの: 素材（Meshy）の クリップを 箱の 関節へ うつす ための 道具（骨の 対応・軸・親子・うつし方）。
 */
import { Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBigTypes';
import type { AimOpts, RetargetOpts, Skeleton } from './gashaBigMotion';

/** 箱の 関節 → 素材（Meshy）の 骨。Meshy の 背骨は 下から Spine02 → Spine01 → Spine（箱は Spine → Spine01 → Spine02） */
const SRC_BONE: Record<string, string> = { Spine: 'Spine02', Spine01: 'Spine01', Spine02: 'Spine' };
const TORSO = new Set(['Spine', 'Spine01', 'Spine02', 'neck', 'Head']);

/** 骨の 向きで うつす ための 箱の 骨の 軸（休みの 姿勢）。首と 頭は 胸の 軸（素材で 首・頭が 胸と まっすぐ なら 箱は 休みの 首・頭） */
export function aimOpts(model: BigModel, c: { armTiltDeg: number; torsoTiltDeg: number; rootTiltDeg: number; loop: boolean; contactSpeed: readonly [number, number]; contactBlur: number; follow: Record<string, number> }): AimOpts {
  const r = model.rest;
  const dir = (a: JointName, b: JointName) => r[b].clone().sub(r[a]).normalize();
  const chest = dir('Spine02', 'neck');
  const axis: Record<string, Vector3> = {
    Hips: dir('Hips', 'Spine'), Spine: dir('Spine', 'Spine01'), Spine01: dir('Spine01', 'Spine02'), Spine02: chest, neck: chest, Head: chest,
  };
  for (const s of ['Left', 'Right'] as const) {
    axis[`${s}Shoulder`] = dir(`${s}Shoulder`, `${s}Arm`);
    axis[`${s}Arm`] = dir(`${s}Arm`, `${s}ForeArm`);
    axis[`${s}ArmMid`] = dir(`${s}ArmMid`, `${s}ForeArm`); // 上わんの 節を 分けた 関節（親と おなじ 向き）
    axis[`${s}ForeArm`] = dir(`${s}ForeArm`, `${s}Hand`);
    axis[`${s}Hand`] = new Vector3(0, 0, 1); // 手の ひらは 地面に 平ら、指が 前
  }
  const side: Record<string, Vector3> = {};
  const tiltDeg: Record<string, number> = {};
  for (const n of Object.keys(model.joints)) {
    tiltDeg[n] = TORSO.has(n) || n === 'Hips' ? c.torsoTiltDeg : c.armTiltDeg;
    if (TORSO.has(n)) side[n] = new Vector3(1, 0, 0);
  }
  return { map: SRC_BONE, axis, side, tiltDeg, follow: { ...c.follow }, inherit: ['LeftArmMid', 'RightArmMid'], rootTiltDeg: c.rootTiltDeg, loop: c.loop, contactSpeed: c.contactSpeed, contactBlur: c.contactBlur };
}

/** 箱の 関節の 親子（Group の 名前から） */
export function skeletonOf(model: BigModel): Skeleton {
  const names = Object.keys(model.joints) as JointName[]; // 親が 先の 並び
  const parent: Record<string, string | null> = {};
  for (const n of names) {
    const p = model.joints[n].parent?.name;
    parent[n] = p && names.includes(p as JointName) ? p : null;
  }
  return { names, parent };
}

/** 調整表の クリップ設定を うつし方に（強さの 書いて ない 関節は 0） */
export function retargetOpts(c: { pitchDeg: number; ref: string; mirror: boolean; strength: Record<string, number> }): RetargetOpts {
  const ref = /^\d+$/.test(c.ref) ? Number(c.ref) : c.ref === 'first' ? 'first' : 'mean';
  return { pitchDeg: c.pitchDeg, ref, mirror: c.mirror, strength: { ...c.strength } };
}
