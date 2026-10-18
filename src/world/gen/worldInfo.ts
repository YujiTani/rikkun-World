import { SEA_Y } from '../../contracts';
import type { BlockId, IslandInfo, RegionRect, SpawnPoint, TestArea, WorldRegions } from '../../contracts';
import type { ChunkedVoxelWorld } from '../VoxelWorld';
import { columnHash, generateChunk } from './chunk';
import { GEN_CONFIG as C } from './config';
import { startFeaturesOf, type StartFeatures } from './features';
import { mouthsInRegion, regionRect, type Bounds, type MouthInfo } from './region';
import { surfaceFor } from './surface';
import type { CountryKind } from './config';
import { terrainAt, terrainFor } from './terrain';
import { treesInRect } from './trees';

/**
 * 世界の「目印」（スタート・仮の regions・洞くつの口・たいまつ）。VOX-D G1〜G6。
 * ブロックは 読みこまずに、高さ（terrainFor(seed).height）と木・口から 決める。読みこんでいる列・テレポートに 関係なく 同じ答え。
 * 起動で 1 回だけ 計算して おぼえておく（同じシードは 同じ答え）。
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
  /** 読みこんでいる列 */
  loadedChunks(): { cx: number; cz: number }[];
  /** 列を 1 つ作った時間（ms）を記録する（genStats 用） */
  noteGen?(ms: number): void;
}

/** 「一番上の地形」に数えないブロック（き・はっぱ・みず・たいまつ・M7 の やわらかい物） */
const SOFT = new Set<string>(['air', 'water', 'log', 'leaves', 'torch', 'start_torch', 'kakashi', 'kakashi_head', 'saku', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'susuki', 'bamboo']);
function isSoft(id: BlockId | 'outside'): boolean {
  return SOFT.has(id) || (id !== 'outside' && (id.startsWith('wild_') || id.startsWith('crop_')));
}

/** 一番上の「地形」ブロックの y。なければ -1（読みこんでいない列も -1） */
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

const regionCache = new Map<number, { regions: WorldRegions; ms: number }>();

/** 仮の regions（G3）。シードごとに 1 回だけ計算する */
export function regionsOf(seed: number): WorldRegions {
  let hit = regionCache.get(seed);
  if (hit === undefined) {
    const t0 = performance.now();
    const regions = makeRegions(seed, regionRect(seed), startFeaturesOf(seed));
    hit = { regions, ms: performance.now() - t0 };
    if (regionCache.size >= 8) regionCache.delete(regionCache.keys().next().value as number);
    regionCache.set(seed, hit);
  }
  return cloneRegions(hit.regions);
}

function cloneRegions(r: WorldRegions): WorldRegions {
  return {
    center: { ...r.center },
    startH0: r.startH0,
    mountain: { ...r.mountain, peak: { ...r.mountain.peak } },
    rock: { ...r.rock },
    forest: { ...r.forest },
    flat: { ...r.flat },
    spring: { ...r.spring },
    river: r.river.map((q) => ({ ...q })),
    meadow: { ...r.meadow },
    pond: { ...r.pond },
  };
}

/** 世界の目印の窓口を作る。world は 地面の高さ（groundHeight）を聞くときだけ使う */
export function createWorldInfo(seed: number, world: ChunkedVoxelWorld): WorldGenInfo {
  const t0 = performance.now();
  const T = terrainFor(seed);
  const sp = T.spawn();
  const regions = regionsOf(seed);
  const features = startFeaturesOf(seed);
  const mouths = mouthsInRegion(seed);
  const times: number[] = [];
  const testArea: TestArea = { ...C.testArea };
  const genTimeMs = performance.now() - t0;
  const startTorch = (): { x: number; y: number; z: number } => {
    const x = sp.x + C.startTorch.dx;
    const z = sp.z + C.startTorch.dz;
    return { x, y: T.height(x, z) + 1, z };
  };
  return {
    seed,
    genTimeMs,
    groundHeight: (x, z) => terrainTopOf(world, x, z),
    spawn(): SpawnPoint {
      // スタートの列は 広場（高さ sp.h・くさ）。木・口は 近くに無い
      return { x: sp.x + 0.5, y: surfaceFor(seed).ground(sp.x, sp.z) + 1, z: sp.z + 0.5, yawDeg: C.spawn.yawDeg, pitchDeg: C.spawn.pitchDeg };
    },
    testArea: () => ({ ...testArea }),
    regions: () => cloneRegions(regions),
    seaY: () => SEA_Y,
    spawnInfo: () => ({ from: { ...sp.from }, fallback: sp.fallback, checked: sp.checked }),
    startTorch,
    startFeatures: () => ({ rock: { ...features.rock }, trees: features.trees.map((t) => ({ ...t })) }),
    caveMouths: () => mouths.map((m) => ({ ...m, room: { ...m.room } })),
    terrainAt: (x, z) => terrainAt(seed, x, z),
    genHash: (cx, cz) => columnHash(generateChunk(seed, cx, cz)),
    genStats: () => {
      const sorted = times.slice().sort((a, b) => a - b);
      return {
        columns: times.length,
        medianMs: sorted[sorted.length >> 1] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        spawnSearchMs: sp.ms,
      };
    },
    loadedChunks: () => world.loadedColumns(),
    noteGen: (ms) => {
      if (times.length < 4096) times.push(ms);
    },
  };
}

// ------------------------------------------------------------------ 仮の regions

function makeRegions(seed: number, b: Bounds, features: StartFeatures): WorldRegions {
  const T = terrainFor(seed);
  const sp = T.spawn();
  const rock = features.rock;
  const r16 = 16;
  const dSp = (x: number, z: number): number => Math.hypot(x - sp.x, z - sp.z);
  // G2: ブロックは 読みこまない。R の高さは 高さの関数だけで 出す（広場・岩山をふくむ。仮の海のふちは もう無い）
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;
  const H = new Int16Array(W * D);
  for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) H[(z - b.z0) * W + (x - b.x0)] = T.height(x, z);
  const h = (x: number, z: number): number => H[(z - b.z0) * W + (x - b.x0)]!;

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

  // 森: 半径 12 の円の中の みきが いちばん多い所（中心は 4 マスおき）。木も R の中で数える（G3）
  const trunks = treesInRect(T, b.x0, b.z0, b.x1 - 1, b.z1 - 1);
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
