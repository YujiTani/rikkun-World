import type { YokaiDef } from './types';

/**
 * ぬりかべ（大きな かべ。前にしか 攻撃しない。みず で 石に なる）。値は ここ 1 か所（ルール #304）。形は yokai/models/nurikabe.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const NURIKABE: YokaiDef = {
  name: 'ぬりかべ',
  basis: { target: 5, attack: 16, xp: 6, frontOnly: true }, // 前にしか 攻撃しない（こわさ ×1/2）
  motion: {
    hitSeconds: 1.5, // 秒: 攻撃を始めてから 当たるまで
    attackSeconds: 4.0, // 秒: 攻撃の 合計（起き上がりまで）
    reach: 3, // ブロック
    speed: 0.5, // ブロック/秒
    cooldownSeconds: 2.0, // 秒: 次の 攻撃まで
    avoidsWater: false,
  },
  ai: {
    stepUp: 1, // 段
    radius: 0.9, // ブロック
    height: 3.0, // ブロック
    eyeHeight: 1.9, // ブロック
    turnDegPerSec: 45, // 度/秒
    marksHeight: 3.5, // ブロック
    flies: false,
  },
  sense: { sight: 12, giveUp: 18, shinobi: true }, // ブロック
  drops: [
    { item: 'dirt', chance: 0.7, max: 4 },
    { item: 'stone', chance: 0.7, max: 4 },
    { item: 'clay', chance: 0.15, max: 2 },
  ],
  colors: {
    2: { 0xa39b8b: 0xb2bce6, 0x8a8273: 0x8e99cc, 0x8e8676: 0x8c97cc, 0x6dbe45: 0xb0ecff, 0x5aa83a: 0x7fd2f2 },
    3: { 0xa39b8b: 0xf2cc6a, 0x8a8273: 0xd9a940, 0x8e8676: 0xddae48, 0x6dbe45: 0xff9a50, 0x5aa83a: 0xff8040 },
  },
  // かべ（はば 2.6・高さ 2.7・あつさ 0.8、かべの グループの 中で y 0〜2.7・z 0.4 が中心）。目の上（y 2.5）に帯、てっぺん（y 2.7）に かんむり
  head: { bandY: 1.25, bandW: 1.34, bandD: 0.44, crownY: 1.35, crownW: 0.45, crownD: 0.3, z: 0.4, k: 2 },
  country: { base: 20 }, // はらっぱの 重み
  achievement: { name: 'ぬりかべ' },
};
