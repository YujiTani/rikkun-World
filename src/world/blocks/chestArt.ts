/**
 * 宝箱・坑道の わくの 色（1 か所。MINE-1C。アート docs/art/design/07-mine.md 20.7）。
 * 小ブロックの 形（looks/chestLooks.ts）と 16×16 の 平らな 絵（mineTexturesWaku.ts）の 両方が ここを 読む。
 * このファイルは 何も import しない 葉。
 */

export type ChestArtTier = 1 | 2 | 3 | 4;

/** 段ごとの 色（W からだ・L ふた・S おび・P じょう前の 板・R びょう・H かけがね・K かぎあな・G ふち／すみ金具・F Y ほのお・I 中） */
export const CHEST_PAL: Readonly<Record<ChestArtTier, Readonly<Record<string, string>>>> = {
  1: { W: '#9A5E32', L: '#A8693A', S: '#4A4650', P: '#5E5A66', K: '#1E1C22', I: '#5E3A1E' },
  2: { W: '#74482A', L: '#7E4F2E', S: '#C8CCD6', R: '#8A8F9C', H: '#8A8F9C', K: '#3B3F4A', I: '#4A2E1C' },
  3: { W: '#2A2238', L: '#342A46', S: '#EBB840', H: '#C98A1E', K: '#2A1A10', I: '#A8432F' },
  4: { W: '#EBB840', L: '#C8442C', S: '#C98A1E', G: '#F5CD55', F: '#FF7A3D', Y: '#FFC83D', I: '#4A2F7A' },
};

/** 平らな 絵の かけがねの 色は どの 色か（段ごと。CHEST_PAL の 文字） */
export const CHEST_FLAT_LOCK: Readonly<Record<ChestArtTier, string>> = { 1: 'P', 2: 'H', 3: 'H', 4: 'L' };

/** 坑道の わく（kodo_waku）の 色 */
export const KODO_WAKU_COLORS = {
  wood: '#B58650',
  dark: '#6B4421',
  iron: '#4A4650',
  light: '#C79A62',
  mid: '#A47544',
  edge: '#A87A46',
  rivet: '#5E5A66',
  black: '#2E2C34',
} as const;
