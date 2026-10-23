import type { MeatBird } from '../contracts';

/**
 * LIVE-3（お肉）に えらべる 子（LIVE-2 §2.12）: `home` が ある かつ `adult` かつ `raised` true。
 * 野原 で なかま に した 大人 を 小屋 に 入れて も `raised` false の まま なので えらべない。
 */
export function meatEligible(b: MeatBird): boolean {
  return b.home !== null && b.stage === 'adult' && b.raised;
}
