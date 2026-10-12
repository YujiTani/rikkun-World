import type { YokaiKind } from '../contracts';

/** 経験値とレベルの数（オーナー了承の PO 決め。あとで調整できる） */
export interface LevelConfig {
  /** 妖怪をたおしたときの経験値 */
  xp: Record<YokaiKind, number>;
  /** 次のレベルまで = perLevel × 今のレベル */
  perLevel: number;
  /** これ以上は上がらない（バーが長くなりすぎないように、とても大きい数） */
  maxLevel: number;
}

export const LEVEL_DEFAULTS: Readonly<LevelConfig> = {
  xp: { chochin: 2, karakasa: 3, rokurokubi: 3, nurikabe: 6 },
  perLevel: 5,
  maxLevel: 99,
};

export function createLevelConfig(): LevelConfig {
  return { ...LEVEL_DEFAULTS, xp: { ...LEVEL_DEFAULTS.xp } };
}
