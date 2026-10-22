import type { ItemId } from '../contracts';

/**
 * WEAPON-7 §2.3: 手に 入れた ことの ある レジェンダリー（`legendGot`。世界ごとに 保存）。
 * 「手に 入れた」= もちものに 入った とき。こわれても 消えない。前の 保存に ない ときは 空。
 */
export class LegendBook {
  private list: ItemId[] = [];

  constructor(private readonly isLegend: (item: ItemId) => boolean) {}

  /** もちものに 入った。レジェンダリーなら 記録して `{ first: はじめての 物か, kinds: しゅるいの 数 }`、そうでなければ null */
  add(item: ItemId): { first: boolean; kinds: number } | null {
    if (!this.isLegend(item)) return null;
    const first = !this.list.includes(item);
    if (first) this.list.push(item);
    return { first, kinds: this.list.length };
  }

  got(): ItemId[] {
    return [...this.list];
  }

  serialize(): { got: ItemId[] } {
    return { got: [...this.list] };
  }

  deserialize(data: unknown): void {
    const g = (data as { got?: unknown } | null | undefined)?.got;
    this.list = Array.isArray(g) && g.every((x) => typeof x === 'string') ? ([...new Set(g as string[])] as ItemId[]) : [];
  }
}
