import type { Inventory, ItemStack } from '../contracts';
import type { CombatArmorPort } from '../combat/PlayerCombat';
import { GADGET_ID } from '../content/items/gadgetTuning';
import { copyStack } from '../tools/durability';
import type { Rng } from '../world/gen/random';

/** やられたとき おとす 物の けっか */
export interface DropBagResult {
  /** 落ちた 物（マスごとに 1 つ） */
  stacks: ItemStack[];
  /** 落ちた もちものの マスばんごう（death の できごとの dropped） */
  dropped: number[];
  /** おまもりに まもられた とき */
  protectedBy?: 'omamori';
}

/**
 * やられたときの「おとしもの袋」の 中身を きめて、もちもの・そうびから 取りのぞく（1P の die() と 2P で 同じ道。袋を 出すのは 呼んだ 側）。
 * 順番: おまもり → 選んでいる マス以外の マスごと → そうび 1 マスずつ（乱数の 順は かえない）
 */
export function takeDropBag(inv: Inventory, armor: CombatArmorPort | undefined, rng: Rng, dropChance: number): DropBagResult {
  // ITEM-FX-1: 持ち物の どこかに おまもりが あれば、なにも おとさない。おまもり 1 つは やぶれた おまもり に かわる
  const charm = inv.slots().findIndex((s) => s?.item === GADGET_ID.omamori);
  if (charm >= 0) {
    inv.setSlot(charm, { item: GADGET_ID.omamoriTorn, count: 1 }); // おまもりは 1 こ だけ（重ねられない）
    return { stacks: [], dropped: [], protectedBy: 'omamori' };
  }
  const sel = inv.selected();
  const dropped: number[] = [];
  const stacks: ItemStack[] = [];
  const slots = inv.slots();
  for (let i = 0; i < inv.size; i++) {
    const s = slots[i];
    if (i === sel || !s) continue;
    if (rng() < dropChance) {
      dropped.push(i);
      stacks.push(copyStack(s));
    }
  }
  for (const i of dropped) inv.setSlot(i, null);
  // そうびのマスも 1 マスずつ同じ確率で（M4 §2.7）
  if (armor) {
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) {
      const it = armor.equipped(slot);
      if (it && rng() < dropChance) {
        const st = armor.equippedStack?.(slot); // WEAPON-2: へった 量も いっしょに
        armor.take(slot);
        stacks.push(st ?? { item: it, count: 1 });
      }
    }
  }
  return { stacks, dropped };
}
