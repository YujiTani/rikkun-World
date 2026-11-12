/**
 * 大地のハンマーの 振りの コマ（hammer_swing 20 コマ。art/LEGEND-4/motion/atlas.json の ticks）。
 * 1 振り 159 ステップ（出だし 42・当たり 9・後すき 108）の どこが どの コマかを 決める。
 */
export const HAMMER_TICKS: readonly number[] = [6, 6, 6, 6, 6, 5, 3, 2, 2, 3, 3, 3, 10, 30, 10, 10, 10, 10, 10, 18];

/** 頭の 上へ 大きく ふりかぶった コマ（出だしの おわり。急降下の 間は この 形の まま） */
export const HAMMER_RAISED_CELL = 8;

/** 振りの F（1 から）の コマ。範囲の そとは 両はしへ まるめる */
export function hammerSwingCell(f: number): number {
  let end = 0;
  for (let i = 0; i < HAMMER_TICKS.length; i++) {
    end += HAMMER_TICKS[i]!;
    if (f <= end) return i;
  }
  return HAMMER_TICKS.length - 1;
}
