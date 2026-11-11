import { LEGEND4_ID } from './ids';
import { LEGEND4_TUNING } from './legend4Tuning';

/** LEGEND-4: 1 本 うった とき へる たいきゅう（レジェンダリーの 弓は 表の 数。ほかは 設定の 数 `normal`） */
export function bowWearPerShot(item: string | null | undefined, normal: number): number {
  if (item === LEGEND4_ID.kokuryu) return LEGEND4_TUNING.kokuryu.wearPerShot;
  if (item === LEGEND4_ID.yatagarasu) return LEGEND4_TUNING.yatagarasu.wearPerShot;
  if (item === LEGEND4_ID.tenshi_yumi) return LEGEND4_TUNING.tenshi.wearPerShot;
  return normal;
}

/** LEGEND-4: 刀の わざが 当たった とき へる たいきゅう（ノームの 斧は 表の 数。ほかは 設定の 数 `normal`） */
export function bladeWearPerHit(item: string | null | undefined, normal: number): number {
  return item === LEGEND4_ID.gnome_axe ? LEGEND4_TUNING.gnome.wearPerHit : normal;
}
