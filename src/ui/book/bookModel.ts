import { listSpreads, neighbors, spreadOf, type BuiltBook } from './bookNav';

/**
 * BOOK-1: 本の 流れの 状態（DOM も 3D も 使わない）。
 * ページの 移りかわり（もくじ → 章の一覧 → 項目）と 動き（appear・open・turn・bump・close）を コマで 数える。
 * 動きは 1/60 秒の 固定ステップ（`tick()`）で 進む。「うごきを へらす」では 動きの のこりは 0 から始まり、次の 1 コマで 移る。
 */
export type BookView = 'toc' | 'chapter' | 'item' | 'closed';
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

  private pending: (() => void) | null = null;
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

  /** 今 押せる リンクの id（① 章、② 見えている 項目。③ と 動きの間は 空） */
  links(): string[] {
    if (!this.isOpen || this.anim !== 'none') return [];
    if (this.view === 'toc') return this.data.chapters.map((c) => c.id);
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
    } else if (this.view === 'chapter') this.toToc();
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
