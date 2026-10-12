/** カメラ・人形の数値（M1-02 §3.3, §4.1, §4.4）。1 か所にまとめる。 */
export interface CameraConfig {
  /** 一人称の目の高さ（足もとから） */
  eyeHeight: number;
  /** 視野角（たて、度） */
  fov: number;
  /** 三人称: カメラの距離 */
  thirdPersonDistance: number;
  /** 三人称: 目より上の回転の中心の高さ */
  thirdPersonHeight: number;
}

export const DEFAULT_CAMERA_CONFIG: Readonly<CameraConfig> = {
  eyeHeight: 1.62,
  fov: 75,
  thirdPersonDistance: 4.0,
  thirdPersonHeight: 0.5,
};

/** 壁の手前に寄せる量 */
export const WALL_MARGIN = 0.2;
/** 壁から離れるときにもとの距離へ戻すのにかける秒数 */
export const WALL_RECOVER_SECONDS = 0.25;
/** カメラと目の距離がこれ未満なら人形を隠す */
export const DOLL_HIDE_DISTANCE = 1.0;
/** 壁の判定でたどる刻み幅 */
export const RAY_STEP = 0.02;

/** 見下ろしカメラ（M1-02 §6.1 camera.overview） */
export const OVERVIEW_POSITION = { x: 72, y: 64.6, z: -8 } as const;
export const OVERVIEW_TARGET = { x: 32, y: 8, z: 32 } as const;

/** 人形の腕・あしの振り */
export const DOLL_SWING_MAX_DEG = 30;
/** 振りの 1 周期（1 歩 0.5 秒 → 左右で 1 周期 1.0 秒） */
export const DOLL_SWING_PERIOD_SECONDS = 1.0;
/** 止まってからまっすぐに戻るまでの秒数 */
export const DOLL_SETTLE_SECONDS = 0.2;
/** 頭の上下のかたむきの最大（度） */
export const DOLL_HEAD_PITCH_MAX_DEG = 45;

/** 人形の色（りっくんの好みで変えられるよう 1 か所に） */
export const DOLL_COLORS = {
  skin: 0xf0c8a0,
  hair: 0x6b4423,
  eye: 0x111111,
  shirt: 0x3fa7ff,
  pants: 0x1d2b64,
  shoes: 0x888888,
} as const;

/** 人形の大きさ [幅, 高さ, 奥行き] */
export const DOLL_SIZES = {
  head: [0.5, 0.5, 0.5],
  body: [0.5, 0.7, 0.25],
  arm: [0.2, 0.7, 0.2],
  leg: [0.25, 0.6, 0.25],
  shoeHeight: 0.1,
  sleeveRatio: 1 / 3,
} as const;
