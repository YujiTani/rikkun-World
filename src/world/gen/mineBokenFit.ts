import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import { SIX_KEY_DELTA, ShaftBuilder, airHeightOf, keyOf } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { Geo, Site } from './mineShaftSite';
import type { PathCell } from './mineShaftTypes';

/**
 * 1E の 坑道の 部品を 1 つずつ 足していく 入れもの（MINE-1E §4.2・§4.11）。
 * 部品〔道の 足の マスの 集まり〕が 今までの 道と ぶつからず、箱・区画・天井の 上の 石・古い 列の きまりに 合う ときだけ 足す。
 * 足すとき ring は 足した 分だけ 差分で 直す〔大きい 坑道でも 軽い〕。
 */

/** 部品を つなぐ 面〔新しい 部品の 最初の 列の 中心と 進む 向き。y は つなぐ 2 つの 床の 低いほう〕 */
interface Attach {
  x: number;
  z: number;
  dx: number;
  dz: number;
  y: number;
}

export interface Piece {
  cells: PathCell[];
  /** 置く ブロック〔たいまつなど。キー → ブロックの 番号〕 */
  puts?: readonly (readonly [number, number])[];
  /** かべに しない マス〔外へ ひらく 面〕 */
  exempt?: readonly number[];
  attach?: Attach;
}

/** 計画の 仕事の 数〔ためした 回数。`Shaft.work`〕 */
export interface Work {
  entrance: number;
  floors: number;
  sides: number;
  eda: number;
  maze: number;
}
export const newWork = (): Work => ({ entrance: 0, floors: 0, sides: 0, eda: 0, maze: 0 });

export interface FitEnv {
  G: Geo;
  site: Site;
  size: number;
  region: { x0: number; z0: number };
  /** 古い 列〔1E の 一覧〕か。なければ すべて 新しい */
  isBoken: ((k: number) => boolean) | null;
}

const OFFSET_COLS = [-2, 0, 2] as const;

export class Fit {
  readonly b = new ShaftBuilder();
  x0 = Infinity;
  x1 = -Infinity;
  z0 = Infinity;
  z1 = -Infinity;
  private readonly ground = new Map<number, number>();
  private readonly terrainOk = new Map<number, boolean>();
  private readonly bokenOk = new Map<number, boolean>();
  /** 道の 広がりの 上限（箱の ゆとり 2 マスずつ ＋ へやの 外わく 1 マスずつ を ひいた 数） */
  readonly maxExt: number;

  constructor(readonly env: FitEnv) {
    this.maxExt = env.size - 2 * S.boxMargin - 2;
    const m = env.site.mound;
    if (m) this.extend(m.x - m.tc, m.z - m.tc, m.x + m.tc, m.z + m.tc);
  }

  extend(x0: number, z0: number, x1: number, z1: number): void {
    this.x0 = Math.min(this.x0, x0);
    this.z0 = Math.min(this.z0, z0);
    this.x1 = Math.max(this.x1, x1);
    this.z1 = Math.max(this.z1, z1);
  }

  private groundAt(x: number, z: number): number {
    const k = x * 65536 + z;
    let h = this.ground.get(k);
    if (h === undefined) this.ground.set(k, (h = this.env.G.h(x, z)));
    return h;
  }

  /** 天井の 上の 石〔`coverOk` と 同じ きまり。地面の 高さを おぼえる〕 */
  private covered(c: PathCell): boolean {
    const { site } = this.env;
    const C = S.cover;
    if (Math.hypot(c.x - site.x, c.z - site.z) <= C.roofedWithin) return true;
    const ground = this.groundAt(c.x, c.z);
    return ground - (c.y + airHeightOf(c.part)) >= (ground <= SEA_Y - 1 ? C.sea : C.ground);
  }

  private terrainFine(x: number, z: number): boolean {
    const k = x * 65536 + z;
    let ok = this.terrainOk.get(k);
    if (ok === undefined) {
      const { G } = this.env;
      ok = !G.nearMouth(x, z, 2) && !G.special(x, z, 2);
      this.terrainOk.set(k, ok);
    }
    return ok;
  }

  /** 古い 列〔まわり 2 マス〕に かからないか */
  freshCol(x: number, z: number): boolean {
    const old = this.env.isBoken;
    if (!old) return true;
    const k = (x >> 1) * 1048576 + (z >> 1);
    let ok = this.bokenOk.get(k);
    if (ok === undefined) {
      ok = true;
      for (const dz of OFFSET_COLS) for (const dx of OFFSET_COLS) if (old(colKey((x + dx) >> 4, (z + dz) >> 4))) ok = false;
      this.bokenOk.set(k, ok);
    }
    return ok;
  }

  /** 箱・区画に おさまる か〔足す 前に しらべる〕 */
  private boxOk(cells: readonly PathCell[], extra?: { x0: number; z0: number; x1: number; z1: number }): boolean {
    let x0 = this.x0;
    let x1 = this.x1;
    let z0 = this.z0;
    let z1 = this.z1;
    for (const c of cells) {
      if (c.x < x0) x0 = c.x;
      if (c.x > x1) x1 = c.x;
      if (c.z < z0) z0 = c.z;
      if (c.z > z1) z1 = c.z;
    }
    if (extra) {
      x0 = Math.min(x0, extra.x0);
      z0 = Math.min(z0, extra.z0);
      x1 = Math.max(x1, extra.x1);
      z1 = Math.max(z1, extra.z1);
    }
    if (x1 - x0 + 1 > this.maxExt || z1 - z0 + 1 > this.maxExt) return false;
    const { region } = this.env;
    return x0 - 4 >= region.x0 && x1 + 4 < region.x0 + S.region && z0 - 4 >= region.z0 && z1 + 4 < region.z0 + S.region;
  }

  /** 坑道の へやの 箱〔まわり 1 マス〕を 足しても 箱・区画に おさまる か */
  roomFits(r: { x0: number; z0: number; x1: number; z1: number }): boolean {
    return this.boxOk([], { x0: r.x0 - 1, z0: r.z0 - 1, x1: r.x1 + 1, z1: r.z1 + 1 });
  }

  /** 部品が 入るか しらべる〔足さない〕 */
  check(p: Piece): boolean {
    if (!this.boxOk(p.cells)) return false;
    // 坑道の へやの 箱〔横穴の 先〕から 3 マス いじょう はなす
    for (const r of this.b.reserved) for (const c of p.cells) if (c.x >= r.x0 - 3 && c.x <= r.x1 + 3 && c.z >= r.z0 - 3 && c.z <= r.z1 + 3 && c.y >= r.y0 - 3 && c.y <= r.y1 + 3) return false;
    for (const c of p.cells) if (!this.terrainFine(c.x, c.z) || !this.covered(c) || !this.freshCol(c.x, c.z)) return false;
    const { b } = this;
    const air = new Set<number>();
    for (const c of p.cells) for (let h = airHeightOf(c.part) - 1; h >= 0; h--) air.add(keyOf(c.x, c.y + h, c.z));
    let door: Set<number> | null = null;
    let entry: Set<number> | null = null;
    const a = p.attach;
    if (a) {
      door = new Set();
      entry = new Set();
      const px = -a.dz;
      const pz = a.dx;
      for (let j = -1; j <= 1; j++) {
        for (let h = -1; h <= 4; h++) {
          door.add(keyOf(a.x + px * j, a.y + h, a.z + pz * j));
          entry.add(keyOf(a.x - a.dx + px * j, a.y + h, a.z - a.dz + pz * j));
        }
      }
    }
    for (const k of air) {
      if (b.air.has(k)) return false;
      if (b.ring.has(k) && !door?.has(k)) return false;
    }
    const skip = new Set(p.exempt);
    for (const c of p.cells) {
      const below = keyOf(c.x, c.y - 2, c.z);
      if (b.air.has(below) && !entry?.has(below)) return false;
    }
    for (const k of air) {
      for (let d = 0; d < 6; d++) {
        const n = k + SIX_KEY_DELTA[d]!;
        if (!air.has(n) && !skip.has(n) && b.air.has(n) && !entry?.has(n)) return false;
      }
    }
    return true;
  }

  /** 入るなら 足して true */
  add(p: Piece): boolean {
    if (!this.check(p)) return false;
    this.commit(p);
    return true;
  }

  /** しらべずに 足す〔`check` の あと〕 */
  commit(p: Piece): void {
    for (const c of p.cells) this.extend(c.x, c.z, c.x, c.z);
    this.b.addCellsInc(p.cells, p.exempt ?? []);
    if (p.puts) for (const [k, v] of p.puts) this.b.put.set(k, v);
  }
}

