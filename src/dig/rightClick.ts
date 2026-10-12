import type { ItemId, TargetInfo } from '../contracts';

/**
 * 右クリックで起きること（実行と表示の両方が、この 1 か所の判定を使う）。
 * 新しい動き（たがやす・まく・たべる・しゅうかく・かまえ など）は、ここに種類と 1 行の判定を足せば、
 * ねらっている所の ヒントにも出る（DigSystem の実行側は kind でふりわける）。
 */
export type RightClickKind = 'storage' | 'furnace' | 'armor' | 'place';

export interface RightClickPreview {
  kind: RightClickKind;
  /** 持っているもの（armor・place のとき） */
  item: ItemId | null;
}

/** 左クリックで起きること（ヒント用） */
export type LeftClickKind = 'dig' | 'shoot';

/** 判定に要るものだけ（DigSystem が毎回つくる。ブロックや持ち物は変えない） */
export interface RightClickCtx {
  target: TargetInfo | null;
  held: ItemId | null;
  isTansu(x: number, y: number, z: number): boolean;
  isFurnace(x: number, y: number, z: number): boolean;
  canEquip(item: ItemId): boolean;
  /** 持っているものを、ねらっている所の前に置けるか */
  canPlace(): boolean;
}

/** たんす → かまど → 防具 → 置く の順。何も起きないなら null */
export function previewRightClick(c: RightClickCtx): RightClickPreview | null {
  const t = c.target;
  if (t && c.isTansu(t.block.x, t.block.y, t.block.z)) return { kind: 'storage', item: null };
  if (t && c.isFurnace(t.block.x, t.block.y, t.block.z)) return { kind: 'furnace', item: null };
  if (c.held && c.canEquip(c.held)) return { kind: 'armor', item: c.held };
  if (t && c.held && c.canPlace()) return { kind: 'place', item: c.held };
  return null;
}
