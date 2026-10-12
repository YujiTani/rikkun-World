/** 距離でチャンクを描く／描かない（M5 §4-7）: カメラから、そのチャンクのいちばん近い点までの水平の距離 */
export const CHUNK_DRAW_DISTANCE = 88;

/** 描画まわりの数値（M1-01 §3, 4-10） */
export const RENDER_CONFIG = {
  /** 面の明るさ: 上 100%、横 80%、下 60% */
  brightnessTop: 1.0,
  brightnessSide: 0.8,
  brightnessBottom: 0.6,
  /** 水の不透明度の描画順（他より後に描く） */
  waterRenderOrder: 1,
} as const;
