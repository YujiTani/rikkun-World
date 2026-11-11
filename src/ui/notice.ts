import type { FxSettings } from '../fx/config';
import { drawPixels, signalIconPixels, type SignalKind } from './itemIcon';
import { NoticeModel, signalText } from './noticeModel';
import { withRuby } from './text';
import './notice.css';

/**
 * 合図のアイコン（画面中央の「＋」の右下に 1 秒）と、えらんだブロックの名前（ホットバーの上に 1.5 秒）。
 * 毎ステップ update(dt) を呼ぶ。
 */
export class Notice {
  readonly model: NoticeModel;
  readonly signalEl: HTMLCanvasElement;
  readonly textEl: HTMLDivElement;
  readonly nameEl: HTMLDivElement;
  private shownKind: SignalKind | null = null;
  private shownName = '';
  /**
   * CRAFT-2: 合図が「出ていない状態から」または「別の合図に替わって」出たとき 1 回呼ぶ（できごと の履歴用）。
   * 出たままの同じ合図を もう一度 出しても 呼ばない
   */
  onSignalStart?: (kind: SignalKind) => void;

  /**
   * who = 2: 2 人の ときの 2P の 分（COOP-1 5f-1。`#notice-signal-p2`・`#notice-signal-text-p2`）。2P の 半分の ＋の 右下に 出る。
   * 選んだ 名前〔`#notice-name`〕は 2P の 分を 作らない（5f-2）。
   */
  constructor(parent: HTMLElement, cfg?: FxSettings, who: 1 | 2 = 1) {
    this.model = new NoticeModel(cfg);
    const suffix = who === 1 ? '' : `-p${who}`;
    this.signalEl = document.createElement('canvas');
    this.signalEl.id = `notice-signal${suffix}`;
    this.signalEl.className = `notice-signal notice-signal--p${who}`;
    this.signalEl.setAttribute('aria-hidden', 'true');
    this.signalEl.dataset.testid = `duo-notice-signal-p${who}`;
    this.signalEl.dataset.aim = 'notice';
    this.signalEl.hidden = true;
    this.textEl = document.createElement('div');
    this.textEl.id = `notice-signal-text${suffix}`;
    this.textEl.className = `notice-signal-text notice-signal-text--p${who}`;
    this.textEl.dataset.aim = 'notice-text';
    this.textEl.hidden = true;
    this.nameEl = document.createElement('div');
    this.nameEl.id = 'notice-name';
    this.nameEl.hidden = true;
    parent.append(this.signalEl, this.textEl);
    if (who === 1) parent.append(this.nameEl);
  }

  showSignal(kind: SignalKind): void {
    const started = !this.model.signal || this.model.signal.kind !== kind;
    this.model.showSignal(kind);
    if (started) this.onSignalStart?.(kind);
    this.sync();
  }
  showName(text: string): void {
    this.model.showName(text);
    this.sync();
  }

  update(dt: number): void {
    this.model.update(dt);
    this.sync();
  }

  /** 出ている 合図と 名前を すぐ 消す（2P が やめた とき） */
  clear(): void {
    this.model.signal = null;
    this.model.name = null;
    this.sync();
  }

  private sync(): void {
    const sig = this.model.signal;
    const text = sig ? signalText(sig.kind) : null;
    this.signalEl.hidden = !sig || text !== null;
    this.textEl.hidden = text === null;
    if (sig && text !== null) {
      this.textEl.textContent = text;
      this.textEl.dataset.kind = sig.kind;
    } else if (sig && sig.kind !== this.shownKind) {
      drawPixels(this.signalEl, signalIconPixels(sig.kind));
      this.signalEl.dataset.kind = sig.kind;
      this.shownKind = sig.kind;
    }
    if (!sig) this.shownKind = null;
    const name = this.model.name;
    this.nameEl.hidden = !name;
    if (name && name.text !== this.shownName) {
      this.nameEl.innerHTML = withRuby(name.text); // 名前は ［漢字｜よみ］ → ふりがなつき（WEAPON-7 §2.7）
      this.shownName = name.text;
    }
    if (!name) this.shownName = '';
  }
}
