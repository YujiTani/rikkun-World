import type { ItemId, YokaiKind } from '../../contracts';

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
  /** 出る重み。null か 0 は出さない */
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
  ],
};

export function createYokaiConfig(): YokaiConfig {
  return {
    yokaiSpawnInterval: 300,
    yokaiMax: 5,
    nurikabeMax: 1,
    yokaiWeights: { karakasa: 30, chochin: 25, rokurokubi: 25, nurikabe: 20 },
    yokaiSpawnMinDist: 12,
    yokaiSpawnMaxDist: 28,
    yokaiSpawnNearExclude: 8,
    yokaiAutoSpawn: true,
    yokaiWander: true,
    yokaiLeaveTicks: 600,
    knockback: 1.0,
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
  karakasa: { sight: 12, giveUp: 18, stepUp: 2, radius: 0.6, height: 1.6, eyeHeight: 1.1, turnDegPerSec: 360, marksHeight: 2.1, flies: false },
  chochin: { sight: 14, giveUp: 20, stepUp: 0, radius: 0.4, height: 1.7, eyeHeight: 0.95, turnDegPerSec: 180, marksHeight: 2.3, flies: true },
  nurikabe: { sight: 8, giveUp: 12, stepUp: 1, radius: 0.9, height: 3.0, eyeHeight: 1.9, turnDegPerSec: 45, marksHeight: 3.5, flies: false },
  rokurokubi: { sight: 12, giveUp: 18, stepUp: 1, radius: 0.4, height: 2.9, eyeHeight: 1.6, turnDegPerSec: 240, marksHeight: 3.3, flies: false },
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
  /** 4 ブロックより深い所へはおりない */
  maxDrop: 4,
  /** うろうろはふつうの半分の速さ */
  wanderSpeedRate: 0.5,
  wanderWalk: [120, 300] as readonly [number, number],
  wanderRest: [120, 240] as readonly [number, number],
  /** 押される（10 ステップで） */
  knockbackTicks: 10,
  /** 頭の上の まる を出す */
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
  /** 火の玉の当たりの箱 */
  fireballBox: 0.5,
  /** 頭の上の まる の最大数 */
  maxMarks: 8,
  /** 場所をさがす回数 */
  spawnTries: 20,
} as const;

/** 攻撃のダメージ（体力の数。ハート半分 = 1。仕様 §2.7） */
export const ATTACK_DAMAGE: Record<YokaiKind, number> = {
  karakasa: 1,
  chochin: 1,
  rokurokubi: 1,
  nurikabe: 2,
};
