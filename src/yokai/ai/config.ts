import type { ItemId, YokaiKind } from '../../contracts';
import { yokaiStrength } from '../stats';

/**
 * 妖怪の数値（仕様 M3-combat §4.2・§4.3・§4.5・§4.6 の「設定の名前」と同じ）。
 * つなぎ込みで `settings.*` に出す。ほかの数（見つける距離など）は KIND_AI / AI_CONST にまとめる。
 */
export interface YokaiConfig {
  /** ためす間かく（ステップ。よる だけ） */
  yokaiSpawnInterval: number;
  /** 同時の数 */
  yokaiMax: number;
  nurikabeMax: number;
  /** 全体の 倍率（COUNTRY-1。種類 → 数）。1 = そのまま・2 = どの国でも 2 倍・null か 0 は どの国にも 出さない */
  yokaiWeights: Record<string, number | null>;
  yokaiSpawnMinDist: number;
  yokaiSpawnMaxDist: number;
  /** プレイヤーのこの近く（水平）には出さない */
  yokaiSpawnNearExclude: number;
  yokaiAutoSpawn: boolean;
  yokaiWander: boolean;
  /** あさ の始めから、全員が帰るまで（ステップ） */
  yokaiLeaveTicks: number;
  /** 押す距離（妖怪・プレイヤーとも。パンチの C と同じ名前） */
  knockback: number;
  /** 妖怪の体にふれたときのダメージ（体力。1 = ハート半分。0 でなし） */
  contactDamage: number;
  /** この高さ（マス）までの落下はダメージなし（プレイヤーと同じ） */
  safeFallHeight: number;
  /** 安全な高さを超えた 1 マスごとのダメージ（体力） */
  fallDamagePerBlock: number;
  /** みず の中の歩く速さ（プレイヤーと同じ名前・同じ値） */
  waterSpeedMul: number;
}

export type DropRow = { item: ItemId; chance: number; max: number };
/** ドロップ表（オーナー決定）。1 回たおすと各行を chance で判定し、数は 1〜max。高 0.7・中 0.4・低 0.15・とても低 0.05 */
export const YOKAI_DROPS: Record<YokaiKind, readonly DropRow[]> = {
  karakasa: [
    { item: 'paper', chance: 0.7, max: 4 },
    { item: 'string', chance: 0.7, max: 4 },
    { item: 'log', chance: 0.4, max: 3 },
    { item: 'oil', chance: 0.15, max: 2 },
    { item: 'iron_ore', chance: 0.05, max: 1 },
    { item: 'seed_tomato', chance: 0.05, max: 1 },
    { item: 'seed_pumpkin', chance: 0.05, max: 1 },
  ],
  chochin: [
    { item: 'paper', chance: 0.7, max: 4 },
    { item: 'string', chance: 0.4, max: 3 },
    { item: 'coal_ore', chance: 0.15, max: 2 },
  ],
  nurikabe: [
    { item: 'dirt', chance: 0.7, max: 4 },
    { item: 'stone', chance: 0.7, max: 4 },
    { item: 'clay', chance: 0.15, max: 2 },
  ],
  rokurokubi: [
    { item: 'cloth', chance: 0.7, max: 4 },
    { item: 'crystal', chance: 0.05, max: 1 },
    { item: 'seed_onion', chance: 0.05, max: 1 },
    { item: 'seed_eggplant', chance: 0.05, max: 1 },
  ],
};

export function createYokaiConfig(): YokaiConfig {
  return {
    yokaiSpawnInterval: 300,
    yokaiMax: 5,
    nurikabeMax: 1,
    // COUNTRY-1: 全体の 倍率（4 種とも 1）。30・25・25・20 の 数は 国の表の ものさしの行（countryTable.ts）
    yokaiWeights: { karakasa: 1, chochin: 1, rokurokubi: 1, nurikabe: 1 },
    yokaiSpawnMinDist: 12,
    yokaiSpawnMaxDist: 28,
    yokaiSpawnNearExclude: 8,
    yokaiAutoSpawn: true,
    yokaiWander: true,
    yokaiLeaveTicks: 600,
    knockback: 1.0,
    contactDamage: 1,
    safeFallHeight: 3,
    fallDamagePerBlock: 1,
    waterSpeedMul: 0.5,
  };
}

/** 妖怪ごとの AI の数（仕様 §4.3、§2.5） */
export interface KindAi {
  /** 見つける距離（水平） */
  sight: number;
  /** あきらめる距離（水平） */
  giveUp: number;
  /** のぼれる段 */
  stepUp: number;
  /** 動くときの体の半分のはば（ぶつかり用） */
  radius: number;
  /** 体の高さ（くうきがあるか調べる用。ちょうちんは地面からの高さ） */
  height: number;
  /** 目の高さ（見つける線の始まり） */
  eyeHeight: number;
  /** 向きを変える速さ（度/秒） */
  turnDegPerSec: number;
  /** 頭の上の「まる」の高さ */
  marksHeight: number;
  /** 浮いて水の上も行けるか */
  flies: boolean;
}

export const KIND_AI: Record<YokaiKind, KindAi> = {
  karakasa: { sight: 18, giveUp: 24, stepUp: 2, radius: 0.6, height: 1.6, eyeHeight: 1.1, turnDegPerSec: 360, marksHeight: 2.1, flies: false },
  chochin: { sight: 21, giveUp: 27, stepUp: 0, radius: 0.4, height: 1.7, eyeHeight: 0.95, turnDegPerSec: 180, marksHeight: 2.3, flies: true },
  nurikabe: { sight: 12, giveUp: 18, stepUp: 1, radius: 0.9, height: 3.0, eyeHeight: 1.9, turnDegPerSec: 45, marksHeight: 3.5, flies: false },
  rokurokubi: { sight: 18, giveUp: 24, stepUp: 1, radius: 0.4, height: 2.9, eyeHeight: 1.6, turnDegPerSec: 240, marksHeight: 3.3, flies: false },
};

/** そのほかの決まった数 */
export const AI_CONST = {
  /** 出てくる（0→1）にかかるステップ */
  appearTicks: 30,
  /** 出てから攻撃しないステップ */
  noAttackTicks: 60,
  /** この間 0.5 ブロックも近づけなかったらあきらめる */
  progressTicks: 180,
  progressDist: 0.5,
  /** さがすのは最大このステップ（仕様は 300。余裕をとる） */
  searchTicks: 290,
  /** 高さの差がこれ以内のときだけ見つける */
  sightDy: 6,
  /** 暗い所の判定: この高さまで上を見て固いブロックがあれば「ふさがっている」 */
  skyCheckHeight: 40,
  /** うろうろ・出現では、これより深い所へはおりない（落ちてもダメージのない高さ） */
  maxDrop: 3,
  /** プレイヤーをおいかけているときは、これより深くてもおりる（落下ダメージで倒れる深さは除く） */
  chaseMaxDrop: 64,
  /** 攻撃の当たり: プレイヤーの体の箱を、横にこれだけ広げて調べる（片側。届く距離も +この分） */
  attackPad: 0.4,
  /** プレイヤーの攻撃を受ける判定: 妖怪の当たり箱を、各方向にこれだけ広げる（片側） */
  hitPad: 0.3,
  /** からかさ: この高さ以上の段差からは ゆらゆら落ちる */
  floatMinDrop: 2,
  /** からかさ: ゆらゆら落ちる最大の速さ（ブロック/秒） */
  floatFallSpeed: 2,
  /** からかさ: 横のゆれ幅（±ブロック）と 1 往復の長さ（秒）、かたむき（±度） */
  floatSwayAmp: 0.8,
  floatSwayPeriod: 1.2,
  floatTiltDeg: 25,
  /** ぬりかべ: みず に入っていて石になるまで（ステップ）。出ると同じ速さでもどる */
  stoneTicks: 180,
  /** ぬりかべ: かたまり 1 での速さ（かたまり 0 が ×1） */
  stoneSlowMin: 0.2,
  /** ぬりかべ: かたまりがこの値以上だと 攻撃しない */
  stoneNoAttack: 0.5,
  /** ぬりかべ: 体当たり（ふれる）ダメージの倍率 */
  nurikabeContactMul: 4,
  /** 攻撃の当たり: 上下に広げる（片側） */
  attackPadY: 0.2,
  /** うろうろはふつうの半分の速さ */
  wanderSpeedRate: 0.5,
  wanderWalk: [120, 300] as readonly [number, number],
  wanderRest: [120, 240] as readonly [number, number],
  /** 押される（10 ステップで） */
  knockbackTicks: 10,
  /** 頭の上の 体力のバー を出す ステップ（hpBar.ts の HP_BAR.ticks と同じ） */
  marksTicks: 180,
  /** ちょうちんの上下の速さ（ブロック/秒） */
  hoverRate: 2,
  /** のぼるときの速さ（ブロック/秒） */
  riseRate: 6,
  /** 世界の下に落ちたら消す */
  voidY: -10,
  /** 世界の端から */
  edgeMargin: 0.3,
  playerEye: 1.62,
  playerWidth: 0.6,
  playerHeight: 1.8,
  /** 火の玉の当たりの箱（前は 0.5） */
  fireballBox: 0.9,
  /** 場所をさがす回数 */
  spawnTries: 20,
  /** M5: これより水平に遠い妖怪は静かに消える */
  farRemoveDist: 64,
} as const;

/** 攻撃のダメージ（体力の数。ハート半分 = 1。オーナー決定で M3 の 2 倍） */
export const ATTACK_DAMAGE: Record<YokaiKind, number> = {
  karakasa: yokaiStrength('karakasa').attack,
  chochin: yokaiStrength('chochin').attack,
  rokurokubi: yokaiStrength('rokurokubi').attack,
  nurikabe: yokaiStrength('nurikabe').attack,
};
