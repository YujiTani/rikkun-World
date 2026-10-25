import { yokaiSense } from '../../content/yokai/registry';
import type { YokaiSense } from '../../content/yokai/types';
import type { YokaiKind } from '../../contracts';

/**
 * 妖怪の 感知（気づく・あきらめる）の 調整表（NINJA-1 §4.4）。ここ 1 か所だけ。値を かえる だけで バランスを 直せる。
 * 数は 今までの ゲームと 同じ（忍び装束を 着て いなければ ふるまいは 1 つも かわらない）。
 * 単位: ブロック = 1 ブロック（1 = 1 m）、割合 = 倍率（1 = そのまま）。
 * 開発中は コンソールで `Object.assign(__rikkun.ninja.sense, { shinobiSightMul: 1 })` のように その場で 上書きできる。
 */
export type KindSense = YokaiSense;

export const SENSE: {
  kinds: Record<YokaiKind, KindSense>;
  sightDy: number;
  giveUpDyMul: number;
  shinobiSightMul: number;
} = {
  // 妖怪ごとの 数は content/yokai/<kind>.ts（登録表の 複製。開発用に その場で 書きかえて よい）
  kinds: yokaiSense(),
  sightDy: 6, // ブロック: 気づく 高さの 差（これ 以内の 高さの 妖怪だけ 気づく）
  giveUpDyMul: 2, // 倍: あきらめる 高さの 差 = sightDy × これ（追って いる とき）
  shinobiSightMul: 0.5, // 倍: 忍び装束を 着て いる とき、気づく 距離に かける（0.5 = 半分。あきらめる 距離・高さの 差は かえない）
};
