/**
 * #308 gashaBigActor.ts を 分けた もの: 動きを 受け持つ 側（BigActor・ActorBoxes・AttackRunner）が 共有する 型と 小さな 道具。
 */
import type { Vector3 } from 'three';
import type { GlassMask, JointName } from './gashaBigTypes';
import type { AimClipJson, ClipJson } from './gashaBigMotion';
import type { Side } from './gashaBigStep';

export interface ActorEnv {
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ） */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** 前へ 進む 1 歩で 手を 地面に たたきつけた（手の ひらの まんなか。y は 地面の 高さ）。打撃・衝撃波・ゆれ は 呼ぶ 側 */
  onSlam?(x: number, y: number, z: number, side: Side): void;
  /** 攻撃 1（両手たたきつけ）で 手が 地面に 着いた（両手の まんなか。fx, fz = 体の 前の 向き）。打撃・岩・衝撃波・ゆれ・地形こわし・体の ゆれ は 呼ぶ 側 */
  onSlam2?(x: number, y: number, z: number, fx: number, fz: number): void;
  /** 攻撃が はじまった（'slam2'・'sweep'・'beam'・'eruption'・'thunder'。効果音など 呼ぶ 側の 用） */
  onAttackStart?(name: string): void;
  /** 攻撃 4 で 火柱が 立った（口から 灰を とばしはじめる） */
  onEruptStart?(): void;
  /** 攻撃 5 で 雷が 指へ 落ちはじめた（雷の 絵・音） */
  onThunderStrike?(): void;
  /** 攻撃 5 で 雷が 指に 着いた（電気が はじまる・まわりの 落雷が はじまる） */
  onThunderLand?(): void;
  /** 攻撃 2 で 腕が 払いはじめた（0 = 1 回目、1 = 2 回目） */
  onSweepStroke?(index: number): void;
  /** 引きよせの おわりに つきなおした 手が 地面を たたいた（小さい 衝撃。手の ひらの まんなか） */
  onTap?(x: number, y: number, z: number, side: Side): void;
  /** 攻撃 1（両手たたきつけ）で 手が 地面に 着いた（両手の まんなか。fx, fz = 体の 前の 向き）。打撃・岩・衝撃波・ゆれ・地形こわし・体の ゆれ は 呼ぶ 側 */
  onSlam2?(x: number, y: number, z: number, fx: number, fz: number): void;
}

export type ActorClips = { climbUp: AimClipJson; climbDown: AimClipJson; lookBack: ClipJson };
export type ActorMode = 'idle' | 'crawl' | 'back' | 'look' | 'angry' | 'attack' | 'tired' | 'frozen';

/** 予告の 半円（世界の 座標。中心 = 手の 落ちる 所、fx, fz = 体の 前。level = 強さ 0〜1） */
export interface WarnMark { x: number; y: number; z: number; fx: number; fz: number; radius: number; level: number }

/** 箱の 世界での 場所（毎コマ 更新。マスの 判定に 使う） */
export interface Box {
  name: string;
  joint: JointName;
  c: [number, number, number];
  /** 3 本の 軸（9 つ） */
  ax: number[];
  half: [number, number, number];
  /** 世界の 軸に そろえた はんぶんの 大きさ（余白 込み） */
  ext: [number, number, number];
  /** ガラスの 雲の マス（割れた マスは 当たらない） */
  mask?: GlassMask;
  /** プレイヤーが 置いた ブロック（ちょうど 1 ブロック。余白・持ち上げは なし） */
  exact?: boolean;
}

/** 体に ついて 動く 追加の 箱（置いた ブロック）。座標は Hit と おなじ（もとの 座標・関節の 休みの 姿勢） */
export interface ExtraHit { joint: JointName; c: Vector3; axes: [Vector3, Vector3, Vector3]; half: [number, number, number] }

export interface ActorWork {
  /** 関節を うごかした 数 */
  joints: number;
  /** 回転の 補間の 数 */
  interps: number;
  /** 行列を 更新した 物の 数（Group） */
  matrices: number;
  /** 当たりの 箱の 更新の 数 */
  boxes: number;
  /** 直前の「このマスは 固いか」で 調べた 箱の 数（さいごの 1 回） */
  lastQueryBoxes: number;
  /** 動いた コマで 1 コマの 仕事の 合計の 目安 */
  total: number;
}

export const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const DEG = Math.PI / 180;
