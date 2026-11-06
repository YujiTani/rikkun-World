import { chestBlockInfo } from './chestBlock';
import { doorInfo } from './houseBlocks';
import { isWater } from './water';

/**
 * 妖怪の たおれこみ・たたきつけ〔ぬりかべ stone.ts・がしゃどくろ gasha/gashaBigCrush.ts〕で こわして よい ブロックか。
 * こわさない 物: 空気・外・みず・start_torch・家の 戸〔上・下・あけた 物〕・宝箱〔MINE-1 §4.4。2 マス とも のこす〕。
 * こわす 判定は 両方の 妖怪で ここ 1 か所を 使う。
 */
export function canCrushBlock(block: string): boolean {
  return block !== 'air' && block !== 'outside' && !isWater(block) && block !== 'start_torch' && doorInfo(block) === null && chestBlockInfo(block) === null;
}
