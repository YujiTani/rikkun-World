import { LIGHT_CONFIG as C } from './config';

/**
 * 明るさ 0〜15 → 見た目の明るさ 0〜1（マイクラ風の曲線 t / (4 - 3t)）。
 * シェーダー（WorldRenderer）も同じ式を使う。
 */
export function lightBrightness(level: number): number {
  const t = Math.max(0, Math.min(C.maxLevel, level)) / C.maxLevel;
  const f = t / (4 - 3 * t);
  return C.minBrightness + (1 - C.minBrightness) * f;
}

/**
 * #76 夜の倍率: 空の光の曲線の明るさにかける数 mix(1, nightSkyMul, nt × w)。
 * nt = 夜の度合い（darken ÷ nightDarken）、w = clamp(空の光 ÷ 4, 0, 1)（空の光 0 = どうくつは かけない）。
 * sky は 時刻で弱める前の空の光（0〜15）。シェーダー（lightShader.ts の skyNight）も同じ式。
 */
export function nightSkyFactor(sky: number, darken: number): number {
  const nt = Math.max(0, Math.min(1, darken / C.nightDarken));
  const w = Math.max(0, Math.min(1, sky / C.nightSkyFullLevel));
  return 1 + (C.nightSkyMul - 1) * nt * w;
}

/** 空の光（時刻で弱める前）から、夜の倍率までふくめた 空の下の見た目の明るさ */
export function skyBrightness(sky: number, darken: number): number {
  return lightBrightness(Math.max(0, sky - darken)) * nightSkyFactor(sky, darken);
}

/** 妖怪・人形・落とし物の明るさ（足もとの明るさから。見えなくなりすぎない下限つき） */
export function dollLightBrightness(level: number): number {
  return Math.max(C.dollMin, lightBrightness(level));
}

/** 時刻の明るさ（昼 1 〜 夜 nightBrightness）から、空の光を弱める段数（0〜nightDarken）を決める */
export function darkenFromBrightness(brightness: number, nightBrightness: number): number {
  const span = 1 - nightBrightness;
  const t = span <= 0 ? 1 : Math.max(0, Math.min(1, (brightness - nightBrightness) / span));
  return C.nightDarken * (1 - t);
}

/**
 * ブロックの光（0〜15）の見た目の明るさ。3 だんかい（強い・少し・なし）。
 * たいまつ（torchLevel）から数えた距離 = torchLevel - 光 が、brightRadius 以内なら強い、dimRadius 以内なら少し。
 * シェーダーも同じ分け方を使う。
 */
export function blockLightBrightness(blockLevel: number): number {
  if (blockLevel <= 0) return 0;
  const dist = C.torchLevel - blockLevel;
  if (dist <= C.torchBrightRadius) return C.torchBrightBrightness;
  if (dist <= C.torchDimRadius) return C.torchDimBrightness;
  return 0;
}

/** 空の光（時刻で弱めたあと）とブロックの光から、見た目の明るさ（大きいほう） */
export function combinedBrightness(sky: number, darken: number, block: number): number {
  return Math.max(skyBrightness(sky, darken), blockLightBrightness(block));
}

/** 妖怪の出る「暗い所」か: 空の光（時刻で弱めたあと）が 7 以下で、たいまつの 8 マス以内でもない */
export function isDarkForSpawn(sky: number, darken: number, block: number): boolean {
  return sky - darken <= C.spawnMaxLevel && block <= C.torchLevel - C.torchDimRadius - 1;
}
