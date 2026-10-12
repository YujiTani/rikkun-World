import type { BlockId, BlockType } from '../../contracts';

/** M1-01 4-2 のブロック 11 種。配列の順番が内部の番号（air = 0） */
export const BLOCK_TYPES: readonly BlockType[] = [
  { id: 'air', name: 'くうき', solid: false, breakable: false },
  { id: 'grass', name: 'くさ', solid: true, breakable: true },
  { id: 'dirt', name: 'つち', solid: true, breakable: true },
  { id: 'stone', name: 'いし', solid: true, breakable: true },
  { id: 'sand', name: 'すな', solid: true, breakable: true },
  { id: 'log', name: 'き', solid: true, breakable: true },
  { id: 'leaves', name: 'はっぱ', solid: true, breakable: true },
  { id: 'coal_ore', name: 'せきたん', solid: true, breakable: true },
  { id: 'iron_ore', name: 'てつ', solid: true, breakable: true },
  { id: 'water', name: 'みず', solid: false, breakable: false },
  { id: 'bedrock', name: 'そこいし', solid: true, breakable: false },
];

export const BLOCK_INDEX: Readonly<Record<BlockId, number>> = Object.fromEntries(
  BLOCK_TYPES.map((t, i) => [t.id, i]),
) as Record<BlockId, number>;

export const AIR = BLOCK_INDEX.air;
export const WATER = BLOCK_INDEX.water;

export function blockIdFromIndex(index: number): BlockId {
  return BLOCK_TYPES[index].id;
}

/** 知らない id なら -1 */
export function blockIndexOf(id: string): number {
  const i = (BLOCK_INDEX as Record<string, number | undefined>)[id];
  return i === undefined ? -1 : i;
}

/** 色のついた不透明ブロックか（面を描く・隠す判定に使う）。水・空気はちがう */
export function isOpaqueIndex(index: number): boolean {
  return index !== AIR && index !== WATER;
}

/** 固いブロックか（番号で） */
export function isSolidIndex(index: number): boolean {
  return BLOCK_TYPES[index].solid;
}
