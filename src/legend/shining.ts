import type { Vec3, YokaiInfo } from '../contracts';
import { boxOf } from '../combat/attackFacing';

/**
 * WEAPON-9 §5.2〜§5.6: シャイニングの 区間の 計算（高さ・ドームの 半径・カメラの きょり）と、ドームの 球と 妖怪の 箱の 当たり。
 * ぜんぶ 純粋な 関数（F = はなした ステップを 1 とした ステップ）。
 */

/** はじめ ゆっくり・おわり ゆっくり（0〜1 → 0〜1） */
export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** 0 〜 riseSteps で 0 → 1、とどまる 間 1、おりる 間 1 → 0 の 出し入れ（高さ・半径・カメラに 共通） */
export function shiningLevelAt(F: number, riseSteps = 40, holdSteps = 160, fallSteps = 40): number {
  if (F <= 0) return 0;
  if (F <= riseSteps) return easeInOut(F / riseSteps);
  if (F <= riseSteps + holdSteps) return 1;
  return 1 - easeInOut((F - riseSteps - holdSteps) / fallSteps);
}

/** うかぶ 高さ（足もとの もとの 高さから） */
export function shiningHeightAt(F: number, rise: number, riseSteps = 40, holdSteps = 160, fallSteps = 40): number {
  return rise * shiningLevelAt(F, riseSteps, holdSteps, fallSteps);
}

/** ドームの 今の 半径（0 = ない） */
export function shiningRadiusAt(F: number, radius: number, riseSteps = 40, holdSteps = 160, fallSteps = 40): number {
  return radius * shiningLevelAt(F, riseSteps, holdSteps, fallSteps);
}

/** 三人称の カメラの きょり（4 から d まで 引いて もどる）。d = 4 なら ずっと 4 */
export function shiningCamDistanceAt(F: number, d: number, riseSteps = 40, holdSteps = 160, fallSteps = 40): number {
  return 4 + (d - 4) * shiningLevelAt(F, riseSteps, holdSteps, fallSteps);
}

/** 球（中心 c・半径 r）が 妖怪の 当たりの 箱〈足もとの 中央から 半径 × 高さ〉に ふれるか */
export function sphereTouchesYokai(c: Vec3, r: number, y: YokaiInfo): boolean {
  if (!(r > 0)) return false;
  const b = boxOf(y);
  const dx = Math.max(Math.abs(c.x - y.position.x) - b.r, 0);
  const dz = Math.max(Math.abs(c.z - y.position.z) - b.r, 0);
  const lo = y.position.y;
  const hi = y.position.y + b.h;
  const dy = c.y < lo ? lo - c.y : c.y > hi ? c.y - hi : 0;
  return dx * dx + dy * dy + dz * dz <= r * r;
}
