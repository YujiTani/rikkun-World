import type { AchievementId, AchievementOwner } from '../contracts';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 #18）: 実績の 持ち主（だれが 達成したか）の 帳面。DOM・時間を 知らない。
 * 実績の 帯を 達成した 人の 半分に 出す ため。数えかた（記録・実績の 数）は 2 人で 共有の まま、ここは 帯の 持ち主だけ。
 * 取った あとの 持ち主は セーブ しない（読みこみ後に 取った 物から 数える。戻した 物は null → 帯は 両方の 半分）。
 */
export class OwnerBook {
  /** いま feed している 人（既定 = 1P） */
  private cur: 1 | 2 | 'world' = 1;
  private readonly by = new Map<AchievementId, 1 | 2 | 'world'>();

  /** fn の あいだ 持ち主を who に する（入れ子・例外でも 元に もどす）。null（持ち主 なし）は 呼ぶ 側が 渡さない */
  with<T>(who: 1 | 2 | 'world', fn: () => T): T {
    const prev = this.cur;
    this.cur = who;
    try {
      return fn();
    } finally {
      this.cur = prev;
    }
  }

  /** いま 取った 実績の 持ち主を 覚える */
  mark(id: AchievementId): void {
    this.by.set(id, this.cur);
  }

  /** 取って いない・戻した（覚えて いない）物は null */
  of(id: AchievementId, unlocked: boolean): AchievementOwner {
    return unlocked ? (this.by.get(id) ?? null) : null;
  }

  clear(): void {
    this.by.clear();
  }
}
