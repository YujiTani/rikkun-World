import type { ItemId } from '../contracts';

/** 拾ったときのログ 1 行（M4 §2.12）。上＝古い、下＝新しい */
export interface PickupLine {
  item: ItemId;
  count: number;
  ticksLeft: number;
  /** 同じアイテムが足されるたびに増える（画面が「ぴょこん」とはねるきっかけ） */
  bump: number;
}

export interface PickupLogOptions {
  /** 1 行が消えるまで（既定 180 ステップ） */
  ticks: number;
  /** 行の上限（既定 5） */
  max: number;
}

/** 拾ったときのログの中身（画面は担当 C1 が読む）。ステップで数える */
export class PickupLog {
  private lines: PickupLine[] = [];

  constructor(private readonly opts: PickupLogOptions = { ticks: 180, max: 5 }) {}

  /** 1 こ以上入ったときに呼ぶ。同じアイテムの行があれば数を足してのこり時間を戻す */
  push(item: ItemId, count: number): void {
    if (!(count > 0)) return;
    const same = this.lines.find((l) => l.item === item);
    if (same) {
      same.count += count;
      same.ticksLeft = this.opts.ticks;
      same.bump++;
      return;
    }
    this.lines.push({ item, count, ticksLeft: this.opts.ticks, bump: 0 });
    while (this.lines.length > this.opts.max) this.lines.shift();
  }

  /** 1 ステップ進める */
  update(): void {
    if (this.lines.length === 0) return;
    for (const l of this.lines) l.ticksLeft--;
    this.lines = this.lines.filter((l) => l.ticksLeft > 0);
  }

  list(): ReadonlyArray<Readonly<PickupLine>> {
    return this.lines;
  }

  clear(): void {
    this.lines = [];
  }
}
