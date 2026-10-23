import * as THREE from 'three';
import type { AnimalState, FightBone, FightPose } from '../../contracts';

/**
 * LIVE-4 マッチョ の たたかい の ポーズ（アート 案 C「ヒーロー」。`livestock/art/live4/tools/poses.py` の 数 を そのまま）。
 * はしる → パンチ（ひねる フック）→ 3 回目 は まわって ジャンプ の きりあげ → おうえん・かちポーズ（力こぶ）。
 * 時間 は ステップ（1/60 秒）。パンチ の 区間 は 刀 の 突き（4・2・35）に あわせた 41 ステップ。数 が かわっても 絵 は この 長さ の まま 伸ばさず、
 * 最後 の ポーズ を 保つ（当たる コマ・ダメージ は 遊び の 側 が 決める）。
 */

type V3 = [number, number, number];
interface BoneSrc {
  rot?: V3;
  rots?: V3[];
  off?: V3;
}
interface PoseSrc {
  root?: { off?: V3; rot?: V3; sc?: V3 };
  [bone: string]: BoneSrc | { off?: V3; rot?: V3; sc?: V3 } | undefined;
}
const L = (rots: V3[], off?: V3): BoneSrc => ({ rots, off });

/** 案 C の ポーズ（単位 1/16 ブロック・度） */
const SRC: Record<string, PoseSrc> = {
  run1: { root: { rot: [-18, 0, 0], off: [0, 2.2, 0] }, legL: { rot: [45, 0, 0] }, legR: { rot: [40, 0, 0] }, wingL: L([[65, 0, 0]]), wingR: L([[65, 0, 0]]), comb: { rot: [25, 0, 0] } },
  run2: { root: { rot: [-10, 0, 0], sc: [1.1, 0.9, 1.1] }, legL: { rot: [-10, 0, 0] }, legR: { rot: [-5, 0, 0] }, wingL: L([[50, 0, 0]]), wingR: L([[50, 0, 0]]), comb: { rot: [10, 0, 0] } },
  p_tame: { root: { rot: [2, -25, 0], sc: [1.04, 0.96, 1.04] }, wingR: L([[45, 0, 0]], [0, 0, 1.2]), wingL: L([[-40, 0, 0]]) },
  p_hit: { root: { rot: [-8, 32, 0], off: [0, 0, -1] }, wingR: L([[-90, 0, 0], [0, 72, 0]], [0, 1, -2]), wingL: L([[45, 0, 0]]), legL: { rot: [-22, 0, 0] }, legR: { rot: [22, 0, 0] } },
  p_back: { root: { rot: [-4, 18, 0] }, wingR: L([[-60, 0, 0], [0, 45, 0]]), wingL: L([[20, 0, 0]]) },
  p_step: { root: { off: [0, 1.0, 0], rot: [-4, 0, 0] }, legL: { rot: [20, 0, 0] }, legR: { rot: [15, 0, 0] }, wingL: L([[-25, 0, 0]]), wingR: L([[-25, 0, 0]]) },
  u_squat: { root: { sc: [1.14, 0.82, 1.14], rot: [-10, -30, 0] }, wingR: L([[0, 0, -70], [40, 0, 0]]), wingL: L([[-40, 0, 0]]) },
  u_hit: { root: { sc: [0.9, 1.14, 0.9], off: [0, 3.0, -0.5], rot: [4, 40, -8] }, wingR: L([[0, 0, 62], [0, -90, 0]], [0, 2, -0.8]), wingL: L([[0, 0, 40]]), legL: { rot: [35, 0, 0] }, legR: { rot: [-5, 0, 0] }, head: { rot: [-14, 0, 0] } },
  u_hold: { root: { sc: [0.94, 1.08, 0.94], off: [0, 2.0, -0.5], rot: [3, 70, -6] }, wingR: L([[0, 0, 55], [0, -90, 0]], [0, 1.6, -0.8]), wingL: L([[0, 0, 35]]), legL: { rot: [25, 0, 0] } },
  u_back: { root: { sc: [1.08, 0.92, 1.08], rot: [0, 10, 0] }, wingL: L([[-25, 0, 0]]), wingR: L([[-25, 0, 0]]) },
  f_chest: { root: { rot: [10, -30, 0], sc: [1.05, 1.0, 1.05] }, wingL: L([[0, 0, 40]]), wingR: L([[0, 0, -40]]) },
  f_flex: { root: { rot: [6, -40, 4] }, wingL: L([[0, 0, -32]], [0, 0.8, 0]), wingR: L([[0, 0, -80]], [0, -0.5, 0]), head: { rot: [-10, 25, 0] } },
};

export const FIGHT_BONES = ['legL', 'legR', 'wingL', 'wingR', 'head', 'comb'] as const;
const D = Math.PI / 180;
const qOf = (r: V3): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));

function build(src: PoseSrc): FightPose {
  const root = (src.root ?? {}) as { off?: V3; rot?: V3; sc?: V3 };
  const bones: Record<string, FightBone> = {};
  for (const n of FIGHT_BONES) {
    const b = src[n] as BoneSrc | undefined;
    // art の 合成: Rm = R(rots[k]) … R(rots[0]) R(rot)
    const q = qOf(b?.rot ?? [0, 0, 0]);
    for (const r of b?.rots ?? []) q.premultiply(qOf(r));
    bones[n] = { q: [q.x, q.y, q.z, q.w], off: b?.off ?? [0, 0, 0] };
  }
  return { root: { off: root.off ?? [0, 0, 0], rot: root.rot ?? [0, 0, 0], sc: root.sc ?? [1, 1, 1] }, bones };
}
export const FIGHT_POSES: Readonly<Record<string, FightPose>> = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, build(v)]));

type Key = readonly [number, string];

/** ふつう の パンチ（ため 4 → 当たり 5 → もどり。かまえ の 足ぶみ）。41 ステップ */
export const PUNCH_KEYS: readonly Key[] = [[0, 'p_step'], [4, 'p_tame'], [5, 'p_hit'], [7, 'p_hit'], [16, 'p_back'], [22, 'p_step'], [28, 'p_back'], [34, 'p_step'], [40, 'p_back']];
/** 3 回目 の きりあげ（しゃがむ → 5 で 当たる → のびた まま → もどり）。41 ステップ */
export const UPPER_KEYS: readonly Key[] = [[0, 'p_back'], [3, 'u_squat'], [5, 'u_hit'], [8, 'u_hit'], [16, 'u_hold'], [20, 'u_back'], [40, 'u_back']];
/** かちポーズ（むね を はる 10 → 力こぶ 20）。30 ステップ */
export const FLEX_KEYS: readonly Key[] = [[0, 'u_back'], [10, 'f_chest'], [30, 'f_flex']];
/** おうえん（力こぶ 上 15 → 下 15 を くり返す）。30 ステップ */
export const CHEER_KEYS: readonly Key[] = [[0, 'f_flex'], [15, 'f_chest'], [30, 'f_flex']];
/** はしる: はねて 12 ステップ で 1 往復（1 → 2 → 1） */
export const RUN_PERIOD = 12;
export const CHEER_PERIOD = 30;

const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 書き込み 先 の ポーズ を 1 つ 作る（毎フレーム new しない ため、使い回す） */
export function makeFightPose(): FightPose {
  const bones: Record<string, FightBone> = {};
  for (const n of FIGHT_BONES) bones[n] = { q: [0, 0, 0, 1], off: [0, 0, 0] };
  return { root: { off: [0, 0, 0], rot: [0, 0, 0], sc: [1, 1, 1] }, bones };
}

/** `out` = `a` と `b` を t で まぜた ポーズ */
export function mixPoseInto(a: FightPose, b: FightPose, t: number, out: FightPose): FightPose {
  for (const n of FIGHT_BONES) {
    const x = a.bones[n]!;
    const y = b.bones[n]!;
    const o = out.bones[n]!;
    qa.set(x.q![0], x.q![1], x.q![2], x.q![3]);
    qb.set(y.q![0], y.q![1], y.q![2], y.q![3]);
    qa.slerp(qb, t);
    o.q![0] = qa.x;
    o.q![1] = qa.y;
    o.q![2] = qa.z;
    o.q![3] = qa.w;
    for (let i = 0; i < 3; i++) o.off![i] = lerp(x.off![i]!, y.off![i]!, t);
  }
  for (let i = 0; i < 3; i++) {
    out.root.off[i] = lerp(a.root.off[i]!, b.root.off[i]!, t);
    out.root.rot[i] = lerp(a.root.rot[i]!, b.root.rot[i]!, t);
    out.root.sc[i] = lerp(a.root.sc[i]!, b.root.sc[i]!, t);
  }
  return out;
}

function copyInto(a: FightPose, out: FightPose): FightPose {
  return mixPoseInto(a, a, 0, out);
}

/** キー（ステップ, ポーズ名）の 列 を なめらかに つなぐ。`hold` なら まぜず に その 時点 の キー の ポーズ（動き の 強さ 0） */
export function sampleInto(keys: readonly Key[], t: number, out: FightPose, hold = false): FightPose {
  const first = keys[0]!;
  if (t <= first[0]) return copyInto(FIGHT_POSES[first[1]]!, out);
  for (let i = 1; i < keys.length; i++) {
    const [t1, n1] = keys[i]!;
    if (t <= t1) {
      const [t0, n0] = keys[i - 1]!;
      if (hold) return copyInto(FIGHT_POSES[t >= t1 ? n1 : n0]!, out);
      return mixPoseInto(FIGHT_POSES[n0]!, FIGHT_POSES[n1]!, smooth((t - t0) / Math.max(1e-6, t1 - t0)), out);
    }
  }
  return copyInto(FIGHT_POSES[keys[keys.length - 1]![1]]!, out);
}

/** たたかい の 状態 に 応じた ポーズ（`out` に 書く）。たたかい の 状態 で なければ null */
export function fightPoseOf(state: AnimalState, t: number, hold: boolean, out: FightPose): FightPose | null {
  switch (state) {
    case 'run': {
      const w = hold ? ((t % RUN_PERIOD) + RUN_PERIOD) % RUN_PERIOD < RUN_PERIOD / 2 ? 0 : 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / RUN_PERIOD);
      return mixPoseInto(FIGHT_POSES.run1!, FIGHT_POSES.run2!, w, out);
    }
    case 'punch':
      return sampleInto(PUNCH_KEYS, t, out, hold);
    case 'upper':
      return sampleInto(UPPER_KEYS, t, out, hold);
    case 'flex':
      return sampleInto(FLEX_KEYS, t, out, hold);
    case 'cheer':
      return sampleInto(CHEER_KEYS, ((t % CHEER_PERIOD) + CHEER_PERIOD) % CHEER_PERIOD, out, hold);
    default:
      return null;
  }
}
