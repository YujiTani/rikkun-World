import { leafMode } from '../leafBambooMode';
import type { BlockCube } from './sectionCube';
import { LEAF, OCC } from './sectionConsts';

/**
 * はっぱの「空気に 出ている 面」。ふつうの 見える面（e）は となりが はっぱでも 立つので、
 * もこもこ（?leaf=moko）は となりが はっぱ・固い物で ない 面だけを 数える。ほかの 種類・ほかの 描き方は e の まま。
 */
export function leafOpen(cube: BlockCube, k: number, bxi: number, byi: number, bzi: number, e: number): number {
  if (LEAF[k] === 0 || leafMode() !== 'moko') return e;
  let o = 0;
  for (let f = 0; f < 6; f++) {
    const n = cube.kindNear(bxi, byi, bzi, f);
    if (n >= 0 && OCC[n] === 0 && LEAF[n] === 0) o |= 1 << f;
  }
  return o;
}
