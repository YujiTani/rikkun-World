// HOUSE-1E 前の セーブの くらの 物を かえす 小さな 部品（くらは もう ない。仕様 docs/design/HOUSE-1.md §2.4 の 4）。DOM・three なし。
// 1D までの セーブの `house.kura`（{ アイテムid: 数 }）を 読んで おいて、次に どれかの 建築士さんに 話した とき、もちものに 入る 分だけ もどす。
// 足もとには 落とさない（落とし物は 10 分で 消える ため）。入らなかった 分は 記録に のこし、次に 話した とき また もどす。
// セーブから 記録が なくなるのは ぜんぶ もどした あと（HouseState が `kura` の キーごと 書かなくなる）。
import type { Inventory, ItemId } from '../contracts';
import { ITEM_TYPES, itemType } from '../inventory/items';

/** 1 種類 あたりの 上限（1D までの くらの 上限。壊れた 大きな 数を はじく ため。単位: こ） */
const LEGACY_MAX = 999;

/** 登録表（ITEM_TYPES）の 並び。もどす 順は この 順 */
const ORDER = new Map<string, number>(ITEM_TYPES.map((t, i) => [t.id as string, i]));

/** もちものへ 入れる 口 */
type LegacyBag = Pick<Inventory, 'add'>;

export class LegacyKura {
  private readonly counts = new Map<string, number>();

  /** まだ かえして いない 物が ある */
  pending(): boolean {
    return this.counts.size > 0;
  }

  /** 窓口 `house.legacyKura()` の 形: { id: 数 }。まだ かえして いない 物が なければ null */
  totals(): Record<string, number> | null {
    if (this.counts.size === 0) return null;
    const out: Record<string, number> = {};
    for (const e of this.entries()) out[e.item] = e.count;
    return out;
  }

  /** セーブに 書く 形。かえす 物が なければ undefined（`kura` の キーごと 書かない） */
  serialize(): Record<string, number> | undefined {
    return this.totals() ?? undefined;
  }

  /**
   * セーブから 読む。前の 中身は すてる。形が ちがう・知らない id・重ならない 物は とばす（こわれた データは 空）。
   * 数は 切りすての 整数で 1〜999
   */
  restore(data: unknown): void {
    this.counts.clear();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
    for (const [item, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || (itemType(item)?.maxStack ?? 0) < 2) continue;
      const n = Math.min(Math.floor(v), LEGACY_MAX);
      if (n >= 1) this.counts.set(item, n);
    }
  }

  /** もちものに 入る 分だけ もどす（登録表の ならび順）。入らなかった 分は のこる。1 こ以上 もどせた 種類（もどした 順） */
  giveBack(bag: LegacyBag): ItemId[] {
    const moved: ItemId[] = [];
    for (const { item, count } of this.entries()) {
      const left = bag.add(item, count);
      if (left < count) moved.push(item);
      if (left > 0) this.counts.set(item, left);
      else this.counts.delete(item);
    }
    return moved;
  }

  private entries(): Array<{ item: ItemId; count: number }> {
    const rows = [...this.counts.entries()].map(([item, count]) => ({ item: item as ItemId, count }));
    rows.sort((a, b) => (ORDER.get(a.item) ?? Infinity) - (ORDER.get(b.item) ?? Infinity));
    return rows;
  }
}
