import type { ItemId } from '../contracts';

/**
 * くらの 画面の 数の えらび（HOUSE-1A。docs/design/HOUSE-1.md §2.4 の 4）。DOM なし。
 * 持ち物の マスを えらぶと「あずける」、くらの マスを えらぶと「とりだす」。数は 1 から はじまり、1 〜 動かせる 数 の 間で かえる。
 */
export type KuraSide = 'bag' | 'store';

export interface KuraSel {
  side: KuraSide;
  item: ItemId;
}

export class KuraPicker {
  sel: KuraSel | null = null;
  amount = 1;

  select(side: KuraSide, item: ItemId): void {
    this.sel = { side, item };
    this.amount = 1;
  }

  clear(): void {
    this.sel = null;
    this.amount = 1;
  }

  /** いまの えらびで 押せる ボタン */
  action(): 'deposit' | 'withdraw' | null {
    return this.sel === null ? null : this.sel.side === 'bag' ? 'deposit' : 'withdraw';
  }

  /** 数を delta だけ かえる（1 〜 max の 間に おさめる） */
  plus(delta: number, max: number): void {
    this.amount = Math.max(1, Math.min(Math.max(1, max), this.amount + delta));
  }

  /** ぜんぶ */
  all(max: number): void {
    this.amount = Math.max(1, max);
  }

  /** 動かせる 数が へった とき まるめる。0 に なれば えらびを けす（もう 動かす 物が ない） */
  fit(max: number): void {
    if (max <= 0) this.clear();
    else if (this.amount > max) this.amount = max;
  }
}
