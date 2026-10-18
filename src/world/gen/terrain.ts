import { SEA_Y, type BlockId } from '../../contracts';
import { clearCountryCache, countryMapFor, newSample, type BiomeSample, type CountryMap } from './biome';
import { GEN_CONFIG as C, type CountryKind } from './config';
import { hash01, subSeed } from './random';

/**
 * 地形の「高さだけ」の計算（VOX-B。ブロックは作らない）。タスク票 H1〜H9・B1〜B5・P1〜P6。
 * すべて (seed, x, z) だけで決まる純粋な計算。作る順・ほかの列に関係しない。
 */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

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

/** 1 つの seed の地形の計算（国・高さ・スタート・岩山）。seed ごとに 1 つ作ってつかい回す */
export class Terrain {
  /** 12 の国（VOX-I-1。biome.ts） */
  readonly map: CountryMap;
  private readonly tmp: BiomeSample = newSample();
  private spawnCache: SpawnResult | null = null;
  private rockCache: RockInfo | null = null;

  constructor(readonly seed: number) {
    this.map = countryMapFor(seed);
  }

  biome(x: number, z: number, out: BiomeSample = this.tmp): BiomeSample {
    return this.map.sampleInto(x, z, out);
  }

  /** 地面のいちばん上のブロック。スタートの広場（plaza）のまわりは いつも くさ（スタートが 国の境目にあっても 広場が 砂にならない） */
  topBlock(x: number, z: number, h: number): BlockId {
    const sp = this.spawn();
    if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= C.plaza.ringMax && h >= SEA_Y + C.strata.landFrom) return 'grass';
    return this.map.topBlock(x, z, h);
  }

  /** H(x,z)（はじまりの広場・岩山・いけ をかける前） */
  raw(x: number, z: number): number {
    return this.map.height(x, z);
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
    const tmp: BiomeSample = newSample();
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
        if (this.map.sampleInto(x, z, tmp).kind !== 'harappa') continue;
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
    // かっぱの ぬま の いけ（水の底・へり）
    const pd = this.map.pondAt(x, z);
    if (pd !== null) return pd.kind === 'inner' ? pd.level - pd.depth - 1 : pd.level;
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
  clearCountryCache();
}

/** 生成の値 H(x,z)（広場・岩山をかける前）・バイオーム・海か */
export function terrainAt(seed: number, x: number, z: number): { h: number; biome: CountryKind; sea: boolean } {
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
