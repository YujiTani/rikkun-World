import { CHUNK_SIZE, SEA_Y } from '../../contracts';
import type { BlockId, IslandInfo, RegionRect, SpawnPoint, TestArea, WorldRegions } from '../../contracts';
import type { ChunkedVoxelWorld } from '../VoxelWorld';
import { HW, columnHash, generateChunk } from './chunk';
import { GEN_CONFIG as C } from './config';
import { startFeaturesOf, type StartFeatures } from './features';
import { LOAD_BOUNDS, edgeDistance, edgeHeight, generateLoaded, mouthsInBounds, type Bounds, type MouthInfo } from './region';
import { microCountries } from '../micro/microSurface';
import { defOf, newSample } from './biome';
import type { CountryKind } from './config';
import { terrainAt, terrainFor } from './terrain';
import { treesInRect } from './trees';

/**
 * 読みこむ範囲（8×8 列）を world に読みこみ、スタート・目印・仮の regions を決める（VOX-B）。
 * 世界の中身は generateLoaded（= generateChunk + 仮の海のふち）。ここでは ふるい畑・やせいの やさい は置かない。
 */

export interface WorldGenInfo extends IslandInfo {
  seaY(): number;
  spawnInfo(): { from: { x: number; z: number }; fallback: boolean; checked: number };
  startTorch(): { x: number; y: number; z: number };
  startFeatures(): StartFeatures;
  caveMouths(): MouthInfo[];
  terrainAt(x: number, z: number): { h: number; biome: CountryKind; sea: boolean };
  genHash(cx: number, cz: number): string;
  genStats(): { columns: number; medianMs: number; maxMs: number; spawnSearchMs: number };
  loadedChunks(): { cx: number; cz: number }[];
}

/** 「一番上の地形」に数えないブロック（き・はっぱ・みず・たいまつ・M7 の やわらかい物） */
const SOFT = new Set<string>(['air', 'water', 'log', 'leaves', 'torch', 'start_torch', 'kakashi', 'kakashi_head', 'saku']);
function isSoft(id: BlockId | 'outside'): boolean {
  return SOFT.has(id) || (id !== 'outside' && (id.startsWith('wild_') || id.startsWith('crop_')));
}

/** 一番上の「地形」ブロックの y。なければ -1 */
export function terrainTopOf(world: ChunkedVoxelWorld, x: number, z: number): number {
  let y = world.topY(x, z);
  while (y >= 0) {
    const id = world.getBlock(x, y, z);
    if (id === 'outside') return -1;
    if (!isSoft(id)) return y;
    y--;
  }
  return -1;
}

/** 山の中心が スタートから これより近くない（スタートが 山の円（r 18）に入らない） */
const MOUNTAIN_FROM_START = 30;
const FOREST_FROM_START = 24;

const rectOverlap = (a: RegionRect, b: RegionRect): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;

export function populateWorld(world: ChunkedVoxelWorld, seed: number, bounds: Bounds = LOAD_BOUNDS): WorldGenInfo {
  const t0 = performance.now();
  const T = terrainFor(seed);
  const sp = T.spawn();
  const W = bounds.x1 - bounds.x0;
  const D = bounds.z1 - bounds.z0;
  /** 仮の海のふちをかけたあとの高さ（木・ふるい畑をのぞく地面） */
  const H = new Int16Array(W * D);
  const times: number[] = [];
  const chunks: { cx: number; cz: number }[] = [];
  for (let cz = bounds.z0 / CHUNK_SIZE; cz < bounds.z1 / CHUNK_SIZE; cz++) {
    for (let cx = bounds.x0 / CHUNK_SIZE; cx < bounds.x1 / CHUNK_SIZE; cx++) {
      const g0 = performance.now();
      const { column, heights } = generateLoaded(seed, cx, cz, bounds);
      times.push(performance.now() - g0);
      world.loadColumn(column);
      chunks.push({ cx, cz });
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          H[(cz * CHUNK_SIZE + lz - bounds.z0) * W + (cx * CHUNK_SIZE + lx - bounds.x0)] = heights[(lz + 1) * HW + lx + 1]!;
        }
      }
    }
  }
  world.edgeClosedBelow = SEA_Y - 8; // 海のふちの 海ゆかより下は 外から見えない（地下の「見えない」印を ふちの列まで）
  // 12 の国: 小ブロックの地面のきまりを 国（と 境目のまぜ具合）ごとの表の番号で返す
  const microKeys = new Map<string, number>();
  const microTmp = newSample();
  world.microForest = (bx, bz) => {
    const b = T.biome(bx, bz, microTmp);
    const q = Math.round(b.a * 8);
    const key = `${b.kind}|${b.kind2}|${q}`;
    let idx = microKeys.get(key);
    if (idx === undefined) {
      const w = q / 8;
      const m1 = defOf(b.kind).micro;
      const m2 = defOf(b.kind2).micro;
      microCountries.table.push({
        tuftThreshold: m1.tuft * w + m2.tuft * (1 - w),
        rockChance: m1.rock * w + m2.rock * (1 - w),
        soilThreshold: m1.soil * w + m2.soil * (1 - w),
      });
      idx = microCountries.table.length;
      microKeys.set(key, idx);
    }
    return idx;
  };
  const h = (x: number, z: number): number => H[(z - bounds.z0) * W + (x - bounds.x0)]!;

  const startTorch = (): { x: number; y: number; z: number } => {
    const x = sp.x + C.startTorch.dx;
    const z = sp.z + C.startTorch.dz;
    return { x, y: T.height(x, z) + 1, z };
  };
  const features = startFeaturesOf(seed);
  const regions = makeRegions(seed, bounds, h, features);
  const sorted = times.slice().sort((a, b) => a - b);
  const testArea: TestArea = { ...C.testArea };
  const genTimeMs = performance.now() - t0;

  return {
    seed,
    genTimeMs,
    groundHeight: (x, z) => terrainTopOf(world, x, z),
    spawn(): SpawnPoint {
      let top = world.topY(sp.x, sp.z);
      while (top >= 0 && !world.isSolid(sp.x, top, sp.z)) top--;
      return { x: sp.x + 0.5, y: top + 1, z: sp.z + 0.5, yawDeg: C.spawn.yawDeg, pitchDeg: C.spawn.pitchDeg };
    },
    testArea: () => ({ ...testArea }),
    regions: () => ({
      center: { ...regions.center },
      startH0: regions.startH0,
      mountain: { ...regions.mountain, peak: { ...regions.mountain.peak } },
      rock: { ...regions.rock },
      forest: { ...regions.forest },
      flat: { ...regions.flat },
      spring: { ...regions.spring },
      river: regions.river.map((r) => ({ ...r })),
      meadow: { ...regions.meadow },
      pond: { ...regions.pond },
    }),
    seaY: () => SEA_Y,
    spawnInfo: () => ({ from: { ...sp.from }, fallback: sp.fallback, checked: sp.checked }),
    startTorch,
    startFeatures: () => ({ rock: { ...features.rock }, trees: features.trees.map((t) => ({ ...t })) }),
    caveMouths: () => mouthsInBounds(seed, bounds),
    terrainAt: (x, z) => terrainAt(seed, x, z),
    genHash: (cx, cz) => columnHash(generateChunk(seed, cx, cz)),
    genStats: () => ({
      columns: times.length,
      medianMs: sorted[sorted.length >> 1] ?? 0,
      maxMs: sorted[sorted.length - 1] ?? 0,
      spawnSearchMs: sp.ms,
    }),
    loadedChunks: () => chunks.map((c) => ({ ...c })),
  };
}

// ------------------------------------------------------------------ 仮の regions

function makeRegions(seed: number, b: Bounds, h: (x: number, z: number) => number, features: StartFeatures): WorldRegions {
  const T = terrainFor(seed);
  const sp = T.spawn();
  const rock = features.rock;
  const r16 = 16;
  const dSp = (x: number, z: number): number => Math.hypot(x - sp.x, z - sp.z);

  // 山: はしから 16 より内で いちばん高い地面（岩山のまわり・スタートから 30 までは のぞく。同じなら スタートに近い方）。
  // スタートの すぐそばは 低い土地（H3）で いちばん高くなりがちだが、はじめから「やま に きた」にならないようにする
  let peak = { x: sp.x, z: sp.z, h: -1 };
  for (let z = b.z0 + r16; z < b.z1 - r16; z++) {
    for (let x = b.x0 + r16; x < b.x1 - r16; x++) {
      if (Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + 2) continue;
      if (dSp(x, z) < MOUNTAIN_FROM_START) continue;
      const hh = h(x, z);
      if (hh > peak.h || (hh === peak.h && dSp(x, z) < dSp(peak.x, peak.z))) peak = { x, z, h: hh };
    }
  }

  // 森: 半径 12 の円の中の みきが いちばん多い所（中心は 4 マスおき）
  const trunks = treesInRect(T, b.x0, b.z0, b.x1 - 1, b.z1 - 1).filter((t) => edgeHeight(t.y, edgeDistance(b, t.x, t.z)) >= t.y);
  let forest = { cx: sp.x, cz: sp.z + FOREST_FROM_START, r: 12 };
  let bestN = -1;
  for (let cz = b.z0 + 12; cz <= b.z1 - 12; cz += 4) {
    for (let cx = b.x0 + 12; cx <= b.x1 - 12; cx += 4) {
      if (dSp(cx, cz) < FOREST_FROM_START) continue; // スタートが 森の円（r 12）に入らない
      let n = 0;
      for (const t of trunks) if (Math.hypot(t.x - cx, t.z - cz) <= 12) n++;
      if (n > bestN || (n === bestN && dSp(cx, cz) < dSp(forest.cx, forest.cz))) {
        bestN = n;
        forest = { cx, cz, r: 12 };
      }
    }
  }

  // 平ら: 24×20 で 高さの差がいちばん小さい所（スタートの 5×5・岩山・テスト場所と重ならない・陸）
  const FW = 24;
  const FD = 20;
  const start5: RegionRect = { x0: sp.x - 2, x1: sp.x + 2, z0: sp.z - 2, z1: sp.z + 2 };
  const rockBox: RegionRect = { x0: Math.floor(rock.cx - rock.r) - 1, x1: Math.ceil(rock.cx + rock.r) + 1, z0: Math.floor(rock.cz - rock.r) - 1, z1: Math.ceil(rock.cz + rock.r) + 1 };
  const ta: RegionRect = { x0: C.testArea.x0, x1: C.testArea.x1, z0: C.testArea.z0, z1: C.testArea.z1 };
  const findFlat = (minLand: number): RegionRect | null => {
    let best: RegionRect | null = null;
    let bestDiff = 1e9;
    let bestDist = 1e9;
    for (let z0 = b.z0 + 1; z0 + FD <= b.z1 - 1; z0++) {
      for (let x0 = b.x0 + 1; x0 + FW <= b.x1 - 1; x0++) {
        const r: RegionRect = { x0, x1: x0 + FW - 1, z0, z1: z0 + FD - 1 };
        if (rectOverlap(r, start5) || rectOverlap(r, rockBox) || rectOverlap(r, ta)) continue;
        let lo = 1e9;
        let hi = -1e9;
        for (let z = r.z0; z <= r.z1 && hi - lo < bestDiff + 1; z++) {
          for (let x = r.x0; x <= r.x1; x++) {
            const v = h(x, z);
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        if (lo < minLand) continue;
        const diff = hi - lo;
        const dist = dSp((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
        if (diff < bestDiff || (diff === bestDiff && dist < bestDist)) {
          best = r;
          bestDiff = diff;
          bestDist = dist;
        }
      }
    }
    return best;
  };
  const flat = findFlat(SEA_Y + 2) ?? findFlat(SEA_Y - 40) ?? { x0: b.x0 + 8, x1: b.x0 + 8 + FW - 1, z0: b.z0 + 8, z1: b.z0 + 8 + FD - 1 };

  return {
    center: { x: sp.x, z: sp.z },
    startH0: sp.h,
    mountain: { cx: peak.x, cz: peak.z, r: 18, peak: { ...peak } },
    rock: { cx: rock.cx, cz: rock.cz, r: rock.r },
    forest,
    flat,
    spring: { cx: sp.x, cz: sp.z, r: 0 },
    river: [],
    meadow: { cx: sp.x, cz: sp.z + 32, r: 12 },
    pond: { cx: sp.x, cz: sp.z, r: 0 },
  };
}
