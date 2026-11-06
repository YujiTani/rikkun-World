/** つまみの 長押し くりかえしの 数（純粋な 計算。画面にも時計にも さわらない） */
export const SLIDER_REPEAT = {
  delaySec: 0.3, // 【秒】押してから くりかえしが はじまるまで（はじめの 1 回は 押した しゅんかん）
  slowSec: 0.5, // 【秒】ゆっくりの 長さ
  slowIntervalSec: 0.1, // 【秒】ゆっくりの 間、何秒に 1 回 動かすか
  midSec: 0.5, // 【秒】ふつうの 長さ（ゆっくりの あと）
  midIntervalSec: 0.05, // 【秒】ふつうの 間、何秒に 1 回 動かすか
  fastPerSec: 60, // 【回／秒】そのあと（はやい）。1 ステップ（1/60 秒）に 1 回
  maxPerStep: 4, // 【回】1 ステップで 動かす 回数の 上限（重い コマで ドッと 動かないように）
} as const;

/** 押しはじめから heldSec 秒の ときまでに、くりかえしで 動かす 合計の 回数（はじめの 1 回は 入れない） */
export function repeatTotal(heldSec: number): number {
  const c = SLIDER_REPEAT;
  const s = heldSec - c.delaySec;
  if (s <= 0) return 0;
  const slow = Math.min(s, c.slowSec) / c.slowIntervalSec;
  const mid = Math.min(Math.max(s - c.slowSec, 0), c.midSec) / c.midIntervalSec;
  const fast = Math.max(s - c.slowSec - c.midSec, 0) * c.fastPerSec;
  return Math.floor(slow + mid + fast + 1e-6);
}

/** 今回の ステップで 動かす 回数。done = 前回までに 動かした 回数 */
export function repeatStepCount(heldSec: number, done: number): number {
  return Math.min(SLIDER_REPEAT.maxPerStep, Math.max(0, repeatTotal(heldSec) - done));
}

/** 押している 秒数と 動かした 回数を 数える（画面に さわらない） */
export class RepeatCounter {
  private held = 0;
  private done = 0;
  reset(): void {
    this.held = 0;
    this.done = 0;
  }
  /** 押しっぱなしの 間 毎ステップ 呼ぶ。今回 動かす 回数を 返す */
  step(dt: number): number {
    this.held += dt;
    const n = repeatStepCount(this.held, this.done);
    // 上限で 切った ぶんは すてる（あとで まとめて 動かさない）
    if (n > 0) this.done = repeatTotal(this.held);
    return n;
  }
}
