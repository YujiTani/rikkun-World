/**
 * #293 試作: はう クリップの「ついている 手」が 地面を すべらない ように、腕を 作りなおす（焼く とき 1 回だけ。毎コマの 計算は ない）。
 *  1. うつした 姿勢（FK）で 手首の 高さが いちばん 低い 所から tol 以内の コマを「手が 地面に ついている」と みなす（ふち は なめらかに 重み 0〜1）。
 *  2. ついている あいだ 手首の 世界の 位置を 止める。からだは 前へ 進むので、からだの 座標では 手首が うしろへ 動く（速さ = からだの 速さ）。
 *     手首の 高さは 休みの 姿勢の 手首の 高さ（手のひらが 地面に ぺたん）、横と 前後は ついた しゅんかんの 位置。
 *  3. 2 本の 骨（上わん・前わん）の 2 点 IK で 肩 → ひじ → 手首を 目標に 合わせる。ひじの まがる 向きは うつした 姿勢の ままに する。
 *     手の ひらは 地面に 平ら（世界で 回転なし）にする。
 *     目標は「うつした 手首」と「ついた 位置」を 重みで まぜた 点（重み 0 = うつした 姿勢と おなじ なので、手が はなれる とき 段が 出ない）。
 *  4. 計算した 腕の 回転を クリップに 書きもどす（手のひらの 平らさだけ 重みで まぜる）。
 * 手が はなれている コマ（重み 0）は うつした 姿勢の まま。
 * クリップは 左 → 右 → 左 … と 順に つながるので、ついている 期間が クリップの 境目を また ぐときは、前の クリップの ついた 位置を 引きつぐ（境目で 手が すべらない）。
 */
import { Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBig';
import type { BakedClip } from './gashaBigMotion';

export interface PlantOpts {
  /** 手首が いちばん 低い 所から この 高さ 以内で 重み 1（もとの 座標）。2 倍で 重み 0 */
  tol: number;
  /** 手首の 横の 位置: 休みの 位置から ついた 位置までの 何割を 使うか（0 = 休みの 位置、1 = ついた 位置） */
  spread: number;
  /** からだが 進む 速さ（もとの 座標 / クリップの 秒） */
  speed: number;
}

export interface PlantReport {
  /** 手ごとの「ついている」コマの 数（重み 0.5 以上） */
  planted: { Left: number; Right: number };
  /** 目標に とどかず 伸ばし 切った コマの 数 */
  overreach: number;
  /** とどかなかった 距離の いちばん 大きい 値（もとの 座標） */
  overreachMax: number;
}

const SIDES = ['Left', 'Right'] as const;
type Side = (typeof SIDES)[number];

interface Info {
  /** 手首の 位置（うつした 姿勢） */
  wrist: Record<Side, Vector3[]>;
  /** ついている 重み 0〜1 */
  w: Record<Side, number[]>;
}

/** clips を 順に くり返す もの として、ついている 手が すべらない ように 各 clip.q の 腕を 作りなおす。model は 一時的に 使い、終わると 休みの 姿勢に もどす */
export function plantHands(model: BigModel, clips: BakedClip[], o: PlantOpts): PlantReport[] {
  const g = model.group;
  const keepPos = g.position.clone(), keepRot = g.rotation.y, keepScale = g.scale.x;
  g.position.set(0, 0, 0); g.rotation.y = 0; g.scale.setScalar(1);
  // 関節の 並びは model.joints の 並び（親が 先）。clip.q の 関節の 並びと おなじ
  const NAMES = Object.keys(model.joints) as JointName[];
  const idx = new Map<string, number>(NAMES.map((n, i) => [n, i] as const));
  const N = NAMES.length;
  const J = model.joints;
  const p = new Vector3();
  const setFrame = (clip: BakedClip, q: Float32Array, f: number): void => {
    for (let j = 0; j < N; j++) {
      const k = (f * N + j) * 4;
      J[NAMES[j]!].quaternion.set(q[k]!, q[k + 1]!, q[k + 2]!, q[k + 3]!);
    }
    g.updateMatrixWorld(true);
    void clip;
  };

  // 1. 手首の 位置（うつした 姿勢）。いちばん 低い 高さは 全クリップで そろえる
  const infos: Info[] = clips.map((c) => {
    const wrist: Info['wrist'] = { Left: [], Right: [] };
    for (let f = 0; f < c.frames; f++) {
      setFrame(c, c.q, f);
      for (const s of SIDES) wrist[s].push(J[`${s}Hand`].getWorldPosition(p).clone());
    }
    return { wrist, w: { Left: [], Right: [] } };
  });
  let low = Infinity;
  for (const inf of infos) for (const s of SIDES) for (const v of inf.wrist[s]) low = Math.min(low, v.y);
  // 手首が 低い ほど 1（tol 以内で 1、3 倍で 0。なめらか）
  const weight = (y: number): number => {
    const t = Math.max(0, Math.min(1, 1 - (y - low - o.tol) / Math.max(1e-6, 2 * o.tol)));
    return t * t * (3 - 2 * t);
  };
  for (const inf of infos) for (const s of SIDES) inf.w[s] = inf.wrist[s].map((v) => weight(v.y));

  const reports: PlantReport[] = [];
  const S = new Vector3(), E = new Vector3(), Wr = new Vector3(), u = new Vector3(), pole = new Vector3(), tmp = new Vector3(), dirA = new Vector3(), dirF = new Vector3();
  const qa = new Quaternion(), qf = new Quaternion(), qh = new Quaternion(), qm = new Quaternion(), Wa = new Quaternion(), Wf = new Quaternion(), Wsh = new Quaternion(), tq = new Quaternion();

  for (let ci = 0; ci < clips.length; ci++) {
    const clip = clips[ci]!, F = clip.frames;
    const prev = (ci - 1 + clips.length) % clips.length;
    const fk = clip.q.slice(); // 書きかえる 前の（うつした だけの）姿勢
    const fkq = (f: number, name: string, out: Quaternion): Quaternion => { const k = (f * N + idx.get(name)!) * 4; return out.set(fk[k]!, fk[k + 1]!, fk[k + 2]!, fk[k + 3]!); };
    const put = (f: number, name: string, q: Quaternion, w: number): void => {
      const A = fkq(f, name, tq);
      if (A.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      A.slerp(q, w);
      const k = (f * N + idx.get(name)!) * 4;
      clip.q[k] = A.x; clip.q[k + 1] = A.y; clip.q[k + 2] = A.z; clip.q[k + 3] = A.w;
    };
    const planted = { Left: 0, Right: 0 };
    // 2. 目標（ついた しゅんかんの 位置から、からだが 進む ぶん うしろへ）。前の クリップの つづきに なる 期間も 前の ついた 位置から
    const target: Record<Side, (Vector3 | null)[]> = { Left: [], Right: [] };
    for (const s of SIDES) {
      // [この クリップ, 前の クリップ, この クリップ] を つないで、さいごの 部分を 使う
      const ext = (pick: (i: Info) => unknown[]): unknown[] => [...pick(infos[ci]!), ...pick(infos[prev]!), ...pick(infos[ci]!)];
      const wv = ext((i) => i.w[s]) as number[];
      const ws = ext((i) => i.wrist[s]) as Vector3[];
      const off = infos[prev]!.w[s].length + F; // この クリップの はじまり（つないだ 列の 中）
      const rest = model.rest[`${s}Hand`];
      for (let f = 0; f < F; f++) {
        const i = off + f;
        if (infos[ci]!.w[s][f]! >= 0.5) planted[s]++;
        if (wv[i]! <= 0) { target[s].push(null); continue; }
        let b0 = i;
        while (b0 > 0 && wv[b0 - 1]! > 0) b0--;
        let sc = -1;
        for (let k = b0; k < wv.length && wv[k]! > 0; k++) if (wv[k]! >= 0.5) { sc = k; break; }
        if (sc < 0) { target[s].push(null); continue; }
        const w0 = ws[sc]!;
        // クリップの 長さは どれも おなじ fps。前の クリップの コマ数が ちがう ときも 列の 位置で 数える
        target[s].push(new Vector3(rest.x + (w0.x - rest.x) * o.spread, rest.y, w0.z - (o.speed * (i - sc)) / clip.fps));
      }
    }

    // 3・4. 2 点 IK
    let overreach = 0, overreachMax = 0;
    for (let f = 0; f < F; f++) {
      setFrame(clip, fk, f);
      for (const s of SIDES) {
        const T0 = target[s][f];
        const w = infos[ci]!.w[s][f]!;
        if (!T0 || w <= 0) continue;
        // 目標 = うつした 手首と ついた 位置を 重みで まぜた 点（重み 0 では うつした 姿勢と おなじ → つなぎ目に 段が 出ない）
        const T = infos[ci]!.wrist[s][f]!.clone().lerp(T0, w);
        const A = J[`${s}Arm`], Fa = J[`${s}ForeArm`], H = J[`${s}Hand`];
        const L1 = model.rest[`${s}ForeArm`].distanceTo(model.rest[`${s}Arm`]);
        const L2 = model.rest[`${s}Hand`].distanceTo(model.rest[`${s}ForeArm`]);
        const rdA = model.rest[`${s}ForeArm`].clone().sub(model.rest[`${s}Arm`]).normalize();
        const rdF = model.rest[`${s}Hand`].clone().sub(model.rest[`${s}ForeArm`]).normalize();
        A.getWorldPosition(S); Fa.getWorldPosition(E); H.getWorldPosition(Wr);
        // ひじの 向き（うつした 姿勢の まがり 方）
        u.copy(Wr).sub(S).normalize();
        pole.copy(E).sub(S);
        pole.addScaledVector(u, -pole.dot(u));
        if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0);
        pole.normalize();
        // 目標へ
        u.copy(T).sub(S);
        let d = u.length();
        const maxD = L1 + L2 - 1e-3, minD = Math.abs(L1 - L2) + 1e-3;
        if (d > maxD) { overreach++; overreachMax = Math.max(overreachMax, d - maxD); }
        d = Math.max(minD, Math.min(maxD, d));
        u.normalize();
        pole.addScaledVector(u, -pole.dot(u));
        if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(u, u.y);
        pole.normalize();
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        E.copy(S).addScaledVector(u, a).addScaledVector(pole, h);
        // 上わんの 向きを ひじへ（もとの 姿勢の ひねりを なるべく のこす）
        A.getWorldQuaternion(Wa);
        dirA.copy(rdA).applyQuaternion(Wa);
        tmp.copy(E).sub(S).normalize();
        qm.setFromUnitVectors(dirA, tmp);
        Wa.premultiply(qm);
        A.parent!.getWorldQuaternion(Wsh);
        qa.copy(Wsh).invert().multiply(Wa);
        // 前わんを 手首へ（目標は 伸ばした とき の 向き）
        fkq(f, `${s}ForeArm`, qf);
        Wf.copy(Wa).multiply(qf);
        dirF.copy(rdF).applyQuaternion(Wf);
        tmp.copy(u).multiplyScalar(d).sub(E.clone().sub(S));
        if (tmp.lengthSq() < 1e-10) tmp.copy(dirF);
        tmp.normalize();
        qm.setFromUnitVectors(dirF, tmp);
        Wf.premultiply(qm);
        qf.copy(Wa).invert().multiply(Wf);
        // 手の ひらは 地面に 平ら（世界で 回転なし）
        qh.copy(Wf).invert();
        put(f, `${s}Arm`, qa, 1);
        put(f, `${s}ForeArm`, qf, 1);
        put(f, `${s}Hand`, qh, w);
      }
    }
    reports.push({ planted, overreach, overreachMax });
  }

  for (const n of NAMES) J[n].quaternion.set(0, 0, 0, 1);
  g.position.copy(keepPos); g.rotation.y = keepRot; g.scale.setScalar(keepScale);
  g.updateMatrixWorld(true);
  return reports;
}
