import type { Inventory, ItemId } from '../contracts';
import { ITEM_TYPES, itemType } from '../inventory/items';

/** 1 種類 あたりの 上限（HOUSE-1.md §2.4）。種類の 数に 上限は ない */
export const KURA_MAX = 999;

/** くらが 使う 持ち物の 窓口（`InventoryImpl` が 合う） */
export type KuraBag = Pick<Inventory, 'count' | 'remove' | 'add'>;

/** 登録表（ITEM_TYPES）の 並び。くらの 一覧は この 順 */
const ORDER = new Map<string, number>(ITEM_TYPES.map((t, i) => [t.id as string, i]));

/** 登録表の 重ね数（知らない id は 0） */
const registryStack = (item: string): number => itemType(item)?.maxStack ?? 0;

/**
 * くら（HOUSE-1A。docs/design/HOUSE-1.md §2.4）: 建築士さん どうしで 共有する 材料の 入れ物。
 * 1 マスに 2 こ 以上 重ねられる 物だけ あずけられる（刀・道具・せっけいず・キットは 0 こ）。1 種類 999 こ まで、種類は 無制限。
 * 持ち物とは `deposit`・`withdraw` で やりとりする（持ち物の 中身は ここでは 持たない）。メニューが とじていても 使える。
 */
export class Kura {
  private readonly counts = new Map<string, number>();

  /** stackOf: id → 重ね数（テストで 登録表に 無い 種類を 使う とき だけ 差しかえる） */
  constructor(private readonly stackOf: (item: string) => number = registryStack) {}

  /** あずけられる 物か（1 マスに 2 こ以上 重なる）。刀・道具・せっけいず・キットは あずけられない */
  canHold(item: ItemId | string): boolean {
    return this.stackOf(item) >= 2;
  }

  /** 1 種類の 数（ない = 0） */
  count(item: ItemId | string): number {
    return this.counts.get(item) ?? 0;
  }

  /** 1 こ以上 ある 種類だけ、登録表の 並びで */
  entries(): Array<{ item: ItemId; count: number }> {
    const rows = [...this.counts.entries()].filter(([, n]) => n > 0);
    rows.sort((a, b) => (ORDER.get(a[0]) ?? Infinity) - (ORDER.get(b[0]) ?? Infinity));
    return rows.map(([item, count]) => ({ item: item as ItemId, count }));
  }

  /** 窓口 `house.kura()` の 形: { id: 数 }（1 こ以上 ある 種類だけ） */
  totals(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries()) out[e.item] = e.count;
    return out;
  }

  /** 持ち物から くらへ。動いた 数を 返す（重ねられない 物・999 こ いっぱい・持って いない 分は 動かない） */
  deposit(bag: KuraBag, item: ItemId, want: number): number {
    if (!this.canHold(item)) return 0;
    const n = Math.min(Math.floor(want), bag.count(item), KURA_MAX - this.count(item));
    if (!(n > 0)) return 0;
    const taken = bag.remove(item, n);
    if (taken > 0) this.counts.set(item, this.count(item) + taken);
    return taken;
  }

  /** くらから 持ち物へ。動いた 数を 返す（持ち物に 入る 分だけ。入らなかった 分は くらに のこる） */
  withdraw(bag: KuraBag, item: ItemId, want: number): number {
    const n = Math.min(Math.floor(want), this.count(item));
    if (!(n > 0)) return 0;
    const moved = n - bag.add(item, n);
    if (moved > 0) this.set(item, this.count(item) - moved);
    return moved;
  }

  /** 材料として 使って へらす（せっけいずの かみ）。へらせた 数 */
  consume(item: ItemId, n: number): number {
    const used = Math.min(Math.floor(n), this.count(item));
    if (!(used > 0)) return 0;
    this.set(item, this.count(item) - used);
    return used;
  }

  clear(): void {
    this.counts.clear();
  }

  /** セーブに 書く 形: { id: 数 }（1 こ以上 だけ） */
  serialize(): Record<string, number> {
    return this.totals();
  }

  /**
   * セーブから 読む。前の 中身は すてる。形が ちがう・知らない id・重ねられない 物は とばす（古いセーブ・こわれた データは 空）。
   * 数は 切りすての 整数で 1〜KURA_MAX
   */
  restore(data: unknown): void {
    this.counts.clear();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
    for (const [item, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || !this.canHold(item)) continue;
      const n = Math.min(Math.floor(v), KURA_MAX);
      if (n >= 1) this.counts.set(item, n);
    }
  }

  private set(item: string, n: number): void {
    if (n > 0) this.counts.set(item, n);
    else this.counts.delete(item);
  }
}
