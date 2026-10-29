/**
 * #308 gashaBigActor.ts を 分けた もの: 目の 色（白 ↔ 赤・くるくる目・光線の 間の 光る 赤）と、首の 向き（プレイヤー・光線の ねらいを 見る）。
 */
import { Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import { DEG } from './gashaBigActorBase';

/** 目の 色を 決める。eyeMix = 0 白 〜 1 赤、swirl = つかれて くるくる目、glow = 光線の 光り 具合。次の コマも 作りなおす 必要が あれば -1、なければ 色の 強さ k を 返す */
export function applyEyeColors(m: BigModel, eyeMix: number, swirl: boolean, glow: number): number {
  const c = m.eyes.color;
  const lo = T.eyes.calmColor, hi = T.eyes.angryColor;
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  let k = eyeMix;
  const bk = T.beam;
  m.swirl.root.visible = swirl;
  m.eyes.visible = !swirl; m.eyeHalo.visible = !swirl; // くるくる目の 間は 赤い 目と 光の 輪を かくす
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255] as const;
  const A = rgb(lo), B = rgb(hi);
  c.setRGB(lerp(A[0], B[0], k) / 255, lerp(A[1], B[1], k) / 255, lerp(A[2], B[2], k) / 255);
  // 目から 光線の 間だけ: 赤黒い 色から 強い 赤へ・光の 輪が 濃く（ふだんは 0.3）
  if (glow > 0) {
    const D = rgb(bk.eyeColorDark), H = rgb(bk.eyeColorHot);
    c.setRGB(lerp(D[0], H[0], glow) / 255, lerp(D[1], H[1], glow) / 255, lerp(D[2], H[2], glow) / 255);
    m.eyeHalo.opacity = 0.3 + (bk.haloMax - 0.3) * glow;
    k = 1;
  } else m.eyeHalo.opacity = 0.3;
  m.eyeHalo.color.copy(c);
  m.brow.visible = k > 0.5;
  return glow > 0 ? -1 : k;
}

/** 首の 向き（ラジアン。怒って いる 間 プレイヤーの 方へ。neck と Head に 半分ずつ かける） */
export class NeckLook {
  yaw = 0;
  pitch = 0;
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private readonly tv = new Vector3();
  private readonly tq = new Quaternion();
  private readonly ts = new Vector3();
  private readonly neckIndex: number;

  constructor(names: readonly JointName[]) { this.neckIndex = names.indexOf('neck'); }

  /**
   * 首を 目ざす 向きへ なめらかに 近づける。tp0 = 追わない ときの 上下（噴火・雷で 上を 向く）、track = プレイヤー（か beamPoint）を 目で 追うか。
   * pose = いまの 姿勢（首の 根もとの 向きを 出すのに 使う）。まだ 動いて いる（0 に もどりきって いない）なら true
   */
  update(dt: number, m: BigModel, env: { player(): { x: number; y: number; z: number } }, tp0: number, track: boolean, beamPoint: { x: number; y: number; z: number } | null, pose: readonly Quaternion[]): boolean {
    const A = T.angry;
    let ty = 0, tp = tp0;
    const neck = m.joints.neck, head = m.joints.Head;
    if (track && neck && head && neck.parent) {
      const p = env.player();
      const hp = this.v.setFromMatrixPosition(head.matrixWorld);
      const bl = beamPoint;
      const dir = bl ? this.v2.set(bl.x - hp.x, bl.y - hp.y, bl.z - hp.z) : this.v2.set(p.x - hp.x, p.y + A.lookEyeHeight - hp.y, p.z - hp.z);
      // 首の 根もとの 向き（1 コマ前の 親の 行列 × いまの 姿勢の 首）
      neck.parent.matrixWorld.decompose(this.tv, this.tq, this.ts);
      const ni = this.neckIndex;
      const qn = this.q.copy(this.tq).multiply(ni >= 0 ? pose[ni]! : this.q2.identity());
      dir.applyQuaternion(qn.invert());
      ty = Math.atan2(dir.x, dir.z);
      if (Math.abs(ty) > 2.6 && this.yaw !== 0 && Math.sign(ty) !== Math.sign(this.yaw)) ty = -ty; // ほぼ 真うしろ: 向きが ぱたぱた かわらない ように 今の 向きの がわに そろえる
      tp = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
      const ym = A.lookYawMaxDeg * DEG, pm = A.lookPitchMaxDeg * DEG;
      ty = Math.max(-ym, Math.min(ym, ty)); tp = Math.max(-pm, Math.min(pm, tp));
    }
    const rate = A.lookTurnDegPerSec * DEG * dt;
    const ease = (cur: number, to: number): number => {
      const d = to - cur;
      const step = rate * Math.min(1, 0.25 + Math.abs(d) / (12 * DEG)); // 近づくほど ゆっくり
      return Math.abs(d) <= step ? to : cur + Math.sign(d) * step;
    };
    const oy = this.yaw, op = this.pitch;
    this.yaw = ease(oy, ty); this.pitch = ease(op, tp);
    return this.yaw !== 0 || this.pitch !== 0 || oy !== 0 || op !== 0;
  }

  /** 首と 頭の 姿勢に 首の 向きを 半分ずつ かける */
  apply(m: BigModel): void {
    if (this.yaw === 0 && this.pitch === 0) return;
    const e = this.q2.setFromAxisAngle(this.v2.set(0, 1, 0), this.yaw / 2).multiply(this.q.setFromAxisAngle(this.v2.set(1, 0, 0), this.pitch / 2));
    for (const n of ['neck', 'Head'] as const) if (m.joints[n]) m.joints[n].quaternion.multiply(e);
  }
}
