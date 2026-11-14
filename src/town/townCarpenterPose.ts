import data from './repairFinal.json';

/**
 * 街の だいくさん（こやの 建築士さん）の しぐさ: 設計 JSON（repairFinal.json の motions）の コマの 表から 骨の 角度（度）を 出す。
 * 回す 順は x → y → z（Three.js の Euler 'ZYX'）。角度は 360 で まるめない（たたくの 14 → 16 コマで tool.x は −136 → −205 と へる）。
 * 計算だけ（three なし）。out を 使いまわして 毎フレーム new しない。
 */
export type MotionName = 'tap' | 'bow' | 'walk';
type Deg3 = [number, number, number];
export const BONE_NAMES = ['body', 'head', 'armL', 'armR', 'tool', 'legL', 'legR'] as const;
type PoseBone = (typeof BONE_NAMES)[number];

export type Pose = Record<PoseBone, Deg3> & {
  /** 体の 上下（1/16 ブロック。あるく ときの はずみ） */
  bodyUp: number;
};

type Ease = 'smooth' | 'accel' | 'hold';
type Key = [number, Partial<Record<PoseBone, number[]>>, Ease];

const M = data.motions as unknown as Record<MotionName, { len: number; keys: Key[] }>;

export const MOTION_LEN: Record<MotionName, number> = { tap: M.tap.len, bow: M.bow.len, walk: M.walk.len };

export const newPose = (): Pose => ({ body: [0, 0, 0], head: [0, 0, 0], armL: [0, 0, 0], armR: [0, 0, 0], tool: [28, 0, -10], legL: [0, 0, 0], legR: [0, 0, 0], bodyUp: 0 });

const ZERO: readonly number[] = [0, 0, 0];

/** m の f コマ目（小数 可。0 〜 len）の 角度を out に 書いて 返す */
export function poseAt(m: MotionName, f: number, out: Pose): Pose {
  if (m === 'walk') {
    const s = Math.sin((2 * Math.PI * f) / M.walk.len);
    for (const b of BONE_NAMES) out[b][0] = out[b][1] = out[b][2] = 0;
    out.legL[0] = 22 * s;
    out.legR[0] = -22 * s;
    out.armL[0] = -14 * s;
    out.tool[0] = 28;
    out.tool[2] = -10;
    out.bodyUp = 0.5 * Math.abs(s);
    return out;
  }
  out.bodyUp = 0;
  const K = M[m].keys;
  let p0 = K[0]![1];
  let p1 = K[0]![1];
  let u = 0;
  for (let i = 0; i + 1 < K.length; i++) {
    const [a, pa] = K[i]!;
    const [b, pb, ease] = K[i + 1]!;
    p0 = pa;
    p1 = pb;
    if (f >= a && f <= b) {
      const t = b > a ? (f - a) / (b - a) : 1;
      u = ease === 'accel' ? t * t : ease === 'smooth' ? t * t * (3 - 2 * t) : 0;
      break;
    }
    if (i + 2 === K.length) {
      p0 = p1 = pb;
      u = 0;
    }
  }
  for (const b of BONE_NAMES) {
    const a = p0[b] ?? ZERO;
    const c = p1[b] ?? ZERO;
    for (let k = 0; k < 3; k++) out[b][k] = a[k]! + (c[k]! - a[k]!) * u;
  }
  return out;
}
