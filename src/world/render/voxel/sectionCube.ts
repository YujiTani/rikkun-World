import type { WorldLight } from '../../light/WorldLight';
import * as K from './sectionConsts';

// vitest の import は 読むたびに getter を通って 遅い。内側のループが読む定数は このファイルの const に写す（本番のビルドでは同じ）
const { BL, CUBE, DIR, OPAQUE_LIGHT } = K;

/** 読みこむ世界の側（ブロックの種類と、高さ。ArrayVoxelWorld の一部） */
interface CubeWorld {
  readonly size: { readonly y: number };
  getIndex(x: number, y: number, z: number): number;
}

/**
 * セクションのまわり 1 ブロックをふくむ 18³ のブロックの種類と光（SectionMesher の作業用。4-7）。
 * bk = 種類（読みこんでいない・世界の底の下 = -1、世界の上 = 空気）、lg = 光（空 << 4 | ブロック）、lsky・lblk = 空・ブロックの光。
 */
export class BlockCube {
  readonly bk = new Int16Array(CUBE);
  /** ブロックごとの光（空 << 4 | ブロック）。光を通さないマスは まわりの光を かりる */
  readonly lg = new Uint8Array(CUBE);
  readonly lsky = new Uint8Array(CUBE);
  readonly lblk = new Uint8Array(CUBE);
  ox = 0;
  oy = 0;
  oz = 0;

  constructor(
    private readonly world: CubeWorld,
    private readonly light?: Pick<WorldLight, 'packedAt'>,
  ) {}

  setOrigin(ox: number, oy: number, oz: number): void {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
  }

  /** まわり 1 ブロックをふくむ 18³ のブロックの種類（行 byi。読みこんでいない・世界の底の下 = -1、世界の上 = 空気）と、ブロックごとの光の 1 まわり目 */
  /** まわり 1 ブロックをふくむ 18³ のブロックの種類（行 byi。読みこんでいない・世界の底の下 = -1、世界の上 = 空気）と、ブロックごとの光の 1 まわり目 */
  readRow(byi: number): void {
    const w = this.world;
    const H = w.size.y;
    const bk = this.bk;
    const wy = this.oy + byi - 1;
    const row0 = byi * BL * BL;
    let i = row0;
    for (let bzi = 0; bzi < BL; bzi++) {
      const wz = this.oz + bzi - 1;
      for (let bxi = 0; bxi < BL; bxi++) {
        bk[i++] = wy >= H ? 0 : w.getIndex(this.ox + bxi - 1, wy, wz);
      }
    }
    const { lg, lsky, lblk, light } = this;
    if (!light) return;
    i = row0;
    for (let bzi = 0; bzi < BL; bzi++) {
      const wz = this.oz + bzi - 1;
      for (let bxi = 0; bxi < BL; bxi++, i++) {
        const k = bk[i];
        if (k < 0 || OPAQUE_LIGHT[k] === 1) {
          lsky[i] = 0;
          lblk[i] = 0;
          lg[i] = 0;
          continue;
        }
        const v = light.packedAt(this.ox + bxi - 1, wy, wz);
        lg[i] = v;
        lsky[i] = v >> 4;
        lblk[i] = v & 15;
      }
    }
  }

  /** 光なしは 空 15・ブロック 0 */
  lightNone(): void {
    this.lg.fill(0xf0);
    this.lsky.fill(15);
    this.lblk.fill(0);
  }

  /** 光を通さないマス（行 byi）: まわり 6 つのうち光のあるマスの 空・ブロックそれぞれの大きいほう（光の 1 まわり目が ぜんぶ終わってから） */
  lightRow2(byi: number): void {
    const { bk, lg, lsky, lblk } = this;
    let i = byi * BL * BL;
    for (let bzi = 0; bzi < BL; bzi++) {
      for (let bxi = 0; bxi < BL; bxi++, i++) {
        const k = bk[i];
        if (k >= 0 && OPAQUE_LIGHT[k] === 0) continue;
        let s = 0;
        let bl = 0;
        for (let f = 0; f < 6; f++) {
          const nx = bxi + DIR[f][0];
          const ny = byi + DIR[f][1];
          const nz = bzi + DIR[f][2];
          if (nx < 0 || ny < 0 || nz < 0 || nx >= BL || ny >= BL || nz >= BL) continue;
          const j = (ny * BL + nz) * BL + nx;
          const nk = bk[j];
          if (nk < 0 || OPAQUE_LIGHT[nk] === 1) continue;
          if (lsky[j] > s) s = lsky[j];
          if (lblk[j] > bl) bl = lblk[j];
        }
        lg[i] = (s << 4) | bl;
      }
    }
  }

  /** ブロックの種類 → となりの種類。18³ の外は 世界から読む */
  kindNear(bxi: number, byi: number, bzi: number, f: number): number {
    const nx = bxi + DIR[f][0];
    const ny = byi + DIR[f][1];
    const nz = bzi + DIR[f][2];
    if (nx >= 0 && ny >= 0 && nz >= 0 && nx < BL && ny < BL && nz < BL) return this.bk[(ny * BL + nz) * BL + nx];
    const wy = this.oy + ny - 1;
    if (wy >= this.world.size.y) return 0;
    return this.world.getIndex(this.ox + nx - 1, wy, this.oz + nz - 1);
  }

  /** 面の角の光（なめらかな平均）を out[0..1] に（0〜255 の バイト）。面の前のマスと、角のまわりの 3 マスのうち光を通すものの平均 */
  corner(bxi: number, byi: number, bzi: number, f: number, v: readonly [number, number, number], out: Uint8Array, o: number, dy = 0): void {
    const fx = bxi + DIR[f][0];
    const fy = byi + DIR[f][1] + dy;
    const fz = bzi + DIR[f][2];
    let ax = 0;
    let ay = 0;
    let az = 0;
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (DIR[f][0] !== 0) {
      ay = v[1] ? 1 : -1;
      bz = v[2] ? 1 : -1;
    } else if (DIR[f][1] !== 0) {
      ax = v[0] ? 1 : -1;
      bz = v[2] ? 1 : -1;
    } else {
      ax = v[0] ? 1 : -1;
      by = v[1] ? 1 : -1;
    }
    let s = 0;
    let bl = 0;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const x = fx + (k & 1 ? ax : 0) + (k & 2 ? bx : 0);
      const y = fy + (k & 1 ? ay : 0) + (k & 2 ? by : 0);
      const z = fz + (k & 1 ? az : 0) + (k & 2 ? bz : 0);
      if (x < 0 || y < 0 || z < 0 || x >= BL || y >= BL || z >= BL) continue;
      const j = (y * BL + z) * BL + x;
      const t = this.bk[j];
      if (t < 0 || OPAQUE_LIGHT[t] === 1) continue;
      s += this.lsky[j];
      bl += this.lblk[j];
      n++;
    }
    if (n === 0) {
      out[o] = 0;
      out[o + 1] = 0;
      return;
    }
    out[o] = Math.round((s / n) * 17);
    out[o + 1] = Math.round((bl / n) * 17);
  }
}
