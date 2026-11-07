// COOP-1 4a（§3.3「とじる とき」・AC89）: 手に もっている 物（つかんだ 物）の あとしまつ。
import type { ItemStack } from '../contracts';
import type { InventoryImpl } from '../inventory/Inventory';

/**
 * その人の 画面が とじる ステップ（自分で とじた・倒れた・パッドが ぬけた・やめた）に 呼ぶ。1 人の ときの とじ方と 同じ:
 * 手に もっている 物を その人の もちものへ もどし、もどしきれなかった 分は その人の 足もとに 落として（dropAtFeet）手は 空に する。
 * 1P の もちもの・2P の もちもの どちらにも 使う（呼ぶ 側が その人の inventory と 足もとを わたす）
 */
export function closeInvHand(inventory: Pick<InventoryImpl, 'cursor' | 'returnCursor' | 'setCursor'>, dropAtFeet: (stack: ItemStack) => void): void {
  if (!inventory.cursor()) return;
  inventory.returnCursor();
  const left = inventory.cursor();
  if (!left) return;
  inventory.setCursor(null);
  dropAtFeet(left);
}
