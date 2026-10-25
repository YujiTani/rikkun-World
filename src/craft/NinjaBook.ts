import type { ItemId } from '../contracts';
import { NINJA_GEAR } from './config';

/** 忍者装備 4 つの id */
export const NINJA_IDS: readonly ItemId[] = Object.values(NINJA_GEAR) as ItemId[];

export function isNinjaGear(item: ItemId): boolean {
  return NINJA_IDS.includes(item);
}

/**
 * NINJA-1 §4.2: 忍者帳（にんじゃちょう）= 手に 入れた ことの ある 忍者装備（世界ごとに 保存）。LegendBook と 同じ 形。
 * 「手に 入れた」= もちものか 防具の マスに 入った とき。こわれても 消えない。前の 保存に ないときは 空。
 */
export class NinjaBook {
  private list: ItemId[] = [];

  /** もちものに 入った。忍者装備なら 記録して `{ first: はじめての 物か, kinds: しゅるいの 数 }`、そうでなければ null */
  add(item: ItemId): { first: boolean; kinds: number } | null {
    if (!isNinjaGear(item)) return null;
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

  /** 読みこみ。held = 読みこんだ とき もちもの・防具の マスに ある 物（忍者装備は 帳に 入れる。#298 で もう 足袋を 持って いる 人に 2 こ目を 出さない） */
  deserialize(data: unknown, held: readonly ItemId[] = []): void {
    const g = (data as { got?: unknown } | null | undefined)?.got;
    this.list = Array.isArray(g) && g.every((x) => typeof x === 'string') ? ([...new Set(g as string[])].filter((x) => isNinjaGear(x as ItemId)) as ItemId[]) : [];
    for (const h of held) this.add(h);
  }
}
