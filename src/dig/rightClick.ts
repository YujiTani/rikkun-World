import type { ItemId, RightClickKind, TargetInfo } from '../contracts';
export type { RightClickKind };

/**
 * 右クリックで起きること（実行と表示の両方が、この 1 か所の判定を使う）。
 * 新しい動き（たがやす・まく・たべる・しゅうかく・かまえ など）は、ここに種類と 1 行の判定を足せば、
 * ねらっている所の ヒントにも出る（DigSystem の実行側は kind でふりわける）。
 */

export interface RightClickPreview {
  kind: RightClickKind;
  /** 持っているもの（armor・place のとき） */
  item: ItemId | null;
}

/** 左クリックで起きること（ヒント用） */
export type LeftClickKind = 'dig' | 'shoot' | 'hit' | 'harvest';

/** 判定に要るものだけ（DigSystem が毎回つくる。ブロックや持ち物は変えない） */
export interface RightClickCtx {
  target: TargetInfo | null;
  held: ItemId | null;
  isTansu(x: number, y: number, z: number): boolean;
  isFurnace(x: number, y: number, z: number): boolean;
  canEquip(item: ItemId): boolean;
  /** 持っているものを、ねらっている所の前に置けるか */
  canPlace(): boolean;
  /** M7: くわ か すで で、上が くうき の くさ・つち を ねらっている（§2.7 の 4） */
  canTill?(): boolean;
  /** M7: たね を持って、上が くうき の はたけ を ねらっている（5） */
  canPlant?(): boolean;
  /** M7: たね を持って、くさ・つち を ねらっている（6。合図） */
  isSeedHintSpot?(): boolean;
  /** M7: やさい を持っている（7） */
  isVeg?(item: ItemId): boolean;
}

/** たんす → かまど → 防具 → たがやす → まく → 合図 → たべる → 置く の順。何も起きないなら null */
export function previewRightClick(c: RightClickCtx): RightClickPreview | null {
  const t = c.target;
  if (t && c.isTansu(t.block.x, t.block.y, t.block.z)) return { kind: 'storage', item: null };
  if (t && c.isFurnace(t.block.x, t.block.y, t.block.z)) return { kind: 'furnace', item: null };
  if (c.held && c.canEquip(c.held)) return { kind: 'armor', item: c.held };
  if (t && c.canTill?.()) return { kind: 'till', item: c.held };
  if (t && c.held && c.canPlant?.()) return { kind: 'plant', item: c.held };
  if (t && c.held && c.isSeedHintSpot?.()) return { kind: 'seedHint', item: c.held };
  if (c.held && c.isVeg?.(c.held)) return { kind: 'eat', item: c.held };
  if (t && c.held && c.canPlace()) return { kind: 'place', item: c.held };
  return null;
}
