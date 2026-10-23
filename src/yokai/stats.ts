import type { YokaiKind, YokaiTitle } from '../contracts';
import { TITLE_RULES } from './title';

export type { YokaiTitle };

/** 妖怪の強さ（設計書 3 章の表）。M3 本番の AI が使う */
export interface YokaiStats {
  /** 体力（素手で何回たたくとたおれるか） */
  hp: number;
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

/** 攻撃力の上限（ぬりかべ の今。防具なしでも 1 回は たえる。§2.3） */
export const ATTACK_CAP = 16;
/** M で 攻撃力が上がる速さ（M の上がり方の半分。§2.3） */
export const ATTACK_M_RATE = 0.5;

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

const BASIS: Record<YokaiKind, Basis> = {
  karakasa: { target: 1, attack: 2, xp: 3, projectile: false, frontOnly: false },
  chochin: { target: 1.25, attack: 2, xp: 2, projectile: true, frontOnly: false },
  rokurokubi: { target: 1.5, attack: 2, xp: 3, projectile: false, frontOnly: false },
  nurikabe: { target: 5, attack: 16, xp: 6, projectile: false, frontOnly: true },
};

/** 動きの数（今のまま）。hp は下で計算して入れる */
type Motion = Omit<YokaiStats, 'hp'>;
const MOTION: Record<YokaiKind, Motion> = {
  karakasa: { hitSeconds: 0.5, attackSeconds: 1.2, reach: 2.5, speed: 1.5, cooldownSeconds: 2.0, avoidsWater: true },
  chochin: { hitSeconds: 0.5, attackSeconds: 0.8, reach: 8, speed: 1.0, cooldownSeconds: 3.0, avoidsWater: true },
  nurikabe: { hitSeconds: 1.5, attackSeconds: 4.0, reach: 3, speed: 0.5, cooldownSeconds: 2.0, avoidsWater: false },
  rokurokubi: { hitSeconds: 0.5, attackSeconds: 1.6, reach: 8, speed: 1.0, cooldownSeconds: 2.5, avoidsWater: false },
};

/** 切り上げ（浮動小数の誤差で 1 ふえないように） */
function ceilEps(x: number): number {
  return Math.ceil(x - 1e-9);
}

export interface StrengthResult {
  /** こわさ = 攻撃力の比 × 特ちょうの倍率 */
  fear: number;
  hp: number;
  attack: number;
  xp: number;
  /** 体力の比 × こわさ（目標の強さにもどる。たしかめ用。M・二つ名 なしのときの体力で出す） */
  strength: number;
  /** はやさの倍率（二つ名） */
  speedMul: number;
  /** ドロップの表を引く回数（二つ名） */
  dropRolls: number;
}

/** START-1: つよさ（妖怪の 体力・攻撃力に かけ算。その 世界では 変えない。仕様 §4.3） */
export type StrengthLevel = 'easy' | 'normal' | 'hard';
export const STRENGTH_LEVELS: readonly StrengthLevel[] = ['easy', 'normal', 'hard'];
export const STRENGTH_MUL: Record<StrengthLevel, { hp: number; attack: number }> = {
  easy: { hp: 0.5, attack: 0.5 },
  normal: { hp: 1, attack: 1 },
  hard: { hp: 1.5, attack: 1.25 },
};

/**
 * (種類, 場所の倍率 M, 二つ名, つよさ) → 体力・攻撃力・経験値（BALANCE §2.2・§2.3・§2.5・§4.5）。
 * - 体力 = 切り上げ（元の体力 × M × 二つ名の倍率）
 * - 攻撃力 = 小さい方（16、切り上げ（元 × （1 ＋ （M − 1）÷ 2）） ＋ 二つ名の足し）。攻撃力の式は ここの 1 か所だけ
 * - 経験値 = 切り上げ（元 × M × 二つ名の倍率）
 */
export function yokaiStrength(kind: YokaiKind, m = 1, title: YokaiTitle = 'none', level: StrengthLevel = 'normal'): StrengthResult {
  const b = BASIS[kind];
  const mo = MOTION[kind];
  const t = TITLE_RULES[title];
  let fear = b.attack / STRENGTH_SCALE.attack;
  if (b.projectile) fear *= FEAR_RULES.projectile;
  if (mo.attackSeconds + mo.cooldownSeconds >= FEAR_RULES.longGapSeconds - 1e-9) fear *= FEAR_RULES.longGapMul;
  if (b.frontOnly) fear *= FEAR_RULES.frontOnlyMul;
  if (mo.hitSeconds >= FEAR_RULES.longWindupSeconds) fear *= FEAR_RULES.longWindupMul;
  const baseHp = ceilEps((STRENGTH_SCALE.hp * b.target) / fear);
  const mul = STRENGTH_MUL[level];
  const attack = Math.max(1, Math.min(ATTACK_CAP, ceilEps(b.attack * (1 + (m - 1) * ATTACK_M_RATE) * mul.attack) + t.attackAdd));
  return {
    fear,
    hp: Math.max(1, ceilEps(baseHp * m * t.hpMul * mul.hp)),
    attack,
    xp: ceilEps(b.xp * m * t.xpMul),
    strength: (baseHp / STRENGTH_SCALE.hp) * fear,
    speedMul: t.speedMul,
    dropRolls: t.dropRolls,
  };
}

/** 二つ名をふくめた動きの数（はやさ ×二つ名）。体力は M で変わるので yokaiStrength で見る */
export function yokaiStats(kind: YokaiKind, title: YokaiTitle = 'none'): YokaiStats {
  const base = YOKAI_STATS[kind];
  return { ...base, speed: base.speed * TITLE_RULES[title].speedMul };
}

function build(kind: YokaiKind): YokaiStats {
  const r = yokaiStrength(kind);
  return { hp: r.hp, ...MOTION[kind] };
}

export const YOKAI_STATS: Record<YokaiKind, YokaiStats> = {
  karakasa: build('karakasa'),
  chochin: build('chochin'),
  nurikabe: build('nurikabe'),
  rokurokubi: build('rokurokubi'),
};
