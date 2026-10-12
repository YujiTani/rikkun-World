/** 妖怪の強さ（設計書 3 章の表）。M3 本番の AI が使う */
export interface YokaiStats {
  /** 体力（素手で何回たたくとたおれるか） */
  hp: number;
  /** 攻撃力（ハートの数。0.5 = 半分） */
  damageHearts: number;
  /** 攻撃を始めてから当たるまで（秒） */
  hitSeconds: number;
  /** 攻撃の合計の長さ（秒。起き上がり・首のもどりまで） */
  attackSeconds: number;
  /** とどく距離（ブロック） */
  reach: number;
  /** 移動の速さ（ブロック/秒） */
  speed: number;
  /** 次の攻撃まで（秒） */
  cooldownSeconds: number;
}

export const YOKAI_STATS = {
  karakasa: { hp: 4, damageHearts: 1, hitSeconds: 0.5, attackSeconds: 1.2, reach: 2.5, speed: 1.5, cooldownSeconds: 2.0 },
  chochin: { hp: 2, damageHearts: 1, hitSeconds: 0.5, attackSeconds: 0.8, reach: 8, speed: 1.0, cooldownSeconds: 3.0 },
  nurikabe: { hp: 12, damageHearts: 2, hitSeconds: 1.5, attackSeconds: 4.0, reach: 3, speed: 0.5, cooldownSeconds: 2.0 },
  rokurokubi: { hp: 4, damageHearts: 1, hitSeconds: 0.5, attackSeconds: 1.6, reach: 8, speed: 1.0, cooldownSeconds: 2.5 },
} as const satisfies Record<string, YokaiStats>;
