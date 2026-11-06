import type { ColPos, RingSpec } from './ring';

/**
 * COOP-1 作業 2（#399）: 輪の 切りかえと 中心 2 つ（§5・AC27・AC28）。宣言だけ（実装は developer）。
 * テストは layout.test.ts（純粋な 部分）と ChunkStream.duo.test.ts（遊んでいる 最中の 切りかえ）。
 *
 * ---- つなぎ目の 約束 ----
 *   decideRings(prev, distance)       2 人の 距離（マス）から 輪の 数。1 のとき 48 より 遠い（> 48）で 2、2 のとき 32 より 近い（< 32）で 1。あいだは 今のまま。
 *   ringSpecFor(rings, base)          rings = 1 なら base（起動で 決めた 輪。decideRing の 結果。ふだん RING_FULL、E2E は RING_SMALL）、2 なら RING_SMALL。
 *   class RingLayout(centers, spec)   列 (cx,cz) が 描く・光・生成・残す・メッシュを 捨てる の どれに 入るかは 「どの 中心からでも いいので、いちばん 近い 中心との チェビシェフ距離」。
 *     dist(cx,cz) / inDraw / inLight / inGen / inKeep / shouldDropMesh   （dist > spec.drawDrop）
 *     keepColumns() = 残す 輪に 入る 列を 1 回ずつ。並びは 近い順（dist が 小さい 順。同じなら 最も 近い 中心との ユークリッド、cz、cx。compareNear と 同じ 決まり）
 *     genColumns()  = 生成する 輪に 入る 列を 1 回ずつ（同じ 並び）
 *   LAYOUT_MAX_COLUMNS = 595            持つ 列の 上限（1 人の 441 の 1.35 倍）
 *
 * ---- ChunkStream / StreamMesh に 足す 口 ----
 *   ChunkStream.setLayout(centers, spec)   遊んでいる 最中に 呼んでよい（restart も 要らない）。centers[0] = 1P（info().center）、centers[1] = 2P(あれば)。
 *     呼ぶと getRing() が spec に なる（ring.ts の setRing を 遊んでいる 最中でも 呼べるように する）。ChunkStream は R_* の 定数ではなく 今の 輪（spec）と centers で 決める。
 *     輪の 外に なった 列は 1 コマで ぜんぶ 捨てず、少しずつ 捨てる（仕事の 数の 中で。unload は 1 つが 1 仕事）。
 *     同じ 列を 2 回 読みこまない（列の 番号 colKey で 1 つの 集まり）。
 *   StreamMesh.setLayout?(centers, spec)   ChunkStream.setLayout が メッシュ側にも 伝える(setRing(pcx,pcz) と 同じ 役。描くか・捨てるかを 今の 輪で 決める)。
 */
export interface RingCenter {
  cx: number;
  cz: number;
}

export const LAYOUT_MAX_COLUMNS = 595;

export function decideRings(_prev: 1 | 2, _distance: number): 1 | 2 {
  throw new Error('COOP-1 作業 2: decideRings は まだ 実装されていない');
}

export function ringSpecFor(_rings: 1 | 2, _base: RingSpec): RingSpec {
  throw new Error('COOP-1 作業 2: ringSpecFor は まだ 実装されていない');
}

export class RingLayout {
  constructor(
    readonly centers: readonly RingCenter[],
    readonly spec: RingSpec,
  ) {
    throw new Error('COOP-1 作業 2: RingLayout は まだ 実装されていない');
  }
  dist(_cx: number, _cz: number): number {
    throw new Error('未実装');
  }
  inDraw(_cx: number, _cz: number): boolean {
    throw new Error('未実装');
  }
  inLight(_cx: number, _cz: number): boolean {
    throw new Error('未実装');
  }
  inGen(_cx: number, _cz: number): boolean {
    throw new Error('未実装');
  }
  inKeep(_cx: number, _cz: number): boolean {
    throw new Error('未実装');
  }
  shouldDropMesh(_cx: number, _cz: number): boolean {
    throw new Error('未実装');
  }
  keepColumns(): ColPos[] {
    throw new Error('未実装');
  }
  genColumns(): ColPos[] {
    throw new Error('未実装');
  }
}

/** ChunkStream に 足す 口(型だけ。テストは これで 呼ぶ。developer は ChunkStream 本体に 足す) */
export interface LayoutStream {
  setLayout(centers: readonly RingCenter[], spec: RingSpec): void;
}

/** StreamMesh に 足す 口(型だけ) */
export interface LayoutMesh {
  setLayout(centers: readonly RingCenter[], spec: RingSpec): void;
}
