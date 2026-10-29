import type { Action } from '../../input/actions';
import type { BookSoundName } from '../../fx/bookSounds';
import { Book3D } from './book3d';
import { BOOK_CHAPTERS, BOOK_ITEMS } from './bookData';
import { bookLayout, type BookLayout } from './bookLayout';
import { BookModel } from './bookModel';
import { buildBook } from './bookNav';
import { BookUi, plainCaption } from './bookUi';
import { createDefaultItemInfo, type ItemInfoSource } from '../../craft/info/build';
import { itemType } from '../../inventory/items';
import type { ItemId } from '../../contracts';

/**
 * BOOK-1: 3D の 本の まとめ役。モデル（流れ）・3D（本）・HTML（字とボタン）をつなぎ、
 * Game から 「止まった世界の 上の 画面」として 呼ばれる（`active`・`tick`・`render`）。
 */
export interface BookOptions {
  parent: HTMLElement;
  /** 音を 鳴らす */
  sound: (name: BookSoundName) => void;
  /** 本が 出る 直前（うしろの 景色を 最後に 1 まい 描いておく） */
  beforeOpen?: () => void;
  /** 出た・しまった（本が 出ている 間 うしろの HUD を かくす 合図など） */
  onVisible?: (visible: boolean) => void;
  /** 「うごきを へらす」か */
  reduced?: () => boolean;
  /** ZUKAN-1: アイテムの 説明（なければ 初期値の レシピ・設定で 作る） */
  itemInfo?: ItemInfoSource;
}

/** 窓口に 出す 四角（DOMRect と 同じ 名前も つける） */
function box(r: { l: number; t: number; w: number; h: number } | null) {
  return r ? { x: r.l, y: r.t, left: r.l, top: r.t, right: r.l + r.w, bottom: r.t + r.h, width: r.w, height: r.h } : null;
}

export class Book {
  readonly model: BookModel;
  private readonly ui: BookUi;
  private three: Book3D | null = null;
  private layout: BookLayout | null = null;
  private shown = false;
  private sig = '';
  private info: ItemInfoSource | null = null;
  /** 本が 鳴らした 音の 記録（テスト用。さいごの 256 こ） */
  readonly soundLog: string[] = [];

  constructor(private readonly o: BookOptions) {
    const built = buildBook(BOOK_CHAPTERS, BOOK_ITEMS);
    this.model = new BookModel(built, {
      reduced: o.reduced ?? (() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true),
      onSound: (s) => {
        this.soundLog.push(s);
        if (this.soundLog.length > 256) this.soundLog.shift();
        o.sound(s);
      },
      onChange: () => this.sync(),
    });
    this.ui = new BookUi(o.parent, {
      chapter: (id) => this.model.openChapter(id),
      item: (id) => this.model.openItem(id),
      back: () => this.model.back(),
      toc: () => this.model.toToc(),
      close: () => this.model.close(),
      prev: () => this.model.step(-1),
      next: () => this.model.step(1),
      zukan: () => this.model.openZukan(),
      zukanItem: (id) => this.model.openZukanItem(id),
      zukanFilter: (q, g) => this.model.setZukanFilter(q, g),
      info: (id) => {
        this.info ??= o.itemInfo ?? createDefaultItemInfo((i: ItemId) => itemType(i)?.name ?? i);
        return this.info.info(id);
      },
    });
    window.addEventListener('resize', () => {
      if (this.shown) this.relayout();
    });
  }

  // ---- Game から ----

  /** 本が 出ている 間 true（その間 世界は 止まる・景色は 描きなおさない） */
  active(): boolean {
    return this.model.isOpen;
  }
  tick(): void {
    this.model.tick();
  }
  render(): void {
    this.three?.render();
  }

  // ---- 開け閉め ----

  /** 案内画面の ボタン */
  open(): void {
    if (this.model.isOpen) return;
    this.prepare();
    this.model.openFromButton();
  }

  /** テスト用: 動きなし・音なしで その ページを 出す */
  jump(target: string): void {
    if (!this.model.isOpen) this.prepare();
    this.model.jump(target);
  }

  /** 音も 動きも なしで しまう */
  closeNow(): void {
    this.model.closeNow();
  }

  /** キー（Action 経由）。本が 出ている 間だけ はたらく */
  onAction(action: Action): void {
    if (!this.model.isOpen) return;
    if (action === 'pagePrev') this.model.step(-1);
    else if (action === 'pageNext') this.model.step(1);
    else if (action === 'closeMenu') this.model.escape();
    else if (action === 'bookBack') this.model.back();
  }

  // ---- 窓口 ----

  state() {
    const m = this.model;
    const item = m.view === 'item' ? BOOK_ITEMS.find((i) => i.id === m.item) : undefined;
    return {
      bookOpen: m.isOpen,
      bookView: m.view,
      bookChapter: m.chapter,
      bookItem: m.view === 'item' ? m.item : null,
      bookListPage: m.listPage,
      bookAnim: m.anim,
      bookAnimLeft: m.anim === 'none' ? 0 : m.animLeft,
      bookLinks: m.links(),
      bookChapters: m.data.chapters.map((c) => ({ id: c.id, label: c.label, itemIds: [...c.itemIds] })),
      bookItemIds: [...m.data.itemIds],
      bookCaption: item ? plainCaption(item.caption) : '',
      bookLastChapter: m.lastChapter,
      bookBumps: m.bumps,
      bookSounds: [...this.soundLog],
      bookPageRect: box(m.isOpen && this.three ? this.three.pageRect() : null),
      bookOverlayRect: box(m.isOpen ? this.ui.overlayRect() : null),
      guideTab: m.guideChapter,
      guideItems: m.guideItems(),
      guideTabs: BOOK_CHAPTERS.map((c) => c.label),
      guideTabIds: BOOK_CHAPTERS.map((c) => c.id),
      // ZUKAN-1
      zukanQuery: m.zukanQuery,
      zukanGroup: m.zukanGroup,
      zukanPage: m.zukanPage,
      zukanItem: m.view === 'zukanItem' ? m.item : null,
      zukanIds: m.view === 'zukan' || m.view === 'zukanItem' ? m.zukanIds() : [],
      zukanShadow: m.zukanEntries().filter((e) => e.shadow).map((e) => e.id as string),
    };
  }

  /** 前回の 描画（本だけ）の 描画回数・三角形 */
  renderInfo(): { calls: number; triangles: number } {
    return this.three?.info() ?? { calls: 0, triangles: 0 };
  }

  // ---- 中 ----

  private prepare(): void {
    this.o.beforeOpen?.();
    if (!this.three) {
      this.three = new Book3D(this.o.parent);
      this.ui.mountCanvas(this.three.canvas);
    }
  }

  private relayout(): void {
    const L = bookLayout(window.innerWidth, window.innerHeight);
    this.layout = L;
    this.ui.setLayout(L);
    this.three?.setLayout(L);
    this.sig = '';
    this.sync();
  }

  private sync(): void {
    const m = this.model;
    if (m.isOpen && !this.shown) {
      this.shown = true;
      document.body.classList.add('book-open');
      this.ui.show();
      this.relayout();
      this.o.onVisible?.(true);
      return;
    }
    if (!m.isOpen && this.shown) {
      this.shown = false;
      document.body.classList.remove('book-open');
      this.ui.hide();
      this.three?.release();
      this.sig = '';
      this.o.onVisible?.(false);
      return;
    }
    if (!this.shown) return;
    this.three?.update(m);
    const a = m.arrows();
    const sig = `${m.anim}|${m.view}|${m.chapter}|${m.item}|${m.listPage}|${m.lastChapter}|${m.zukanQuery}|${m.zukanGroup}|${m.zukanPage}|${a.show}|${a.prevEdge}|${a.nextEdge}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.ui.render(m);
    }
  }

  get layoutNow(): BookLayout | null {
    return this.layout;
  }
}
