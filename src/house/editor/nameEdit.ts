// HOUSE-1B 名前を かえる 操作（前の 文字を 足す・1 もじ けす・゛゜・後ろの ことば）。仕様 docs/design/HOUSE-1.md §2.6。DOM・three なし。
// 作りかけの 読み書き・もどす の 記録・ふきだしは 持ち主（controller.ts）の 係。ここは 名前の 決まりごと（文字の しらべ・よくない ことば）だけ。
import { canAddChar, cloneState, dakuten, handakuten, isKanaChar, type EditorState } from './model';
import { hasNgName, trimToClean } from './ngWords';
import { MSG, SUFFIXES } from './tuning';

/** 名前の 操作が 持ち主に たのむ こと（持ち主 ぜんぶは わたさない） */
export interface NameHost {
  /** 作りかけ（読むだけ） */
  state(): EditorState;
  /** 状態を ③ なまえの 操作として 履歴に 積む。かわらなければ 何もしない（false） */
  commit(next: EditorState): boolean;
  say(text: string): void;
}

export class NameEdit {
  constructor(private readonly host: NameHost) {}

  /** 名前を かえる 操作: よくない ことばに なる ときは 何も かえず ふきだし（もどす にも 入らない。わざと ためす 遊びに しない） */
  private commitName(next: EditorState): boolean {
    const was = this.host.state().name;
    if ((next.name.front !== was.front || next.name.back !== was.back) && hasNgName(next.name)) {
      this.host.say(MSG.ngWord);
      return false;
    }
    return this.host.commit(next);
  }

  char(ch: string): boolean {
    const s = this.host.state();
    if (!isKanaChar(ch) || !canAddChar(s.name.front)) return false;
    const next = cloneState(s);
    next.name.front += ch;
    return this.commitName(next);
  }

  /** 1 もじ けす: 止めない。けした あとに よくない ことばが のこる ときは、なくなるまで 1 字ずつ けす（1 回の 操作。同じ ふきだし） */
  erase(): boolean {
    const s = this.host.state();
    const chars = [...s.name.front];
    if (chars.length === 0) return false;
    chars.pop();
    const { front, cut } = trimToClean(chars.join(''), s.name.back);
    const next = cloneState(s);
    next.name.front = front;
    const ok = this.host.commit(next);
    if (ok && cut > 0) this.host.say(MSG.ngWord);
    return ok;
  }

  mark(kind: 'dakuten' | 'handakuten'): boolean {
    const s = this.host.state();
    const chars = [...s.name.front];
    const last = chars.pop();
    if (!last) return false;
    const marked = kind === 'dakuten' ? dakuten(last) : handakuten(last);
    if (marked === null) return false;
    const next = cloneState(s);
    next.name.front = [...chars, marked].join('');
    return this.commitName(next);
  }

  suffix(back: string): boolean {
    if (!SUFFIXES.includes(back)) return false;
    const next = cloneState(this.host.state());
    next.name.back = back;
    return this.commitName(next);
  }
}
