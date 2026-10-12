import type { ItemId } from '../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';

export interface PickupRow {
  item: ItemId;
  count: number;
  ticksLeft: number;
  /** 数を足した回数（画面が「ぴょこん」をやり直す目印） */
  bump: number;
}

/**
 * 拾ったときの ログ（M4 §2.12）。上＝古い、下＝新しい。
 * 同じアイテムの行が出ていれば数を足して時間を戻す。5 行まで。ゲームのステップ（step）で数える。
 */
export class PickupLogModel {
  private readonly rows_: PickupRow[] = [];

  constructor(private readonly cfg: CraftUiSettings = CRAFT_UI_SETTINGS) {}

  /** 拾って持ち物に入った（入りきらなかった分は ふくめない）。0 以下は無視 */
  push(item: ItemId, count: number): void {
    if (!(count > 0)) return;
    const row = this.rows_.find((r) => r.item === item);
    if (row) {
      row.count += count;
      row.ticksLeft = this.cfg.pickupLogTicks;
      row.bump++;
      return;
    }
    this.rows_.push({ item, count, ticksLeft: this.cfg.pickupLogTicks, bump: 0 });
    while (this.rows_.length > this.cfg.pickupLogMax) this.rows_.shift();
  }

  /** 1 ステップ進める */
  step(): void {
    for (const r of this.rows_) r.ticksLeft--;
    for (let i = this.rows_.length - 1; i >= 0; i--) if (this.rows_[i].ticksLeft <= 0) this.rows_.splice(i, 1);
  }

  /** 今の行（上＝古い から順） */
  rows(): readonly PickupRow[] {
    return this.rows_;
  }

  list(): { item: ItemId; count: number; ticksLeft: number }[] {
    return this.rows_.map((r) => ({ item: r.item, count: r.count, ticksLeft: r.ticksLeft }));
  }

  /** うすくなる度合い 0〜1（最後の pickupLogFadeTicks で 1 → 0） */
  opacity(row: PickupRow): number {
    return Math.max(0, Math.min(1, row.ticksLeft / this.cfg.pickupLogFadeTicks));
  }

  clear(): void {
    this.rows_.length = 0;
  }
}
