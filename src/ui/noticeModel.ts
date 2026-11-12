import { FX_SETTINGS, type FxSettings } from '../fx/config';
import type { SignalKind } from './itemIcon';
import { YAKATA_TEXT } from './yakataText';

/** 「いっぱい」は絵ではなく文字で出す */
export const FULL_TEXT = 'もちものが いっぱい！';
/** 宝箱が からっぽ〔MINE-1C。あいた 宝箱を 右クリック〕 */
const CHEST_EMPTY_TEXT = 'からっぽ だよ';
/** やかたの ブロックは まだ・挑戦の 間は こわせない（MINE-1F §3.1） */
const YAKATA_LOCKED_TEXT = YAKATA_TEXT.locked;
export function signalText(kind: SignalKind): string | null {
  switch (kind) {
    case 'full':
      return FULL_TEXT;
    case 'chestEmpty':
      return CHEST_EMPTY_TEXT;
    case 'yakataLocked':
      return YAKATA_LOCKED_TEXT;
    case 'needTool':
    case 'needIron':
    case 'noArrow':
      return null;
    default: {
      const never: never = kind;
      return never;
    }
  }
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
