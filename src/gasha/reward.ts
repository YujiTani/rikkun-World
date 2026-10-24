/**
 * #293 リリース: がしゃどくろを たおした ごほうび（コアを こわした 一山の 中身）。何が 何個かは releaseTuning.ts の reward。
 * かならず 入る もの(いまは 忍者の足袋 1 つ。部位が できたら 表に 行を 足すだけ)、レア素材は 表の 行ごとに 最小〜最大の 個数。乱数は シード付き。
 */
import type { ItemStack } from '../contracts';
import { createRng, randInt, type Rng } from '../world/gen/random';
import { RELEASE } from './releaseTuning';

export type RewardTune = (typeof RELEASE)['reward'];

/** 中身を きめる 乱数（世界の シードと 何日目、その 日の 何体目か） */
export function rewardRng(worldSeed: number, n: number, salt: number = RELEASE.reward.seedSalt): Rng {
  let h = Math.imul(worldSeed | 0, 0x9e3779b1) ^ Math.imul(n | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return createRng((h ^ (h >>> 13)) >>> 0);
}

/** コアを こわした 一山の 中身（持ち物の 山の 一覧）。かならず 入る もの → レア素材の じゅん */
export function rollReward(rng: Rng, tune: RewardTune = RELEASE.reward): ItemStack[] {
  const out: ItemStack[] = tune.guaranteed.map((g) => ({ item: g.item, count: g.count }));
  for (const row of tune.rare) out.push({ item: row.item, count: randInt(rng, row.min, Math.max(row.min, row.max)) });
  return out;
}
