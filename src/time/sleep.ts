import { GADGET_TUNING } from '../content/items/gadgetTuning';
import type { TimeOfDayImpl } from './TimeOfDay';

/** ひる・あさ に ふとんを つかった ときの 文（ITEM-FX-1 AC7） */
export const NOT_NIGHT_TEXT = 'よる に ねようね';

/**
 * ふとんで ねる（ITEM-FX-1 AC6・AC7）。
 * ゆうがた・よるに use() すると ねはじめ、表の長さ（GADGET_TUNING.futon.sleepSteps） の間 画面が 宿屋のように 早く 真っ暗 → 曲の あいだ 真っ暗 → おわりに ゆっくり 明るく なる。
 * 真っ暗の まんなかで 時刻が ひるの はじまりに かわる。ねている 間は 動けない（blocksInput）。
 */
export class SleepSystem {
  private readonly total: number;
  private left = 0;
  private slept = false;

  constructor(
    private readonly time: TimeOfDayImpl,
    opts: { steps?: number } = {},
  ) {
    this.total = Math.max(2, Math.floor(opts.steps ?? GADGET_TUNING.futon.sleepSteps));
  }

  /** ふとんを つかう。ゆうがた・よる = 'start'、ひる・あさ = 'notNight'（何も かえない）、ねている 間 = 'busy' */
  use(): 'start' | 'notNight' | 'busy' {
    if (this.left > 0) return 'busy';
    const p = this.time.phase();
    if (p !== 'dusk' && p !== 'night') return 'notNight';
    this.left = this.total;
    this.slept = false;
    return 'start';
  }

  /** 1 ステップごとに 呼ぶ */
  update(): void {
    if (this.left <= 0) return;
    this.left--;
    if (!this.slept && this.total - this.left >= this.total / 2) {
      this.slept = true;
      this.time.sleepToMorning();
    }
  }

  sleeping(): boolean {
    return this.left > 0;
  }
  stepsLeft(): number {
    return this.left;
  }
  /** 画面の 暗さ 0〜1（宿屋のように: 早く 真っ暗に → 曲の あいだ 真っ暗 → おわりに ゆっくり 明るく） */
  fade(): number {
    if (this.left <= 0) return 0;
    const done = this.total - this.left; // 1 〜 total
    const inN = Math.max(1, Math.min(GADGET_TUNING.futon.fadeInSteps, Math.floor(this.total / 2)));
    const outN = Math.max(1, Math.min(GADGET_TUNING.futon.fadeOutSteps, Math.floor(this.total / 2)));
    if (done <= inN) return done / inN;
    if (this.left >= outN) return 1;
    return this.left / outN;
  }
  blocksInput(): boolean {
    return this.sleeping();
  }
}
