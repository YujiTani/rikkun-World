/**
 * がしゃどくろ大の 腕の 関節の 場所（休みの 姿勢。もとの 座標）。#293 段 1（yuzu 2026-10-24: 腕の 関節を 4 つに、外へ 開いた 腕、ひじを 地面へ 近く、少し 曲げる）。
 * 関節 4 つ = J1 かたの 外の ふくらみ（Arm）→ J2 上わんの なかほど（ArmMid）→ J3 前わんの なかほど（ForeArm）→ J4 手首（Hand）。
 * 5 つの 節 = かた〜J1・J1〜J2・J2〜J3・J3〜J4・手。ひじは J2 と J3 の あいだ（まんなか）。
 * 曲がりは ひじの まわりに ばらす（bendDeg の 半分ずつ 2 か所）。
 */
import { Vector3 } from 'three';

export interface ArmShape {
  /** 節の 長さ [J1〜J2, J2〜J3, J3〜J4]（もとの 座標） */
  segLen: readonly [number, number, number];
  /** 上から 見て 前（+z）から 外へ 開く 角（度）。0 = まっすぐ 前、90 = 真横 */
  spreadDeg: number;
  /** ひじ（J2 と J3 の まんなか）の 地面からの 高さ（もとの 座標。地面 = y 0） */
  elbowHeight: number;
  /** 曲げ角（度）: 上わんの 向きに くらべ、前わんの 向きが この ぶん ゆるく（水平に）なる */
  bendDeg: number;
  /** 手首（J4）の 高さ（もとの 座標。地面 = y 0。地面の すこし 下） */
  wristY: number;
}

export interface ArmPoints {
  /** J1〜J4 の 場所（J1 = 引数の 肩の 外） */
  p: [Vector3, Vector3, Vector3, Vector3];
  /** 節ごとの 下がり 角（度。水平 = 0、下向き = +）。[J1〜J2, J2〜J3, J3〜J4] */
  pitchDeg: [number, number, number];
  /** ひじ（J2 と J3 の まんなか）の 高さ */
  elbowY: number;
}

const D = Math.PI / 180;

/**
 * 肩の 外（J1）から 4 つの 関節を 決める。side = +1（左）/ −1（右）。
 * 上わんの 下がり 角 p0 は、ひじの 高さが elbowHeight に なるように 二分法で 解く（J2〜J3 は p0 − bend/2）。
 * 最後の 節（J3〜J4）は 手首が wristY に ちょうど つくように 角を 決める（届かない ときは 届く 所まで）。
 */
export function armPoints(J1: Vector3, side: number, a: ArmShape): ArmPoints {
  const [l0, l1, l2] = a.segLen;
  const al = a.spreadDeg * D;
  const hx = side * Math.sin(al), hz = Math.cos(al);
  const half = (a.bendDeg / 2) * D;
  const elbowAt = (p0: number): number => J1.y - l0 * Math.sin(p0) - (l1 / 2) * Math.sin(p0 - half);
  // elbowAt は p0 が 大きい ほど 低い
  let lo = -80 * D, hi = 80 * D;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (elbowAt(mid) > a.elbowHeight) lo = mid; else hi = mid;
  }
  const p0 = (lo + hi) / 2, p1 = p0 - half;
  const seg = (from: Vector3, len: number, pitch: number): Vector3 =>
    new Vector3(from.x + hx * Math.cos(pitch) * len, from.y - Math.sin(pitch) * len, from.z + hz * Math.cos(pitch) * len);
  const J2 = seg(J1, l0, p0);
  const J3 = seg(J2, l1, p1);
  const p2 = Math.asin(Math.max(-1, Math.min(1, (J3.y - a.wristY) / l2)));
  const J4 = seg(J3, l2, p2);
  return { p: [J1.clone(), J2, J3, J4], pitchDeg: [p0 / D, p1 / D, p2 / D], elbowY: (J2.y + J3.y) / 2 };
}
