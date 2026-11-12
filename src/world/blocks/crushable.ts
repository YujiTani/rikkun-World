import { BLOCK_TYPES } from './blockTypes';
import { chestBlockInfo } from './chestBlock';
import { doorInfo } from './houseBlocks';
import { himawariPartnerDy } from './himawari';
import { isWater } from './water';

/**
 * 妖怪の たおれこみ・たたきつけ〔ぬりかべ stone.ts・がしゃどくろ gasha/gashaBigCrush.ts〕で こわして よい ブロックか。
 * こわさない 物: 空気・外・みず・start_torch・家の 戸〔上・下・あけた 物〕・宝箱〔MINE-1 §4.4。2 マス とも のこす〕。
 * こわせない 物（breakable: false。とうろう など）も のこす。
 * こわす 判定は 両方の 妖怪で ここ 1 か所を 使う。
 */
/** こわせない ブロックの id（とうろう など。表から 1 回だけ 作る） */
const UNBREAKABLE: ReadonlySet<string> = new Set(BLOCK_TYPES.filter((b) => !b.breakable).map((b) => b.id));

export function canCrushBlock(block: string): boolean {
  return block !== 'air' && block !== 'outside' && !isWater(block) && block !== 'start_torch' && doorInfo(block) === null && chestBlockInfo(block) === null && !UNBREAKABLE.has(block);
}

/** こわす ブロックと 2 段で ひと組の 相手の マス（ひまわり）。なければ null。相手は こわす はんいの 外でも いっしょに 消す */
export function crushPartner(block: string, x: number, y: number, z: number): { x: number; y: number; z: number } | null {
  const dy = himawariPartnerDy(block);
  return dy === null ? null : { x, y: y + dy, z };
}
