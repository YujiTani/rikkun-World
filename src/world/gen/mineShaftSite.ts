import { SEA_Y } from '../../contracts';
import { caveAirFor, type CaveAir } from './mineCaveAir';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { DV } from './mineShaftBuild';
import { inMouthFootprint, mouthsNear, roomFloor, type Mouth } from './mouths';
import { createRng, hash01, hashInts, subSeed, type Rng } from './random';
import { terrainFor, type Terrain } from './terrain';

/**
 * 坑道の 入口を おく 場所（MINE-1C。docs/design/MINE-1.md §4.5.1）。区画の 抽選、斜面の 入口、小さな いしの 山、はじまりの 坑道。
 * 地形の 高さと ほらあなの 空気だけで 決める（列は 作らない）。同じ シード・同じ 区画なら いつも 同じ。
 */

export type Dir = 0 | 1 | 2 | 3;
export interface Site {
  kind: 'slope' | 'mound';
  dir: Dir;
  /** 入口の 足の マス（x, z）と 高さ y */
  x: number;
  y: number;
  z: number;
  /** 山: 中心と 高さ Tc（てっぺんが 地面より Tc 高い）。斜面は null */
  mound: { x: number; z: number; tc: number } | null;
}

/** 地形の 高さ・ほらあな・洞くつの 口を おぼえて 答える 入れもの（seed ごとに 1 つ） */
export class Geo {
  readonly T: Terrain;
  readonly cave: CaveAir;
  private readonly mouths = new Map<number, Mouth[]>();
  constructor(readonly seed: number) {
    this.T = terrainFor(seed);
    this.cave = caveAirFor(this.T);
  }
  h(x: number, z: number): number {
    return this.cave.height(x, z);
  }
  /** (x, z) の まわり margin マスに 洞くつの 口の 外わくが かかるか */
  nearMouth(x: number, z: number, margin: number): boolean {
    const cx = x >> 4;
    const cz = z >> 4;
    const k = (cx + 4096) * 8192 + (cz + 4096);
    let list = this.mouths.get(k);
    if (!list) {
      if (this.mouths.size > 4000) this.mouths.clear();
      list = mouthsNear(this.T, cx, cz);
      this.mouths.set(k, list);
    }
    for (const m of list) if (inMouthFootprint(m, x, z, margin)) return true;
    return false;
  }
  /** (x, z) の まわり margin マスに かかる 洞くつの 口の いちばん 低い 空気の y（なければ null） */
  mouthBottom(x: number, z: number, margin: number): number | null {
    const cx = x >> 4;
    const cz = z >> 4;
    const k = (cx + 4096) * 8192 + (cz + 4096);
    let list = this.mouths.get(k);
    if (!list) {
      if (this.mouths.size > 4000) this.mouths.clear();
      list = mouthsNear(this.T, cx, cz);
      this.mouths.set(k, list);
    }
    let low: number | null = null;
    for (const m of list) if (inMouthFootprint(m, x, z, margin)) low = Math.min(low ?? Infinity, roomFloor(m.h0));
    return low;
  }
  /** (x, z) に いけ・溶岩の いけ・はじまりの 岩山が かかるか */
  special(x: number, z: number, margin = 0): boolean {
    return this.T.map.pondAt(x, z) !== null || this.T.liquid.pondAt(x, z) !== null || this.T.inRock(x, z, margin);
  }
}

const geos = new Map<number, Geo>();
export function geoFor(seed: number): Geo {
  let g = geos.get(seed);
  if (!g) {
    if (geos.size > 6) geos.clear();
    g = new Geo(seed);
    geos.set(seed, g);
  }
  return g;
}

/** 道の 足の マス 1 つの 天井の 上に、地面まで cover.ground・海の 下は 海の 底まで cover.sea 以上 石が あるか（入口から roofedWithin マスは ゆるす。§4.5.3 の 6）。airH は 空気の 高さ */
export function coverOk(G: Geo, site: { x: number; z: number }, c: { x: number; y: number; z: number }, airH: number): boolean {
  const C = S.cover;
  if (Math.hypot(c.x - site.x, c.z - site.z) <= C.roofedWithin) return true;
  const ground = G.h(c.x, c.z);
  return ground - (c.y + airH) >= (ground <= SEA_Y - 1 ? C.sea : C.ground);
}

export const regionOf = (v: number): number => Math.floor(v / S.region);

/** 区画の 抽選（当たりか） */
export function regionHit(seed: number, rx: number, rz: number): boolean {
  return hash01(subSeed(seed, 801), rx, rz) < S.hitChance;
}

/** 区画の 陸の わりあい（0〜1。8×8 の 点で はかる） */
export function regionLand(G: Geo, rx: number, rz: number): number {
  const n = S.landSamples;
  let land = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = rx * S.region + Math.floor(((i + 0.5) * S.region) / n);
      const z = rz * S.region + Math.floor(((j + 0.5) * S.region) / n);
      if (G.h(x, z) > SEA_Y) land++;
    }
  }
  return land / (n * n);
}

function regionRng(seed: number, rx: number, rz: number, tag: number): Rng {
  return createRng(hashInts(subSeed(seed, 802), rx, rz, tag));
}

// ------------------------------------------------------------------ 入口の 場所

/** 入口の まわり ledgeRadius マスに 4 以上 落ちる ふちが ない（高さの となりあう 差が ledgeDrop 未満） */
function noLedge(G: Geo, cx: number, cz: number, radius: number): boolean {
  const lim = S.entrance.ledgeDrop;
  for (let z = cz - radius; z <= cz + radius; z++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const h = G.h(x, z);
      if (Math.abs(h - G.h(x + 1, z)) >= lim || Math.abs(h - G.h(x, z + 1)) >= lim) return false;
    }
  }
  return true;
}

/** 山を おく 15×15 が 平ら（高さの ちがい flatDiff まで）か。山の 高さ tc を 返す（5〜7 に なる ものが なければ null） */
function moundHeight(G: Geo, mx: number, mz: number): number | null {
  const M = S.mound;
  const hc = G.h(mx, mz);
  let lo = hc;
  let hi = hc;
  for (let z = mz - M.flatRadius; z <= mz + M.flatRadius; z++) {
    for (let x = mx - M.flatRadius; x <= mx + M.flatRadius; x++) {
      const h = G.h(x, z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  if (hi - lo > M.flatDiff || lo <= SEA_Y + 1) return null;
  for (let tc = M.heightMin; tc <= M.heightMax; tc++) {
    const far = tc - 0.5 + 3;
    const probes = [
      G.h(Math.round(mx + far), mz),
      G.h(Math.round(mx - far), mz),
      G.h(mx, Math.round(mz + far)),
      G.h(mx, Math.round(mz - far)),
    ];
    const top = hc + tc - Math.max(...probes);
    if (top >= M.heightMin && top <= M.heightMax) return tc;
  }
  return null;
}

const inRange = (y: number): boolean => y >= S.entrance.minY && y <= S.entrance.maxY;

/** 斜面の 入口 1 つを ためす（できたら Site）。x・z は 入口の 足の マス */
function trySlope(G: Geo, x: number, z: number, dir: Dir): Site | null {
  const E = S.entrance;
  const h = G.h(x, z);
  const ey = h + 1;
  if (!inRange(ey) || G.special(x, z, E.ledgeRadius + 1) || G.nearMouth(x, z, E.ledgeRadius + 1)) return null; // 入口の まわり 8 マスに いけ・滝・洞くつの 口を ふくめない〔その ふちで 落ちない ため〕
  const v = DV[dir]!;
  if (G.h(x - v[0] * E.inland, z - v[1] * E.inland) - h < E.rise) return null;
  if (!noLedge(G, x, z, E.ledgeRadius)) return null;
  return { kind: 'slope', dir, x, y: ey, z, mound: null };
}

/** 小さな いしの 山の 入口 1 つ。dir は 入口の 向き（外へ ひらく）。ex・ez は 入口の マス */
function tryMound(G: Geo, ex: number, ez: number, dir: Dir): Site | null {
  const M = S.mound;
  const v = DV[dir]!;
  if (!inRange(G.h(ex, ez) + 1)) return null;
  for (const tc of [5, 6, 7]) {
    const mx = ex - v[0] * tc;
    const mz = ez - v[1] * tc;
    if (moundHeight(G, mx, mz) !== tc) continue;
    const ey = G.h(ex, ez) + 1;
    if (!inRange(ey)) continue;
    const r = tc + M.clear + 2;
    let bad = false;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]] as const) {
      if (G.special(mx + dx, mz + dz, 2) || G.nearMouth(mx + dx, mz + dz, 3)) bad = true;
    }
    if (bad) continue;
    if (!noLedge(G, mx, mz, tc + 8)) continue;
    return { kind: 'mound', dir, x: ex, y: ey, z: ez, mound: { x: mx, z: mz, tc } };
  }
  return null;
}

/** 区画 (rx, rz) の 入口の 候補を 順に 出す（斜面 slopeTries 回 → 山 moundTries 回）。siteChunk 回ごとに null〔ひと休み の 合図〕を 出す */
export function* regionSites(G: Geo, rx: number, rz: number): Generator<Site | null> {
  const rng = regionRng(G.seed, rx, rz, 1);
  const m = S.edgeMargin;
  const span = S.region - 2 * m;
  const E = S.entrance;
  for (let i = 0; i < E.slopeTries; i++) {
    if (i % S.plan.siteChunk === 0) yield null;
    const x = rx * S.region + m + Math.floor(rng() * span);
    const z = rz * S.region + m + Math.floor(rng() * span);
    const d0 = Math.floor(rng() * 4);
    for (let k = 0; k < 4; k++) {
      const s = trySlope(G, x, z, ((d0 + k) % 4) as Dir);
      if (s) yield s;
    }
  }
  for (let i = 0; i < E.moundTries; i++) {
    if (i % S.plan.siteChunk === 0) yield null;
    const x = rx * S.region + m + Math.floor(rng() * span);
    const z = rz * S.region + m + Math.floor(rng() * span);
    const s = tryMound(G, x, z, Math.floor(rng() * 4) as Dir);
    if (s) yield s;
  }
}

/** スタートの ほうを 向く 向き（はじまりの 坑道の 入口の 向き） */
function dirToSpawn(sp: { x: number; z: number }, ex: number, ez: number): Dir {
  let best: Dir = 0;
  let bestDot = -Infinity;
  for (let k = 0; k < 4; k++) {
    const dot = DV[k]![0] * (sp.x - ex) + DV[k]![1] * (sp.z - ez);
    if (dot > bestDot) {
      bestDot = dot;
      best = k as Dir;
    }
  }
  return best;
}

/** meta に 書いて あった 入口 (x, z) から 入口の 場所を 作りなおす（さがしなおさない） */
export function startSiteAt(G: Geo, x: number, z: number): Site | null {
  return tryMound(G, x, z, dirToSpawn(G.T.spawn(), x, z));
}

/** はじまりの 坑道の 入口の 候補: スタートから 24〜48（置けない ときは 48〜96・96〜160・さらに 1280 まで ひろげる）。北の 左右 60 度を 先に */
export function* startSites(G: Geo): Generator<Site> {
  const sp = G.T.spawn();
  const rng = createRng(hashInts(subSeed(G.seed, 803), 1, 2));
  for (const [a, b] of S.start.ranges) {
    for (const north of [true, false]) {
      for (let i = 0; i < S.start.tries; i++) {
        const ang = north ? ((rng() * 2 - 1) * S.start.northHalfAngle * Math.PI) / 180 : rng() * Math.PI * 2;
        const dist = a + rng() * (b - a);
        // 北 ＝ z−。角度 0 が 北
        const ex = sp.x + Math.round(Math.sin(ang) * dist);
        const ez = sp.z - Math.round(Math.cos(ang) * dist);
        const d = Math.hypot(ex - sp.x, ez - sp.z);
        if (d < a || d > b) continue;
        const best = dirToSpawn(sp, ex, ez);
        const s = tryMound(G, ex, ez, best);
        if (s) yield s;
      }
    }
  }
}
