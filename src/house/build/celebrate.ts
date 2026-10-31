// 完成の 盛り上げ（HOUSE-1C PR-2 #340。仕様 §3.1・AC36）: 紙ふぶきの 回数（ずっと 数える）と 上の 帯「<名前> が できた！」。DOM・three なし。
import { CELEBRATE } from './tuning';

export interface CelebrateView {
  /** 出した 紙ふぶきの 回数（家が できた ステップに ちょうど 1 ふえる） */
  confetti: number;
  banner: { text: string; ticksLeft: number } | null;
}

export class HouseCelebrate {
  private confetti = 0;
  private ticks = 0;
  private text = '';
  /** 読む 側へ わたす 入れもの（毎フレーム 新しい 物を 作らない ように 使いまわす） */
  private readonly out: { confetti: number; banner: { text: string; ticksLeft: number } | null } = { confetti: 0, banner: null };
  private readonly banner = { text: '', ticksLeft: 0 };

  /** 家が できた */
  fire(name: string): void {
    this.confetti++;
    this.ticks = CELEBRATE.bannerTicks;
    this.text = `${name} が できた！`;
  }

  /** 1 ステップ（帯の 時間） */
  step(): void {
    if (this.ticks > 0) this.ticks--;
  }

  /** 読むだけ（使いまわす 入れもの。取っておかない） */
  view(): CelebrateView {
    this.banner.text = this.text;
    this.banner.ticksLeft = this.ticks;
    this.out.confetti = this.confetti;
    this.out.banner = this.ticks > 0 ? this.banner : null;
    return this.out;
  }
}
