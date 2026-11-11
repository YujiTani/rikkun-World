import type { BladeStance, BowStage } from '../contracts';
import './aimMarks.css';

/**
 * 刀・弓の 小さな しるし（CHAR-1 第 1 段階, §3.3・§3.6）。字は 使わない（色と形だけ）。
 * - かまえ: 「＋」の右に 横線 3 本（上から 上段・中段・下段）。今の かまえだけ 明るい。
 * - 弓: 「＋」の下に 丸 3 つ。引いた 段の数だけ 色がつく。
 */
export const STANCE_LINE_ORDER: readonly BladeStance[] = ['jodan', 'chudan', 'gedan'];

export class AimMarks {
  readonly stanceEl: HTMLDivElement;
  readonly bowEl: HTMLDivElement;
  private readonly lines: HTMLDivElement[] = [];
  private readonly dots: HTMLDivElement[] = [];
  private stance: BladeStance | null = null;
  private bowLit = 0;

  /** who = 2: 2 人の ときの 2P の 分（COOP-1 5f-1。`#aim-stance-p2`・`#aim-bow-p2`。2P の 半分の ＋に ついていく） */
  constructor(parent: HTMLElement, who: 1 | 2 = 1) {
    const suffix = who === 1 ? '' : `-p${who}`;
    this.stanceEl = document.createElement('div');
    this.stanceEl.id = `aim-stance${suffix}`;
    this.stanceEl.className = `aim-stance aim-stance--p${who}`;
    this.stanceEl.dataset.testid = `duo-aim-stance-p${who}`;
    this.stanceEl.dataset.aim = 'stance';
    this.stanceEl.hidden = true;
    for (const s of STANCE_LINE_ORDER) {
      const l = document.createElement('div');
      l.className = 'aim-stance__line';
      l.dataset.stance = s;
      this.stanceEl.append(l);
      this.lines.push(l);
    }
    this.bowEl = document.createElement('div');
    this.bowEl.id = `aim-bow${suffix}`;
    this.bowEl.className = `aim-bow aim-bow--p${who}`;
    this.bowEl.dataset.aim = 'bow';
    this.bowEl.hidden = true;
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'aim-bow__dot';
      this.bowEl.append(d);
      this.dots.push(d);
    }
    parent.append(this.stanceEl, this.bowEl);
  }

  update(s: { stance: BladeStance | null; bowStage: BowStage }): void {
    if (s.stance !== this.stance) {
      this.stance = s.stance;
      this.stanceEl.hidden = s.stance === null;
      STANCE_LINE_ORDER.forEach((name, i) => this.lines[i].classList.toggle('on', name === s.stance));
    }
    if (s.bowStage !== this.bowLit) {
      this.bowLit = s.bowStage;
      this.bowEl.hidden = s.bowStage === 0;
      this.dots.forEach((d, i) => d.classList.toggle('on', i < s.bowStage));
    }
  }

  state(): { stance: BladeStance | null; bowLit: number } {
    return { stance: this.stance, bowLit: this.bowLit };
  }

  dispose(): void {
    this.stanceEl.remove();
    this.bowEl.remove();
  }
}
