import type { ItemId } from '../contracts';
import type { Rng } from '../world/gen/random';

/**
 * 宝箱を あけた とき の レアドロップの 表（#293 試作）。chance は 1 回 あけるごとの 確率（0.003 = 0.3%）。
 * 宝箱は まだ ゲームに 無い。できたら、あけた ときに `rollChestLoot(rng)` を 呼んで 出た アイテムを 渡す。
 * 乱数は シード付き（`createRng`）を 渡す。表の 行ごとに 1 回ずつ 引く。
 */
export interface ChestLootEntry {
  item: ItemId;
  chance: number;
}

export const CHEST_LOOT: readonly ChestLootEntry[] = [
  { item: 'ninja_tabi', chance: 0.003 }, // 忍者の足袋（レア度 7。がしゃどくろ へ の ロードマップ）
];

/** 宝箱 1 つ ぶんの レアドロップ（当たった アイテムの 一覧。ふつうは 空） */
export function rollChestLoot(rng: Rng, table: readonly ChestLootEntry[] = CHEST_LOOT): ItemId[] {
  const out: ItemId[] = [];
  for (const e of table) if (rng() < e.chance) out.push(e.item);
  return out;
}
