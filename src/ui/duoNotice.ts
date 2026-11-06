/**
 * COOP-1 作業 3d（§2.1・§2.6・AC46・AC64・AC84）: 2 人あそびの 小さな 知らせ 2 つ。
 *  - `duo-join-hint`「＋で さんか」: 2 本目の パッドが つながった とき 3 秒（出し入れは src/duo/joinHint.ts）
 *  - `duo-wait`「ちょっと まってね」: 2 人で 1P の 全面の もちもの画面・本・建築士さんが 世界を 止めている あいだ、2P の 側（右半分）に 出す
 * 出す ときまで DOM を 作らない。変わった ときだけ 書く（毎フレーム 作らない）。
 */
import './duoNotice.css';

/** ＋ボタンの 絵（まる の 中に ＋。色は 文字と 同じ） */
const PLUS_SVG =
  '<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 9v14M9 16h14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>';

export class DuoNotices {
  private hint: HTMLDivElement | null = null;
  private wait: HTMLDivElement | null = null;
  private hintOn = false;
  private waitOn = false;

  constructor(private readonly hud: HTMLElement) {}

  /** 「＋で さんか」を 出す / 消す */
  setJoinHint(on: boolean): void {
    if (on === this.hintOn) return;
    this.hintOn = on;
    if (on && !this.hint) {
      const el = document.createElement('div');
      el.className = 'duo-join-hint';
      el.setAttribute('data-testid', 'duo-join-hint');
      const icon = document.createElement('span');
      icon.className = 'duo-join-hint-icon';
      icon.innerHTML = PLUS_SVG;
      const text = document.createElement('span');
      text.textContent = 'で さんか';
      el.append(icon, text);
      this.hud.append(el);
      this.hint = el;
    }
    if (this.hint) this.hint.hidden = !on;
  }

  /** 2P の 側の「ちょっと まってね」を 出す / 消す */
  setWait(on: boolean): void {
    if (on === this.waitOn) return;
    this.waitOn = on;
    if (on && !this.wait) {
      const el = document.createElement('div');
      el.className = 'duo-wait';
      el.setAttribute('data-testid', 'duo-wait');
      el.textContent = 'ちょっと まってね';
      this.hud.append(el);
      this.wait = el;
    }
    if (this.wait) this.wait.hidden = !on;
  }

  dispose(): void {
    this.hint?.remove();
    this.wait?.remove();
    this.hint = this.wait = null;
    this.hintOn = this.waitOn = false;
  }
}
