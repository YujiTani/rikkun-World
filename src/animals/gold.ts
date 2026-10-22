import type { GoldBird, LiveSettings } from '../contracts';
import type { Rng } from '../world/gen/random';

type GoldSettings = Pick<LiveSettings, 'goldBaseWild' | 'goldBaseRaised' | 'goldPerBug' | 'goldBugMax' | 'goldCap' | 'goldPity'>;

/**
 * 金 の たまご の 確率（LIVE-2 §2.8）。きほん（野原 1%・そだてた 4%）＋ むし 1 ぴき ごと に goldPerBug（上限 goldBugMax）、
 * 全体 は goldCap まで。金 で ない たまご を goldPity こ つづけて うんだら 次 は かならず（1）。種類（マッチョ）で は かわらない。
 */
export function goldChance(bird: GoldBird, s: GoldSettings): number {
  if (bird.goldMiss >= s.goldPity) return 1;
  const base = bird.raised ? s.goldBaseRaised : s.goldBaseWild;
  const bugs = Math.min(s.goldBugMax, Math.max(0, bird.bugs) * s.goldPerBug);
  return Math.min(s.goldCap, base + bugs);
}

/** くじ を 1 回。乱数 は いつも 1 つ つかう。`goldMiss` は 金 で ない たまご の つづけた 数（金 が 出たら 0） */
export function rollGold(rng: Rng, bird: GoldBird, s: GoldSettings): { gold: boolean; goldMiss: number } {
  const r = rng();
  if (r < goldChance(bird, s)) return { gold: true, goldMiss: 0 };
  return { gold: false, goldMiss: bird.goldMiss + 1 };
}
