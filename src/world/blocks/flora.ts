import type { BlockId } from '../../contracts';

/** 家を 建てる とき（どうづき・建築の はじめ・場所さがし）に どけて よい 草花（HOUSE-1 §4.7）: くさ・のばな・はな 3 しゅ・すすき。1 回で 消える 十字の 板 */
const VANISHING_FLORA: ReadonlySet<string> = new Set(['kusa', 'nobana', 'flower_y', 'flower_o', 'flower_p', 'susuki']);
export function isVanishingFlora(id: BlockId | 'outside'): boolean {
  return VANISHING_FLORA.has(id);
}

/** FLORA-75: 景色の くさ・のばな（十字の板。1 回で消える）か */
export function isFloraBlock(id: BlockId | 'outside'): id is 'kusa' | 'nobana' {
  return id === 'kusa' || id === 'nobana';
}
