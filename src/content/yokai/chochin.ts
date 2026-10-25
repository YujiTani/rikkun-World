import type { YokaiDef } from './types';

/**
 * ちょうちん（ふわふわ うかぶ 提灯。火の玉を 飛ばす）。値は ここ 1 か所（ルール #304）。形は yokai/models/chochin.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const CHOCHIN: YokaiDef = {
  name: 'ちょうちん',
  basis: { target: 1.25, attack: 2, xp: 2, projectile: true }, // 飛び道具（こわさ ×2）
  motion: {
    hitSeconds: 0.5, // 秒: 攻撃を始めてから 当たるまで
    attackSeconds: 0.8, // 秒: 攻撃の 合計
    reach: 8, // ブロック
    speed: 1.0, // ブロック/秒
    cooldownSeconds: 3.0, // 秒: 次の 攻撃まで
    avoidsWater: true,
  },
  ai: {
    stepUp: 0, // 段
    radius: 0.4, // ブロック
    height: 1.7, // ブロック（地面からの 高さ）
    eyeHeight: 0.95, // ブロック
    turnDegPerSec: 180, // 度/秒
    marksHeight: 2.3, // ブロック
    flies: true,
  },
  sense: { sight: 21, giveUp: 27, shinobi: true }, // ブロック
  drops: [
    { item: 'paper', chance: 0.7, max: 4 },
    { item: 'string', chance: 0.4, max: 3 },
    { item: 'coal_ore', chance: 0.15, max: 2 },
  ],
  colors: {
    2: { 0xffb347: 0xbcd2ff, 0xfff2a0: 0xe4eeff, 0xc46a1e: 0x5f7be6, 0x3a3a4a: 0x343d8c },
    3: { 0xffb347: 0xfff05a, 0xfff2a0: 0xfff8c8, 0xc46a1e: 0xff5a3c, 0x3a3a4a: 0xd99a1a },
  },
  // どうの 上（ふたの上・えの まわり。つり手の グループの 中心から見た高さ）
  head: { bandY: -0.27, bandW: 0.5, bandD: 0.5, crownY: -0.3, crownW: 0.44, crownD: 0.44 },
  country: { base: 25 }, // はらっぱの 重み
  achievement: { name: 'ちょうちん' },
};
