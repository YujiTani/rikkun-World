import { InvFocus } from '../../duo/invFocus';
import { boxOf, menuItems, type FocusBox, type FocusDir } from './focusNav';

/**
 * COOP-1 4a（§3.3「2P の えらび」。AC88）: 2P の パネルの 十字の えらび。DOM の フォーカス（`document.activeElement`）は
 * 画面に 1 つしか ないので 使わず、パネルごとに「えらんでいる 物」を 1 つ 持つ（核は `duo/invFocus.ts`。ここは DOM との つなぎだけ）。
 * 見た目は フォーカスの わくと 同じ（`[data-pad-focus="true"]`。css は inventoryDuo.css）。1P の フォーカスには さわらない。
 * 見える 物の 一覧（FocusBox[]）は 開いた とき・ページが かわった とき・十字を 押した ときだけ 作る（毎ステップは 作らない）。
 */
export class PadNav {
  readonly focus = new InvFocus({ who: 2 });
  private boxes: FocusBox[] = [];
  private readonly els = new Map<string, HTMLElement>();
  private marked: HTMLElement | null = null;
  private markedName: string | null = null;

  /** nameOf: 押せる 物 → `duo.inv(2).focus` の 名前（名前の ない 物は 十字で えらばない） */
  constructor(
    private readonly root: HTMLElement,
    private readonly nameOf: (el: HTMLElement) => string | null,
  ) {}

  /** いま えらんでいる 物の 名前 */
  current(): string | null {
    return this.focus.current();
  }

  /** いま えらんでいる 要素（見えなく なっていたら null） */
  currentEl(): HTMLElement | null {
    const n = this.focus.current();
    const el = n === null ? null : (this.els.get(n) ?? null);
    return el?.isConnected ? el : null;
  }

  /** 開いた とき: はじめの 物 */
  reset(): void {
    this.collect();
    this.focus.reset(this.boxes);
    this.paint();
  }

  /** とじた とき: わくを 消す */
  clear(): void {
    this.focus.clear();
    this.paint();
  }

  /** ページが かわった・描きなおした とき: 一覧を 作りなおし、えらんでいた 物が 消えていたら はじめの 物へ */
  sync(): void {
    this.collect();
    this.focus.sync(this.boxes);
    this.paint();
  }

  /** 十字 1 回。見える 位置は スクロールで かわる ので、押した ときに 一覧を 作りなおす */
  move(dir: FocusDir): void {
    this.collect();
    this.focus.move(this.boxes, dir);
    this.paint();
  }

  /** `confirm`: えらんでいる 物を 押す（1 人の ときの クリックと 同じ）。えらびが 見えなく なっていたら はじめの 物を えらぶだけ */
  press(): void {
    this.collect();
    const el = this.currentEl();
    if (el && this.boxes.some((b) => b.id === this.focus.current())) el.click();
    else {
      this.focus.sync(this.boxes);
      this.paint();
    }
  }

  /** 毎ステップ: わくの 付いた 要素が 画面から 消えて いたら 付け直す（安い） */
  tick(): void {
    if (this.markedName !== null && this.marked?.isConnected) return;
    if (this.focus.current() !== null) this.sync();
  }

  private collect(): void {
    this.boxes = [];
    this.els.clear();
    for (const el of menuItems(this.root)) {
      const name = this.nameOf(el);
      if (name === null || this.els.has(name)) continue;
      this.els.set(name, el);
      const b = boxOf(el, 0);
      this.boxes.push({ ...b, id: name });
    }
  }

  /** わく（data-pad-focus）を いま えらんでいる 物に 付ける。かわった ときは 1P の フォーカスと 同じに せつめいも 切りかえる（#419） */
  private paint(): void {
    const name = this.focus.current();
    const el = this.currentEl();
    if (el === this.marked && name === this.markedName) return;
    this.marked?.removeAttribute('data-pad-focus');
    const changed = name !== this.markedName;
    this.marked = el;
    this.markedName = name;
    if (!el) return;
    el.setAttribute('data-pad-focus', 'true');
    if (changed) {
      el.dispatchEvent(new Event('focus'));
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }
}
