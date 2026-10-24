/**
 * #293 少女の 決めポーズ「空中で 足を 組んで 座る」(オーナー 2026-10-24 17:31、見本 girl-pose/ref/)。
 * 少女の 骨(休みの 姿勢)に 体の 向き・IK で ポーズを 組み、骨ごとの ローカル回転(PoseBones)に して 返す。
 * 読みこみの とき 1 回だけ 呼ぶ(軽い)。ゲームでの 入り(くるっと 上がる)・ゆれは gashaGirl.ts、数は gashaGirlTuning.ts の intro.float。
 *
 * 向き: モデルの 前 = +Z、上 = +Y、少女の 左 = +X(Meshy の 骨)。長さは もとの GLB の 大きさ(m。腰の 高さ 約 0.98)。
 * かたち: 左足を 前へ 長く のばし(つま先は 下)、右足を 高く 組んで ひざを 立てる(右の 足首は 左ひざの 上)。両手で 右ひざを かかえ、上体は 少し うしろへ。顔は 少し 下を 向く。
 */
import { Quaternion, Vector3, type Object3D } from 'three';
import type { PoseBones } from './gashaGirlPoseData';

/** ポーズに 入れる 骨 */
export const FLOAT_BONES = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'] as const;

const D = Math.PI / 180;
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const tq = new Quaternion(), tq2 = new Quaternion(), tq3 = new Quaternion();
const tv = new Vector3(), tv2 = new Vector3();

const pos = (b: Object3D): Vector3 => { b.updateWorldMatrix(true, false); return b.getWorldPosition(new Vector3()); };

/** 骨を 世界の 軸まわりに 回す */
export function rotW(b: Object3D, axis: Vector3, rad: number): void {
  b.updateWorldMatrix(true, false);
  const w = b.getWorldQuaternion(tq2).premultiply(tq.setFromAxisAngle(axis, rad));
  b.quaternion.copy(b.parent!.getWorldQuaternion(tq3).invert().multiply(w));
  b.updateWorldMatrix(false, true);
}

/** 骨の 向き(この 骨から child へ。child が なければ 骨の +Y)を dir に むける(いちばん 小さい 回転) */
export function aim(b: Object3D, child: Object3D | null, dir: Vector3): void {
  b.updateWorldMatrix(true, true);
  const a = b.getWorldPosition(tv);
  const cur = child ? child.getWorldPosition(tv2).sub(a).normalize() : tv2.set(0, 1, 0).applyQuaternion(b.getWorldQuaternion(tq3));
  const dq = tq.setFromUnitVectors(cur, dir.clone().normalize());
  const w = b.getWorldQuaternion(tq2).premultiply(dq);
  b.quaternion.copy(b.parent!.getWorldQuaternion(tq3).invert().multiply(w));
  b.updateWorldMatrix(false, true);
}

/** 2 本の 骨(a→b→c)の IK: c の 根元を target へ。pole の 方へ まん中の 関節(ひじ・ひざ)を 出す */
export function ik2(a: Object3D, b: Object3D, c: Object3D, target: Vector3, pole: Vector3): void {
  const A = pos(a), Bp = pos(b), C = pos(c);
  const l1 = Bp.distanceTo(A), l2 = C.distanceTo(Bp);
  const to = target.clone().sub(A);
  const d = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const dir = to.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pd = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const mid = A.clone().addScaledVector(dir, l1 * cosA).addScaledVector(pd, l1 * sinA);
  aim(a, b, mid.sub(A));
  aim(b, c, target.clone().sub(pos(b)));
}

const n = (x: number, y: number, z: number) => new Vector3(x, y, z).normalize();

/**
 * 休みの 姿勢の 骨組み(root は 原点・回転なし)から 座りポーズを 作る。骨の 回転は 呼ぶ 前の 姿勢に もどす。
 * ないものが あれば 空の ポーズ(その ときは 立ち姿の まま)。
 */
export function buildFloatPose(root: Object3D): PoseBones {
  const bones = new Map<string, Object3D>();
  for (const k of FLOAT_BONES) { const b = root.getObjectByName(k); if (b) bones.set(k, b); }
  if (bones.size !== FLOAT_BONES.length) return {};
  const B = (k: (typeof FLOAT_BONES)[number]) => bones.get(k)!;
  const saved = FLOAT_BONES.map((k) => B(k).quaternion.clone());
  root.updateMatrixWorld(true);

  // 1) 腰: 座ると 骨盤が うしろへ たおれる(上体は 約 12° うしろへ そる)
  rotW(B('Hips'), X, -14 * D);
  rotW(B('Hips'), Z, 4 * D); // 組んだ 右足の 側へ すこし かたむく
  rotW(B('Spine'), X, 2 * D);

  // 2) 左足: 前へ 長く のばす(もも は 少し 下、すね は 下 前、つま先は 下へ のばす)
  aim(B('LeftUpLeg'), B('LeftLeg'), n(-0.06, -0.05, 1));
  aim(B('LeftLeg'), B('LeftFoot'), n(0.02, -1.2, 0.7));
  aim(B('LeftFoot'), B('LeftToeBase'), n(0.02, -1, 0.35));
  aim(B('LeftToeBase'), null, n(0.0, -1, 0.5));

  // 3) 右足: 高く 組む。右の 足首を 左ひざの 上に のせ、ひざは 上・前へ 立てる
  const lk = pos(B('LeftLeg'));
  const ankle = lk.clone().add(new Vector3(0.02, 0.1, -0.1));
  ik2(B('RightUpLeg'), B('RightLeg'), B('RightFoot'), ankle, n(-0.15, 1, 0.1));
  aim(B('RightFoot'), B('RightToeBase'), n(0.25, -0.75, 0.6));
  aim(B('RightToeBase'), null, n(0.2, -0.6, 0.8));

  // 4) 腕: 両手で 右ひざを かかえる(手首は ひざの 両側。ひじは 外・下へ)
  rotW(B('LeftShoulder'), Y, 10 * D); // 肩を 前へ よせる
  rotW(B('RightShoulder'), Y, -10 * D);
  const knee = pos(B('RightLeg'));
  // 左手(おく)は ひざの 前を まわって 右へ、右手(手前)は ひざの 上に かさねる
  const wl = knee.clone().add(new Vector3(0.07, -0.01, 0.05));
  const wr = knee.clone().add(new Vector3(-0.07, 0.04, -0.01));
  ik2(B('LeftArm'), B('LeftForeArm'), B('LeftHand'), wl, n(1, -0.7, -0.3));
  ik2(B('RightArm'), B('RightForeArm'), B('RightHand'), wr, n(-1, -0.6, -0.3));
  aim(B('LeftHand'), null, n(-1, 0.15, 0.35));
  aim(B('RightHand'), null, n(1, 0.35, 0.4));

  // 5) 首・頭: 少し 下を 向いて 見下ろす(首を かしげる)
  rotW(B('neck'), X, 8 * D);
  rotW(B('Head'), X, 8 * D);
  rotW(B('Head'), Z, -7 * D);

  const out: PoseBones = {};
  for (const k of FLOAT_BONES) { const q = B(k).quaternion; out[k] = [q.x, q.y, q.z, q.w]; }
  FLOAT_BONES.forEach((k, i) => B(k).quaternion.copy(saved[i]!));
  root.updateMatrixWorld(true);
  return out;
}

/** ポーズ 2 つの 間を 混ぜる: 骨ごとに from → to を k(0〜1)。表に ない 骨は base の まま */
export function blendBetween(base: readonly { bone: Object3D; q: Quaternion }[], from: PoseBones | null, to: PoseBones, k: number): void {
  for (const s of base) {
    const a = from?.[s.bone.name], b = to[s.bone.name];
    if (a) s.bone.quaternion.set(a[0], a[1], a[2], a[3]); else s.bone.quaternion.copy(s.q);
    if (b) s.bone.quaternion.slerp(tq.set(b[0], b[1], b[2], b[3]), k);
  }
}

/** 入りの 曲線: 少し しずんで(ため)から 上がり、少し 行きすぎて もどる。t = 入りの 中の 割合(0〜1)。戻り値: lift(高さの 割合)・pose(座りへの 割合) */
export function floatEntry(t: number, dipFrac: number): { lift: number; pose: number; dip: number } {
  const c = Math.min(1, Math.max(0, t));
  const df = Math.min(0.9, Math.max(0, dipFrac));
  if (c < df) { const u = c / Math.max(1e-6, df); return { lift: 0, pose: 0, dip: Math.sin((u * Math.PI) / 2) }; }
  const u = (c - df) / (1 - df);
  const back = 1.6; // 行きすぎの 強さ
  const ob = 1 + (back + 1) * (u - 1) ** 3 + back * (u - 1) ** 2; // easeOutBack
  const pose = 1 - (1 - u) ** 3; // easeOutCubic
  return { lift: ob, pose, dip: Math.max(0, 1 - u * 3) };
}
