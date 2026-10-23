import type { GoldBird, LiveSettings } from '../contracts';
import type { Rng } from '../world/gen/random';

type GoldSettings = Pick<LiveSettings, 'goldBaseWild' | 'goldBaseRaised' | 'goldPerBug' | 'goldBugMax' | 'goldCap' | 'goldPity' | 'natsukiGoldMin' | 'goldMachoMul'>;

/**
 * 金 の たまご の 確率（LIVE-2 §2.8 を GOLD-1 §4.5 で かえた もの）。
 * なつき度 が `natsukiGoldMin`（70）を こえて いなければ 0。そうでなければ goldMiss が goldPity 以上 で 1（かならず）、
 * きほん（野原 1%・そだてた 4%）＋ むし 1 ぴき ごと に goldPerBug（上限 goldBugMax）、全体 は goldCap まで、
 * マッチョ なら その あと に goldMachoMul 倍（上限 16%）。
 */
export function goldChance(bird: GoldBird, s: GoldSettings): number {
  if (bird.natsuki <= s.natsukiGoldMin) return 0;
  if (bird.goldMiss >= s.goldPity) return 1;
  const base = bird.raised ? s.goldBaseRaised : s.goldBaseWild;
  const bugs = Math.min(s.goldBugMax, Math.max(0, bird.bugs) * s.goldPerBug);
  const p = Math.min(s.goldCap, base + bugs);
  return bird.breed === 'macho' ? p * s.goldMachoMul : p;
}

/**
 * くじ を 1 回。乱数 は いつも 1 つ つかう（70 以下 でも すてる）。`goldMiss` は 金 で ない たまご の つづけた 数
 * （金 が 出たら 0。70 以下 で うんだ たまご は 数えない）
 */
export function rollGold(rng: Rng, bird: GoldBird, s: GoldSettings): { gold: boolean; goldMiss: number } {
  const r = rng();
  if (r < goldChance(bird, s)) return { gold: true, goldMiss: 0 };
  if (bird.natsuki <= s.natsukiGoldMin) return { gold: false, goldMiss: bird.goldMiss };
  return { gold: false, goldMiss: bird.goldMiss + 1 };
}
