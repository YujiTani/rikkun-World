import * as THREE from 'three';
import type { RepairAtlas } from './repairAtlas';

/**
 * 竹の 足場・るすの ふだの 箱を 1 つの ジオメトリに まとめる（全部 1 描画）。箱は 1/16 ブロックの 点で 受けとる。
 * 絵の はり方（設計 repair-final.md）: `T:` ＝ たての 竹（ふしが 高さの 向き）、`R:` ＝ 横に のびる 竹（ふしが 長さの 向き。絵を 90° 回して はる）、
 * `N:` ＝ のぼりの 布（大きい 面に 12×36 の 絵を 1 まい）、`F:` ＝ ふだの 前の 面だけ 絵（ほかの 面は 板の 色）、`S:` ＝ 色だけ。
 * 絵は 16 点 ごとに くりかえす（まとめ絵は くりかえし できない ため 16 点ごとの 四角に 分ける）。
 */
type V3 = [number, number, number];

export interface BoxTex {
  /** 'T' 'R' 'N' 'F' 'S' */
  kind: string;
  /** 絵の 名前（まとめ絵の 中の） */
  name: string;
  /** 'F' の ほかの 面・'N' の ふち に つかう 色の 絵 */
  edge?: string;
}

const SHADE = { top: 1, bottom: 0.5, z: 0.8, x: 0.6 };
const TILE = 16;

export class BoxBuf {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly col: number[] = [];
  readonly idx: number[] = [];
  private readonly t = { u: 0, v: 0 };
  /** 箱の 数（上限の しらべ用） */
  boxes = 0;

  constructor(private readonly atlas: RepairAtlas) {}

  /** 軸に そろった 箱（x0 y0 z0 x1 y1 z1 は 点。原点 o（ブロック）から の ずれ） */
  box(o: V3, b: readonly [number, number, number, number, number, number], tex: BoxTex): void {
    const s = 1 / 16;
    const base: V3 = [o[0] + b[0] * s, o[1] + b[1] * s, o[2] + b[2] * s];
    const la = (b[3] - b[0]) * s;
    const lb = (b[4] - b[1]) * s;
    const lc = (b[5] - b[2]) * s;
    this.oriented(base, [la, 0, 0], [0, lb, 0], [0, 0, lc], tex);
  }

  /** ななめの 箱: from → to を 軸に した 太さ thick の 箱（面内の 向きは 面の きまった 方） */
  brace(o: V3, from: V3, to: V3, thick: number, tex: BoxTex): void {
    const s = 1 / 16;
    const a: V3 = [from[0] * s, from[1] * s, from[2] * s];
    const c: V3 = [to[0] * s, to[1] * s, to[2] * s];
    const axis: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const len = Math.hypot(...axis);
    const e0: V3 = [axis[0] / len, axis[1] / len, axis[2] / len];
    // 面は x = 一定 か z = 一定。その 面の 法線を B に する
    const flatZ = Math.abs(axis[2]) < 1e-6;
    const nrm: V3 = flatZ ? [0, 0, 1] : [1, 0, 0];
    const th = thick * s;
    // A = e0、C = nrm、B = C × A（右手の 系: A × B = C）
    const A: V3 = [e0[0] * len, e0[1] * len, e0[2] * len];
    const Bv: V3 = cross(nrm, e0);
    const B: V3 = [Bv[0] * th, Bv[1] * th, Bv[2] * th];
    const C: V3 = [nrm[0] * th, nrm[1] * th, nrm[2] * th];
    const mid: V3 = [o[0] + a[0] - (B[0] + C[0]) / 2, o[1] + a[1] - (B[1] + C[1]) / 2, o[2] + a[2] - (B[2] + C[2]) / 2];
    this.oriented(mid, A, B, C, tex);
  }

  /** 右手の 系の 3 辺 A・B・C（A × B = C）で できた 箱。C の 負の 向きが 「前」（−z） */
  private oriented(base: V3, A: V3, B: V3, C: V3, tex: BoxTex): void {
    this.boxes++;
    const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
    const neg = (p: V3): V3 => [-p[0], -p[1], -p[2]];
    // 横に のびる 竹は 一番 長い 辺の 向きに ふしが ならぶ。そうでなければ 高さの 向き
    const run = tex.kind === 'R' ? longest(A, B, C) : ([0, 1, 0] as V3);
    // 面ごとに（原点・u・v・明るさ）。u × v が 外向き
    const faces: [V3, V3, V3, number][] = [
      [add(base, C), A, B, SHADE.z], // +C
      [add(base, B), A, neg(B), SHADE.z], // −C（前。A × (−B) = −C）
      [add(base, A), B, C, SHADE.x], // +A
      [add(base, C), B, neg(C), SHADE.x], // −A
      [add(base, B), C, A, SHADE.top], // +B
      [base, A, C, SHADE.bottom], // −B
    ];
    faces.forEach(([o, u, v, shade], i) => {
      // ふだ（F）: 前の 面だけ 絵、ほかは 色。のぼりの 布（N）の ふち・ふだの ふちは edge の 色
      const t: BoxTex = tex.kind === 'F' && i !== 1 ? { kind: 'S', name: tex.edge ?? tex.name } : tex.kind === 'N' && i > 1 ? { kind: 'S', name: tex.edge ?? tex.name } : tex;
      this.face(o, u, v, shade, t, run, i === 1);
    });
  }

  private face(o: V3, u: V3, v: V3, shade: number, tex: BoxTex, run: V3, flipU: boolean): void {
    const lu = Math.hypot(...u) * 16;
    const lv = Math.hypot(...v) * 16;
    if (lu < 1e-6 || lv < 1e-6) return;
    const n = cross(u, v);
    const nl = Math.hypot(...n);
    n[0] /= nl;
    n[1] /= nl;
    n[2] /= nl;
    const sz = this.atlas.size(tex.name);
    const whole = tex.kind === 'N' || tex.kind === 'F';
    // 絵の たて（ふしの ならび）が u の 辺に そう か v の 辺に そう か
    const runIsU = Math.abs(dot(u, run)) / (lu / 16) > Math.abs(dot(v, run)) / (lv / 16);
    const runVec = runIsU ? u : v;
    const cu = whole ? lu : TILE;
    const cv = whole ? lv : TILE;
    const nu = Math.max(1, Math.ceil(lu / cu - 1e-6));
    const nv = Math.max(1, Math.ceil(lv / cv - 1e-6));
    for (let i = 0; i < nu; i++) {
      const u0 = (i * cu) / lu;
      const u1 = Math.min(1, ((i + 1) * cu) / lu);
      for (let j = 0; j < nv; j++) {
        const v0 = (j * cv) / lv;
        const v1 = Math.min(1, ((j + 1) * cv) / lv);
        const ps = (u1 - u0) * lu; // この 四角の 点の 数
        const pt = (v1 - v0) * lv;
        const base = this.pos.length / 3;
        for (const [s, t] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const) {
          this.pos.push(o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t);
          this.nor.push(n[0], n[1], n[2]);
          this.col.push(shade, shade, shade);
          const fs = u1 > u0 ? (s - u0) / (u1 - u0) : 0;
          const ft = v1 > v0 ? (t - v0) / (v1 - v0) : 0;
          let px: number;
          let py: number;
          if (tex.kind === 'S') {
            px = sz.w / 2;
            py = sz.h / 2;
          } else if (whole) {
            px = (flipU ? 1 - fs : fs) * sz.w;
            py = (v[1] >= 0 ? 1 - ft : ft) * sz.h; // 絵の 上が 上
          } else {
            const runLen = runIsU ? ps : pt;
            const acrossLen = runIsU ? pt : ps;
            const fRun = runIsU ? fs : ft;
            const fAcross = runIsU ? ft : fs;
            px = fAcross * acrossLen;
            py = runVec[1] > 1e-6 ? TILE - fRun * runLen : fRun * runLen; // 上へ のびる 向きは 絵の 上（下が 地面がわ）
          }
          this.atlas.uv(tex.name, Math.min(px, sz.w), Math.min(py, sz.h), this.t);
          this.uv.push(this.t.u, this.t.v);
        }
        this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }

  triangles(): number {
    return this.idx.length / 3;
  }
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 3 辺の うち いちばん 長い 辺の 向き（単位ベクトル） */
function longest(A: V3, B: V3, C: V3): V3 {
  let best = A;
  for (const e of [B, C]) if (Math.hypot(...e) > Math.hypot(...best)) best = e;
  const l = Math.hypot(...best);
  return [best[0] / l, best[1] / l, best[2] / l];
}
