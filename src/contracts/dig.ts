/**
 * 掘る・画面・レア度の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { BlockId, Vec3 } from './world';

export interface TargetInfo {
  block: Vec3;
  id: BlockId;
  /** 面の外向きの向き（各成分 −1・0・1） */
  face: Vec3;
  /** 置く場所（世界の外でもそのまま） */
  place: Vec3;
  /** 目から面まで */
  distance: number;
}

export type DigBlockedReason = 'needTool' | 'unbreakable';

export interface DigState {
  active: boolean;
  block: Vec3 | null;
  /** 0〜1 */
  progress: number;
  /** 0〜3（3 = MAX。あとひと押しでこわれる） */
  crackStage: number;
  /** ひびが MAX で、ひと押しを待っている */
  ready: boolean;
  blockedReason: DigBlockedReason | null;
}

export type DigEvent =
  /** count: 手に入った数（ドロップ数はランダム。入りきらなかった分はふくまない） */
  | { type: 'break'; tick: number; block: Vec3; id: BlockId; gotItem: boolean; count: number }
  /** LIVE-2: 小屋 を 置いた とき は `id` が `toriya_fence`（C が 出す。実績 `place:toriya` に なる） */
  | { type: 'place'; tick: number; block: Vec3; id: BlockId }
  /** ひびが MAX になった（あとひと押しでこわれる。オーナー決定 B） */
  | { type: 'ready'; tick: number; block: Vec3; id: BlockId }
  | { type: 'blocked'; tick: number; block: Vec3; id: BlockId; reason: DigBlockedReason };

/** ねらう・ほる・おく。担当 AB が `src/dig/` で実装する */
export interface DigSystem {
  target(): TargetInfo | null;
  state(): DigState;
  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面と音用 */
  drainEvents(): DigEvent[];
  /** テストの窓口用。読んでも空にならない、まだ読まれていない出来事 */
  peekEvents(): DigEvent[];
  /** 何もねらっていない場所で振った（空振り）回数の合計。見た目と音用 */
  whiffCount?(): number;
}

/** 画面の状態。担当 D が作る */
/** M6: 'celebrate' = おめでとう画面。WEAPON-7 で なくなり、この 値は もう 出ない（BGM の 表の ために 型だけ 残す） */
export type ScreenMode = 'play' | 'inventory' | 'guide' | 'celebrate';

export interface ScreenState {
  mode(): ScreenMode;
  inventoryOpen(): boolean;
  /** 実時間の速さの倍率（あそぶ 1、もちもの 0.25、案内 0） */
  timeScale(): number;
}

/** 担当 AB の設定（`settings.*` の名前と同じ）。値は AB が `src/dig/config.ts` で決める */
export interface DigSettings {
  reach: number;
  /** ブロックごとのかたさ（素手の秒数）。null はこわれない */
  hardness: Record<BlockId, number | null>;
  /** ほるのに要るレベル */
  harvestLevel: Record<BlockId, number>;
  handPower: number;
  handLevel: number;
  digResumeTicks: number;
  digCooldown: number;
  placeRepeatTicks: number;
}

/** ブロックのめずらしさ（ドロップ数の最大を決める。オーナー決定） */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'superRare' | 'epic' | 'mythic' | 'legendary';

/** めずらしさの順番（0〜6）。星の数は +1 */
export type RarityIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 担当 D の設定 */
export interface ScreenSettings {
  inventoryTimeScale: number;
  saveIntervalTicks: number;
}
