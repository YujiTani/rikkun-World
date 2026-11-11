/**
 * 大地のハンマーの 地面の われ・光（H1 ground-slam。pixelfx、MIT）の 数と 計算。three.js は 使わない（テストしやすいように）。
 * 絵: public/models/fx/hammer_slam.png（288×208 を 6 列 × 6 段 = 33 コマ。もとの 97 コマの 3 つに 1 つ。もとは 30fps 3.2 秒 → 約 1.1 秒）
 */
export const HAMMER_SHEET = {
  cols: 6,
  rows: 6,
  frames: 33,
  cellW: 288,
  cellH: 208,
  /** 地面に ふれる 点（コマの 左上から の ドット） */
  originX: 144,
  originY: 164,
} as const;

/** ステップ。1 コマを 出す 長さ（33 コマ × 2 = 66 ステップ ≒ 1.1 秒。ゲームでは 1 秒 前後） */
const HAMMER_FX_STEPS_PER_FRAME = 2;
export const HAMMER_FX_STEPS = HAMMER_SHEET.frames * HAMMER_FX_STEPS_PER_FRAME;
/** 「動きを へらす」: 止めて 見せる コマ（われ目と 光が いちばん 見える 所）と 見せる ステップ */
const HAMMER_REDUCED_FRAME = 9;
const HAMMER_REDUCED_STEPS = 30;
/** マス/ドット。1 ドットの 大きさ（もとの 3 マスはば）。実際の 大きさは これに LEGEND4_TUNING.daichi.fxScale（地面 2 倍・急降下 3 倍）を かける */
const HAMMER_DOT_BLOCKS = 1 / 80;
/** 同時に 出す 数（描画回数 4 以下: 1 つ 2 まい × 2） */
export const HAMMER_FX_MAX = 2;

export function hammerFrameAt(age: number, reduced: boolean): number | null {
  if (reduced) return age >= 0 && age < HAMMER_REDUCED_STEPS ? HAMMER_REDUCED_FRAME : null;
  if (age < 0 || age >= HAMMER_FX_STEPS) return null;
  return Math.floor(age / HAMMER_FX_STEPS_PER_FRAME);
}

/** コマ f の 板の 絵の 位置（three の uv は 左下が 原点） */
export function hammerFrameUv(f: number): { x: number; y: number; w: number; h: number } {
  const col = f % HAMMER_SHEET.cols;
  const row = Math.floor(f / HAMMER_SHEET.cols);
  return { x: col / HAMMER_SHEET.cols, y: 1 - (row + 1) / HAMMER_SHEET.rows, w: 1 / HAMMER_SHEET.cols, h: 1 / HAMMER_SHEET.rows };
}

/** 4 方向（dx, dz）→ 十字の 板の 向きの もと（度。北 = 0・東 = 90） */
export function hammerFacingDeg(dir: { dx: number; dz: number }): number {
  if (dir.dx > 0) return 90;
  if (dir.dx < 0) return 270;
  return dir.dz > 0 ? 180 : 0;
}

/**
 * 置く 場所。まん中 = 地面の 点 origin の 真上、高さ = 絵の 地面の 点が origin に あう（板の まん中は 地面の 点より (originY − cellH / 2) ドット 上）。
 * scale = もとの 大きさに かける 倍（板の 大きさだけ かえる。描画の 数は ふえない）
 */
export function hammerFxPlacement(origin: { x: number; y: number; z: number }, scale: number): { x: number; y: number; z: number; w: number; h: number } {
  const s = HAMMER_DOT_BLOCKS * scale;
  return {
    x: origin.x,
    y: origin.y + (HAMMER_SHEET.originY - HAMMER_SHEET.cellH / 2) * s,
    z: origin.z,
    w: HAMMER_SHEET.cellW * s,
    h: HAMMER_SHEET.cellH * s,
  };
}
