import type { BlockId } from '../../contracts';

/** はっぱの ブロック（固い ブロックに 数えない。みずもりの はかり）。HOUSE-1C PR-2 */
export const LEAF_BLOCKS: readonly string[] = ['leaves', 'momiji_leaves', 'matsu_leaves'];

/** FLORA-75: 景色の くさ・のばな（十字の板。1 回で消える）か */
export function isFloraBlock(id: BlockId | 'outside'): id is 'kusa' | 'nobana' {
  return id === 'kusa' || id === 'nobana';
}
