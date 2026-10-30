import type { YokaiKind, YokaiState, YokaiTitle } from '../../contracts';
import type { YokaiBase } from '../common';
import type { Fireball } from '../models/chochin';
import type { KindAi } from './config';
import type { HpBar } from './hpBar';

/** 1 ステップの長さ（秒） */
export const DT = 1 / 60;
export const DEG = Math.PI / 180;
/** 虹の はじき中だけの 重力（g=2h/t²: 高さ 6・0.4 秒 → 75） */
export const HEAVY_G = 75;

/**
 * およぐ 妖怪（traits.swims）の 1 体ぶんの 状態（TAKO-1。ai/swim.ts が 読み書きする）。数は content/yokai/<kind>.ts の swim。
 * 時間は ぜんぶ ステップ（1/60 秒）で 数える。
 */
export interface SwimState {
  /** 'cycle' = はやく → とまる のくり返し / 'charge' = すみの ため / 'flee' = すみの あと にげる */
  mode: 'cycle' | 'charge' | 'flee';
  /** cycle の 何ステップ目か（0〜go+rest-1。go ステップ 未満が はやく すすむ） */
  cycleStep: number;
  /** 次に すすむ 向き（ラジアン。とまっている 間に ここへ 向きを かえる） */
  heading: number;
  /** charge / flee ののこり ステップ */
  modeLeft: number;
  /** すみを また はけるように なるまで（ステップ） */
  inkCool: number;
  /** ぺちんまで のこり（-1 = 予定なし）・ぺちんの まち時間のこり */
  slapLeft: number;
  slapCool: number;
  /** 前のステップの 体力（たたかれたかを 見る） */
  lastHp: number;
  /** 体が 水の 外に いる ステップ数 */
  dry: number;
  /** flee の 向き（単位ベクトル。りっくんから はなれる 向き） */
  fleeX: number;
  fleeZ: number;
}

/**
 * 妖怪 1 体ぶんの 状態（YokaiManager が 持ち、各「係」の 部品が 1 体ずつ 受けとって 読み書きする）。
 */
export interface Ent {
  id: number;
  kind: YokaiKind;
  model: YokaiBase;
  x: number;
  y: number;
  z: number;
  /** ラジアン。0 = 北（-Z）、時計回り */
  yaw: number;
  hp: number;
  maxHp: number;
  state: YokaiState;
  ai: boolean;
  age: number;
  /** 次の攻撃までのこり */
  cool: number;
  attackSteps: number;
  vy: number;
  /** AI を 止めた ちょうちんが 置かれた 高さ（これより 下へは おりない。WEAPON-5 のテスト用） */
  homeY: number;
  wanderLeft: number;
  wandering: boolean;
  wanderYaw: number;
  bestDist: number;
  lastProgress: number;
  /** いま かけている明るさ（光があるとき。変わったときだけ色を塗りなおす） */
  bright: number;
  searchSteps: number;
  lastSeenX: number;
  lastSeenZ: number;
  knockLeft: number;
  /** ノックバックの 1 ステップ あたりの 水平の 距離 */
  knockStep: number;
  /** 上へ の 初速（ブロック/秒）。0 より 大きい あいだ は うきあがっている */
  knockUpV: number;
  /** 虹の はじきで とんでいる あいだ true（おりても 落下ダメージを 受けない。いたそうに しない） */
  airSafe: boolean;
  knockDx: number;
  knockDz: number;
  /** WEAPON-9: 長い はじきの 全部の 距離・全部の ステップ(0 = 一定の 速さ) */
  knockTotal: number;
  knockT: number;
  motion: 'wait' | 'move';
  leaveAt: number;
  marks: HpBar | null;
  marksLeft: number;
  /** 二つ名（出たときに決める） */
  title: YokaiTitle;
  /** 出た場所の倍率 M */
  m: number;
  /** 1 回の攻撃力・たおしたときの経験値・はやさの倍率・ドロップを引く回数・からだの大きさ（M と二つ名から） */
  attack: number;
  xp: number;
  speedMul: number;
  dropRolls: number;
  bodyScale: number;
  /** 体の大きさを入れた 動きの数（半径・高さ。のぼれる段などは そのまま） */
  dims: KindAi;
  /** 色の段階の うすい色の上乗せ（0 = なし） */
  stage: 1 | 2 | 3;
  appearScale: number;
  remove: boolean;
  /** 落ち始めた高さ（落ちていなければ NaN） */
  fallFrom: number;
  /** からかさ: ゆらゆら落ちている最中か、その経過ステップ */
  floating: boolean;
  swayStep: number;
  /** ぬりかべ: みず でかたまった度合い 0〜1 */
  stone: number;
  /** WEAPON-5: このステップは よろけている（ステップのはじめに 決める） */
  stag: boolean;
  /** WEAPON-5: よろけの ふらつきの 位相 */
  stagPhase: number;
  /** TAKO-1: およぐ 妖怪（traits.swims）だけ。ほかは null */
  swim: SwimState | null;
  /** MINE-1A §4.3: 自動で 出た 妖怪か（手で 出した 物は false。見つけられなくても 消えない） */
  auto: boolean;
  /** MINE-1A §4.3: 出た とき、または 最後に プレイヤーを 見つけて いた ステップ（YokaiField.steps）。ここから yokaiForgetSteps たつと 去る */
  foundAt: number;
}

export interface LiveFireball {
  id: number;
  fb: Fireball;
  owner: number;
  /** 出した妖怪の攻撃力（出した時点の数） */
  damage: number;
  /** WEAPON-5: はね返した（プレイヤーには もう 当たらない） */
  reflected: boolean;
}


/**
 * 係どうしで 共有する 「いまの ステップ」の 入れ物（妖怪の 列・ステップの 数・プレイヤーの 足もと）。
 * YokaiManager が 1 つだけ 作り、update のはじめに 書きかえる。部品は これだけを 受けとる（YokaiManager 全体は 渡さない）。
 */
export interface YokaiField {
  ents: Ent[];
  /** update を 呼んだ 回数 */
  steps: number;
  /** 今のステップの プレイヤー（足もとの中央） */
  px: number;
  py: number;
  pz: number;
}
