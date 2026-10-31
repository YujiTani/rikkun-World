// なまえを かえる（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.6・AC53）。DOM・three なし。
// 上の メニューの「なまえを かえる」→ 建てた 家の 一覧（近い 順）→ 名前の 画面 → これで いい！／やめる。
// 名前の 字の きまり・よくない ことばの 止め方は エディターの ③ なまえと 同じ もの（editor/nameEdit.ts の NameEdit・ngWords.ts の hasNgName）を 使う。
// せっけいずの 名前は かわらない（家の 記録の 名前だけ）。
import type { Vec3 } from '../contracts';
import type { HouseBook, HouseRec } from './book';
import { KANA_CHARS, canAddChar, dakuten, emptyState, handakuten, toKatakana, type EditorState } from './editor/model';
import { NameEdit } from './editor/nameEdit';
import { hasNgName } from './editor/ngWords';
import { MSG, SUFFIXES } from './editor/tuning';

type Name = EditorState['name'];

/** 名前を かえる 画面の ことば */
export const RENAME_SAY = {
  pick: 'どの いえの なまえを かえる？',
  name: 'あたらしい なまえを つけてね',
  noName: MSG.name,
  ngWord: MSG.ngWord,
} as const;

export interface RenameButton {
  id: string;
  enabled: boolean;
}

/** 画面が 読む 形（一覧の 家・今 作って いる 名前） */
export interface RenameView {
  houses: Array<{ id: number; name: string }>;
  name: Name | null;
  katakana: boolean;
}

/** ゛・゜ が いま 押せる か（最後の 字に つけられる とき） */
function canMark(front: string, kind: 'dakuten' | 'handakuten'): boolean {
  const last = [...front].pop();
  return last !== undefined && (kind === 'dakuten' ? dakuten(last) : handakuten(last)) !== null;
}

export class HouseRename {
  /** 名前の 画面で 作って いる 家（一覧の ときは null）。名前は st.name */
  private target: number | null = null;
  /** 作りかけの 名前（NameEdit が 読み書きする 入れ物。名前いがいは 使わない） */
  private st: EditorState = emptyState();
  private katakana = false;
  /** 直前の 操作で 出た ふきだし（よくない ことば）。press の たびに 取りかえる */
  private bubble: string | null = null;
  private readonly names = new NameEdit({
    state: () => this.st,
    commit: (next) => {
      if (next.name.front === this.st.name.front && next.name.back === this.st.name.back) return false;
      this.st = next;
      return true;
    },
    say: (text) => {
      this.bubble = text;
    },
  });

  constructor(private readonly d: { book: HouseBook; player: () => Vec3 }) {}

  /** 押せる か（建てた 家が 1 けん 以上） */
  available(): boolean {
    return this.d.book.count() > 0;
  }

  /** 建てた 家の 一覧。プレイヤーから 近い 順（戸の マスまでの XZ の きょり。同じ なら 建てた 順） */
  list(): HouseRec[] {
    const p = this.d.player();
    const dist = (r: HouseRec): number => Math.hypot(r.door.x + 0.5 - p.x, r.door.z + 0.5 - p.z);
    return [...this.d.book.list()].sort((a, b) => dist(a) - dist(b) || a.id - b.id);
  }

  /** 一覧から えらぶ（名前の 画面へ。はじめは 今の 名前）。知らない 家なら false */
  pick(id: number): boolean {
    const r = this.d.book.get(id);
    if (!r) return false;
    this.target = id;
    this.st = emptyState();
    this.st.name = { front: r.front, back: r.back };
    this.katakana = false;
    this.bubble = null;
    return true;
  }

  /** 名前の 画面で 作って いる 名前（窓口 `renaming()`）。画面に いなければ null */
  renaming(): { id: number; name: Name } | null {
    return this.target === null ? null : { id: this.target, name: { ...this.st.name } };
  }

  /** 画面が 読む もの（一覧は 近い 順） */
  view(): RenameView {
    return { houses: this.list().map((r) => ({ id: r.id, name: r.name })), name: this.target === null ? null : { ...this.st.name }, katakana: this.katakana };
  }

  /** やめる／おわる／ページを 出る */
  leave(): void {
    this.target = null;
    this.bubble = null;
  }

  /** 直前の 操作で 出た ふきだし（なければ null）。一度 読むと 消える */
  takeBubble(): string | null {
    const b = this.bubble;
    this.bubble = null;
    return b;
  }

  isKatakana(): boolean {
    return this.katakana;
  }

  /** 名前の 画面の ボタン（char-*・dakuten・handakuten・katakana・erase・suffix-N を 押した）。何か かわったら true。よくない ことばに なる ときは かえずに ふきだし（takeBubble） */
  press(id: string): boolean {
    if (this.target === null) return false;
    this.bubble = null;
    if (id.startsWith('char-')) {
      const ch = id.slice(5);
      return KANA_CHARS.includes(ch) && this.names.char(this.katakana ? toKatakana(ch) : ch);
    }
    if (id === 'dakuten' || id === 'handakuten') return this.names.mark(id);
    if (id === 'erase') return this.names.erase();
    if (id === 'katakana') {
      this.katakana = !this.katakana;
      return true;
    }
    if (id.startsWith('suffix-')) return this.names.suffix(SUFFIXES[Number(id.slice(7))] ?? '');
    return false;
  }

  /**
   * これで いい！: 前の 文字が 0 字 なら 'noName'、名前に よくない ことばが あれば 'ngWord'（どちらも 何も かえない）。
   * 1 字 以上で よければ 記録の 名前を かえて 'ok'
   */
  confirm(): 'ok' | 'noName' | 'ngWord' | 'none' {
    if (this.target === null) return 'none';
    const n = this.st.name;
    if ([...n.front].length === 0) return 'noName';
    if (hasNgName(n)) return 'ngWord';
    this.d.book.rename(this.target, n.front, n.back);
    this.target = null;
    return 'ok';
  }

  /** 名前の 画面の ボタン一覧（押せるか。字は 8 字まで・てんてんは つけられる ときだけ・1 もじ けすは 字が ある ときだけ） */
  nameButtons(): RenameButton[] {
    if (this.target === null) return [];
    const front = this.st.name.front;
    const room = canAddChar(front);
    return [
      ...KANA_CHARS.map((ch) => ({ id: `char-${ch}`, enabled: room })),
      { id: 'dakuten', enabled: canMark(front, 'dakuten') },
      { id: 'handakuten', enabled: canMark(front, 'handakuten') },
      { id: 'katakana', enabled: true },
      { id: 'erase', enabled: [...front].length > 0 },
      ...SUFFIXES.map((_, i) => ({ id: `suffix-${i}`, enabled: true })),
      { id: 'renameOk', enabled: true },
      { id: 'renameCancel', enabled: true },
    ];
  }

  /** 一覧の ボタン一覧（近い 順の renamePick-<id> ＋ ✕） */
  listButtons(): RenameButton[] {
    return [...this.list().map((r) => ({ id: `renamePick-${r.id}`, enabled: true })), { id: 'close', enabled: true }];
  }
}
