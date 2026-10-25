import { mapKinds } from '../content/yokai/registry';
import type { YokaiKind } from '../contracts';
import { yokaiStrength } from '../yokai/stats';

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
  xp: mapKinds((k) => yokaiStrength(k).xp), // 全種類（足し忘れない）。値は 強さの式（content/yokai/<kind>.ts の basis）
  perLevel: 5,
  maxLevel: 99,
};

export function createLevelConfig(): LevelConfig {
  return { ...LEVEL_DEFAULTS, xp: { ...LEVEL_DEFAULTS.xp } };
}
