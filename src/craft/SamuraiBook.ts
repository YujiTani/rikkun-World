import type { ItemId } from '../contracts';
import { SAMURAI_GEAR } from './config';

/** 侍装備 4 つの id */
export const SAMURAI_IDS: readonly ItemId[] = Object.values(SAMURAI_GEAR) as ItemId[];

export function isSamuraiGear(item: ItemId): boolean {
  return SAMURAI_IDS.includes(item);
}

/**
 * SAMURAI-1 §4.2: 侍帳（さむらいちょう）= 手に 入れた ことの ある 侍装備（世界ごとに 保存）。LegendBook と 同じ 形。
 * 「手に 入れた」= もちものか 防具の マスに 入った とき。こわれても 消えない。前の 保存に ないときは 空。
 */
export class SamuraiBook {
  private list: ItemId[] = [];

  /** もちものに 入った。侍装備なら 記録して `{ first: はじめての 物か, kinds: しゅるいの 数 }`、そうでなければ null */
  add(item: ItemId): { first: boolean; kinds: number } | null {
    if (!isSamuraiGear(item)) return null;
    const first = !this.list.includes(item);
    if (first) this.list.push(item);
    return { first, kinds: this.list.length };
  }

  /** 手に 入れた 物の コピー */
  got(): ItemId[] {
    return [...this.list];
  }

  serialize(): { got: ItemId[] } {
    return { got: [...this.list] };
  }

  /** 読みこみ。held = 読みこんだ とき もちもの・防具の マスに ある 物（侍装備は 帳に 入れる） */
  deserialize(data: unknown, held: readonly ItemId[] = []): void {
    const g = (data as { got?: unknown } | null | undefined)?.got;
    this.list = Array.isArray(g) && g.every((x) => typeof x === 'string') ? ([...new Set(g as string[])].filter((x) => isSamuraiGear(x as ItemId)) as ItemId[]) : [];
    for (const h of held) this.add(h);
  }
}
