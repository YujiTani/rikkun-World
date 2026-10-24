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
  /** 押されるとき、少し上にはねる初速（ブロック/秒） */
  knockbackUp: number;
  /** 体力（ハート 10 こ = 20） */
  playerMaxHp: number;
  /** ダメージを受けたあとの怯み（歩く・遊びの入力がきかない）。単位はステップ（1/60 秒。24 = 0.4 秒） */
  hurtFlinchTicks: number;
  /** ダメージを受けたあとの むてき（怯みをふくむ）。単位はステップ（1/60 秒。90 = 1.5 秒） */
  hurtInvincibleTicks: number;
  /** ダメージから回復が始まるまで待つ */
  regenDelayTicks: number;
  /** 回復のあいだ（最初の 1 は regenDelayTicks のあと、この数ステップ目） */
  regenIntervalTicks: number;
  /** 自然回復は体力がこの わりあい（最大の半分）より少ないときだけ。食べ物などは別 */
  regenMaxRatio: number;
  /** 落とす確率（えらんでいるマスは対象外） */
  dropChance: number;
  /** やられた画面 */
  respawnDelayTicks: number;
  /** 復活のあとの むてき */
  respawnInvincibleTicks: number;
  /** 落ちたアイテムが消えるまで */
  dropBagTicks: number;
  /** 拾える水平の距離（高さの差は BAG_PICKUP_HEIGHT） */
  pickupRadius: number;
  /** この高さ（マス）までの落下はダメージなし */
  safeFallHeight: number;
  /** 安全な高さを超えた 1 マスごとのダメージ（体力。1 = ハート半分） */
  fallDamagePerBlock: number;
}

/** 落下ダメージ（プレイヤー・妖怪で共通）。h = 落ち始めの y − 着地の y（マス） */
export function fallDamage(h: number, safeFallHeight: number, perBlock: number): number {
  const over = Math.floor(h + 1e-6) - safeFallHeight;
  return over > 0 ? over * perBlock : 0;
}

/** 内部の決まり（仕様書の表にある数。設定の名前は付けない） */
export const KNOCKBACK_TICKS = 10;
/** 体の箱（M1-02 §4.1） */
export const BODY_HALF = 0.3;
export const BODY_HEIGHT = 1.8;

export const COMBAT_DEFAULTS: Readonly<CombatConfig> = {
  punchTicks: 30,
  punchReach: 3.5,
  punchDamage: 1,
  knockback: 1.8,
  knockbackUp: 4.5,
  playerMaxHp: 20,
  hurtFlinchTicks: 24,
  hurtInvincibleTicks: 90,
  regenDelayTicks: 600,
  regenIntervalTicks: 900,
  regenMaxRatio: 0.5,
  dropChance: 0.5,
  respawnDelayTicks: 120,
  respawnInvincibleTicks: 180,
  dropBagTicks: 36000,
  pickupRadius: 1.5,
  safeFallHeight: 3,
  fallDamagePerBlock: 1,
};

export function createCombatConfig(): CombatConfig {
  return { ...COMBAT_DEFAULTS };
}
