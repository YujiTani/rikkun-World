import type { Data3DTexture, Mesh, MeshBasicMaterial } from 'three';
import type { Tier } from './voxel/tier';

/** WorldRenderer が 1 セクション・1 列ごとに持つ状態（WorldRenderer.ts から分けた。4-7） */

export type Cls = 0 | 1 | 2 | 3; // 0 = まだ見ていない / 1 = 全部空気 / 2 = 見えない / 3 = ふつう
export const CLS_UNKNOWN = 0;
export const CLS_AIR = 1;
export const CLS_HIDDEN = 2;
export const CLS_NORMAL = 3;

export interface SecState {
  readonly col: ColState;
  readonly cx: number;
  readonly sy: number;
  readonly cz: number;
  cls: Cls;
  /** 最後に作った段（null = まだ・捨てた）。面が 0 でも入る */
  built: 'micro' | 'box' | null;
  /** 中身（ブロック・光）が変わって、作り直しが要る */
  dirty: boolean;
  /** プレイヤーがブロックを変えた（先に作る） */
  player: boolean;
  /** ブロックや光の変化による作り直し（rebuildStats の count に入れる） */
  byChange: boolean;
  /** markDirty のたびに 1 増える（分けて作っている間に 中身が変わったかを見る。PERF-2） */
  gen: number;
  /** 作ったが 見える面が 0 だった */
  faceless: boolean;
  evicted: boolean;
  queued: boolean;
  voxel: Mesh | null;
  extras: Mesh | null;
  water: Mesh | null;
  /** 小ブロックの段の材料（このセクションの「うまり」のテクスチャを持つ）と、うまりの中身（角の暗がり用。TEX-A） */
  voxMat: MeshBasicMaterial | null;
  aoTex: Data3DTexture | null;
  occ: Uint8Array | null;
  bytes: number;
  tris: number;
}

export interface ColState {
  readonly cx: number;
  readonly cz: number;
  readonly secs: SecState[];
  tier: Tier | null;
  dist: number;
  /** 遠くで使う かんたんメッシュ（LOD。列ごと 1 まい） */
  lodOpaque: Mesh | null;
  lodWater: Mesh | null;
  lodStale: boolean;
  /** LOD をやめて 箱・小ブロックにした直後: セクションができるまで LOD を見せておく */
  lodHold: boolean;
  /** この列の作り直し待ち（queue の列ごとの分。ストリーミングの仕事えらび用） */
  readonly work: Set<SecState>;
  /** 描く輪の中心から この列までのチェビシェフ距離（ストリーミングのとき） */
  ring: number;
  /** ring ≤ R_DRAW（ストリーミングのとき、作る対象） */
  inDraw: boolean;
  /** 自分と 8 つのとなりの光がそろっている（ストリーミングのとき、メッシュを作ってよい。S2） */
  meshable: boolean;
}
