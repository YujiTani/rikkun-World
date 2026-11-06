/**
 * COOP-1 作業 3d（§2.1・AC46・AC64）: 「＋で さんか」を いつ 出すか。
 * 型だけの スタブ（developer が 作る。テストは src/duo/joinHint.test.ts）。DOM なし。固定ステップごとに step() を 1 回 呼ぶ。
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
  step(_input: DuoJoinHintInput): void {
    throw new Error('COOP-1 3d: DuoJoinHint.step は まだ ない');
  }

  /** 「＋で さんか」が 出ているか */
  visible(): boolean {
    throw new Error('COOP-1 3d: DuoJoinHint.visible は まだ ない');
  }
}
