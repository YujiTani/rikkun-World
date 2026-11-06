// COOP-1 作業 3c（#417。docs/design/COOP-1.md §3.4・§9.7）: 場所の ある 音を だれの 耳で 聞くか。
// DOM・Three.js なし。音の 出た 点から 1P・2P の 体までの 直線の 小さい 方（近い 方）を 使う。
import type { Vec3 } from '../contracts';

/** 近い 方の 人（1P か 2P）と その 距離（マス）。同じ 距離なら 1P。p2 が null（2P が いない）なら いつも 1P */
export function hearFrom(p1: Vec3, p2: Vec3 | null, at: Vec3): { who: 1 | 2; distance: number } {
  const d1 = Math.hypot(at.x - p1.x, at.y - p1.y, at.z - p1.z);
  if (!p2) return { who: 1, distance: d1 };
  const d2 = Math.hypot(at.x - p2.x, at.y - p2.y, at.z - p2.z);
  return d2 < d1 ? { who: 2, distance: d2 } : { who: 1, distance: d1 };
}

/** `hearFrom` で 選ばれた 人の 位置（聞く 点） */
export function nearestEar(p1: Vec3, p2: Vec3 | null, at: Vec3): Vec3 {
  return hearFrom(p1, p2, at).who === 2 ? p2! : p1;
}
