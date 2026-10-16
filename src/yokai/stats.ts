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
  /** みず が苦手（入らない・落ちる先が みず なら降りない）。false は みず の中まで追いかける */
  avoidsWater: boolean;
}

/** 妖怪の種類（contracts と同じ名前。循環をさけてここで持つ） */
export type StrengthKind = 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi';

/** 強さの物さし「からかさ = 1」（BALANCE §2.2・§4.9）。からかさ の体力 8・攻撃力 2 */
export const STRENGTH_SCALE = { hp: 8, attack: 2 } as const;

/** こわさの特ちょうの倍率（2 倍・半分のきざみ。§2.2） */
export const FEAR_RULES = {
  projectile: 2,
  /** 攻撃の合計 + 次の攻撃まで がこの秒数以上 → ×1/2（からかさ 3.2 秒の 1.5 倍） */
  longGapSeconds: 4.8,
  longGapMul: 0.5,
  frontOnlyMul: 0.5,
  /** 合図（攻撃を始めてから当たるまで）がこの秒数以上 → ×1/2 */
  longWindupSeconds: 1.5,
  longWindupMul: 0.5,
} as const;

/** 妖怪ごとの元の数。体力・攻撃力・経験値は、ここと上の式から計算する（手で書かない） */
interface Basis {
  /** 目標の強さ（オーナーのことば） */
  target: number;
  /** 1 回の攻撃力（体力。1 = ハート半分） */
  attack: number;
  /** 経験値（M = 1・二つ名なし） */
  xp: number;
  /** 飛び道具か */
  projectile: boolean;
  /** 前にしか攻撃しないか */
  frontOnly: boolean;
}

const BASIS: Record<StrengthKind, Basis> = {
  karakasa: { target: 1, attack: 2, xp: 3, projectile: false, frontOnly: false },
  chochin: { target: 1.25, attack: 2, xp: 2, projectile: true, frontOnly: false },
  rokurokubi: { target: 1.5, attack: 2, xp: 3, projectile: false, frontOnly: false },
  nurikabe: { target: 5, attack: 16, xp: 6, projectile: false, frontOnly: true },
};

/** 動きの数（今のまま）。hp は下で計算して入れる */
type Motion = Omit<YokaiStats, 'hp' | 'damageHearts'>;
const MOTION: Record<StrengthKind, Motion> = {
  karakasa: { hitSeconds: 0.5, attackSeconds: 1.2, reach: 2.5, speed: 1.5, cooldownSeconds: 2.0, avoidsWater: true },
  chochin: { hitSeconds: 0.5, attackSeconds: 0.8, reach: 8, speed: 1.0, cooldownSeconds: 3.0, avoidsWater: true },
  nurikabe: { hitSeconds: 1.5, attackSeconds: 4.0, reach: 3, speed: 0.5, cooldownSeconds: 2.0, avoidsWater: false },
  rokurokubi: { hitSeconds: 0.5, attackSeconds: 1.6, reach: 8, speed: 1.0, cooldownSeconds: 2.5, avoidsWater: false },
};

/** 切り上げ（浮動小数の誤差で 1 ふえないように） */
function ceilEps(x: number): number {
  return Math.ceil(x - 1e-9);
}

/** 二つ名（#110 が中身を足す。いまは なし だけ） */
export type YokaiTitle = 'none';

export interface StrengthResult {
  /** こわさ = 攻撃力の比 × 特ちょうの倍率 */
  fear: number;
  hp: number;
  attack: number;
  xp: number;
  /** 体力の比 × こわさ（目標の強さにもどる。たしかめ用） */
  strength: number;
}

/**
 * (種類, 場所の倍率 M = 1, 二つ名 = なし) → 体力・攻撃力・経験値（BALANCE §2.2・§4.1）。
 * #110 が M と二つ名の中身をここに足す（引数はそのまま。いまは M = 1・なし だけ）。
 */
export function yokaiStrength(kind: StrengthKind, _m = 1, _title: YokaiTitle = 'none'): StrengthResult {
  const b = BASIS[kind];
  const m = MOTION[kind];
  let fear = b.attack / STRENGTH_SCALE.attack;
  if (b.projectile) fear *= FEAR_RULES.projectile;
  if (m.attackSeconds + m.cooldownSeconds >= FEAR_RULES.longGapSeconds - 1e-9) fear *= FEAR_RULES.longGapMul;
  if (b.frontOnly) fear *= FEAR_RULES.frontOnlyMul;
  if (m.hitSeconds >= FEAR_RULES.longWindupSeconds) fear *= FEAR_RULES.longWindupMul;
  const hp = ceilEps((STRENGTH_SCALE.hp * b.target) / fear);
  return { fear, hp, attack: b.attack, xp: b.xp, strength: (hp / STRENGTH_SCALE.hp) * fear };
}

function build(kind: StrengthKind): YokaiStats {
  const r = yokaiStrength(kind);
  return { hp: r.hp, damageHearts: r.attack / 2, ...MOTION[kind] };
}

export const YOKAI_STATS: Record<StrengthKind, YokaiStats> = {
  karakasa: build('karakasa'),
  chochin: build('chochin'),
  nurikabe: build('nurikabe'),
  rokurokubi: build('rokurokubi'),
};
