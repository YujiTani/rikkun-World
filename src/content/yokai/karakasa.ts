import type { YokaiDef } from './types';

/**
 * からかさ（赤いかさの 1 本足）。値は ここ 1 か所（ルール #304）。形は yokai/models/karakasa.ts。
 * 強さの 物さしは「からかさ = 1」（体力 8・攻撃力 2。BALANCE §2.2）。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const KARAKASA: YokaiDef = {
  name: 'からかさ',
  basis: { target: 1, attack: 2, xp: 3 }, // target = 強さ（からかさ = 1）・attack = 体力（1 = ハート半分）・xp = 経験値
  motion: {
    hitSeconds: 0.5, // 秒: 攻撃を始めてから 当たるまで
    attackSeconds: 1.2, // 秒: 攻撃の 合計
    reach: 2.5, // ブロック
    speed: 1.5, // ブロック/秒
    cooldownSeconds: 2.0, // 秒: 次の 攻撃まで
    avoidsWater: true,
  },
  ai: {
    stepUp: 2, // 段
    radius: 0.6, // ブロック
    height: 1.6, // ブロック
    eyeHeight: 1.1, // ブロック
    turnDegPerSec: 360, // 度/秒
    marksHeight: 2.1, // ブロック
    flies: false,
  },
  sense: { sight: 18, giveUp: 24, shinobi: true }, // ブロック
  drops: [
    { item: 'paper', chance: 0.7, max: 4 },
    { item: 'string', chance: 0.7, max: 4 },
    { item: 'log', chance: 0.4, max: 3 },
    { item: 'oil', chance: 0.15, max: 2 },
    { item: 'iron_ore', chance: 0.05, max: 1 },
    { item: 'seed_tomato', chance: 0.05, max: 1 },
    { item: 'seed_pumpkin', chance: 0.05, max: 1 },
  ],
  colors: {
    2: { 0xe0503a: 0x9aaaff, 0x8b4a2b: 0x4b56b8, 0xf2c14e: 0xe2eaff, 0xa0703c: 0x7a86cc },
    3: { 0xe0503a: 0xffc83d, 0x8b4a2b: 0xff6a3d, 0xf2c14e: 0xfff2b0, 0xa0703c: 0xe89a30 },
  },
  // かさの 2 段め（y 1.43）・てっぺん（y 1.6）
  head: { bandY: 1.43, bandW: 0.74, bandD: 0.74, crownY: 1.6, crownW: 0.4, crownD: 0.4 },
  country: { base: 30 }, // はらっぱの 重み
  achievement: { name: 'からかさ' },
};
