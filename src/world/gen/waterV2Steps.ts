/**
 * 水の 計画を 小分けに 進める ための 小さな 道具（#187）。計画は generator で 書き、途中の yield で 止まれる。
 * いつ 止まり いつ 続けるかは 呼ぶ 側が きめる（結果は 止まり方に 関係ない）。
 */
export type Steps<T> = Generator<void, T, void>;

/** 最後まで 一気に 進めて 結果を 返す */
export function runSteps<T>(g: Steps<T>): T {
  for (;;) {
    const r = g.next();
    if (r.done === true) return r.value;
  }
}
