import * as K from './sectionConsts';

// vitest の import は 読むたびに getter を通って 遅い。内側のループが読む定数は このファイルの const に写す（本番のビルドでは同じ）
const { FACE_VERTS } = K;

export interface VoxelPiece {
  /** セクションの中の小ブロック座標 */
  positions: Uint16Array;
  /** aData = [ブロックの種類, 地形の横の面の行の符号（255 = 世界の高さで決める）, 0, 面の番号] */
  data: Uint8Array;
  /** aLight = [空の光, ブロックの光]（0〜255。255 = 15 を 17 倍） */
  light: Uint8Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
}

/** 四角を貯める入れもの（大きくなったら 倍にひろげる） */
export class QuadBuilder {
  private cap = 8192;
  private pos = new Uint16Array(3 * this.cap);
  private dat = new Uint8Array(4 * this.cap);
  private lit = new Uint8Array(2 * this.cap);
  private idx = new Uint32Array((this.cap / 4) * 6);
  private nv = 0;
  private ni = 0;
  faces = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.faces = 0;
  }

  private grow(): void {
    this.cap *= 2;
    const p = new Uint16Array(3 * this.cap);
    p.set(this.pos);
    this.pos = p;
    const d = new Uint8Array(4 * this.cap);
    d.set(this.dat);
    this.dat = d;
    const l = new Uint8Array(2 * this.cap);
    l.set(this.lit);
    this.lit = l;
    const i = new Uint32Array((this.cap / 4) * 6);
    i.set(this.idx);
    this.idx = i;
  }

  /** 角ごとの光 lights = [空0, ブロック0, 空1, ブロック1, …]（4 つぶん）。lights が null なら 全部 (sky, blk) */
  quad(
    f: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    d0: number,
    d1: number,
    d2: number,
    flag: number,
    sky: number,
    blk: number,
    lights: ArrayLike<number> | null,
  ): void {
    if (this.nv + 4 > this.cap) this.grow();
    const verts = FACE_VERTS[f];
    let p = this.nv * 3;
    let d = this.nv * 4;
    let l = this.nv * 2;
    for (let i = 0; i < 4; i++) {
      const v = verts[i];
      this.pos[p++] = v[0] ? x1 : x0;
      this.pos[p++] = v[1] ? y1 : y0;
      this.pos[p++] = v[2] ? z1 : z0;
      this.dat[d++] = d0;
      this.dat[d++] = d1;
      // 角の印（x, y, z の どちら側か: ビット 0, 1, 2）。シェーダーが 面の中で ごく少し ひろげて 面どうしの つぎ目の 空の色を ふさぐ
      this.dat[d++] = v[0] | (v[1] << 1) | (v[2] << 2) | d2;
      this.dat[d++] = f | flag;
      if (lights) {
        this.lit[l++] = lights[i * 2];
        this.lit[l++] = lights[i * 2 + 1];
      } else {
        this.lit[l++] = sky;
        this.lit[l++] = blk;
      }
    }
    const base = this.nv;
    let q = this.ni;
    const idx = this.idx;
    idx[q++] = base;
    idx[q++] = base + 1;
    idx[q++] = base + 2;
    idx[q++] = base;
    idx[q++] = base + 2;
    idx[q++] = base + 3;
    this.nv += 4;
    this.ni = q;
    this.faces++;
  }

  finish(): VoxelPiece[] {
    if (this.nv === 0) return [];
    const idx = this.nv <= 65535 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return [
      {
        positions: this.pos.slice(0, this.nv * 3),
        data: this.dat.slice(0, this.nv * 4),
        light: this.lit.slice(0, this.nv * 2),
        indices: idx,
        vertexCount: this.nv,
      },
    ];
  }
}
