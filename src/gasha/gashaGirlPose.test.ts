import { describe, expect, it } from 'vitest';
import { Object3D, Quaternion } from 'three';
import { applyDelta, blendPose, SIT_DELTA } from './gashaGirlPose';
import { POSES } from './gashaGirlPoseData';

const bone = (name: string): Object3D => { const o = new Object3D(); o.name = name; return o; };
const rig = () => {
  const names = ['Hips', 'LeftUpLeg', 'LeftLeg', 'Head'];
  return names.map((n) => { const b = bone(n); return { bone: b, q: b.quaternion.clone() }; });
};

describe('決めポーズ・座りポーズ', () => {
  it('blendPose: k=0 は もとの まま、k=1 は ポーズどおり、ポーズに ない 骨は もとの まま', () => {
    const base = rig();
    const pose = { Head: [0, 0.7071, 0, 0.7071] as const, LeftLeg: [0.5, 0.5, 0.5, 0.5] as const };
    blendPose(base, pose, 0);
    expect(base[3]!.bone.quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 6);
    blendPose(base, pose, 1);
    expect(base[3]!.bone.quaternion.x).toBeCloseTo(0, 4);
    expect(base[3]!.bone.quaternion.y).toBeCloseTo(0.7071, 4);
    expect(base[0]!.bone.quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 6);
    blendPose(base, pose, 0.5);
    expect(base[3]!.bone.quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 4, 3); // 90° の はんぶん
  });

  it('applyDelta: ローカルの 軸まわりに 度で 回す。k=0 は もとの まま。骨が なければ むし', () => {
    const base = rig();
    applyDelta(base, { LeftUpLeg: [90, 0, 0], Nothing: [10, 0, 0] }, 1);
    expect(base[1]!.bone.quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 2, 4);
    applyDelta(base, { LeftUpLeg: [90, 0, 0] }, 0);
    expect(base[1]!.bone.quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 6);
  });

  it('座りポーズは 足(もも・ひざ)を 動かす。ポーズの データは 3 つ(a・b・c)で 骨ごとに 長さ 4 の 回転', () => {
    expect(Object.keys(SIT_DELTA)).toEqual(expect.arrayContaining(['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']));
    expect(Object.keys(POSES).sort()).toEqual(['a', 'b', 'c']);
    for (const p of Object.values(POSES)) {
      expect(Object.keys(p.bones)).toEqual(expect.arrayContaining(['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']));
      for (const q of Object.values(p.bones)) expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 2);
    }
  });
});
