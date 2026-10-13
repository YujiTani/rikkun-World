import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isTorchIndex } from '../blocks/blockTypes';
import { LIGHT_CONFIG as C } from './config';

const LEAVES = BLOCK_TYPES.findIndex((t) => t.id === 'leaves');

/** 光を弱める量。0 = そのまま通す、1 = 1 弱める、15 = 通さない（知らないブロックは通さない） */
export const OPACITY: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => {
  if (i === AIR || isTorchIndex(i) || isCrossIndex(i)) return 0;
  if (i === WATER || i === LEAVES) return 1; // みず・はっぱ は 1 弱める
  return 15;
});

/** ブロックが出す光（0 = 光らない） */
export const EMISSION: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => (isTorchIndex(i) ? C.torchLevel : 0));
