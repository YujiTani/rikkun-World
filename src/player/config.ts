/**
 * プレイヤーの数値（M1-02 §4.1）。ここ 1 か所にまとめる。
 * 単位: 1 ブロック = 1、時間は秒。
 */

/** 遊びながら変えられる数値（`settings.get/set` の名前と同じ） */
export interface PlayerSettings {
  walkSpeed: number;
  accelTime: number;
  jumpHeight: number;
  gravity: number;
  maxFallSpeed: number;
  autoJump: boolean;
  eyeHeight: number;
  fov: number;
  mouseSensitivity: number;
  thirdPersonDistance: number;
  thirdPersonHeight: number;
}

export const PLAYER_DEFAULTS: Readonly<PlayerSettings> = {
  walkSpeed: 4.0,
  accelTime: 0.1,
  jumpHeight: 1.25,
  gravity: 28,
  maxFallSpeed: 30,
  autoJump: true,
  eyeHeight: 1.62,
  fov: 75,
  mouseSensitivity: 0.12,
  thirdPersonDistance: 4.0,
  thirdPersonHeight: 0.5,
};

export function createPlayerSettings(): PlayerSettings {
  return { ...PLAYER_DEFAULTS };
}

/** 当たり判定の箱（向きで回らない） */
export const BODY_WIDTH = 0.6;
export const BODY_HEIGHT = 1.8;
export const BODY_HALF = BODY_WIDTH / 2;

/** 上下の向きの範囲（度） */
export const PITCH_LIMIT_DEG = 89;

/** これより下に落ちたらスタート地点に戻す（M1-01 4-8） */
export const VOID_Y = -10;

/** オートジャンプ（M1-02 §4.6） */
export const AUTOJUMP_PROBE = 0.3;
export const AUTOJUMP_CLEAR_TOP = 2.8;
export const AUTOJUMP_HEAD_TOP = 3.05;

/** 水平に動いているとみなす速さ（ブロック/秒） */
export const MOVING_SPEED_EPS = 0.05;

/** 面ぴったりの誤差よけ */
export const EPS = 1e-6;
