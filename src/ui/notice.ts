import type { FxSettings } from '../fx/config';
import { drawPixels, signalIconPixels, type SignalKind } from './itemIcon';
import { NoticeModel, signalText } from './noticeModel';
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

  constructor(parent: HTMLElement, cfg?: FxSettings) {
    this.model = new NoticeModel(cfg);
    this.signalEl = document.createElement('canvas');
    this.signalEl.id = 'notice-signal';
    this.signalEl.setAttribute('aria-hidden', 'true');
    this.signalEl.hidden = true;
    this.textEl = document.createElement('div');
    this.textEl.id = 'notice-signal-text';
    this.textEl.hidden = true;
    this.nameEl = document.createElement('div');
    this.nameEl.id = 'notice-name';
    this.nameEl.hidden = true;
    parent.append(this.signalEl, this.textEl, this.nameEl);
  }

  showSignal(kind: SignalKind): void {
    this.model.showSignal(kind);
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
      this.nameEl.textContent = name.text;
      this.shownName = name.text;
    }
    if (!name) this.shownName = '';
  }
}
