import { listSpreads, neighbors, spreadOf, type BuiltBook } from './bookNav';
import { ZUKAN_SPREAD, filterZukan, zukanEntries, zukanPages, type ZukanEntry, type ZukanGroup } from './zukanData';

/**
 * BOOK-1: 本の 流れの 状態（DOM も 3D も 使わない）。
 * ページの 移りかわり（もくじ → 章の一覧 → 項目）と 動き（appear・open・turn・bump・close）を コマで 数える。
 * 動きは 1/60 秒の 固定ステップ（`tick()`）で 進む。「うごきを へらす」では 動きの のこりは 0 から始まり、次の 1 コマで 移る。
 */
export type BookView = 'toc' | 'chapter' | 'item' | 'zukan' | 'zukanItem' | 'closed';
/** もくじの 「アイテム ずかん」の リンクの id（ZUKAN-1） */
const ZUKAN_LINK = 'zukan';
export type BookAnim = 'none' | 'appear' | 'open' | 'turn' | 'bump' | 'close';
export type BookSound = 'open' | 'turn' | 'bump' | 'close';

/** 動きの 長さ（コマ）。オーナーが 試作で 見て 決めなおす */
export const BOOK_FRAMES: Readonly<Record<'appear' | 'open' | 'turn' | 'bump' | 'close', number>> = {
  appear: 24,
  open: 42,
  turn: 22,
  bump: 20,
  close: 30,
};

export interface BookModelOptions {
  /** 「うごきを へらす」か（押した そのときに 聞く） */
  reduced?: () => boolean;
  frames?: Partial<typeof BOOK_FRAMES>;
  onSound?: (s: BookSound) => void;
  /** 見た目を 作りなおす 合図（ページや 動きが かわった） */
  onChange?: () => void;
}

export class BookModel {
  isOpen = false;
  view: BookView = 'closed';
  chapter: string | null = null;
  item: string | null = null;
  /** ② の 何見開き目か（1 から） */
  listPage = 1;
  anim: BookAnim = 'none';
  animLeft = 0;
  animTotal = 0;
  /** turn の 向き: 1 ＝ 深い ほうへ（右から 左へ めくる）、-1 ＝ もどる */
  turnDir: 1 | -1 = 1;
  bumps = 0;
  lastChapter: string | null = null;
  /** ① でも のこる 「今の章」（guideTab） */
  guideChapter: string;

  /** ZUKAN-1: さがす 字・組・一覧の 何見開き目か */
  zukanQuery = '';
  zukanGroup: ZukanGroup | null = null;
  zukanPage = 1;

  private pending: (() => void) | null = null;
  private zukanAll: ZukanEntry[] | null = null;
  private readonly frames: typeof BOOK_FRAMES;

  constructor(
    readonly data: BuiltBook,
    private readonly opt: BookModelOptions = {},
  ) {
    this.frames = { ...BOOK_FRAMES, ...opt.frames };
    this.guideChapter = data.chapters[0]?.id ?? '';
  }

  // ---- 読む ----

  chapterItems(id: string | null = this.chapter): string[] {
    return this.data.chapters.find((c) => c.id === id)?.itemIds ?? [];
  }

  /** ZUKAN-1: 全アイテム（はじめて 使う ときに 作る） */
  zukanEntries(): readonly ZukanEntry[] {
    return (this.zukanAll ??= zukanEntries());
  }

  /** ZUKAN-1: さがす 字・組で しぼった アイテムの id */
  zukanIds(): string[] {
    return filterZukan(this.zukanEntries(), this.zukanQuery, this.zukanGroup);
  }

  /** ZUKAN-1: 今の 見開きに 見える アイテムの id */
  zukanVisible(): string[] {
    return this.zukanIds().slice((this.zukanPage - 1) * ZUKAN_SPREAD, this.zukanPage * ZUKAN_SPREAD);
  }

  /** 今 押せる リンクの id（① 章、② 見えている 項目。③ と 動きの間は 空） */
  links(): string[] {
    if (!this.isOpen || this.anim !== 'none') return [];
    if (this.view === 'toc') return this.data.chapters.map((c) => c.id); // ずかんの ボタンは 章の リンクと 別（data-zukan-open）
    if (this.view === 'zukan') return this.zukanVisible();
    if (this.view === 'chapter') return listSpreads(this.chapterItems())[this.listPage - 1] ?? [];
    return [];
  }

  /** ◀ ▶ を 出すか、最初・最後か */
  arrows(): { show: boolean; prevEdge: boolean; nextEdge: boolean } {
    if (this.view === 'item' && this.item) {
      const n = neighbors(this.chapterItems(), this.item);
      return { show: true, prevEdge: n.prev === null, nextEdge: n.next === null };
    }
    if (this.view === 'chapter') {
      const total = listSpreads(this.chapterItems()).length;
      return { show: total > 1, prevEdge: this.listPage <= 1, nextEdge: this.listPage >= total };
    }
    if (this.view === 'zukanItem' && this.item) {
      const n = neighbors(this.zukanIds(), this.item);
      return { show: true, prevEdge: n.prev === null, nextEdge: n.next === null };
    }
    if (this.view === 'zukan') {
      const total = zukanPages(this.zukanIds().length);
      return { show: total > 1, prevEdge: this.zukanPage <= 1, nextEdge: this.zukanPage >= total };
    }
    return { show: false, prevEdge: true, nextEdge: true };
  }

  guideItems(): number {
    return this.chapterItems(this.guideChapter).length;
  }

  /** 動きの 進み（0〜1）。のこり 0 の ときは 1 */
  progress(): number {
    return this.animTotal > 0 ? 1 - this.animLeft / this.animTotal : 1;
  }

  // ---- ひらく・とじる ----

  /** 案内画面の ボタン: 毎回 もくじから。あらわれて ひらく */
  openFromButton(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.view = 'toc';
    this.chapter = null;
    this.item = null;
    this.listPage = 1;
    this.bumps = 0;
    this.sound('open');
    this.begin('appear', null);
  }

  /** テスト用: 動きなし・音なしで その ページを 出す（'toc'・章の id・項目の id） */
  jump(target: string): void {
    this.isOpen = true;
    this.anim = 'none';
    this.animLeft = 0;
    this.animTotal = 0;
    this.pending = null;
    if (target === ZUKAN_LINK || target.startsWith(`${ZUKAN_LINK}:`)) {
      const id = target.slice(ZUKAN_LINK.length + 1);
      this.resetZukan();
      this.chapter = null;
      this.listPage = 1;
      if (id && this.zukanIds().includes(id)) {
        this.view = 'zukanItem';
        this.item = id;
        this.zukanPage = this.zukanPageOf(id);
      } else {
        this.view = 'zukan';
        this.item = null;
      }
      this.changed();
      return;
    }
    const itemOf = this.data.itemIds.includes(target) ? target : null;
    const chapterOf = this.data.chapters.find((c) => c.id === target) ?? this.data.chapters.find((c) => c.itemIds.includes(itemOf ?? ''));
    if (itemOf && chapterOf) {
      this.view = 'item';
      this.chapter = chapterOf.id;
      this.item = itemOf;
      this.listPage = spreadOf(chapterOf.itemIds, itemOf);
      this.guideChapter = chapterOf.id;
    } else if (chapterOf) {
      this.view = 'chapter';
      this.chapter = chapterOf.id;
      this.item = null;
      this.listPage = 1;
      this.guideChapter = chapterOf.id;
    } else {
      this.view = 'toc';
      this.chapter = null;
      this.item = null;
      this.listPage = 1;
    }
    this.changed();
  }

  /** ✕・① の Esc: 動きの 途中でも 効く */
  close(): void {
    if (!this.isOpen || this.anim === 'close') return;
    this.sound('close');
    this.begin('close', () => this.finishClose());
  }

  /** 音も 動きも なしで しまう（ロックが かかった・おめでとう画面が 来た） */
  closeNow(): void {
    if (!this.isOpen) return;
    this.anim = 'none';
    this.animLeft = 0;
    this.animTotal = 0;
    this.pending = null;
    this.finishClose();
  }

  // ---- ページを 移る（動きの 間は うけつけない） ----

  openChapter(id: string): void {
    if (!this.canMove() || this.view !== 'toc' || !this.data.chapters.some((c) => c.id === id)) return;
    this.turn(1, () => {
      this.view = 'chapter';
      this.chapter = id;
      this.item = null;
      this.listPage = 1;
      this.guideChapter = id;
      this.lastChapter = id;
    });
  }

  /** ZUKAN-1: もくじの 「アイテム ずかん」。毎回 さがす 字・組は 空から */
  openZukan(): void {
    if (!this.canMove() || this.view !== 'toc') return;
    this.turn(1, () => {
      this.resetZukan();
      this.view = 'zukan';
      this.chapter = null;
      this.item = null;
    });
  }

  /** ZUKAN-1: 一覧の アイテムを 押した */
  openZukanItem(id: string): void {
    if (!this.canMove() || this.view !== 'zukan' || !this.zukanVisible().includes(id)) return;
    this.turn(1, () => {
      this.view = 'zukanItem';
      this.item = id;
    });
  }

  /** ZUKAN-1: さがす（めくらずに 一覧を 作りなおす。1 見開き目へ） */
  setZukanFilter(query: string, group: ZukanGroup | null): void {
    if (!this.isOpen || this.view !== 'zukan') return;
    if (query === this.zukanQuery && group === this.zukanGroup) return;
    this.zukanQuery = query;
    this.zukanGroup = group;
    this.zukanPage = 1;
    this.changed();
  }

  openItem(id: string): void {
    if (!this.canMove() || this.view !== 'chapter' || !this.chapterItems().includes(id)) return;
    this.turn(1, () => {
      this.view = 'item';
      this.item = id;
    });
  }

  /** ◀ ＝ -1、▶ ＝ +1 */
  step(dir: -1 | 1): void {
    if (!this.canMove()) return;
    if (this.view === 'item' && this.item) {
      const n = neighbors(this.chapterItems(), this.item);
      const to = dir < 0 ? n.prev : n.next;
      if (to === null) this.bump();
      else this.turn(dir, () => (this.item = to));
    } else if (this.view === 'chapter') {
      const total = listSpreads(this.chapterItems()).length;
      if (total <= 1) return;
      const to = this.listPage + dir;
      if (to < 1 || to > total) this.bump();
      else this.turn(dir, () => (this.listPage = to));
    } else if (this.view === 'zukanItem' && this.item) {
      const n = neighbors(this.zukanIds(), this.item);
      const to = dir < 0 ? n.prev : n.next;
      if (to === null) this.bump();
      else this.turn(dir, () => (this.item = to));
    } else if (this.view === 'zukan') {
      const total = zukanPages(this.zukanIds().length);
      if (total <= 1) return;
      const to = this.zukanPage + dir;
      if (to < 1 || to > total) this.bump();
      else this.turn(dir, () => (this.zukanPage = to));
    }
  }

  /** もどる（③ → ② → ①）。① では 何もしない */
  back(): void {
    if (!this.canMove()) return;
    if (this.view === 'item') {
      this.turn(-1, () => {
        this.view = 'chapter';
        this.listPage = spreadOf(this.chapterItems(), this.item ?? '');
        this.item = null;
      });
    } else if (this.view === 'zukanItem') {
      this.turn(-1, () => {
        this.view = 'zukan';
        this.zukanPage = this.zukanPageOf(this.item ?? '');
        this.item = null;
      });
    } else if (this.view === 'chapter' || this.view === 'zukan') this.toToc();
  }

  toToc(): void {
    if (!this.canMove() || this.view === 'toc') return;
    this.turn(-1, () => {
      this.view = 'toc';
      this.chapter = null;
      this.item = null;
      this.listPage = 1;
    });
  }

  /** Esc: ① では とじる、② ③ では もどる */
  escape(): void {
    if (!this.isOpen) return;
    if (this.view === 'toc') this.close();
    else this.back();
  }

  // ---- 1 コマ ----

  tick(): void {
    if (this.anim === 'none') return;
    if (this.animLeft > 0) {
      this.animLeft--;
      if (this.animLeft > 0) {
        this.opt.onChange?.();
        return;
      }
    }
    const was = this.anim;
    const fn = this.pending;
    this.pending = null;
    if (was === 'appear' && this.frames.appear > 0 && this.opt.reduced?.() !== true) {
      this.anim = 'open';
      this.animLeft = this.animTotal = this.frames.open;
      this.opt.onChange?.();
      return;
    }
    this.anim = 'none';
    this.animLeft = 0;
    this.animTotal = 0;
    fn?.();
    this.changed();
  }

  // ---- 中 ----

  private resetZukan(): void {
    this.zukanQuery = '';
    this.zukanGroup = null;
    this.zukanPage = 1;
  }

  private zukanPageOf(id: string): number {
    const k = this.zukanIds().indexOf(id);
    return k < 0 ? 1 : Math.floor(k / ZUKAN_SPREAD) + 1;
  }

  private canMove(): boolean {
    return this.isOpen && this.anim === 'none';
  }

  private turn(dir: 1 | -1, then: () => void): void {
    this.turnDir = dir;
    this.sound('turn');
    this.begin('turn', then);
  }

  private bump(): void {
    this.bumps++;
    this.sound('bump');
    this.begin('bump', null);
  }

  private begin(kind: 'appear' | 'turn' | 'bump' | 'close', then: (() => void) | null): void {
    const reduced = this.opt.reduced?.() === true;
    this.anim = kind;
    this.animTotal = reduced ? 0 : this.frames[kind];
    this.animLeft = this.animTotal;
    this.pending = then;
    this.changed();
  }

  private finishClose(): void {
    this.isOpen = false;
    this.view = 'closed';
    this.chapter = null;
    this.item = null;
    this.listPage = 1;
    this.changed();
  }

  private sound(s: BookSound): void {
    this.opt.onSound?.(s);
  }

  private changed(): void {
    this.opt.onChange?.();
  }
}
