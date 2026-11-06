import { DUO_TUNING } from '../../duo/tuning';
import { RING_SMALL, colKey, type ColPos, type RingSpec } from './ring';

/**
 * COOP-1 作業 2（#399）: 輪の 切りかえと 中心 2 つ（§5・AC27・AC28）。
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
 * ---- 〔PO の 決定〕ChunkStream / StreamMesh の 形 ----
 *   ChunkStream は「中心の 配列」を 持つ。setLayout(centers, spec) が 唯一の 入口。setCenter(cx, cz) は setLayout([{cx,cz}], 今の spec) と 同じ(1 人のときの 今の 呼び方を 残す)。
 *   2 人のときは 1P・2P の どちらかが 列を またぐたびに setLayout を 呼ぶ。
 *   mesh には mesh.setRing では なく StreamMesh.setLayout(centers, spec) を 伝える(1 中心の ときは 今の setRing と 同じ 動き)。
 *   developer へ: ChunkStream 内の cheb(.., this.cx, this.cz) と getRing() の 距離判定は RingLayout.dist / in* に 置きかえる。
 *   RING_SIZES / MAX（static）も layout(今の spec)から 出す。streamDriver の setRing(cx,cz) は setLayout の 1 中心の ばんに する。
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

export const LAYOUT_MAX_COLUMNS: number = DUO_TUNING.layoutMaxColumns;

/** 輪の 数（幅つき。§5）。1 のとき 48 より 遠くて 2、2 のとき 32 より 近くて 1 */
export function decideRings(prev: 1 | 2, distance: number): 1 | 2 {
  if (prev === 1) return distance > DUO_TUNING.ringsUpAt ? 2 : 1;
  return distance < DUO_TUNING.ringsDownAt ? 1 : 2;
}

/** 輪の 大きさ。1 つは 起動で 決めた 輪、2 つは 小さい 輪 */
export function ringSpecFor(rings: 1 | 2, base: RingSpec): RingSpec {
  return rings === 1 ? base : RING_SMALL;
}

const cheb = (cx: number, cz: number, c: RingCenter): number => Math.max(Math.abs(cx - c.cx), Math.abs(cz - c.cz));

/** 近い 中心との ユークリッド距離の 2 乗（同じ チェビシェフ距離の 並び用） */
function nearestEuclid(centers: readonly RingCenter[], cx: number, cz: number): number {
  let best = Infinity;
  for (const c of centers) {
    const e = (cx - c.cx) ** 2 + (cz - c.cz) ** 2;
    if (e < best) best = e;
  }
  return best;
}

export class RingLayout {
  constructor(
    readonly centers: readonly RingCenter[],
    readonly spec: RingSpec,
  ) {}

  /** どの 中心からでも いい、いちばん 近い 中心との チェビシェフ距離 */
  dist(cx: number, cz: number): number {
    let best = Infinity;
    for (const c of this.centers) {
      const d = cheb(cx, cz, c);
      if (d < best) best = d;
    }
    return best;
  }
  inDraw(cx: number, cz: number): boolean {
    return this.dist(cx, cz) <= this.spec.draw;
  }
  inLight(cx: number, cz: number): boolean {
    return this.dist(cx, cz) <= this.spec.light;
  }
  inGen(cx: number, cz: number): boolean {
    return this.dist(cx, cz) <= this.spec.gen;
  }
  inKeep(cx: number, cz: number): boolean {
    return this.dist(cx, cz) <= this.spec.keep;
  }
  shouldDropMesh(cx: number, cz: number): boolean {
    return this.dist(cx, cz) > this.spec.drawDrop;
  }
  /** 残す 輪に 入る 列を 1 回ずつ。近い順 */
  keepColumns(): ColPos[] {
    return this.columnsWithin(this.spec.keep);
  }
  /** 生成する 輪に 入る 列を 1 回ずつ。近い順 */
  genColumns(): ColPos[] {
    return this.columnsWithin(this.spec.gen);
  }

  private columnsWithin(r: number): ColPos[] {
    const seen = new Set<number>();
    const out: Array<ColPos & { d: number; e: number }> = [];
    for (const c of this.centers) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = c.cx + dx;
          const cz = c.cz + dz;
          const k = colKey(cx, cz);
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ cx, cz, d: this.dist(cx, cz), e: nearestEuclid(this.centers, cx, cz) });
        }
      }
    }
    out.sort((a, b) => a.d - b.d || a.e - b.e || a.cz - b.cz || a.cx - b.cx);
    return out.map((o) => ({ cx: o.cx, cz: o.cz }));
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
