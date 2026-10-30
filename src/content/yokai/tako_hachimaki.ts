import type { YokaiDef } from './types';

/**
 * タコはちまき（うみを およぐ、はちまきの タコ。すみを はいて にげる）。値は ここ 1 か所（ルール #304）。形は yokai/models/tako_hachimaki.ts。
 * 強さは からかさ 並み（仕様書 docs/design/TAKO-1.md §4）。持ち物の「たこ（凧, kite）」とは 別。
 * motion の hit/attack/cooldown は 強さの 式（stats.ts）を からかさ と そろえる ための 数。ぺちんの 距離・ダメージは swim の slap*（motion.reach は 使わない）。
 */
export const TAKO_HACHIMAKI: YokaiDef = {
  name: 'タコはちまき',
  basis: { target: 1, attack: 2, xp: 3 }, // target = 強さ（からかさ = 1）・attack = 体力の 物さし（ぺちんの ダメージ では ない）・xp = 経験値
  motion: {
    hitSeconds: 0.3, // 秒: ぺちんの 合図から 当たるまで（swim.slapDelaySeconds と そろえる）
    attackSeconds: 0.8, // 秒: ぺちんの 動きの 合計
    reach: 2.5, // ブロック: 使わない（ぺちんの 距離は swim.slapReach）
    speed: 3, // ブロック/秒: 使わない（およぐ 速さは swim.goSpeed）
    cooldownSeconds: 1.5, // 秒
    avoidsWater: false,
  },
  ai: {
    stepUp: 0, // 段
    radius: 0.5, // ブロック
    height: 2.4, // ブロック（当たりの 高さ。見た目の 1.7 より 高く して、水面から ななめに 突いても 当たる）
    eyeHeight: 1.0, // ブロック
    turnDegPerSec: 180, // 度/秒
    marksHeight: 2.2, // ブロック
    flies: false,
  },
  sense: { sight: 12, giveUp: 16, shinobi: true }, // ブロック
  drops: [{ item: 'sumi', chance: 1, max: 2 }], // かならず 1〜2 こ
  colors: {
    2: { 0xcf3b3b: 0x4f7de0, 0xf6b39a: 0xcfe0ff, 0x9e2a33: 0x2c4aa8, 0xf3efe2: 0xe9f1ff },
    3: { 0xcf3b3b: 0xe0a82e, 0xf6b39a: 0xfff0b8, 0x9e2a33: 0xb06a1a, 0xf3efe2: 0xfff4c2 },
  },
  // 頭の 上（はちまきの 上に 重ならない 位置）。頭の グループの 原点は 足もと
  head: { bandY: 1.5, bandW: 0.9, bandD: 0.84, crownY: 1.45, crownW: 0.5, crownD: 0.5 },
  country: { base: 20 }, // はらっぱの 重み（すなはまは +15、ほかは −5。countryTable.ts）
  achievement: { name: 'タコはちまき' },
  traits: {
    swims: true,
    knockOnlyHeavy: true, // ふつうの 攻撃では 水の 中で 流されない（虹の はじきだけ のけぞる）
  },
  swim: {
    goSeconds: 1.5, // 秒
    restSeconds: 4, // 秒
    goSpeed: 3, // ブロック/秒
    bobAmp: 0.1, // ブロック
    bobSeconds: 2, // 秒
    depthMin: 1, // ブロック
    depthMax: 3, // ブロック
    depthSpawn: 2, // ブロック
    minWaterDepth: 4, // ブロック
    turnDegPerSec: 180, // 度/秒
    inkRange: 4, // ブロック
    inkChargeSeconds: 0.4, // 秒
    fleeSeconds: 2, // 秒
    fleeSpeed: 4, // ブロック/秒
    inkCooldownSeconds: 8, // 秒
    inkRadius: 2, // ブロック
    inkLifeSeconds: 2, // 秒
    inkFadeSeconds: 0.9, // 秒
    dimAlpha: 0.4, // 黒い 板の 不透明度
    dimFadeOutSeconds: 0.5, // 秒
    slapDelaySeconds: 0.3, // 秒
    slapReach: 2.5, // ブロック
    slapDamage: 1, // 体力（ハート半分）
    slapCooldownSeconds: 1.5, // 秒
    dryLeaveSeconds: 3, // 秒
  },
};
