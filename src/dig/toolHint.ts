/**
 * あう道具のヒント（BALANCE.md §4.6）。あわない道具で 同じブロックを 31 ステップ目まで ほりつづけて
 * まだ MAX でなく、あう道具が ホットバーにあり、そのブロックで まだ光らせていないとき、
 * その道具のマスを 120 ステップ（31〜150 ステップ目）光らせる。持ちかえたら すぐ消す。
 * 画面（Hotbar）は current() を読むだけ。
 */
export const HINT_AFTER_TICKS = 31;
export const HINT_TICKS = 120;
/** 「同じブロックでは 1 回だけ」を 覚えておく数の上限（あふれたら 全部わすれる） */
const MAX_SHOWN = 512;

export interface ToolHintState {
  slot: number;
  ticksLeft: number;
}

export class ToolHintModel {
  private readonly shown = new Set<string>();
  private key: string | null = null;
  private count = 0;
  private cur: ToolHintState | null = null;
  private readonly out: ToolHintState = { slot: 0, ticksLeft: 0 };
  private selAtStart = -1;

  /** 毎ステップ、ほる処理より先に（ほる処理の中で 光りはじめた分は 同じステップで 減らさない） */
  tick(selected: number): void {
    if (!this.cur) return;
    if (selected !== this.selAtStart || --this.cur.ticksLeft <= 0) this.cur = null;
  }

  /**
   * あわない道具で 1 ステップ ほった。key = ブロックの 座標、slot = ホットバーの あう道具のマス（なければ -1）、
   * ready = もう MAX
   */
  digTick(key: string, slot: number, selected: number, ready: boolean): void {
    if (this.key !== key) {
      this.key = key;
      this.count = 0;
    }
    if (ready) return;
    this.count++;
    if (this.count !== HINT_AFTER_TICKS || slot < 0 || this.shown.has(key)) return;
    if (this.shown.size >= MAX_SHOWN) this.shown.clear();
    this.shown.add(key);
    this.cur = { slot, ticksLeft: HINT_TICKS };
    this.selAtStart = selected;
  }

  /** ほりつづけていない（はなした・あう道具で ほっている・別の物を見ている）: 数えなおし */
  idle(): void {
    this.key = null;
    this.count = 0;
  }

  /** そのブロックを こわした: また 光らせてよい */
  forget(key: string): void {
    this.shown.delete(key);
  }

  current(): ToolHintState | null {
    if (!this.cur) return null;
    this.out.slot = this.cur.slot;
    this.out.ticksLeft = this.cur.ticksLeft;
    return this.out;
  }
}

/** ホットバーの マスから、あう道具の いちばん強い物（同じなら左）。なければ -1 */
export function bestHotbarSlot<T extends string>(
  items: ReadonlyArray<T | undefined | null>,
  fits: (item: T | undefined) => boolean,
  rank: (item: T | undefined) => number,
): number {
  let best = -1;
  let bestRank = -1;
  for (let i = 0; i < items.length && i < 9; i++) {
    const it = items[i] ?? undefined;
    if (!fits(it)) continue;
    const r = rank(it);
    if (r > bestRank) {
      best = i;
      bestRank = r;
    }
  }
  return best;
}
