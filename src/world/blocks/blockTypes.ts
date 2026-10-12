import type { BlockId, BlockType } from '../../contracts';

/** M1-01 4-2 のブロック 11 種 + M4 の 3 種。配列の順番が内部の番号（air = 0） */
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
  // M4（番号は後ろに足す。保存データの番号を変えないため）
  { id: 'furnace', name: 'かまど', solid: true, breakable: true },
  { id: 'kawara', name: 'かわら', solid: true, breakable: true },
  { id: 'brick', name: 'レンガ', solid: true, breakable: true },
  // M4 光
  { id: 'torch', name: 'たいまつ', solid: false, breakable: true },
  { id: 'start_torch', name: 'こわれない たいまつ', solid: false, breakable: false },
];

export const BLOCK_INDEX: Readonly<Record<BlockId, number>> = Object.fromEntries(
  BLOCK_TYPES.map((t, i) => [t.id, i]),
) as Record<BlockId, number>;

export const AIR = BLOCK_INDEX.air;
export const WATER = BLOCK_INDEX.water;
export const TORCH = BLOCK_INDEX.torch;
export const START_TORCH = BLOCK_INDEX.start_torch;

/** たいまつの なかまか（細い棒＋炎の形で描く。光る） */
export function isTorchIndex(index: number): boolean {
  return index === TORCH || index === START_TORCH;
}

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
  return index !== AIR && index !== WATER && !isTorchIndex(index);
}

/** 固いブロックか（番号で） */
export function isSolidIndex(index: number): boolean {
  return BLOCK_TYPES[index].solid;
}
