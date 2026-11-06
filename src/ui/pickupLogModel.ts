import type { ItemId } from '../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';

/** ひろった／たんす から つかった／宝箱の 中身（CRAFT-2 §2.5。3 しゅるいで 5 行を 分け合う） */
export type LiveKind = 'pickup' | 'fromTansu' | 'chest';

/** 行の 文（`つち ×2`・`たんす から き ×1`）。'chest' は 文を そのまま（`text`。たからばこ から ◯◯ など を てにいれた！） */
export function liveRowText(kind: LiveKind, name: string, count: number, text?: string): string {
  switch (kind) {
    case 'fromTansu':
      return `たんす から ${name} ×${count}`;
    case 'pickup':
      return `${name} ×${count}`;
    case 'chest':
      return text ?? name;
    default: {
      const never: never = kind;
      return never;
    }
  }
}

export interface PickupRow {
  kind: LiveKind;
  item: ItemId;
  count: number;
  ticksLeft: number;
  /** 数を足した回数（画面が「ぴょこん」をやり直す目印） */
  bump: number;
  /** 'chest' の 行の 文（ほかは なし） */
  text?: string;
  /** 行の 通し番号（'chest' の 行は まとめないので、画面の 行の 目印に 使う） */
  id: number;
}

/**
 * 拾ったときの ログ（M4 §2.12）。上＝古い、下＝新しい。
 * 同じアイテムの行が出ていれば数を足して時間を戻す。5 行まで。ゲームのステップ（step）で数える。
 */
export class PickupLogModel {
  private readonly rows_: PickupRow[] = [];
  private nextId = 0;

  constructor(private readonly cfg: CraftUiSettings = CRAFT_UI_SETTINGS) {}

  /** 拾って持ち物に入った（入りきらなかった分は ふくめない）。0 以下は無視 */
  push(item: ItemId, count: number, kind: LiveKind = 'pickup', text?: string): void {
    if (!(count > 0)) return;
    // 宝箱の 行は ほかの 行と まとめない〔1 回 あけるごとに 1 行〕
    const row = kind === 'chest' ? undefined : this.rows_.find((r) => r.item === item && r.kind === kind);
    if (row) {
      row.count += count;
      row.ticksLeft = this.cfg.pickupLogTicks;
      row.bump++;
      return;
    }
    this.rows_.push({ kind, item, count, ticksLeft: this.cfg.pickupLogTicks, bump: 0, text, id: this.nextId++ });
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

  /** 拾った行だけ（M4 AC27。`inventory.pickupLog()`） */
  list(): { item: ItemId; count: number; ticksLeft: number }[] {
    return this.rows_.filter((r) => r.kind === 'pickup').map((r) => ({ item: r.item, count: r.count, ticksLeft: r.ticksLeft }));
  }

  /** 2 しゅるい ぜんぶ（上＝古い） */
  listAll(): { kind: LiveKind; item: ItemId; count: number; ticksLeft: number; text?: string }[] {
    return this.rows_.map((r) => ({ kind: r.kind, item: r.item, count: r.count, ticksLeft: r.ticksLeft, text: r.text }));
  }

  /** うすくなる度合い 0〜1（最後の pickupLogFadeTicks で 1 → 0） */
  opacity(row: PickupRow): number {
    return Math.max(0, Math.min(1, row.ticksLeft / this.cfg.pickupLogFadeTicks));
  }

  clear(): void {
    this.rows_.length = 0;
  }
}
