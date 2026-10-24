import type { AchievementCategory, AchievementId } from '../contracts';
import { ACHIEVEMENT_DEFS, CATEGORY_LABEL, CATEGORY_ORDER } from './defs';
import type { AchievementSystem } from './AchievementSystem';

export type PageTab = 'items' | 'achievements' | 'log';

export interface PageRow {
  id: AchievementId;
  /** 名前を見せてよい（取った） */
  shown: boolean;
  /** 同じシリーズの すぐ下の段を 取った（この段の名前だけ 見せる。#260） */
  next: boolean;
  /** 次の段だけ: いまの数（目標で頭打ち）と 目標 */
  progress?: { now: number; goal: number };
  unlocked: boolean;
  isNew: boolean;
  /** COUNTRY-1: むかしの ばしょ（取った物だけ。いちばん下） */
  legacy?: boolean;
}

export interface PageUi {
  tab: PageTab;
  category: AchievementCategory;
  categories: Array<{ id: AchievementCategory; label: string; dot: boolean }>;
  total: number;
  unlocked: number;
  rows: PageRow[];
  tabDot: boolean;
  badge: { visible: boolean; count: number };
}

/** じっせき ページの 中身のきまり（画面なし。M6 §2.7） */
export class AchievementsPageModel {
  private tab_: PageTab = 'items';
  private category_: AchievementCategory = 'break';
  private viewingKey: AchievementCategory | null = null;

  constructor(private readonly sys: AchievementSystem) {}

  tab(): PageTab {
    return this.tab_;
  }
  category(): AchievementCategory {
    return this.category_;
  }

  setTab(t: PageTab): void {
    this.tab_ = t;
  }

  /** 分類の名前（id でも ことばでも） */
  setCategory(name: string): boolean {
    const id = CATEGORY_ORDER.find((c) => c === name || CATEGORY_LABEL[c] === name);
    if (!id) return false;
    this.category_ = id;
    return true;
  }

  /**
   * 見ているものが 変わったら、離れた分類の取った実績を「見た」にする。
   * inventoryOpen = もちもの画面が 開いているか
   */
  sync(inventoryOpen: boolean): void {
    const key = inventoryOpen && this.tab_ === 'achievements' ? this.category_ : null;
    if (this.viewingKey !== null && this.viewingKey !== key) this.markCategory(this.viewingKey);
    this.viewingKey = key;
  }

  private markCategory(c: AchievementCategory): void {
    this.sys.markViewed(ACHIEVEMENT_DEFS.filter((d) => d.category === c && this.sys.isUnlocked(d.id)).map((d) => d.id));
  }

  private dot(c: AchievementCategory | null): boolean {
    return ACHIEVEMENT_DEFS.some((d) => (c === null || d.category === c) && this.sys.isUnlocked(d.id) && !this.sys.isViewed(d.id));
  }

  ui(inventoryOpen = true): PageUi {
    this.sync(inventoryOpen);
    // COUNTRY-1 §5.2: 古い（legacy）実績は 取った物だけ いちばん下に「むかしの ばしょ」として 出す
    const inCategory = ACHIEVEMENT_DEFS.filter((d) => d.category === this.category_);
    const ordered = [...inCategory.filter((d) => !d.legacy), ...inCategory.filter((d) => d.legacy && this.sys.isUnlocked(d.id))];
    const rows: PageRow[] = ordered.map((d) => {
      const u = this.sys.isUnlocked(d.id);
      const prev = !u && d.tier > 1 ? ACHIEVEMENT_DEFS.find((p) => p.series === d.series && p.tier === d.tier - 1) : undefined;
      const next = !!prev && this.sys.isUnlocked(prev.id);
      const row: PageRow = { id: d.id, shown: u || next, next, unlocked: u, isNew: u && !this.sys.isViewed(d.id), ...(d.legacy ? { legacy: true } : {}) };
      if (next) row.progress = { now: Math.min(d.goal, this.sys.stat(d.stat)), goal: d.goal };
      return row;
    });
    const count = this.sys.pendingCount();
    return {
      tab: this.tab_,
      category: this.category_,
      categories: CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABEL[id], dot: this.dot(id) })),
      // N = 今 取れる 実績 ＋ 取った むかしの 実績（COUNTRY-1 §5.2）
      total: ACHIEVEMENT_DEFS.filter((d) => !d.legacy || this.sys.isUnlocked(d.id)).length,
      unlocked: this.sys.unlockedCount(),
      rows,
      tabDot: this.dot(null),
      badge: { visible: count > 0, count },
    };
  }
}
