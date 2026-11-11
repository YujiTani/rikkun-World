import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Bone, Object3D, Quaternion, Vector3 } from 'three';
import { applyDelta, blendPose, lowestContactY, PETAN_CONTACT, PETAN_DELTA, type BaseBone } from './gashaGirlPose';
import { POSES, SLUMP_POSE } from './gashaGirlPoseData';
import { TUNE } from './gashaGirlTuning';
import { introSpot } from './gashaGirlIntro';

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

  it('ポーズの データは 3 つ(a・b・c)で 骨ごとに 長さ 4 の 回転', () => {
    expect(Object.keys(POSES).sort()).toEqual(['a', 'b', 'c']);
    for (const p of Object.values(POSES)) {
      expect(Object.keys(p.bones)).toEqual(expect.arrayContaining(['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']));
      for (const q of Object.values(p.bones)) expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 2);
    }
  });

  it('うなだれポーズ(pose_slump): 頭と 首と 背中が 前へ 深く 下がり、足の 骨は 入れない(立った まま)', () => {
    const pitch = (n: string) => { const q = SLUMP_POSE[n]!; return (2 * Math.atan2(q[0], q[3]) * 180) / Math.PI; };
    expect(pitch('Head') + pitch('neck')).toBeGreaterThan(45); // 頭を 深く 下げる
    expect(pitch('Spine') + pitch('Spine01') + pitch('Spine02')).toBeGreaterThan(10); // 背中を 少し まるく
    for (const n of Object.keys(SLUMP_POSE)) {
      expect(n).not.toMatch(/Leg|Foot|Toe|Hips/); // 腰を 落とさない・足は 立ったまま
      const q = SLUMP_POSE[n]!; expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 2);
    }
  });

  it('休みの 場所: プレイヤーの 前 rest.dist ブロック。箱は ポーズごとに 地面の 上に 収まる', () => {
    const R = TUNE.rest;
    const s = introSpot({ x: 10, z: 10, yawDeg: 0 }, 0, R.dist);
    expect(Math.hypot(s.x - 10, s.z - 10)).toBeCloseTo(R.dist, 5);
    expect(s.z).toBeLessThan(10); // yaw 0 の 前(-z)
    expect(R.dist).toBeGreaterThan(2);
    expect(['petan', 'slump']).toContain(R.pose);
    expect(R.pose).toBe('petan'); // 既定は ぺたん座り
    for (const h of Object.values(R.hit)) {
      expect(h.up - h.half[1]).toBeGreaterThanOrEqual(-0.01); // 箱の 底は 地面より 下に ならない
      expect(h.up + h.half[1]).toBeLessThan(3.2); // 立った 少女(3 ブロック)の 高さに 収まる
    }
    expect(R.breathDeg).toBeGreaterThan(0); expect(R.breathSec).toBeGreaterThan(0);
  });
});

/** 少女の GLB の 骨だけ(メッシュ なし)を 読んで 組む。大きさは ゲームと おなじ 約 3 ブロックの 身長(S) */
const S = 1.84;
function skeleton(): { root: Object3D; base: BaseBone[]; get: (n: string) => Object3D } {
  const b = readFileSync('public/models/gasha/girl-cast.glb');
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const mk = (i: number): Object3D => {
    const x = j.nodes[i]; const o = x.mesh !== undefined ? new Object3D() : new Bone(); o.name = x.name ?? '';
    if (x.translation) o.position.fromArray(x.translation);
    if (x.rotation) o.quaternion.fromArray(x.rotation);
    if (x.scale) o.scale.fromArray(x.scale);
    for (const c of x.children ?? []) o.add(mk(c));
    return o;
  };
  const root = mk(j.scenes[0].nodes.find((n: number) => j.nodes[n].name === 'Armature'));
  root.scale.multiplyScalar(S);
  const base: BaseBone[] = [];
  root.traverse((o) => { if ((o as Bone).isBone) base.push({ bone: o, q: o.quaternion.clone() }); });
  return { root, base, get: (n) => root.getObjectByName(n)! };
}

describe('ぺたん座り(PETAN_DELTA)', () => {
  const sk = skeleton();
  const y = (n: string) => sk.get(n).getWorldPosition(new Vector3());
  const pose = () => { applyDelta(sk.base, PETAN_DELTA, 1); sk.root.updateMatrixWorld(true); };
  const lowest = () => lowestContactY(PETAN_CONTACT.map((n) => y(n).y), y('Hips').y, TUNE.rest.buttDrop);

  it('ひざは 前(+z)で 左右に ひらき、足は ひざより 外がわ・後ろ(M 字)。足は 地面に ちかい', () => {
    pose();
    const hips = y('Hips');
    for (const side of [1, -1]) {
      const knee = y(side > 0 ? 'LeftLeg' : 'RightLeg'), foot = y(side > 0 ? 'LeftFoot' : 'RightFoot');
      expect(knee.z - hips.z).toBeGreaterThan(0.4); // ひざが 前
      expect(Math.abs(knee.x - hips.x)).toBeGreaterThan(0.05); // ひざが ひらく
      expect(Math.abs(foot.x - hips.x)).toBeGreaterThan(Math.abs(knee.x - hips.x)); // 足は ひざより 外
      expect(foot.z).toBeLessThan(knee.z - 0.4); // 足は ひざより 後ろ
      expect(Math.abs(side * (foot.x - hips.x) - Math.abs(foot.x - hips.x))).toBeLessThan(1e-6); // 左右 それぞれ 自分の がわへ
    }
    expect(hips.y - lowest()).toBeLessThan(0.45); // 腰が 高く うかない(足から 腰まで 0.45 ブロック いない)
  });

  it('地面に つけると お尻・足が ちょうど 地面(めりこまない・うかない)。腰の 高さ hipUp は buttDrop', () => {
    pose();
    const lift = -lowest(); // この 分 上げると いちばん 低い 点が 高さ 0
    const ys = PETAN_CONTACT.map((n) => y(n).y + lift);
    const butt = y('Hips').y + lift - TUNE.rest.buttDrop;
    expect(Math.min(...ys, butt)).toBeCloseTo(0, 6); // 地面に ちょうど
    expect(Math.min(...ys, butt)).toBeGreaterThanOrEqual(-1e-9); // めりこまない
    expect(butt).toBeLessThan(0.2); // お尻が うかない(0.2 ブロック いない)
    expect(Math.min(...ys)).toBeLessThan(0.2); // 足も うかない
  });

  it('頭は 前(+z)へ うなだれる。もとより 低い', () => {
    const rest = new Vector3(); applyDelta(sk.base, {}, 0); sk.root.updateMatrixWorld(true); y('Head').clone();
    rest.copy(y('Head'));
    const hips0 = y('Hips').clone();
    pose();
    const head = y('Head'), hips = y('Hips');
    expect(head.z - hips.z).toBeGreaterThan(rest.z - hips0.z + 0.1);
    expect(head.y - hips.y).toBeLessThan(rest.y - hips0.y);
  });

  it('すわった 高さ: 頭の 骨が 地面から 立った ときの 半分ていど(1.6 ブロック いない)。当たりの 箱の 上の 面が 頭に とどく', () => {
    pose();
    const h = y('Head').y - lowest();
    expect(h).toBeLessThan(1.6);
    const P = TUNE.rest.hit.petan;
    expect(P.up + P.half[1]).toBeGreaterThan(h - 0.2); // 箱が 頭の 高さ ちかくまで
  });
});
