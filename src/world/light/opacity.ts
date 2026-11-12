import { GADGET_TUNING } from '../../content/items/gadgetTuning';
import { FURN_BLOCK_IDS, K_ANDON, isFurnKind } from '../blocks/houseBlocks';
import { isYakataTorch } from '../blocks/mineYakata';
import { AIR, BLOCK_INDEX, BLOCK_TYPES, HOTARUISHI, SPRINKLER, isLampIndex, isChalkIndex, isCrossIndex, isFloorDecoIndex, isLeafIndex, isPropIndex, isTorchIndex } from '../blocks/blockTypes';
import { isWaterIndex } from '../blocks/water';
import { isMagmaIndex } from '../blocks/magma';
import { MAGMA_TUNING } from '../blocks/liquids';
import { LIGHT_CONFIG as C } from './config';

/** 光を弱める量。0 = そのまま通す、1 = 1 弱める、15 = 通さない（知らないブロックは通さない） */
export const OPACITY: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => {
  if (i === AIR || isTorchIndex(i) || isCrossIndex(i) || isPropIndex(i) || isChalkIndex(i) || isFloorDecoIndex(i)) return 0; // しるし（MINE-1B）・床の 飾り（MINE-1E）は 光を 通す
  if (i === SPRINKLER) return 0; // M7-2 §4.1: 固いが 光を 通す（となり の 作物 を くらく しない）
  if (isWaterIndex(i) || isLeafIndex(i)) return 1; // みず・はっぱ は 1 弱める
  return 15;
});

/** あんどん（HOUSE-1D。4 向き）の ブロックの 番号。たいまつと 同じ 強さで 光る（家具の しゅるいを 足しても 書きかえない：光る 家具は ここだけ） */
const ANDON_INDEX: ReadonlySet<number> = new Set(FURN_BLOCK_IDS.filter((id) => isFurnKind(id, K_ANDON)).map((id) => BLOCK_INDEX[id]));

/** WATERFALL-1: マグマ（量 1〜8）は 光る（マグマの わきどころは 光らない。出た マグマが 光る） */
const MAGMA_GLOW: ReadonlySet<number> = new Set(BLOCK_TYPES.map((_, i) => i).filter((i) => isMagmaIndex(i)));

/** ブロックが出す光（0 = 光らない） */
export const EMISSION: Uint8Array = Uint8Array.from(BLOCK_TYPES, (_, i) => (isYakataTorch(BLOCK_TYPES[i]!.id) ? C.yakataTorchLevel : isTorchIndex(i) || ANDON_INDEX.has(i) ? C.torchLevel : isLampIndex(i) ? GADGET_TUNING.lantern.light : i === HOTARUISHI ? C.hotaruishiLevel : MAGMA_GLOW.has(i) ? MAGMA_TUNING.light : 0)); // ちょうちんは 表の 強さ（ITEM-FX-1）。ほたるいしは 光る 固い ブロック（MINE-1B。光は となりの 空気へ 広がる）
