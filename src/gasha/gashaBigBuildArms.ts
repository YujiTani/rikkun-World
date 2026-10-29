/**
 * #308 gashaBig.ts を 分けた もの: うで 4 節（かた・上わん・前わん・手）の 見た目と 当たり。
 */
import { Euler, Quaternion, Vector3 } from 'three';
import { BONE, BONE_D, C, nailColor, vec, frameOf } from './gashaBigBuilder';
import { JointName } from './gashaBigTypes';
import type { BuildCtx } from './gashaBigBuildCtx';

export type ArmEnd = { s: number; S: Vector3; E: Vector3; joint: JointName };

/** うで（のぼれるように 長め・ゆるい 坂。手を 地面に ついて すすむ）。手の 先の 点と、上わんの はし（うでの 足場の 雲用）を 返す */
export function buildArms(c: Pick<BuildCtx, 'b' | 'A' | 'armPts' | 'mossAlong'>): { groundPts: Vector3[]; armEnds: ArmEnd[] } {
  const { b, A, armPts, mossAlong } = c;
  const cl = C.top, cd = C.topDark;
  const groundPts: Vector3[] = [vec(0, 0, 0)];
  const armEnds: { s: number; S: Vector3; E: Vector3; joint: JointName }[] = []; // 上わんの かたがわの はし（あとで うでの 足場の 雲を つける）
  let nailI = 0;
  const th = A.handThick;
  for (const s of [-1, 1]) {
    const nmS = s > 0 ? 'Left' : 'Right', sd = s < 0 ? 'R' : 'L';
    const { S, M, E, Wr } = armPts[nmS]!;
    const jA = `${nmS}Arm` as JointName, jM = `${nmS}ArmMid` as JointName, jF = `${nmS}ForeArm` as JointName, jH = `${nmS}Hand` as JointName;
    const upper = b.root(jA), mid = b.root(jM), fore = b.root(jF), hand = b.root(jH);
    const uF = Wr.clone().sub(E).normalize(), uM = E.clone().sub(M).normalize();
    // 節 1（J1〜J2）: 関節 Arm（そで ぼろぼろ）。かたの 外の ふくらみ から 上わんの なかほど まで
    upper.box(4.6, 4.6, 4.6, S.x, S.y, S.z, BONE_D); // かたの 関節
    upper.seg(S, M, 3.6, 3.6, BONE); upper.seg(S, M, 1.2, 1.2, BONE_D, 0.1, 0.9);
    mossAlong(upper, S, M, [0.2, 0.55, 0.8], 2.0);
    upper.seg(S, M, 6.0, A.upperThick, cl, -0.08, 0.86);
    upper.seg(S, M, 6.4, A.upperThick + 0.4, C.stripe, 0.8, 0.88); upper.seg(S, M, 6.0, A.upperThick, cd, 0.86, 0.94);
    for (let i = 0; i < 3; i++) { const c = S.clone().lerp(M, 0.9 + i * 0.01); upper.box(1.6, 2.4, 1.6, c.x + (i - 1) * 2.1 * s, c.y - 0.6 - (i % 2) * 0.9, c.z + 1.0, cd); }
    // 節 2（J2〜J3）: 関節 ArmMid。上わんの なかほど から 前わんの なかほど まで（ひじは この まんなか）
    mid.box(4.4, 4.4, 4.4, M.x, M.y, M.z, BONE_D);
    mid.seg(M, E, A.foreWidth, A.foreThick, BONE); mid.seg(M.clone().add(vec(1.1 * s, 0.3, 0)), E.clone().add(vec(1.1 * s, 0.3, 0)), 1.2, 1.2, BONE_D);
    mossAlong(mid, M, E, [0.3, 0.6], 1.9);
    const el = M.clone().lerp(E, 0.5); // ひじ
    mid.box(4.0, 4.0, 4.0, el.x, el.y + 0.3, el.z, BONE);
    // 節 3（J3〜J4）: 関節 ForeArm。前わんの なかほど から 手首 まで
    fore.box(4.4, 4.4, 4.4, E.x, E.y, E.z, BONE_D); fore.box(3.6, 3.6, 3.6, E.x, E.y + 0.3, E.z, BONE);
    fore.seg(E, Wr, A.foreWidth, A.foreThick, BONE); fore.seg(E.clone().add(vec(1.1 * s, 0.3, 0)), Wr.clone().add(vec(1.1 * s, 0.3, 0)), 1.2, 1.2, BONE_D);
    mossAlong(fore, E, Wr, [0.3, 0.6], 1.9);
    // 手: 関節 Hand（てのひら と 指。先に ネイル。地面に ぺたんと）
    hand.box(A.foreWidth - 0.4, 3.0, 3.6, Wr.x, Wr.y, Wr.z, BONE_D);
    const palmZ = Wr.z + 3.4, palmX = Wr.x;
    hand.box(6.4, th, 7.0, palmX, th / 2, palmZ, BONE_D); hand.box(5.6, th, 6.2, palmX, th / 2 + 0.05, palmZ + 0.4, BONE);
    let tipZ = palmZ;
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4;
      const ang = thumb ? s * -0.95 : (f - 1.5) * 0.19;
      let p = vec(palmX + (thumb ? s * -3.0 : (f - 1.5) * 1.5), th * 0.5, palmZ + (thumb ? -0.5 : 3.5));
      const lens = thumb ? [2.4, 2.2] : [3.4, 3.0, 2.5];
      let dir = vec(Math.sin(ang), 0, Math.cos(ang));
      lens.forEach((L, k) => {
        const rise = k === lens.length - 1 ? 0.2 : k === 1 ? 0.06 : 0;
        dir = vec(dir.x, rise, dir.z).normalize();
        const n = p.clone().addScaledVector(dir, L);
        hand.seg(p, n, 1.25, Math.min(1.15, th * 0.95), k % 2 ? BONE : BONE_D);
        hand.box(1.5, Math.min(1.4, th), 1.5, p.x, p.y, p.z, BONE_D);
        p = n;
      });
      tipZ = Math.max(tipZ, p.z);
      const eu = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(vec(0, 0, 1), dir.clone().normalize()));
      const tip = p.clone().addScaledVector(dir, 0.2).add(vec(0, 0.45, 0));
      hand.box(1.15, 0.55, 1.5, tip.x, tip.y, tip.z, nailColor(nailI++), [eu.x, eu.y, eu.z]);
    }
    groundPts.push(vec(palmX, 0, palmZ), vec(palmX, 0, tipZ));
    // 指（ひらいた 4 本）の 当たり: 外がわ 2 本・内がわ 2 本を それぞれ 1 つの 箱に（根元の はばより 先が ひろがる）
    for (const k of [0, 1]) {
      const ang = k === 0 ? -0.19 : 0.19, bx = palmX + (k === 0 ? -1.5 : 1.5); // 2 本の まんなかの かたむきと 根元の 場所
      hand.hit(`handFingers${k === 0 ? 'A' : 'B'}${sd}`, 4.4, th, 9.0, bx + Math.sin(ang) * 4.5, th / 2, palmZ + 3.5 + Math.cos(ang) * 4.5, [0, ang, 0]);
    }
    // 親指（てのひらの 内がわへ 開く）の 当たり。ほかの 指は てのひらの 箱に ふくまれる
    hand.hit(`handThumb${sd}`, 2.6, th, 5.2, palmX - s * 4.87, th / 2, palmZ + 0.84, [0, -s * 0.95, 0]);
    // ---- 当たり（のぼる 道）。目に 見える 面と そろえる
    const lineHit = (name: string, joint: JointName, a: Vector3, bb: Vector3, width: number, thick: number): void => {
      const u = bb.clone().sub(a), len = u.length(); u.normalize();
      const { side, n } = frameOf(u);
      b.hits.push({ name, joint, c: a.clone().add(bb).multiplyScalar(0.5), axes: [side, n, u], half: [width / 2, thick / 2, len / 2] });
    };
    // 上わんの 当たりは ひじの 先まで 少し のばして、前わんの 当たりと かさねる（つなぎ目の 段を なくす）
    armEnds.push({ s, S: S.clone(), E: M.clone(), joint: jA });
    lineHit(`upperArm${sd}`, jA, S, M.clone().addScaledVector(M.clone().sub(S).normalize(), A.elbowExtend), A.upperWidth, A.upperThick - 0.4);
    lineHit(`upperArmMid${sd}`, jM, M, E.clone().addScaledVector(uM, A.elbowExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    // 前わんは 手首の 先まで 少し のばして 手に つなぐ（手首が 浮いて 見えても 段が 1 つに なる）
    lineHit(`foreArm${sd}`, jF, E, Wr.clone().addScaledVector(uF, A.foreExtend), A.foreWidth - 0.2, A.foreThick - 0.2);
    b.hits.push({ name: `hand${sd}`, joint: jH, c: vec(palmX, th / 2, (palmZ - 3.5 + tipZ) / 2), axes: [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)], half: [3.4, th / 2, (tipZ - palmZ + 3.5) / 2] });
  }
  return { groundPts, armEnds };
}
