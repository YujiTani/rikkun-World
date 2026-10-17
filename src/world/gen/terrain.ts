import { SEA_Y } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { hash01, subSeed, valueNoise } from './random';

/**
 * 地形の「高さだけ」の計算（VOX-B。ブロックは作らない）。タスク票 H1〜H9・B1〜B5・P1〜P6。
 * すべて (seed, x, z) だけで決まる純粋な計算。作る順・ほかの列に関係しない。
 */

export type BiomeKind = 'grassland' | 'forest';

export interface BiomeSample {
  /** いちばん近い点のバイオーム */
  kind: BiomeKind;
  /** 森の重み 0〜1（境目で 0〜1 のあいだ。MICRO_PARAMS・丘・木の割合をまぜる） */
  forest: number;
  /** いちばん近い点の しめり・でこぼこ（0〜1。でこぼこは VOX-I 用） */
  moist: number;
  bumpy: number;
}

export interface BiomeCell {
  px: number;
  pz: number;
  kind: BiomeKind;
  moist: number;
  bumpy: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 値ノイズ（0〜1）の分布を 0〜1 の一様な順位にならす表（崖の割合を「面積の割合」にするため） */
let rankTable: Float32Array | null = null;
function noiseRank(v: number): number {
  if (rankTable === null) {
    const n = 16384;
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = valueNoise(777, (i % 128) * 61.3, Math.floor(i / 128) * 57.7, 96);
    t.sort();
    rankTable = t;
  }
  const t = rankTable;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo / t.length;
}

/** バイオームの升目（点・種類） */
class BiomeMap {
  private readonly cells = new Map<number, BiomeCell>();
  private readonly sPoint: number;
  private readonly sMoist: number;
  private readonly sBump: number;
  private readonly sStart: number;
  private startKinds: Map<number, BiomeKind> | null = null;

  constructor(seed: number) {
    this.sPoint = subSeed(seed, 101);
    this.sMoist = subSeed(seed, 102);
    this.sBump = subSeed(seed, 103);
    this.sStart = subSeed(seed, 104);
  }

  private rawCell(i: number, j: number): BiomeCell {
    const B = C.biome;
    const px = C.anchor.x + B.cell * i + B.pointMin + Math.floor(hash01(this.sPoint, i, j, 1) * B.pointSpan);
    const pz = C.anchor.z + B.cell * j + B.pointMin + Math.floor(hash01(this.sPoint, i, j, 2) * B.pointSpan);
    const moist = valueNoise(this.sMoist, px, pz, B.noiseScale);
    const bumpy = valueNoise(this.sBump, px, pz, B.noiseScale);
    return { px, pz, kind: moist >= B.forestMoist ? 'forest' : 'grassland', moist, bumpy };
  }

  /** B4: (64,64) を角にもつ 4 つの升目。いちばん近い点 = 草原、のこり 3 つのうち 1 つ = 森 */
  private startOverride(): Map<number, BiomeKind> {
    if (this.startKinds) return this.startKinds;
    const four: [number, number][] = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
    let best = 0;
    let bestD = Infinity;
    four.forEach(([i, j], k) => {
      const c = this.rawCell(i, j);
      const d = Math.hypot(c.px - C.anchor.x, c.pz - C.anchor.z);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    const others = four.map((_, k) => k).filter((k) => k !== best);
    const forestK = others[Math.floor(hash01(this.sStart, 0, 0, 1) * 3)]!;
    const m = new Map<number, BiomeKind>();
    m.set(cellKey(four[best]![0], four[best]![1]), 'grassland');
    m.set(cellKey(four[forestK]![0], four[forestK]![1]), 'forest');
    this.startKinds = m;
    return m;
  }

  cell(i: number, j: number): BiomeCell {
    const key = cellKey(i, j);
    let c = this.cells.get(key);
    if (c === undefined) {
      c = this.rawCell(i, j);
      if (i >= -1 && i <= 0 && j >= -1 && j <= 0) {
        const o = this.startOverride().get(key);
        if (o !== undefined) c.kind = o;
      }
      this.cells.set(key, c);
    }
    return c;
  }

  sample(x: number, z: number, out: BiomeSample): BiomeSample {
    const B = C.biome;
    const i0 = Math.floor((x - C.anchor.x) / B.cell);
    const j0 = Math.floor((z - C.anchor.z) / B.cell);
    let c1: BiomeCell | null = null;
    let c2: BiomeCell | null = null;
    let d1 = Infinity;
    let d2 = Infinity;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const c = this.cell(i, j);
        const d = Math.hypot(c.px - x, c.pz - z);
        if (d < d1) {
          c2 = c1;
          d2 = d1;
          c1 = c;
          d1 = d;
        } else if (d < d2) {
          c2 = c;
          d2 = d;
        }
      }
    }
    const u = clamp((d2 - d1) / B.blend, 0, 1);
    const f1 = c1!.kind === 'forest' ? 1 : 0;
    const f2 = c2!.kind === 'forest' ? 1 : 0;
    out.kind = c1!.kind;
    out.forest = f1 * (0.5 + 0.5 * u) + f2 * (0.5 - 0.5 * u);
    out.moist = c1!.moist;
    out.bumpy = c1!.bumpy;
    return out;
  }
}

function cellKey(i: number, j: number): number {
  return (i + 50000) * 100003 + (j + 50000);
}

export interface SpawnResult {
  /** スタートの列 */
  x: number;
  z: number;
  /** スタートの高さ Hs */
  h: number;
  from: { x: number; z: number };
  /** P3 を使ったか */
  fallback: boolean;
  /** 調べた列の数 */
  checked: number;
  /** さがすのにかかった ミリ秒 */
  ms: number;
}

export interface RockInfo {
  cx: number;
  cz: number;
  r: number;
  /** 頂上のブロックの y */
  peakY: number;
}

/** 1 つの seed の地形の計算（biome・高さ・スタート・岩山）。seed ごとに 1 つ作ってつかい回す */
export class Terrain {
  readonly biomeMap: BiomeMap;
  private readonly sC1: number;
  private readonly sC2: number;
  private readonly sMtn: number;
  private readonly sHill: number[];
  private readonly sBump: number;
  private readonly sCliff: number;
  private readonly tmp: BiomeSample = { kind: 'grassland', forest: 0, moist: 0, bumpy: 0 };
  private spawnCache: SpawnResult | null = null;
  private rockCache: RockInfo | null = null;

  constructor(readonly seed: number) {
    this.biomeMap = new BiomeMap(seed);
    this.sC1 = subSeed(seed, 1);
    this.sC2 = subSeed(seed, 2);
    this.sMtn = subSeed(seed, 3);
    this.sHill = [subSeed(seed, 4), subSeed(seed, 5)];
    this.sBump = subSeed(seed, 6);
    this.sCliff = subSeed(seed, 7);
  }

  biome(x: number, z: number, out: BiomeSample = this.tmp): BiomeSample {
    return this.biomeMap.sample(x, z, out);
  }

  /** H(x,z)（はじまりの広場・岩山をかける前） */
  raw(x: number, z: number): number {
    const H = C.height;
    const b = this.biomeMap.sample(x, z, this.tmp);
    const t = b.forest;
    const c = valueNoise(this.sC1, x, z, H.continent.big) * H.continent.bigWeight + valueNoise(this.sC2, x, z, H.continent.small) * H.continent.smallWeight;
    const hb0 = clamp(SEA_Y + (c - H.landCenter) * H.landScale, SEA_Y + H.minAbove, SEA_Y + H.maxAbove);
    const d = Math.hypot(x - C.anchor.x, z - C.anchor.z);
    const w = d <= H.startRadius ? 1 : d >= H.farRadius ? 0 : 1 - smoothstep(H.startRadius, H.farRadius, d);
    const hb = hb0 * (1 - w) + (SEA_Y + H.startAbove) * w;
    const L = clamp((hb - SEA_Y) / H.landRamp, 0, 1);
    let v = hb;
    if (L > 0) {
      const gm = C.biomes.grassland;
      const fm = C.biomes.forest;
      if (w < 1) {
        const nm = valueNoise(this.sMtn, x, z, H.mountain.scale);
        v += smoothstep(H.mountain.from, H.mountain.to, nm) * H.mountain.peak * L * (1 - w);
      }
      let nh: number;
      if (t <= 0) nh = valueNoise(this.sHill[0]!, x, z, gm.hillScale);
      else if (t >= 1) nh = valueNoise(this.sHill[1]!, x, z, fm.hillScale);
      else nh = lerp(valueNoise(this.sHill[0]!, x, z, gm.hillScale), valueNoise(this.sHill[1]!, x, z, fm.hillScale), t);
      v += (nh - 0.5) * 2 * lerp(gm.hill, fm.hill, t) * L;
      v += (valueNoise(this.sBump, x, z, H.bumpScale) - 0.5) * 2 * lerp(gm.bump, fm.bump, t) * (0.3 + 0.7 * L);
    } else {
      const gm = C.biomes.grassland;
      const fm = C.biomes.forest;
      v += (valueNoise(this.sBump, x, z, H.bumpScale) - 0.5) * 2 * lerp(gm.bump, fm.bump, t) * 0.3;
    }
    let h = Math.round(v);
    if (L >= H.cliff.minL && w === 0) {
      const frac = lerp(C.biomes.grassland.cliff, C.biomes.forest.cliff, t);
      if (noiseRank(valueNoise(this.sCliff, x, z, H.cliff.scale)) > 1 - frac) h -= ((h % H.cliff.step) + H.cliff.step) % H.cliff.step;
    }
    return clamp(h, SEA_Y + H.minAbove2, H.max);
  }

  // ------------------------------------------------------------ スタート（P1〜P3）

  spawn(): SpawnResult {
    if (this.spawnCache) return this.spawnCache;
    const t0 = performance.now();
    const cache = new Map<number, number>();
    const rawAt = (x: number, z: number): number => {
      const k = (x + 4096) * 8192 + (z + 4096);
      let h = cache.get(k);
      if (h === undefined) {
        h = this.raw(x, z);
        cache.set(k, h);
      }
      return h;
    };
    const ax = C.anchor.x;
    const az = C.anchor.z;
    const R = C.searchRadius;
    const tmp: BiomeSample = { kind: 'grassland', forest: 0, moist: 0, bumpy: 0 };
    const flatness = (x: number, z: number): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const h = rawAt(x + dx, z + dz);
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      return hi - lo;
    };
    let checked = 0;
    let found: { x: number; z: number } | null = null;
    let best: { x: number; z: number; flat: number; d: number } | null = null;
    scan: for (let r = 0; r <= R; r++) {
      // うずまき順: 北のへりを西から東、東のへりを北から南、南のへりを東から西、西のへりを南から北
      const ring: [number, number][] = [];
      if (r === 0) ring.push([0, 0]);
      else {
        for (let dx = -r; dx < r; dx++) ring.push([dx, -r]);
        for (let dz = -r; dz < r; dz++) ring.push([r, dz]);
        for (let dx = r; dx > -r; dx--) ring.push([dx, r]);
        for (let dz = r; dz > -r; dz--) ring.push([-r, dz]);
      }
      for (const [dx, dz] of ring) {
        const x = ax + dx;
        const z = az + dz;
        checked++;
        if (this.biomeMap.sample(x, z, tmp).kind !== 'grassland') continue;
        const flat = flatness(x, z);
        const h = rawAt(x, z);
        if (h >= SEA_Y + C.spawnAbove.min && h <= SEA_Y + C.spawnAbove.max && flat <= C.spawnFlat) {
          found = { x, z };
          break scan;
        }
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        if (best === null || flat < best.flat || (flat === best.flat && dist < best.d)) best = { x, z, flat, d: dist };
      }
    }
    const pick = found ?? best ?? { x: ax, z: az };
    this.spawnCache = {
      x: pick.x,
      z: pick.z,
      h: rawAt(pick.x, pick.z),
      from: { x: ax, z: az },
      fallback: found === null,
      checked,
      ms: performance.now() - t0,
    };
    return this.spawnCache;
  }

  // ------------------------------------------------------------ 高さ（広場・岩山あり）

  /** 広場（P4）をかけた高さ。岩山の前 */
  base(x: number, z: number): number {
    const sp = this.spawn();
    const r = Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z));
    if (r > C.plaza.ringMax) return this.raw(x, z);
    if (r <= C.plaza.half) return sp.h;
    const k = r - C.plaza.half;
    return clamp(this.raw(x, z), sp.h - k, sp.h + k);
  }

  rock(): RockInfo {
    if (this.rockCache) return this.rockCache;
    const sp = this.spawn();
    const R = C.rock;
    const s = subSeed(this.seed, 201);
    const j = R.jitter;
    const cx = sp.x - j + Math.floor(hash01(s, 1, 0) * (2 * j + 1));
    const cz = sp.z + R.dz - j + Math.floor(hash01(s, 2, 0) * (2 * j + 1));
    const r = R.radiusMin + hash01(s, 3, 0) * (R.radiusMax - R.radiusMin);
    let maxG = -1;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        if (Math.hypot(x - cx, z - cz) <= r) maxG = Math.max(maxG, this.base(x, z));
      }
    }
    const over = R.peakOverMin + Math.floor(hash01(s, 4, 0) * (R.peakOverMax - R.peakOverMin + 1));
    this.rockCache = { cx, cz, r, peakY: maxG + over };
    return this.rockCache;
  }

  /** (x,z) は はじまりの岩山の円の中か（余白 margin ブロックを足して調べられる） */
  inRock(x: number, z: number, margin = 0): boolean {
    const k = this.rock();
    return Math.hypot(x - k.cx, z - k.cz) <= k.r + margin;
  }

  /** 生成する高さ H（広場・岩山をふくむ。仮の海のふちは まだかけない） */
  height(x: number, z: number): number {
    const b = this.base(x, z);
    const k = this.rock();
    const d = Math.hypot(x - k.cx, z - k.cz);
    if (d > k.r) return b;
    return Math.max(b, k.peakY - Math.floor(d));
  }
}

// ------------------------------------------------------------------ seed ごとの使いまわし

const terrains = new Map<number, Terrain>();
const MAX_TERRAINS = 6;

export function terrainFor(seed: number): Terrain {
  const key = seed | 0;
  let t = terrains.get(key);
  if (t === undefined) {
    if (terrains.size >= MAX_TERRAINS) terrains.delete(terrains.keys().next().value as number);
    t = new Terrain(key);
    terrains.set(key, t);
  } else {
    // 使った順に並べなおす（古いものから捨てる）
    terrains.delete(key);
    terrains.set(key, t);
  }
  return t;
}

/** テスト用: 覚えているものを全部すてる（作る順に頼っていないことを確かめるため） */
export function clearTerrainCache(): void {
  terrains.clear();
}

export function biomeCell(seed: number, i: number, j: number): BiomeCell {
  return { ...terrainFor(seed).biomeMap.cell(i, j) };
}

export function biomeAt(seed: number, x: number, z: number): BiomeSample {
  return { ...terrainFor(seed).biome(x, z, { kind: 'grassland', forest: 0, moist: 0, bumpy: 0 }) };
}

/** 生成の値 H(x,z)（広場・岩山をかける前）・バイオーム・海か */
export function terrainAt(seed: number, x: number, z: number): { h: number; biome: BiomeKind; sea: boolean } {
  const t = terrainFor(seed);
  const h = t.raw(x, z);
  return { h, biome: t.biome(x, z).kind, sea: h <= SEA_Y - 1 };
}

export function rawHeightAt(seed: number, x: number, z: number): number {
  return terrainFor(seed).raw(x, z);
}

/** 広場・岩山をかけた高さ（仮の海のふちの前） */
export function heightAt(seed: number, x: number, z: number): number {
  return terrainFor(seed).height(x, z);
}

export function spawnOf(seed: number): SpawnResult {
  return { ...terrainFor(seed).spawn() };
}

export function rockOf(seed: number): RockInfo {
  return { ...terrainFor(seed).rock() };
}
