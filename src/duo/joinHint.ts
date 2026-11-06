import { DUO_TUNING } from './tuning';

/**
 * COOP-1 作業 3d（§2.1・AC46・AC64）: 「＋で さんか」を いつ 出すか。DOM なし。固定ステップごとに step() を 1 回 呼ぶ。
 * 出るのは 候補が いない → いる に なった とき だけ。出す 長さは 世界が 動いている ステップで `DUO_TUNING.joinHintSteps`。
 */
export interface DuoJoinHintInput {
  /** 2P の 候補が いる（`DuoPadRouter.joinCandidate() !== null`） */
  candidate: boolean;
  /** 2P が 参加している */
  joined: boolean;
  /** 世界が 動いている（`DuoPadRouter.poll(now, active)` の active と 同じ。せってい画面・本・案内画面などは false） */
  active: boolean;
  /** 候補の パッドの どれかの ボタンを 押している */
  anyButton: boolean;
}

export class DuoJoinHint {
  private prevCandidate = false;
  /** 出す つもり（まだ 3 秒たっていない・ボタンも 押していない） */
  private pending = false;
  private count = 0;
  private shown = false;

  step(i: DuoJoinHintInput): void {
    if (!i.candidate) {
      this.pending = false;
    } else if (!this.prevCandidate) {
      this.pending = !i.joined;
      this.count = 0;
    }
    this.prevCandidate = i.candidate;
    if (i.joined || i.anyButton) this.pending = false;
    if (this.pending && i.active) {
      this.count++;
      if (this.count >= DUO_TUNING.joinHintSteps) this.pending = false;
    }
    this.shown = this.pending && i.active;
  }

  /** 「＋で さんか」が 出ているか */
  visible(): boolean {
    return this.shown;
  }
}
