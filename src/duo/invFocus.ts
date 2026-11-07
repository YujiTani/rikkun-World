// COOP-1 4a（§3.3「2P の えらび」・AC88）: パネルごとに「えらんでいる 物」を 1 つ 持つ。DOM を 使わない 核。
// 1P の えらびは DOM の フォーカス（キー・マウスと いっしょ）。2P は DOM の フォーカスを 使わず、ここで 持つ（2 人が 同時に 開いても とりあわない）。
import { pickNext, type FocusBox, type FocusDir } from '../ui/menu/focusNav';

/** 1P の えらび = DOM の フォーカスを「名前」に した物を 返す 口。2P は 使わない */
interface InvDomFocus {
  get(): string | null;
}

export interface InvFocusOptions {
  who: 1 | 2;
  dom?: InvDomFocus;
  /** えらびが かわった とき 1 回（#419 の せつめいの 切りかえが 聞く） */
  onChange?: (name: string | null) => void;
}

export class InvFocus {
  private cur: string | null = null;

  constructor(private readonly o: InvFocusOptions) {}

  /** いま えらんでいる 物の 名前（`duo.inv(who).focus` と 同じ）。1P は DOM の フォーカス */
  current(): string | null {
    return this.o.who === 1 ? (this.o.dom?.get() ?? null) : this.cur;
  }

  /** `data-pad-focus="true"` を 付ける 物。2P は 開いている あいだ ちょうど 1 つ。1P は いつも 空（DOM の フォーカスの わくを 使う） */
  padMarks(): readonly string[] {
    return this.o.who === 2 && this.cur !== null ? [this.cur] : NONE;
  }

  /** 開いた とき: はじめの 物（2P だけ）。`first` が 見えていれば それ（たんす → 0 番の マス・やく → はじめの レシピ。4c）、なければ 画面の いちばん はじめの 物 */
  reset(items: readonly FocusBox[], first: string | null = null): void {
    if (this.o.who !== 2) return;
    this.set(first !== null && items.some((b) => b.id === first) ? first : (items[0]?.id ?? null));
  }

  /** とじた とき（2P だけ） */
  clear(): void {
    if (this.o.who === 2) this.set(null);
  }

  /** 十字 1 回（2P だけ）。端では その場 */
  move(items: readonly FocusBox[], dir: FocusDir): void {
    if (this.o.who !== 2 || items.length === 0) return;
    this.set(pickNext(items, this.cur, dir));
  }

  /** ページが かわった とき・描きなおした ときだけ 呼ぶ（毎ステップは 呼ばない）。えらんでいた 物が 消えていたら はじめの 物へ（2P だけ） */
  sync(items: readonly FocusBox[]): void {
    if (this.o.who !== 2) return;
    if (this.cur !== null && items.some((b) => b.id === this.cur)) return;
    this.set(items[0]?.id ?? null);
  }

  private set(name: string | null): void {
    if (name === this.cur) return;
    this.cur = name;
    this.o.onChange?.(name);
  }
}

const NONE: readonly string[] = [];
