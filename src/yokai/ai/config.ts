import { mapKinds, yokaiAi, yokaiDrops } from '../../content/yokai/registry';
import type { DropRow, YokaiAi } from '../../content/yokai/types';
import type { YokaiKind } from '../../contracts';
import { yokaiStrength } from '../stats';
import { KIND_TRAITS } from '../traits';

export type { DropRow };

/**
 * 妖怪の数値（仕様 M3-combat §4.2・§4.3・§4.5・§4.6 の「設定の名前」と同じ）。
 * つなぎ込みで `settings.*` に出す。ほかの数（見つける距離など）は KIND_AI / AI_CONST にまとめる。
 */
export interface YokaiConfig {
  /** ためす間かく（ステップ。地上〔よる だけ〕。60 ステップ ＝ 1 秒） */
  yokaiSpawnInterval: number;
  /** 地下に いる ときの ためす間かく（ステップ。MINE-1A §4.3。昼も 出る） */
  yokaiSpawnIntervalUnder: number;
  /** 同時の数（地上） */
  yokaiMax: number;
  /** 地下に いる ときの 同時の数（地上の yokaiMax とは べつ。今 いる 所の 数を 使う） */
  yokaiMaxUnder: number;
  nurikabeMax: number;
  /** 全体の 倍率（COUNTRY-1。種類 → 数）。1 = そのまま・2 = どの国でも 2 倍・null か 0 は どの国にも 出さない */
  yokaiWeights: Partial<Record<YokaiKind, number | null>>;
  yokaiSpawnMinDist: number;
  yokaiSpawnMaxDist: number;
  /** 出る 高さの はば（マス）。プレイヤーの 足 ±これ の 中の 床だけに 出る（地上も 地下も。MINE-1A §4.3） */
  yokaiSpawnHeight: number;
  /** 自動で 出た 妖怪が プレイヤーを 見つけない まま そっと 去るまで（ステップ。見つけると 数えなおし。ヌシ・手で 出した 妖怪は 去らない） */
  yokaiForgetSteps: number;
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

/** ドロップ表（オーナー決定）。1 回たおすと各行を chance で判定し、数は 1〜max。高 0.7・中 0.4・低 0.15・とても低 0.05。値は content/yokai/<kind>.ts */
export const YOKAI_DROPS: Record<YokaiKind, readonly DropRow[]> = yokaiDrops();

export function createYokaiConfig(): YokaiConfig {
  return {
    // 地上: 300 ステップ（5 秒）ごとに ためす・5 体まで。地下（MINE-1A §4.3）: 480 ステップ（8 秒）・8 体まで
    yokaiSpawnInterval: 300,
    yokaiSpawnIntervalUnder: 480,
    yokaiMax: 5,
    yokaiMaxUnder: 8,
    nurikabeMax: 1,
    // COUNTRY-1: 全体の 倍率（4 種とも 1）。30・25・25・20 の 数は 国の表の ものさしの行（countryTable.ts）
    yokaiWeights: { karakasa: 1, chochin: 1, rokurokubi: 1, nurikabe: 1 },
    yokaiSpawnMinDist: 12,
    yokaiSpawnMaxDist: 28,
    // 足 ±8 マス（17 段）。見つけられない 妖怪は 3,600 ステップ（60 秒）で 去る
    yokaiSpawnHeight: 8,
    yokaiForgetSteps: 3600,
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

/** 妖怪ごとの AI の数（仕様 §4.3、§2.5）。見つける距離（sight）・あきらめる距離（giveUp）は 感知の 表 senseTuning.ts（NINJA-1）。値は content/yokai/<kind>.ts */
export type KindAi = YokaiAi;

export const KIND_AI: Record<YokaiKind, KindAi> = yokaiAi();

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
  // 高さの差の 上限（sightDy）は 感知の 表 senseTuning.ts
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
  /** ぬりかべ: 体当たり（ふれる）ダメージの倍率（値は content/yokai/nurikabe.ts の traits.contactMul） */
  nurikabeContactMul: KIND_TRAITS.nurikabe.contactMul,
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
  /** 地下に いる ＝ 足の 高さが、その x・z の 生成の 地形の 高さより これ（マス）以上 下（MINE-1A §4.3。地面 150 なら 足 144 いかが 地下） */
  underDepth: 6,
} as const;

/** 攻撃のダメージ（体力の数。ハート半分 = 1。オーナー決定で M3 の 2 倍） */
export const ATTACK_DAMAGE: Record<YokaiKind, number> = mapKinds((k) => yokaiStrength(k).attack);
