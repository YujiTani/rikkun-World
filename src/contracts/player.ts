/**
 * プレイヤーの状態・動きの型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { Vec3 } from './world';

// ---------------------------------------------------------------- 入力・スタート画面（T5）

/** マウスの動き（ピクセル。右・下が正）。T5 が作り、T3 が読む */
export interface LookSource {
  /** 前回から動いた量を返して 0 に戻す。ロックが外れている間は常に {dx:0, dy:0} */
  consume(): { dx: number; dy: number };
}

/** ポインターロックと案内画面の状態。T5 が作る */
export interface LockStatus {
  locked(): boolean;
  overlayVisible(): boolean;
  /** 実時間のゲームループを進めてよいか（M1-02 §2.4）。step() はこれに関係なく進む */
  realtimeAllowed(): boolean;
  /** 遊びの入力（移動・ジャンプ・向き）を受け付けてよいか */
  playInputEnabled(): boolean;
}

// ---------------------------------------------------------------- プレイヤー（T3）

export interface PlayerState {
  /** 足もとの中央 */
  position: Vec3;
  velocity: Vec3;
  /** 0 以上 360 未満。0 = 北（-Z）、上から見て時計回り（M1-02 §4.3） */
  yawDeg: number;
  /** 0 = 水平、上がプラス */
  pitchDeg: number;
  onGround: boolean;
  inWater: boolean;
  /** 水平に動いているか（人形の手足を振るため） */
  moving: boolean;
  /** CHAR-1: キャラの向き（0 以上 360 未満。yaw と同じ数え方）。見た目だけ。省略時は yaw と同じ */
  facingDeg: number;
  /** CHAR-1: 走る入力が効いているか（run を押していて 歩く入力あり） */
  running: boolean;
}

// ---------------------------------------------------------------- 動きの 制限（A・B → プレイヤー）

/** わざ・ゆみを ひく あいだの 歩く 速さ。つなぎ込みが プレイヤーの 速さに かける */
export interface PlayerMotionMod {
  /** 歩く 速さの 倍率（1 = ふつう） */
  speedMul: number;
  /** true の あいだ ジャンプ できない（刀の わざの あいだ） */
  jumpLocked: boolean;
  /** CHAR-2: null でない あいだ キャラの 向き（facing）は これ。回らない（わざの 向きの 固定） */
  faceDeg?: number | null;
  /** CHAR-2: true の ステップは 水平の速さを 0 に する */
  stopNow?: boolean;
  /** WEAPON-9: null でない あいだ 足もとの 高さを これに 向けて うごかす（シャイニングで うかぶ。重力を 使わない） */
  hoverY?: number | null;
}
