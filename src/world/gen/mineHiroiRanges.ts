import { hiroiTable } from './mineHiroiTable';

/**
 * ひろい ほらあな B の 列ごとの 空気の はんい（下 lo ・上 hi。段）と、天井の とがりを ならす 処理
 * （docs/design/MINE-1.md §4.7.2 の B の きまり 2・3・4）。部屋の 中の 座標。世界には さわらない。
 */

export interface HiroiPillar {
  /** 中心の マス */
  x: number;
  z: number;
  /** 中心の 列の 天井の 高さ（床から。段） */
  ceil: number;
  /** 0 段目から ceil − 1 段目 までの 段ごとの はば（ceil こ。すそ・まん中・かんむり） */
  widths: number[];
}
export interface HiroiKnob {
  /** 中心（マスの かどの 座標。2×2 の 底が できる ように 整数） */
  x: number;
  z: number;
  /** はばの 半分（マス） */
  r: number;
  /** さがる 量（段） */
  drop: number;
}

/** 円（中心 (px, pz) の マス・はば w）の 中か。中心から の きょり ＜ はば ÷ 2 */
export function inDisc(x: number, z: number, px: number, pz: number, w: number): boolean {
  return Math.hypot(x - px, z - pz) < w / 2;
}

/** こぶが (x, z) で さがる 量（段。四捨五入） */
export function knobDropAt(k: HiroiKnob, x: number, z: number): number {
  const dd = Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z);
  return dd >= k.r ? 0 : Math.round(k.drop * Math.sqrt(1 - (dd / k.r) ** 2));
}

interface RangeInput {
  size: { x: number; z: number; h: number };
  ceil: Int8Array;
  pillars: HiroiPillar[];
  knobs: HiroiKnob[];
}

/** 列ごとの 空気の はんい。たまごの 天井 − こぶ ＝ 上・柱の 円の 中は 固い（かんむりの 段から 上は ぜんぶ）・床の こぶで 下が 1 上がる。空気が 無い 列は lo ＝ hi */
export function hiroiRanges(plan: RangeInput, bumps: { x: number; z: number }[]): { lo: Int8Array; hi: Int8Array } {
  const { x: sx, z: sz, h } = plan.size;
  const T = hiroiTable().pillar;
  const lo = new Int8Array(sx * sz);
  const hi = new Int8Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const c = plan.ceil[z * sx + x]!;
      if (c === 0) continue;
      let t = c;
      for (const kn of plan.knobs) t = Math.min(t, c - knobDropAt(kn, x, z));
      hi[z * sx + x] = t;
    }
  }
  for (const b of bumps) lo[b.z * sx + b.x] = 1;
  // 柱: 段ごとの まる。かんむりの まるの 中は、その 段から 上を ぜんぶ 固く する
  const solid = new Map<number, Uint8Array>();
  for (const p of plan.pillars) {
    const r = Math.ceil(p.widths[0]! / 2);
    for (let z = p.z - r; z <= p.z + r; z++) {
      for (let x = p.x - r; x <= p.x + r; x++) {
        if (x < 0 || z < 0 || x >= sx || z >= sz) continue;
        for (let k = 0; k < h; k++) {
          const w = k < p.ceil ? p.widths[k]! : p.widths[p.ceil - 1]!;
          if (!inDisc(x, z, p.x, p.z, w)) continue;
          let col = solid.get(z * sx + x);
          if (!col) solid.set(z * sx + x, (col = new Uint8Array(h)));
          if (k < p.ceil - T.crown.length) col[k] = 1;
          else col.fill(1, k);
        }
      }
    }
  }
  for (const [i, col] of solid) {
    let k = lo[i]!;
    const top = hi[i]!;
    while (k < top && col[k]) k++;
    if (k >= top) {
      lo[i] = 0;
      hi[i] = 0;
      continue;
    }
    let e = k;
    while (e < top && !col[e]) e++;
    lo[i] = k;
    hi[i] = e;
  }
  return { lo, hi };
}

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 天井の 1 マスの とがり（4 方向の となりが ぜんぶ 空気の 列で、どれも 自分より 高い）を 1 段 上げて ならす。なくなる まで。
 * 柱の 列（どれかの 柱の かんむりの いちばん 大きい まるの 中）は 見る マスから のぞく。1 マス ならす ごとに spend(1) を よぶ。false が 返ったら 回数が 上の 限りに とどいた
 */
export function smoothTips(sx: number, sz: number, lo: Int8Array, hi: Int8Array, pillars: HiroiPillar[], spend: (n: number) => boolean): boolean {
  const T = hiroiTable().pillar;
  const crownMax = T.crown[T.crown.length - 1]!;
  const skip = new Uint8Array(sx * sz);
  for (const p of pillars) {
    const r = Math.ceil(crownMax / 2);
    for (let z = p.z - r; z <= p.z + r; z++) for (let x = p.x - r; x <= p.x + r; x++) if (x >= 0 && z >= 0 && x < sx && z < sz && inDisc(x, z, p.x, p.z, crownMax)) skip[z * sx + x] = 1;
  }
  const air = (x: number, z: number): boolean => x >= 0 && z >= 0 && x < sx && z < sz && hi[z * sx + x]! > lo[z * sx + x]!;
  for (let changed = true; changed; ) {
    changed = false;
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = z * sx + x;
        if (skip[i] || !air(x, z)) continue;
        const v = hi[i]!;
        if (!FOUR.every(([dx, dz]) => air(x + dx, z + dz) && hi[(z + dz) * sx + x + dx]! > v)) continue;
        if (!spend(1)) return false;
        hi[i] = v + 1;
        changed = true;
      }
    }
  }
  return true;
}
