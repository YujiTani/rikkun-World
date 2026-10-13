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
  // M6
  { id: 'tansu', name: 'たんす', solid: true, breakable: true },
  // M7（番号は後ろに足す。作物の段階は id に入れない）
  { id: 'farmland', name: 'はたけ', solid: true, breakable: true },
  { id: 'farmland_wet', name: 'はたけ', solid: true, breakable: true },
  { id: 'crop_onion', name: 'たまねぎ', solid: false, breakable: false },
  { id: 'crop_tomato', name: 'トマト', solid: false, breakable: false },
  { id: 'crop_pumpkin', name: 'かぼちゃ', solid: false, breakable: false },
  { id: 'crop_eggplant', name: 'なす', solid: false, breakable: false },
  { id: 'wild_onion', name: 'やせいの たまねぎ', solid: false, breakable: false },
  { id: 'wild_tomato', name: 'やせいの トマト', solid: false, breakable: false },
  { id: 'wild_pumpkin', name: 'やせいの かぼちゃ', solid: false, breakable: false },
  { id: 'wild_eggplant', name: 'やせいの なす', solid: false, breakable: false },
  { id: 'kakashi', name: 'かかし', solid: false, breakable: false },
  { id: 'kakashi_head', name: 'かかし', solid: false, breakable: false },
  { id: 'saku', name: 'さく', solid: false, breakable: true },
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

const CROSS_IDS: ReadonlySet<string> = new Set([
  'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
  'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant',
  'kakashi', 'kakashi_head', 'saku',
]);
const CROSS = BLOCK_TYPES.map((t) => CROSS_IDS.has(t.id));
/** 十字の板で描くブロックか（作物・やせいの やさい・かかし・さく）。固くない・光を通す・まわりの面を隠さない */
export function isCrossIndex(index: number): boolean {
  return CROSS[index] === true;
}
/** みのった作物・やせいの やさい（少し光る。明るさの下限） */
const WILD_IDS: ReadonlySet<string> = new Set(['wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant']);
export function isWildIndex(index: number): boolean {
  return WILD_IDS.has(BLOCK_TYPES[index]?.id);
}

/** 色のついた不透明ブロックか（面を描く・隠す判定に使う）。水・空気・十字の板はちがう */
export function isOpaqueIndex(index: number): boolean {
  return index !== AIR && index !== WATER && !isTorchIndex(index) && !isCrossIndex(index);
}

/** 固いブロックか（番号で） */
export function isSolidIndex(index: number): boolean {
  return BLOCK_TYPES[index].solid;
}
