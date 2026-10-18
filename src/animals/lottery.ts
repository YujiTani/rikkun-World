import type { SwingResult, Vec3, LiveSettings } from '../contracts';
import { createRng, type Rng } from '../world/gen/random';

/** 「ときどき あたる。つづけて はずれたら 次 は かならず」の くじ（LIVE-1 §2.4・§2.10） */
export type PityReason = 'chance' | 'pity' | 'miss';

export interface PityRoll {
  hit: boolean;
  reason: PityReason;
  /** くじ の あと の「つづけて はずれた 数」 */
  misses: number;
}

/**
 * 1 回 ひく。乱数 は いつも 1 つ つかう（かならず の ときも。流れ が ずれない ため）。
 * `misses` が `pity` 以上 なら かならず あたり。あたったら 数 は 0 に もどる。
 */
export function rollPity(rng: Rng, chance: number, pity: number, misses: number): PityRoll {
  const r = rng();
  if (misses >= pity) return { hit: true, reason: 'pity', misses: 0 };
  if (r < chance) return { hit: true, reason: 'chance', misses: 0 };
  return { hit: false, reason: 'miss', misses: misses + 1 };
}

/** 妖怪・にわとり と べつ の 流れ に する ため に シード に まぜる 数 */
export const NET_SALT = 0x11fe0002;
export const EGG_SALT = 0x11fe0003;

interface Rest {
  x: number;
  z: number;
  until: number;
}

/** むしとりあみ の くじ と き の おやすみ（保存 しない） */
export class BugNet {
  private readonly rng: Rng;
  private misses = 0;
  private rests: Rest[] = [];

  constructor(seed: number) {
    this.rng = createRng((seed ^ NET_SALT) >>> 0);
  }

  reset(): void {
    this.misses = 0;
    this.rests.length = 0;
  }

  /** `tick` = いまの ステップ。ふった ステップ に ぜんぶ きまる */
  swing(block: Vec3, tick: number, s: Pick<LiveSettings, 'bugChance' | 'bugPity' | 'bugTreeCooldown' | 'bugTreeRadius'>): SwingResult {
    if (this.rests.length > 0) this.rests = this.rests.filter((r) => r.until > tick);
    for (const r of this.rests) {
      if (Math.hypot(block.x - r.x, block.z - r.z) <= s.bugTreeRadius) return { caught: false, reason: 'empty' };
    }
    const roll = rollPity(this.rng, s.bugChance, s.bugPity, this.misses);
    this.misses = roll.misses;
    if (!roll.hit) return { caught: false, reason: 'miss' };
    this.rests.push({ x: block.x, z: block.z, until: tick + s.bugTreeCooldown });
    return { caught: true, reason: roll.reason === 'pity' ? 'pity' : 'chance' };
  }
}
