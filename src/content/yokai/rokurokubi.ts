import type { YokaiDef } from './types';

/**
 * ろくろくび（首が のびる）。値は ここ 1 か所（ルール #304）。形は yokai/models/rokurokubi.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const ROKUROKUBI: YokaiDef = {
  name: 'ろくろくび',
  basis: { target: 1.5, attack: 2, xp: 3 },
  motion: {
    hitSeconds: 0.5, // 秒: 攻撃を始めてから 当たるまで
    attackSeconds: 1.6, // 秒: 攻撃の 合計（首の もどりまで）
    reach: 8, // ブロック（首が のびる）
    speed: 1.0, // ブロック/秒
    cooldownSeconds: 2.5, // 秒: 次の 攻撃まで
    avoidsWater: false,
  },
  ai: {
    stepUp: 1, // 段
    radius: 0.4, // ブロック
    height: 2.9, // ブロック
    eyeHeight: 1.6, // ブロック
    turnDegPerSec: 240, // 度/秒
    marksHeight: 3.3, // ブロック
    flies: false,
  },
  sense: { sight: 18, giveUp: 24, shinobi: true }, // ブロック
  drops: [
    { item: 'cloth', chance: 0.7, max: 4 },
    { item: 'crystal', chance: 0.05, max: 1 },
    { item: 'seed_onion', chance: 0.05, max: 1 },
    { item: 'seed_eggplant', chance: 0.05, max: 1 },
  ],
  colors: {
    2: { 0x6f84e8: 0xc29cf2, 0x5b6fd6: 0x9f78e0, 0xf2c14e: 0xe8eeff },
    3: { 0x6f84e8: 0xffc83d, 0x5b6fd6: 0xf0a830, 0xf2c14e: 0xff6a3d },
  },
  // 頭（0〜0.5）の おでこ・まげの 上
  head: { bandY: 0.465, bandW: 0.55, bandD: 0.55, crownY: 0.7, crownW: 0.4, crownD: 0.4 },
  country: { base: 25 }, // はらっぱの 重み
  achievement: { name: 'ろくろくび' },
};
