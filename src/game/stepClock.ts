/**
 * ゲームの時間（固定ステップ）の 時計。実時間の フレームを うけとって、何ステップ 進めるかを 返す。
 * scale は ゲームの時間の 進む速さの 倍率（もちもの画面の 0.25・パリィの スロー 0.25 など。かけ算した 値）。
 * WEAPON-5 AC8: 1/60 秒の フレームを 24 回 わたすと（scale 0.25）ちょうど 6 ステップ。
 */
export const STEP_DT = 1 / 60;
/** 処理落ちしても 1 フレームで 追いつく 更新回数の 上限 */
export const MAX_STEPS_PER_FRAME = 5;
/** 小数の 誤差で 1 ステップ 足りなくならない ための 余裕（秒） */
const EPS = 1e-9;

export interface StepClock {
  /** elapsedSec: 実時間の 経過、scale: ゲームの時間の 倍率。進める ステップ数を 返す */
  advance(elapsedSec: number, scale: number): number;
  /** ためている 時間を 捨てる */
  reset(): void;
}

export function createStepClock(): StepClock {
  let acc = 0;
  return {
    advance(elapsedSec: number, scale: number): number {
      acc = Math.min(acc + elapsedSec * scale, STEP_DT * MAX_STEPS_PER_FRAME);
      let n = 0;
      while (acc >= STEP_DT - EPS) {
        acc -= STEP_DT;
        n++;
      }
      if (acc < 0) acc = 0;
      return n;
    },
    reset(): void {
      acc = 0;
    },
  };
}
