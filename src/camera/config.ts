/** カメラ・人形の数値（M1-02 §3.3, §4.1, §4.4）。1 か所にまとめる。 */
export interface CameraConfig {
  /** 一人称の目の高さ（足もとから） */
  eyeHeight: number;
  /** 視野角（たて、度） */
  fov: number;
  /** 三人称: カメラの距離 */
  thirdPersonDistance: number;
  /** 三人称: 目より上の回転の中心 P の高さ */
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
/** カメラと キャラの からだの中心 の距離がこれ未満なら キャラを隠す（CHAR-1 §4.1） */
export const DOLL_HIDE_DISTANCE = 1.2;
/** からだの中心の高さ（足もとから） */
export const BODY_CENTER_HEIGHT = 1.0;
/** P が固いブロックの下の面より下がる量 */
export const PIVOT_CEILING_GAP = 0.1;
/** 肩の点 S: P の何下か（CHAR-1 第 5.2 版 §4.1） */
export const SHOULDER_DROP = 0.72;
/** 肩ごしのずらし s の大きさ（s = これ × cos(pitch)） */
export const SHOULDER_OFFSET = 0.7;
/** 壁ぎわで s を 面の何手前まで小さくするか */
export const SHOULDER_WALL_MARGIN = 0.2;
/** 壁がなくなってから s がもとへもどる秒数（15 ステップ） */
export const SHOULDER_RECOVER_SECONDS = 0.25;
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

/** 一人称で右うでを前に出す角度（度。前に水平 = 90）。向き（pitch）にそのままついていく */
export const HELD_ARM_RAISE_FIRST_DEG = 80;
/** 三人称でブロックを持つときの右うでの上げ角 */
export const HELD_ARM_RAISE_THIRD_DEG = 50;
/** 持ったブロックの大きさ（M2 §2.6） */
export const HELD_BLOCK_SIZE = 0.25;
/** ほる・置くときに右うでを振る角度と 1 回の長さ（秒） */
export const ACTION_SWING_DEG = 40;
export const ACTION_SWING_SECONDS = 0.25;
/** ほっているあいだ、うでを振りなおす間隔（0.25 秒に 1 回） */
export const DIG_SWING_PERIOD_SECONDS = 0.25;

// ---------------------------------------------------------------- M4 人形の動き（docs/design/M4-craft.md §2.9）
/** 動きの 1 ステップの秒（固定ステップ） */
export const ANIM_TICK_SECONDS = 1 / 60;

/** うでの動きの名前ごとの長さ（ステップ）と優先（高いほうが打ち切る）。`dig`・`place` は繰り返し／短い振り */
export const ARM_ANIM_DEFS = {
  punch: { ticks: 30, priority: 4 },
  dig: { ticks: 15, priority: 4 },
  place: { ticks: 15, priority: 4 },
  slash: { ticks: 30, priority: 4 },
  thrust: { ticks: 40, priority: 4 },
  sweep: { ticks: 40, priority: 4 },
  draw: { ticks: 10, priority: 4 },
  release: { ticks: 10, priority: 4 },
  banzai: { ticks: 40, priority: 3 },
  cheer: { ticks: 20, priority: 3 },
  pickup: { ticks: 20, priority: 3 },
  equip: { ticks: 15, priority: 3 },
  // M6: ものを すてる（右うでを前へ 12 ステップ）
  throw: { ticks: 12, priority: 3 },
} as const;

/** からだの層の優先（時間で終わるものの長さは BODY_ANIM_TICKS） */
export const BODY_ANIM_PRIORITY = { idle: 1, walk: 2, jump: 3, land: 3, hurt: 5, down: 6 } as const;
export const BODY_ANIM_TICKS = { land: 8, hurt: 12 } as const;

export const DOLL_ANIM = {
  /** 動きが終わってから元のかまえにもどすステップ数 */
  recoverTicks: 6,
  /** 絶対の角度の動きに切りかわるまでのステップ数 */
  blendInTicks: 3,
  /** 止まっているときの息（3 秒に 1 回）の高さ */
  idleBreathTicks: 180,
  idleBreathHeight: 0.015,
  /** 歩くときのからだの上下 */
  walkBobHeight: 0.03,
  /** ジャンプ中のあしの曲げ（度）・うでの上げ（度）・ふみきりのかがみ */
  jumpLegDeg: 22,
  jumpArmLiftDeg: 30,
  jumpCrouch: 0.06,
  /** 着地のぽよん（からだが下がる量） */
  landDip: 0.08,
  /** ダメージで うしろへ たおれる（度）・あたまのふり（度）・一人称で手が下がる（度） */
  hurtTiltDeg: 15,
  hurtHeadDeg: 8,
  hurtFirstPersonDropDeg: 10,
  /** ばんざいで からだがはねる高さ */
  banzaiHop: 0.12,
  /** やられたとき 1 回はねる高さと、頭の上の星 */
  downHop: 0.12,
  starCount: 3,
  starRadius: 0.38,
  starSize: 0.09,
  starSpinDegPerTick: 6,
  /** 一人称では動きの大きさをおさえる（画面からはみ出さない） */
  firstPersonXScale: 0.45,
  firstPersonZScale: 0.7,
  firstPersonXCenterDeg: 60,
  /** ゆみ を持っているときの左うでの上げ（三人称。度） */
  bowLeftRaiseDeg: 50,
  /** 切ったときの白い弧が消えるまで（0.15 秒 = 9 ステップ）。弧の位置・広さ */
  arcTicks: 9,
  slashArc: { radius: 1.1, width: 0.12, fromDeg: 40, toDeg: 140 },
  sweepArc: { radius: 1.5, width: 0.2, fromDeg: 20, toDeg: 160 },
  arcHeight: 1.1,
} as const;
