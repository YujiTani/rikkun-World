import type { AnimalView, Vec3 } from '../contracts';
import { ANIMAL_FX } from './animalFxConfig';

export interface HeadHeart {
  id: number;
  filled: number;
  empty: number;
  x: number;
  y: number;
  z: number;
  d2: number;
}

/**
 * 頭の 上の ハート に する にわとり を えらぶ（AC18）。やせい（なかまでない）で hearts ≥ 1、
 * プレイヤー から 水平 `dist` 以内、近い 順に 3 わ まで。`out` を 書きかえて 数を 返す。
 */
export function headHeartsInto(out: HeadHeart[], views: readonly AnimalView[], eye: Vec3, dist: number): number {
  let n = 0;
  const lim = ANIMAL_FX.headHearts;
  const r2 = dist * dist;
  while (out.length < lim) out.push({ id: 0, filled: 0, empty: 0, x: 0, y: 0, z: 0, d2: 0 });
  for (const v of views) {
    if (v.friend || v.hearts < 1) continue;
    const dx = v.x - eye.x;
    const dz = v.z - eye.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    // 近い 順に 並べて 入れる（最大 3）
    let at = n;
    while (at > 0 && out[at - 1].d2 > d2) at--;
    if (at >= lim) continue;
    if (n < lim) n++;
    // うしろに ずらす
    for (let k = n - 1; k > at; k--) copyHeart(out[k], out[k - 1]);
    const o = out[at];
    o.id = v.id;
    o.filled = v.hearts;
    o.empty = ANIMAL_FX.headHearts - v.hearts;
    o.x = v.x;
    o.y = v.y;
    o.z = v.z;
    o.d2 = d2;
  }
  return n;
}

function copyHeart(to: HeadHeart, from: HeadHeart): void {
  to.id = from.id;
  to.filled = from.filled;
  to.empty = from.empty;
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.d2 = from.d2;
}

/** テスト用: `headHeartsInto` の 結果を `{ id, filled, empty }` の 配列で */
export function headHeartProgress(views: readonly AnimalView[], eye: Vec3, dist: number): Array<{ id: number; filled: number; empty: number }> {
  const buf: HeadHeart[] = [];
  const n = headHeartsInto(buf, views, eye, dist);
  return buf.slice(0, n).map((h) => ({ id: h.id, filled: h.filled, empty: h.empty }));
}
