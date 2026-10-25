import { mapKinds, yokaiBasis, yokaiMotion, yokaiNames } from '../content/yokai/registry';
import type { YokaiMotion } from '../content/yokai/types';
import type { YokaiKind, YokaiTitle } from '../contracts';
import { TITLE_RULES } from './title';

export type { YokaiTitle };

/** 妖怪の名前（ひらがな）。画面・ログ・ドロップ表の文で使う、ひとつだけの表 */
export const YOKAI_NAME: Readonly<Record<YokaiKind, string>> = yokaiNames();

/** 妖怪の強さ（設計書 3 章の表）。M3 本番の AI が使う。動きの数（秒・距離・速さ）は 登録表の YokaiMotion */
export interface YokaiStats extends YokaiMotion {
  /** 体力（素手で何回たたくとたおれるか） */
  hp: number;
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

/** 妖怪ごとの元の数（目標の強さ・攻撃力・経験値・飛び道具か・前だけか）。体力・攻撃力・経験値は、ここと上の式から計算する（手で書かない）。値は content/yokai/<kind>.ts */
const BASIS = yokaiBasis();

/** 動きの数（今のまま）。hp は下で計算して入れる */
const MOTION = yokaiMotion();

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

export const YOKAI_STATS: Record<YokaiKind, YokaiStats> = mapKinds(build);
