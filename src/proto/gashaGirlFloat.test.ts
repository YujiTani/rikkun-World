import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three';
import { blendBetween, buildFloatPose, FLOAT_BONES, floatEntry } from './gashaGirlFloat';

/** 少女の GLB(public/models/gasha/girl-cast.glb)の 骨組みだけを 組む(絵・メッシュは 読まない) */
function loadRig(): Group {
  const buf = readFileSync(resolve(import.meta.dirname, '../../public/models/gasha/girl-cast.glb'));
  const len = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + len).toString()) as { nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; scenes: { nodes: number[] }[] };
  const objs = j.nodes.map((nd) => {
    const o = new Bone();
    o.name = nd.name ?? '';
    if (nd.translation) o.position.fromArray(nd.translation);
    if (nd.rotation) o.quaternion.fromArray(nd.rotation);
    if (nd.scale) o.scale.fromArray(nd.scale);
    return o;
  });
  j.nodes.forEach((nd, i) => (nd.children ?? []).forEach((c) => objs[i]!.add(objs[c]!)));
  const root = new Group();
  for (const i of j.scenes[0]!.nodes) root.add(objs[i]!);
  root.updateMatrixWorld(true);
  return root;
}

const P = (root: Object3D, n: string) => root.getObjectByName(n)!.getWorldPosition(new Vector3());
/** 点と 線分(a→b)の きょり */
const segDist = (p: Vector3, a: Vector3, b: Vector3) => {
  const ab = b.clone().sub(a), t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
};
const applyPose = (root: Object3D, pose: Record<string, readonly number[]>) => {
  for (const [k, q] of Object.entries(pose)) root.getObjectByName(k)!.quaternion.set(q[0]!, q[1]!, q[2]!, q[3]!);
  root.updateMatrixWorld(true);
};

/** 座りポーズの ものさし(長さは m。少女の 腰の 高さ 約 0.98 m) */
export function floatMetrics(root: Object3D) {
  const knee = P(root, 'RightLeg'), lKnee = P(root, 'LeftLeg'), ankle = P(root, 'RightFoot');
  const lHip = P(root, 'LeftUpLeg'), rHip = P(root, 'RightUpLeg');
  const sp0 = P(root, 'Spine02'), neck = P(root, 'neck'), hips = P(root, 'Hips');
  const lHand = P(root, 'LeftHand'), rHand = P(root, 'RightHand');
  const lElb = P(root, 'LeftForeArm'), rElb = P(root, 'RightForeArm');
  const torso = (p: Vector3) => segDist(p, sp0, neck);
  const up = neck.clone().sub(hips);
  const head = root.getObjectByName('Head')!;
  const face = new Vector3(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
  return {
    /** 手首から 右ひざ まで(m) */
    handToKnee: Math.max(lHand.distanceTo(knee), rHand.distanceTo(knee)),
    /** 右の 足首が 左ひざに のって いるか: 足首と 左もも(腰→ひざ)の きょり(m)・足首が 左ひざより 上か(m) */
    ankleToLeftThigh: segDist(ankle, lHip, lKnee),
    ankleAboveKnee: ankle.y - lKnee.y,
    /** 足が 組めて いるか: 右の 足首が 体の まん中を こえて 左へ(m、+ が 左) */
    ankleCross: ankle.x - (lHip.x + rHip.x) / 2,
    /** 体に めりこまないか: 胴(背骨の 線)から いちばん 近い ひじ・手首・右ひざ・右もも(ひざ寄り 3/4)(m) */
    torsoGap: Math.min(torso(lElb), torso(rElb), torso(lHand), torso(rHand), torso(knee), torso(knee.clone().lerp(rHip, 0.25))),
    torsoGapKnee: torso(knee),
    torsoGapArms: Math.min(torso(lElb), torso(rElb), torso(lHand), torso(rHand)),
    /** 右ひざの 高さ(腰から m) */
    kneeUp: knee.y - hips.y,
    /** 上体の うしろへの そり(度。+ が うしろ) */
    leanBackDeg: (Math.atan2(-up.z, up.y) * 180) / Math.PI,
    /** 顔の 下向き(度。+ が 下) */
    faceDownDeg: (Math.asin(-face.y) * 180) / Math.PI,
    /** のばした 左足の つま先が 足首より 下(m) */
    toeDown: P(root, 'LeftFoot').y - P(root, 'LeftToeBase').y,
    /** 左足の のび: 腰から つま先までの きょり(m)と 前への 出(m) */
    leftReach: P(root, 'LeftToeBase').distanceTo(lHip),
    leftForward: P(root, 'LeftToeBase').z - lHip.z,
  };
}

describe('決めポーズ「空中で 足を 組んで 座る」(オーナー 2026-10-24 17:31)', () => {
  const root = loadRig();
  const rest = FLOAT_BONES.map((k) => root.getObjectByName(k)!.quaternion.clone());
  const pose = buildFloatPose(root);

  it('ポーズは 22 本の 骨の 回転(長さ 1)。作った あと 骨は もとの 休みの 姿勢に もどる', () => {
    expect(Object.keys(pose).sort()).toEqual([...FLOAT_BONES].sort());
    for (const q of Object.values(pose)) expect(Math.hypot(...q)).toBeCloseTo(1, 4);
    FLOAT_BONES.forEach((k, i) => expect(root.getObjectByName(k)!.quaternion.angleTo(rest[i]!)).toBeLessThan(0.002));
  });

  it('数で 見る: 手が ひざに とどく・体に めりこまない・足が 組めて いる・つま先は 下・上体は 少し うしろ・顔は 少し 下', () => {
    const r = loadRig();
    applyPose(r, pose);
    const m = floatMetrics(r);
    expect(m.handToKnee).toBeLessThan(0.13); // 手首が ひざの そば
    expect(m.ankleToLeftThigh).toBeGreaterThan(0.07); // 足首が 左ももに めりこまない(ふとさ 約 0.07)
    expect(m.ankleToLeftThigh).toBeLessThan(0.15); // でも のって いる
    expect(m.ankleAboveKnee).toBeGreaterThan(0.03);
    expect(m.ankleCross).toBeGreaterThan(0.02); // 右の 足首が まん中を こえる
    expect(m.torsoGap).toBeGreaterThan(0.1); // 胴の 太さ(はんぶん 約 0.1)より 外
    expect(m.kneeUp).toBeGreaterThan(0.2); // ひざを 高く 立てる
    expect(m.leanBackDeg).toBeGreaterThan(5);
    expect(m.leanBackDeg).toBeLessThan(25);
    expect(m.faceDownDeg).toBeGreaterThan(3);
    expect(m.faceDownDeg).toBeLessThan(30);
    expect(m.toeDown).toBeGreaterThan(0.08);
    expect(m.leftForward).toBeGreaterThan(0.45); // 前へ 長く
  });

  it('骨が 足りない 骨組みでは 空の ポーズ(立ち姿の まま)', () => {
    expect(buildFloatPose(new Group())).toEqual({});
  });

  it('blendBetween: k=0 は from、k=1 は to、どちらにも ない 骨は base の まま', () => {
    const a = new Object3D(); a.name = 'A';
    const b = new Object3D(); b.name = 'B';
    const base = [{ bone: a, q: new Quaternion() }, { bone: b, q: new Quaternion(0, 0, 0.7071, 0.7071) }];
    const from = { A: [0, 0.7071, 0, 0.7071] as const }, to = { A: [0.7071, 0, 0, 0.7071] as const };
    blendBetween(base, from, to, 0);
    expect(a.quaternion.y).toBeCloseTo(0.7071, 4);
    blendBetween(base, from, to, 1);
    expect(a.quaternion.x).toBeCloseTo(0.7071, 4);
    expect(b.quaternion.z).toBeCloseTo(0.7071, 4);
    blendBetween(base, null, to, 0); // from が なければ base から
    expect(a.quaternion.angleTo(new Quaternion())).toBeCloseTo(0, 6);
  });

  it('floatEntry: ため(しずむ)→ 上がる(少し 行きすぎ)→ 座る。おわりは ぴったり 1', () => {
    expect(floatEntry(0, 0.2)).toEqual({ lift: 0, pose: 0, dip: 0 });
    expect(floatEntry(0.2, 0.2).dip).toBeCloseTo(1, 4);
    const end = floatEntry(1, 0.2);
    expect(end.lift).toBeCloseTo(1, 6); expect(end.pose).toBeCloseTo(1, 6); expect(end.dip).toBe(0);
    let max = 0;
    for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, floatEntry(t, 0.2).lift);
    expect(max).toBeGreaterThan(1.03); // 行きすぎて もどる
    expect(max).toBeLessThan(1.25);
    expect(floatEntry(2, 0.2).lift).toBeCloseTo(1, 6); // はみ出しても 1
  });
});
