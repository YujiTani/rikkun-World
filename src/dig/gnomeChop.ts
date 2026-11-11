import type { BlockId, ItemId, TargetInfo, Vec3, VoxelWorld } from '../contracts';
import { blockFamily, toolFamily } from './toolFamily';
import { LEGEND4_ID } from '../content/items/ids';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';

/** LEGEND-4 ノームの斧: 手に 持つ 物の id（ここ 1 か所。数は LEGEND4_TUNING.gnome） */
const GNOME_AXE_ID = LEGEND4_ID.gnome_axe;

/** ノームの斧か */
const GNOME_ITEMS: ReadonlySet<string> = new Set([GNOME_AXE_ID]);
export const isGnomeAxe = (item: ItemId | null | undefined): boolean => item != null && GNOME_ITEMS.has(item);

/**
 * 2 マス きれる ブロックか（斧が 得意 = 道具の 得意表 `blockFamily` が 斧の なかま。まるた・坑道の わく・板・家の き ぜんぶ。
 * 1 か所の 表から 引く ので、ここに id は 書かない）
 */
const choppable = (held: ItemId, id: BlockId): boolean => {
  const f = toolFamily(held); // ノームの斧の なかま（登録表の tool.family）
  return f !== null && blockFamily(id) === f;
};

/**
 * 2 マス きる（§7.3-3。2026-11-12 変更 B）: ノームの斧で 斧が 得意な ブロックが こわれた とき、つながって いる 同じ しゅるいの ブロックを もう 1 つ こわす 対象に する。
 * えらびかた: ① 真上 → ② よこ（ねらいの 向きの おく → 左右）→ ③ 真下は しない。ねらいが 上下の 面の ときは おくが ないので よこ 4 方向。
 * 1 回に ふえるのは 1 マス だけ（くさりの ように 続けない）。なければ null。
 * 返す もの = その マスの ねらい（ふつうに ほった ときと 同じ 道で こわす ための TargetInfo）。
 */
export function chopPartner(held: ItemId | null | undefined, broken: TargetInfo, world: Pick<VoxelWorld, 'getBlock'>): TargetInfo | null {
  if (!isGnomeAxe(held) || LEGEND4_TUNING.gnome.chopExtra < 1 || !choppable(held!, broken.id)) return null;
  const { x, y, z } = broken.block;
  const { x: fx, z: fz } = broken.face;
  const horizontal = fx !== 0 || fz !== 0;
  const sides: Array<[number, number]> = horizontal ? [[-fx, -fz], [fz, fx], [-fz, -fx]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cands: Vec3[] = [{ x, y: y + 1, z }, ...sides.map(([dx, dz]) => ({ x: x + dx, y, z: z + dz }))];
  const hit = cands.find((c) => world.getBlock(c.x, c.y, c.z) === broken.id);
  if (!hit) return null;
  return { block: hit, id: broken.id, face: broken.face, place: { x: hit.x + broken.face.x, y: hit.y + broken.face.y, z: hit.z + broken.face.z }, distance: broken.distance };
}
