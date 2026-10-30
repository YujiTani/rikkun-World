/**
 * #308 gashaBig.ts を 分けた もの: 体を 作る ときの 共通の 材料（関節の 場所・腕の 関節・こけを 置く 道具・胴体の 親・道の 数）。
 * buildBig が 1 回 作って、部位ごとの gashaBigBuild*.ts に 要る 物だけ わたす（乱数 rnd は 同じ 順で 使う）。
 */
import { Builder, Node, MOSS, makeRnd, vec } from './gashaBigBuilder';
import { TUNE as T } from './gashaBigTuning';
import { armPoints } from './gashaBigArm';
import type { JointName } from './gashaBigTypes';
import { Vector3 } from 'three';

export interface BuildCtx {
  b: Builder;
  rnd: () => number;
  HIP: Vector3;
  Tt: (x: number, y: number, z: number) => Vector3;
  A: typeof T.arm;
  headPos: Vector3;
  rest: Record<JointName, Vector3>;
  armPts: Record<string, { S: Vector3; M: Vector3; E: Vector3; Wr: Vector3 }>;
  moss: (p: Node, x: number, y: number, z: number, n?: number, spread?: number) => void;
  mossAlong: (p: Node, a: Vector3, bb: Vector3, ts: number[], up?: number) => void;
  torso: Node;
  tj: (j: JointName) => Node;
  vJoint: (i: number) => JointName;
  K: typeof T.core;
  KT: typeof T.core.tunnel;
  SH: typeof T.core.sideHole;
  /** 左の かべの 穴（なければ null） */
  SHOLE: { y0: number; y1: number; z0: number; z1: number } | null;
  /** 道（トンネル）の 左右の はしと 天井、途中の 穴の はじ */
  TX0: number; TX1: number; CEIL: number; G0: number; G1: number;
}

/** 体を 作る 材料を 作る。b と rnd と 胴体の 親 torso を ここで 作る（作る 順は もとの まま） */
export function makeBuildCtx(): BuildCtx {
  const b = new Builder();
  const rnd = makeRnd(7);
  const PITCH = 0.55;
  const HIP = vec(0, 4, -14);
  const Tt = (x: number, y: number, z: number) => vec(x * 1.45, y * 1.1, z * 1.3).applyAxisAngle(vec(1, 0, 0), PITCH).add(HIP);
  const A = T.arm;

  // 関節の 場所（休みの 姿勢）
  const hn = Tt(0, 38, -6);
  const headPos = vec(hn.x, hn.y + 0.6, hn.z + 5.6);
  const rest = {
    Hips: HIP.clone(), Spine: Tt(0, 6, -6), Spine01: Tt(0, 16, -6), Spine02: Tt(0, 26, -6), neck: Tt(0, 36, -6), Head: headPos.clone(),
  } as Record<JointName, Vector3>;
  // 腕の 関節 4 つ: S = J1（かたの 外）、M = J2（上わんの なかほど）、E = J3（前わんの なかほど）、Wr = J4（手首）。gashaBigArm.ts
  const armPts: Record<string, { S: Vector3; M: Vector3; E: Vector3; Wr: Vector3 }> = {};
  for (const s of [-1, 1]) {
    const nm = s > 0 ? 'Left' : 'Right';
    const S = Tt(s * 12.5, 33.2, -0.5);
    const { p: [, M, E, Wr] } = armPoints(S, s, A);
    rest[`${nm}Shoulder` as JointName] = Tt(s * 4, 34.5, 1.4);
    rest[`${nm}Arm` as JointName] = S; rest[`${nm}ArmMid` as JointName] = M; rest[`${nm}ForeArm` as JointName] = E; rest[`${nm}Hand` as JointName] = Wr;
    armPts[nm] = { S, M, E, Wr };
  }

  const moss = (p: Node, x: number, y: number, z: number, n = 3, spread = 1.6): void => {
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rnd() * 1.3;
      p.box(s, 0.5 + rnd() * 0.6, s, x + (rnd() - 0.5) * spread, y + rnd() * 0.3, z + (rnd() - 0.5) * spread, MOSS[Math.floor(rnd() * 3)]!);
    }
  };
  const mossAlong = (p: Node, a: Vector3, bb: Vector3, ts: number[], up = 1.4): void => {
    for (const t of ts) { const c = a.clone().lerp(bb, t); moss(p, c.x, c.y + up, c.z, 3, 1.8); }
  };

  const torso = b.root('Spine02').group(HIP.x, HIP.y, HIP.z, [PITCH, 0, 0], [1.45, 1.1, 1.3]);
  const tj = (j: JointName) => torso.at(j);
  const vJoint = (i: number): JointName => (i < 3 ? 'Hips' : i < 9 ? 'Spine' : i < 15 ? 'Spine01' : 'Spine02');
  const K = T.core, KT = K.tunnel;
  const SH = K.sideHole;
  /** 左の かべの 穴（なければ null）。y は 道の 左の かべの 高さ（19.6 〜 天井）に おさめる */
  const SHOLE = SH.enabled ? { y0: Math.max(19.6, SH.y - SH.h / 2), y1: Math.min(T.core.tunnel.ceilY, SH.y + SH.h / 2), z0: SH.z - SH.w / 2, z1: SH.z + SH.w / 2 } : null;
  const TX0 = KT.x - KT.width / 2, TX1 = KT.x + KT.width / 2, CEIL = KT.ceilY, G0 = KT.gap.z0, G1 = KT.gap.z1; // 道（トンネル）の 左右の はしと 天井、途中の 穴の はじ
  return { b, rnd, HIP, Tt, A, headPos, rest, armPts, moss, mossAlong, torso, tj, vJoint, K, KT, SH, SHOLE, TX0, TX1, CEIL, G0, G1 };
}
