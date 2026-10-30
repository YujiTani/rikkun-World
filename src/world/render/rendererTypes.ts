/** WorldRenderer が外に返す答えの形（WorldRenderer.ts から再び export する。4-7） */

export interface RebuildStats {
  /** いちばん最近の作り直し（セクション 1 つ分のメッシュ作り）にかかったミリ秒（描画そのものはふくまない） */
  lastMs: number;
  /** ブロックや光が変わって作り直したセクションの数（最初の全部の分・段の切りかえはふくまない） */
  count: number;
}

/** render.chunks() の答え（M5 AC15）。「チャンク」は 列（16×16 の縦ぜんぶ） */
export interface ChunkStats {
  /** 列の数（8×8 = 64） */
  total: number;
  /** 遠くを かんたんメッシュ（LOD）で描いている列の数 */
  lodDrawn: number;
  /** 距離が 88 以下で、いま描いている（メッシュがあって見える）列の数 */
  drawn: number;
  /** 距離が 88 以下の列の数 */
  inRange: number;
  /** 描く距離（88） */
  maxDistance: number;
  /** 描いている列の番号（colKey(cx, cz)。負の列でも ちがう数） */
  drawnIndices: number[];
}

export type SectionTier = 'micro' | 'box' | 'lod' | 'none';
export type NoneReason = 'empty' | 'hidden' | 'unlit';

/** window.__rikkun.world.sectionInfo の答え（VOX-E） */
export interface SectionInfo {
  tier: SectionTier;
  reason: NoneReason | null;
  meshes: number;
  triangles: number;
  dist: number;
}

export interface SectionStats {
  microR: number;
  total: number;
  micro: number;
  box: number;
  lod: number;
  none: number;
  noneBy: { empty: number; hidden: number; unlit: number };
  microMaxDist: number;
  boxMinDist: number;
  boxMaxDist: number;
}

export interface MeshStats {
  geometryBytes: number;
  geometryBytesLimit: number;
  meshCount: number;
  disposedTotal: number;
  pending: number;
}

export interface RebuildLogEntry {
  x: number;
  y: number;
  z: number;
  kind: 'micro' | 'box' | 'water';
  frame: number;
}

/** 描画まわりの設定（F3 の設定・URL・テストから書きかえられる。毎コマ読む） */
export interface WorldRenderConfig {
  /** 小ブロックの半径（16 / 24 / 32。ほかは近い値になる） */
  microRadius: number;
  /** 小ブロックの 1 セクションを 途中で止められる仕事に分けて作るか（既定 true。?meshSlice=off で false。見くらべと perf 用。PERF-2） */
  meshSlice?: boolean;
}

/** 分けて作る小ブロックの仕事の様子（window.__rikkun.world.meshJob。PERF-2） */
export interface MeshJobStats {
  /** いま作っている途中のセクション（無ければ null） */
  active: { cx: number; sy: number; cz: number } | null;
  /** 分けて作りおえた数 */
  finished: number;
  /** 途中で捨てた数 */
  cancelled: number;
  /** resume を呼んだ回数の合計 */
  slices: number;
  /** 1 回の resume にかかった いちばん長いミリ秒 */
  maxSliceMs: number;
}
