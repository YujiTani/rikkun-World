import type { ItemId, TargetInfo, VoxelWorld } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';

/** LEGEND-4 ノームの斧: 手に 持つ 物の id（ここ 1 か所。数は LEGEND4_TUNING.gnome） */
const GNOME_AXE_ID = 'gnome_axe' as const satisfies ItemId;

/** ノームの斧か */
const GNOME_ITEMS: ReadonlySet<string> = new Set([GNOME_AXE_ID]);
export const isGnomeAxe = (item: ItemId | null | undefined): boolean => item != null && GNOME_ITEMS.has(item);

/** 2 マス きれる ブロック（き の まるた。家・坑道の わくは 対象外） */
const CHOPPABLE: ReadonlySet<string> = new Set(['log']);

/**
 * 2 マス きる（§7.3-3）: ノームの斧で まるた（`log`）が こわれた とき、その 真上の マスが まるた なら それも こわす 対象に する。
 * 真上が はっぱ・ほかの ブロック・空気 なら null。1 回に ふえるのは 上 `chopExtra` マス だけ（くさりの ように 続けない）。
 * 返す もの = 上の マスの ねらい（ふつうに ほった ときと 同じ 道で こわす ための TargetInfo）。
 */
export function chopAbove(held: ItemId | null | undefined, broken: TargetInfo, world: Pick<VoxelWorld, 'getBlock'>): TargetInfo | null {
  if (!isGnomeAxe(held) || LEGEND4_TUNING.gnome.chopExtra < 1 || !CHOPPABLE.has(broken.id)) return null;
  const { x, y, z } = broken.block;
  if (!CHOPPABLE.has(world.getBlock(x, y + 1, z))) return null;
  return { block: { x, y: y + 1, z }, id: broken.id, face: broken.face, place: { x, y: y + 2, z }, distance: broken.distance };
}
