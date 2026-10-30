/** ChunkedVoxelWorld が 外に渡す記録の形（VoxelWorld.ts から再び export する。4-7） */

export interface SectionPos {
  cx: number;
  sy: number;
  cz: number;
}

export interface ChangeBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export interface ColumnEvent {
  cx: number;
  cz: number;
  /** true = 読みこんだ、false = 捨てた */
  loaded: boolean;
}
