/**
 * プレイヤーの戦い・体力・やられるの数値（M3 §4.5・§4.6）。ここ 1 か所にまとめる。
 * 名前は仕様の「設定の名前」と同じ（`settings.*` へはつなぎ込みで出す）。
 */
export interface CombatConfig {
  /** パンチが当たるまで（始めたステップを 1 として、このステップ目に当たり判定） */
  punchTicks: number;
  /** とどく距離（目から当たりの箱まで） */
  punchReach: number;
  /** パンチの強さ（妖怪の体力） */
  punchDamage: number;
  /** 押す距離（プレイヤー）。10 ステップでかけて動く */
  knockback: number;
  /** 体力（ハート 10 こ = 20） */
  playerMaxHp: number;
  /** ダメージのあとの むてき */
  hurtInvincibleTicks: number;
  /** ダメージから回復が始まるまで待つ */
  regenDelayTicks: number;
  /** 回復のあいだ（最初の 1 は regenDelayTicks のあと、この数ステップ目） */
  regenIntervalTicks: number;
  /** 落とす確率（えらんでいるマスは対象外） */
  dropChance: number;
  /** やられた画面 */
  respawnDelayTicks: number;
  /** 復活のあとの むてき */
  respawnInvincibleTicks: number;
  /** ふくろが消えるまで */
  dropBagTicks: number;
  /** 拾える水平の距離（高さの差は BAG_PICKUP_HEIGHT） */
  pickupRadius: number;
}

/** 内部の決まり（仕様書の表にある数。設定の名前は付けない） */
export const KNOCKBACK_TICKS = 10;
export const BAG_PICKUP_HEIGHT = 2;
/** 線が妖怪にふれるか調べる最大の距離（ほる距離と同じ 5.0）。3.0 より遠ければ からぶり */
export const PUNCH_SEE_REACH = 5;
/** 体の箱（M1-02 §4.1） */
export const BODY_HALF = 0.3;
export const BODY_HEIGHT = 1.8;

export const COMBAT_DEFAULTS: Readonly<CombatConfig> = {
  punchTicks: 30,
  punchReach: 3.0,
  punchDamage: 1,
  knockback: 1.0,
  playerMaxHp: 20,
  hurtInvincibleTicks: 30,
  regenDelayTicks: 600,
  regenIntervalTicks: 240,
  dropChance: 0.5,
  respawnDelayTicks: 120,
  respawnInvincibleTicks: 180,
  dropBagTicks: 36000,
  pickupRadius: 1.5,
};

export function createCombatConfig(): CombatConfig {
  return { ...COMBAT_DEFAULTS };
}
