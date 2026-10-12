import { FX_SETTINGS, type FxSettings } from '../fx/config';
import type { SignalKind } from './itemIcon';

/** 「いっぱい」は絵ではなく文字で出す */
export const FULL_TEXT = 'もちものが いっぱい！';
export function signalText(kind: SignalKind): string | null {
  return kind === 'full' ? FULL_TEXT : null;
}

/** 合図のアイコンとブロックの名前を「何秒出すか」だけ持つ（DOM なしでテストできる） */
export class NoticeModel {
  signal: { kind: SignalKind; left: number } | null = null;
  name: { text: string; left: number } | null = null;

  constructor(private readonly cfg: FxSettings = FX_SETTINGS) {}

  showSignal(kind: SignalKind): void {
    this.signal = { kind, left: this.cfg.signalSeconds };
  }
  showName(text: string): void {
    this.name = { text, left: this.cfg.nameSeconds };
  }
  update(dt: number): void {
    if (this.signal && (this.signal.left -= dt) <= 0) this.signal = null;
    if (this.name && (this.name.left -= dt) <= 0) this.name = null;
  }
}
