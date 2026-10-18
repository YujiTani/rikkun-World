import type { BlockId } from '../../contracts';

/** FLORA-75: 景色の くさ・のばな（十字の板。1 回で消える）か */
export function isFloraBlock(id: BlockId | 'outside'): id is 'kusa' | 'nobana' {
  return id === 'kusa' || id === 'nobana';
}
