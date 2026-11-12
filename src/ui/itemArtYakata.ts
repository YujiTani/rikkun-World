import { fromRows } from './itemArtM4';
import { YAKATA_BLOCKS } from '../world/blocks/mineYakata';
import type { Rgba } from '../world/blocks/textures';

/**
 * MINE-1F: あやしい たいまつ 2 つの 2D の 絵（16×16）。かべ・ゆか・だんは ブロックの 横の 面の 絵〔itemIcon の ふつうの 道〕。
 * むらさき = 鉄の 火ざら ＋ むらさきの 火 / おにび = 細い 燭台 ＋ 青白い まるい 鬼火。
 */
const MAOU = [
  '................',
  '.......K........',
  '......KFK.......',
  '.....KFPFK......',
  '....KFPWPFK.....',
  '....KFPPPFK.....',
  '.....KFPFK......',
  '......KKK.......',
  '.....KIIIK......',
  '......KIK.......',
  '......KIK.......',
  '......KIK.......',
  '......KIK.......',
  '.....KIIIK......',
  '.......K........',
  '................',
] as const;
const ONIBI = [
  '................',
  '......KKK.......',
  '.....KFFFK......',
  '....KFPWPFK.....',
  '....KFWWWFK.....',
  '....KFPWPFK.....',
  '.....KFFFK......',
  '......KKK.......',
  '......KIK.......',
  '......KIK.......',
  '......KIK.......',
  '......KIK.......',
  '......KIK.......',
  '.....KIIIK......',
  '.......K........',
  '................',
] as const;

const PAL_MAOU = { K: 0x1c1626, F: 0x8a4fe0, P: 0xb36cff, W: 0xf1deff, I: 0x4a4552 };
const PAL_ONIBI = { K: 0x1b2030, F: 0x4aa8e0, P: 0x7fd0ff, W: 0xeaf9ff, I: 0x77778a };

/** あやしい たいまつか（絵を ここで 引く 物） */
export const isYakataTorchItem = (item: string): boolean => item === YAKATA_BLOCKS.maou.taimatsu || item === YAKATA_BLOCKS.otera.taimatsu;

export function yakataTorchPixels(item: string): Rgba[] {
  return item === YAKATA_BLOCKS.maou.taimatsu ? fromRows(MAOU, PAL_MAOU) : fromRows(ONIBI, PAL_ONIBI);
}
