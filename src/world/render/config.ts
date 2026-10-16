/** 距離でチャンクを描く／描かない（M5 §4-7）: カメラから、そのチャンクのいちばん近い点までの水平の距離 */
export const CHUNK_DRAW_DISTANCE = 88;

/**
 * 面の明るさ（TEX-A、docs/art/DESIGN.md 3.1。マイクラ式）。世界のブロックの面は ぜんぶ この値
 * （小ブロック・箱の段・平らな箱・LOD）。順番は 面の向きの番号: 上, 下, +x（東）, -x（西）, +z（南）, -z（北）。
 * 「最初より暗い」と感じたら 東西 0.8・下 0.6 に もどせる（数字の置きかえだけ）。
 */
export const FACE_SHADE_BY_INDEX: readonly number[] = [1.0, 0.5, 0.6, 0.6, 0.8, 0.8];

/** 面の向きの名前（テストの hook 用）。north = -z */
export type FaceName = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export const FACE_NAMES: readonly FaceName[] = ['top', 'bottom', 'east', 'west', 'south', 'north'];

/** hook の faceShade() の形 */
export function faceShadeTable(): Record<FaceName, number> {
  const out = {} as Record<FaceName, number>;
  FACE_NAMES.forEach((n, i) => {
    out[n] = FACE_SHADE_BY_INDEX[i];
  });
  return out;
}

/** 角の暗がり（AO）の 4 だん: 0 → 1.0 … 3 → 0.55（DESIGN 3.2） */
export const AO_LEVELS: readonly number[] = [1.0, 0.82, 0.68, 0.55];
/** AO を消しはじめる距離（小ブロックの半径 r の 8 ブロック手前から r で 1.0 へ） */
export const AO_FADE_BLOCKS = 8;

/** 描画まわりの数値（M1-01 §3, 4-10） */
export const RENDER_CONFIG = {
  /** 水の不透明度の描画順（他より後に描く） */
  waterRenderOrder: 1,
  /**
   * これより遠い（チャンクのいちばん近い点まで）チャンクは、かんたんメッシュ（LOD）で描く。
   * かすみ（fogNear 40）の中で切りかえて目立たなくする。CHUNK_DRAW_DISTANCE より小さいこと。
   */
  lodDistance: 48,
} as const;
