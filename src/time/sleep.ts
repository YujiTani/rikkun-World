import type { DayPhase } from '../contracts';
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import type { TimeOfDayImpl } from './TimeOfDay';

/** ひる・あさ に ふとんを つかった ときの 文（ITEM-FX-1 AC7） */
export const NOT_NIGHT_TEXT = 'よる に ねようね';

/** 2 人の とき、先に ねた 人が まって いる あいだ、ねて いない 人の 半分に 出す 文（COOP-1 5e・AC173。ひらがなだけ） */
export const SLEEP_ASK_TEXT = 'おともだちが いっしょに ねたがっているよ';

/** ふとんで ねられる 時刻か（ゆうがた・よる） */
export function canSleepAt(phase: DayPhase): boolean {
  return phase === 'dusk' || phase === 'night';
}

/** 人の 番号（1P・2P） */
export type SleepWho = 1 | 2;

/** `SleepSystem.use` の 答え。'wait' ＝ 2 人の とき 先に ねて もう 1 人を まつ（COOP-1 5e） */
export type SleepUse = 'start' | 'wait' | 'notNight' | 'busy';

export interface SleepOpts {
  /** ねむりの 長さ（ステップ。省くと 表） */
  steps?: number;
  /**
   * 「2 人」に 数えられる 人の 数（参加していて 倒れておらず 2P は パッドが ある 人）。毎ステップ 読む。
   * 渡さない／1 以下 ＝ 1 人の とき（今の 動き。ZL で すぐ ねむり）
   */
  ready?: () => number;
  /** ねむりが 本当に はじまる たびに 1 回（ねる 音）。待ちの あいだは 呼ばない */
  onStart?: () => void;
}

/**
 * ふとんで ねる（ITEM-FX-1 AC6・AC7）。
 * ゆうがた・よるに use() すると ねはじめ、表の長さ（GADGET_TUNING.futon.sleepSteps） の間 画面が 宿屋のように 早く 真っ暗 → 曲の あいだ 真っ暗 → おわりに ゆっくり 明るく なる。
 * 真っ暗の まんなかで 時刻が ひるの はじまりに かわる。ねている 間は 動けない（blocksInput）。
 * COOP-1 5e: 2 人の とき（`ready()` が 2 以上）は 2 人とも ふとんで ねた ときだけ 夜を とばす。先に ねた 人は「まち」（`waiting()`。時刻も 世界も 止めない）。
 * 1 人の とき（ready が 1 以下・渡さない）は 今の まま。
 */
export class SleepSystem {
  private readonly total: number;
  private left = 0;
  private slept = false;
  /** 先に ねて もう 1 人を まって いる 人（COOP-1 5e）。ねむり中・1 人の ときは null */
  private wait: SleepWho | null = null;
  private readonly ready: () => number;
  private readonly onStart: (() => void) | undefined;

  constructor(
    private readonly time: TimeOfDayImpl,
    opts: SleepOpts = {},
  ) {
    this.total = Math.max(2, Math.floor(opts.steps ?? GADGET_TUNING.futon.sleepSteps));
    this.ready = opts.ready ?? ((): number => 1);
    this.onStart = opts.onStart;
  }

  /**
   * ふとんを つかう。ねている 間 = 'busy'、ひる・あさ = 'notNight'（何も かえない。待ちにも ならない）。
   * ゆうがた・よる: 1 人の とき（ready が 1 以下）は すぐ 'start'。2 人の とき 1 人目は 'wait'（まつ。夜は とばない）、もう 1 人が 使うと そろって 'start'
   */
  use(who: SleepWho = 1): SleepUse {
    if (this.left > 0) return 'busy';
    if (!canSleepAt(this.time.phase())) return 'notNight';
    if (this.ready() >= 2) {
      if (this.wait === null) {
        this.wait = who;
        return 'wait';
      }
      if (this.wait === who) return 'wait';
    }
    this.begin();
    return 'start';
  }

  /** 待って いる 人（いなければ null） */
  waiting(): SleepWho | null {
    return this.wait;
  }

  /** who が 待って いれば 待ちを 消す（歩く・ジャンプ・ひるむ・倒れる・やめる・パッドが ぬける）。ほかの 人・待って いない 人は 何も しない */
  wake(who: SleepWho): void {
    if (this.wait === who) this.wait = null;
  }

  private begin(): void {
    this.wait = null;
    this.left = this.total;
    this.slept = false;
    this.onStart?.();
  }

  /**
   * 待って いる 人の 見なおし（update が 呼ぶ。ねむり中は 何も しない）: 朝に なって いたら 起きる／「2 人」が 1 人に なって いたら その場で ねむり。
   * 2P が やめた とき 次の update を 待たずに 呼べる
   */
  settle(): void {
    if (this.left > 0 || this.wait === null) return;
    if (!canSleepAt(this.time.phase())) this.wait = null;
    else if (this.ready() < 2) this.begin();
  }

  /** 1 ステップごとに 呼ぶ。待って いる あいだ: 朝に なったら 起きる／「2 人」が 1 人に なったら その ステップから ねむり */
  update(): void {
    if (this.left <= 0) {
      this.settle();
      return;
    }
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
