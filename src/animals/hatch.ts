import type { AnimalBreed, BreedLotteryState, LiveSettings } from '../contracts';
import type { Rng } from '../world/gen/random';

/**
 * かえす 時 の しゅるい の くじ（LIVE-2 §2.10）。
 * - `egg`: `machoChance` で マッチョ。つづけて マッチョ で ない 回数 `machoMiss` が `machoPity` に なったら 次 は かならず。乱数 は いつも 1 つ。
 * - `kin_tamago`（`'gold'` も 同じ）: かならず マッチョ。くじ を ひかない（乱数 を つかわず `machoMiss` も かえない）。
 * 金 の ひよこ・金 の にわとり は 無い ので `'gold'` は 返さない。
 */
export function rollBreed(
  item: 'egg' | 'gold' | 'kin_tamago',
  s: Pick<LiveSettings, 'machoChance' | 'machoPity'>,
  state: BreedLotteryState,
  rng: Rng,
): AnimalBreed {
  if (item !== 'egg') return 'macho';
  const r = rng();
  if (state.machoMiss >= s.machoPity || r < s.machoChance) {
    state.machoMiss = 0;
    return 'macho';
  }
  state.machoMiss++;
  return 'normal';
}
