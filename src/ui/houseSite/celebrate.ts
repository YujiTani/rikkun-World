import type { CelebrateView } from '../../house/build/celebrate';
import './houseSite.css';

/**
 * 完成の 盛り上げ（HOUSE-1C PR-2 #340。仕様 §3.1・AC36）: 紙ふぶき（CSS だけ。回数が ふえた ときに 1 回）と、上の 帯「<名前> が できた！」を 上の 帯の 列（TopBandModel。`house-done-banner`）に 入れる。
 * 毎フレーム `update(view)`。回数が ふえた ときだけ 動く。動きを へらす 設定の ときは 紙ふぶきを 出さない（帯だけ）。
 */

/** 紙ふぶきの つぶの 数と 色 */
const PIECES = 36;
const COLORS = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f45'] as const;
/** 紙ふぶきを 画面に のこす 長さ（ms。CSS の 動きより 少し 長く） */
const CONFETTI_MS = 3600;

export class HouseDoneUi {
  private readonly layer = document.createElement('div');
  private count = -1;
  private clearAt = 0;

  /** band ＝ 完成の 帯を 上の 帯の 列に 入れる */
  constructor(parent: HTMLElement, private readonly reduced: () => boolean, private readonly band: (text: string) => void) {
    this.layer.className = 'house-confetti';
    this.layer.dataset.testid = 'house-confetti';
    this.layer.setAttribute('aria-hidden', 'true');
    parent.append(this.layer);
  }

  update(v: CelebrateView): void {
    if (this.count < 0) this.count = v.confetti; // 読みこんだ 直後は 出さない
    else if (v.confetti !== this.count) {
      if (v.confetti > this.count) {
        if (v.banner) this.band(v.banner.text);
        if (!this.reduced()) this.burst();
      }
      this.count = v.confetti;
    }
    if (this.clearAt > 0 && performance.now() > this.clearAt) {
      this.layer.replaceChildren();
      this.clearAt = 0;
    }
  }

  private burst(): void {
    this.layer.replaceChildren();
    for (let i = 0; i < PIECES; i++) {
      const p = document.createElement('i');
      const r = (i * 0.6180339) % 1; // ならびを ばらけさせる（乱数は 使わない）
      p.style.left = `${Math.round(r * 100)}%`;
      p.style.background = COLORS[i % COLORS.length]!;
      p.style.animationDelay = `${Math.round(((i * 7) % 10) * 60)}ms`;
      p.style.setProperty('--sway', `${((i % 5) - 2) * 24}px`);
      this.layer.append(p);
    }
    this.clearAt = performance.now() + CONFETTI_MS;
  }
}
