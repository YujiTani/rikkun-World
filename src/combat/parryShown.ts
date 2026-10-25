import { W2_SETTING_DEFAULTS } from '../contracts';
import { NINJA_TUNING } from '../craft/ninjaTuning';

/**
 * SAMURAI-1 §4.3 陣笠の パリィの 絵: 受けが のびた 12 コマ（= jingasaGuardTicks − 今の 受け 18）の あいだ、受けの 最後の 絵（F20）を 止めて 見せる。
 * 見せる F = F ≤ 20 → F、21〜32 → 20、33 以上 → F − 12（陣笠 なしは F の まま）。キャラの コマ（parryCells.ts）と 刀の 道（parryFx.ts）が 同じに つかう。
 * 新しい 絵は 作らない。
 */
export function parryShownFrame(frame: number, jingasa: boolean): number {
  if (!jingasa) return frame;
  const t = W2_SETTING_DEFAULTS.parryTicks;
  const lastGuard = t.ready + t.guard; // 20: 今の 受けの 最後の F
  const extra = Math.max(0, NINJA_TUNING.jingasaGuardTicks - t.guard);
  if (frame <= lastGuard) return frame;
  if (frame <= lastGuard + extra) return lastGuard;
  return frame - extra;
}
