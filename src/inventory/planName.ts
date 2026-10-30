import type { ItemStack } from '../contracts';

/**
 * せっけいずの 名前（HOUSE-1B #339）。持ち物の マスは 番号（`plan`）だけを 持ち、名前を 含む 中身は 保存の house（HouseState）に ある。
 * ツールチップが 名前を 出す とき 番号から 引く 口。`wireHouse` が つなぐ（つなぐ 前・番号が 分からない ときは null = 登録表の 名前「せっけいず」）。
 */
let source: (plan: number) => string | null = () => null;

export function setPlanNameSource(fn: (plan: number) => string | null): void {
  source = fn;
}

/** そのマスの せっけいずの 名前（「<前><後ろ>の せっけいず」）。せっけいず でない・番号が ない・分からない = null */
export function planNameOf(stack: ItemStack | null | undefined): string | null {
  return stack && typeof stack.plan === 'number' && stack.plan > 0 ? source(stack.plan) : null;
}
