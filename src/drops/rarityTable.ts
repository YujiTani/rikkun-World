import type { GemShape, Rarity, RarityIndex } from '../contracts';

/**
 * めずらしさ 7 段の表（RARITY-7 §3.1・§4.1）。色・宝石の形・ことば・星・dropMax はここ 1 か所。
 * 色・形・ことばを変えるときは、この表の値だけ変える（--rk-rarity-N は tokens.css にも同じ値を書く。ユニットテストが見張る）。
 * ことばは ひらがな・カタカナ・のばし棒・空白だけ（9 文字まで）。
 */
export interface RarityTier {
  id: Rarity;
  index: RarityIndex;
  /** index + 1 */
  stars: number;
  /** 0xrrggbb（光の柱・ツールチップ・ふち。--rk-rarity-<index> と同じ値） */
  color: number;
  cssVar: string;
  gem: GemShape;
  word: string;
  /** ほったときの最大数の既定値 */
  dropMax: number;
}

function tier(index: RarityIndex, id: Rarity, color: number, gem: GemShape, word: string, dropMax: number): RarityTier {
  return { id, index, stars: index + 1, color, cssVar: `--rk-rarity-${index}`, gem, word, dropMax };
}

// 見た目は案 A「いまの 4 色をそのままのばす」
export const RARITY_TIERS: readonly RarityTier[] = [
  tier(0, 'common', 0xffffff, 'circle', 'ふつう', 4),
  tier(1, 'uncommon', 0x8fe08f, 'diamond', 'すこし めずらしい', 3),
  tier(2, 'rare', 0x7fb8ff, 'hexagon', 'めずらしい', 2),
  tier(3, 'superRare', 0xc79bff, 'star', 'とても めずらしい', 1),
  tier(4, 'epic', 0xffd23f, 'moon', 'すごく めずらしい', 1),
  tier(5, 'mythic', 0xff7a3d, 'flame', 'まぼろし', 1),
  tier(6, 'legendary', 0xfff3a0, 'crown', 'でんせつ', 1),
];

export const RARITY_ORDER: readonly Rarity[] = RARITY_TIERS.map((t) => t.id);

export const RARITY_COLOR: Readonly<Record<Rarity, number>> = Object.fromEntries(RARITY_TIERS.map((t) => [t.id, t.color])) as Record<Rarity, number>;

const BY_ID = new Map<string, RarityTier>(RARITY_TIERS.map((t) => [t.id, t]));

export function isRarity(x: unknown): x is Rarity {
  return typeof x === 'string' && BY_ID.has(x);
}

export function rarityTier(r: Rarity): RarityTier {
  return BY_ID.get(r)!;
}

export function rarityIndex(r: Rarity): RarityIndex {
  return rarityTier(r).index;
}

/** ほったときの最大数の既定値（設定 dropMax の初期値） */
export function defaultDropMax(): Record<Rarity, number> {
  return Object.fromEntries(RARITY_TIERS.map((t) => [t.id, t.dropMax])) as Record<Rarity, number>;
}
