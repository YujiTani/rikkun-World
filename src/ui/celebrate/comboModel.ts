import { CELEBRATE, type CelebrateSettings } from './config';

/** コンボ（仕様 §2.4 (1) の 5）。時間は 画面ステップ */
export class ComboModel {
  private combo_ = 0;
  private since = Infinity;
  private labelLeft = 0;

  constructor(private readonly cfg: () => CelebrateSettings) {}

  /** 作れた。つづけて作ったなら +1（はじめは 1）。上限をこえても数は 上限のまま */
  made(): number {
    const c = this.cfg();
    this.combo_ = this.combo_ > 0 && this.since <= c.craftComboTicks ? Math.min(this.combo_ + 1, c.craftComboMax) : 1;
    this.since = 0;
    this.labelLeft = this.combo_ >= 2 ? CELEBRATE.comboLabelSteps : 0;
    return this.combo_;
  }

  /** 作れなかった（ぷぷ） */
  failed(): void {
    this.combo_ = 0;
    this.since = Infinity;
    this.labelLeft = 0;
  }

  step(amount: number): void {
    if (amount <= 0) return;
    this.since += amount;
    if (this.labelLeft > 0) this.labelLeft = Math.max(0, this.labelLeft - amount);
    if (this.combo_ > 0 && this.since > this.cfg().craftComboTicks) this.combo_ = 0;
  }

  /** いまのコンボ（つづけていなければ 0 → 次は 1 から。テストの `craft.fx().combo`） */
  combo(): number {
    return this.combo_;
  }

  /** ×N を出しているときの N（出していなければ 0） */
  label(): number {
    return this.labelLeft > 0 ? this.combo_ : 0;
  }

  /** 光のつぶの数（12 + 2 × (コンボ − 1)） */
  static sparkCount(combo: number): number {
    return CELEBRATE.sparkBase + CELEBRATE.sparkPerCombo * Math.max(0, combo - 1);
  }

  /** 音の高さ（半音）。コンボ 1 つにつき +1 */
  static pitch(combo: number): number {
    return Math.max(0, combo - 1);
  }
}
