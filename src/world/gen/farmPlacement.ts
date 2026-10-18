import type {
  ApplyFarmPlacement,
  BlockId,
  CropKind,
  FarmPlacedBlock,
  FarmPlacement,
  FarmPlacementFn,
  VoxelWorld,
} from '../../contracts';
import { CROP_KINDS, SEA_Y, WILD_BLOCK } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { inMouthFootprint, mouthOfChunk, type Mouth } from './mouths';
import { createRng, randInt, shuffle } from './random';
import { startFeaturesOf } from './features';
import { regionRect } from './region';
import { regionsOf } from './worldInfo';
import { surfaceFor } from './surface';
import { spawnOf, terrainFor } from './terrain';

/**
 * 置きもの の 場所（M7 §4.5 (0)〜(3)。VOX-B F1〜F3、VOX-D G1〜G6）。シード だけ で 決まる 純粋な 計算。
 * ブロックは 読みこまない: 四角 R（スタートのまわり 128×128）の中を、高さ・木・洞くつの口から調べる（surface.ts）。
 * 読みこんでいる列・テレポートに 関係なく 同じ答え。同じ シードの 答えは おぼえておく。
 */

/** ふるい はたけ の ゆるめ方（段ごと: 距離の はんい・角度）。最後の段（どの向きでも・40 まで）は VOX-B で足した（新しい地形で置けない seed をなくす） */
const OLD_FARM_TIERS: ReadonlyArray<{ dMin: number; dMax: number; deg: number }> = [
  { dMin: 7, dMax: 12, deg: 40 },
  { dMin: 7, dMax: 16, deg: 40 },
  { dMin: 7, dMax: 20, deg: 60 },
  { dMin: 7, dMax: 40, deg: 360 },
];

/** 6×6 の 中の 決まった 形（lx = 東、lz = 南 が 正。0〜5） */
const FARMLAND_LOCAL = { x0: 1, x1: 4, z0: 1, z1: 3 }; // 4 × 3 = 12
const SAKU_LOCAL: ReadonlyArray<[number, number]> = [
  [2, 0],
  [4, 0],
  [5, 1],
  [5, 3],
  [0, 2],
  [1, 4],
  [4, 4],
];
const KAKASHI_LOCAL: [number, number] = [0, 0];
const TANSU_LOCAL: [number, number] = [3, 5];

export const TANSU_ITEMS: ReadonlyArray<{ item: 'seed_onion' | 'seed_tomato' | 'seed_eggplant' | 'seed_pumpkin'; count: number }> = [
  { item: 'seed_onion', count: 2 },
  { item: 'seed_tomato', count: 3 },
  { item: 'seed_eggplant', count: 2 },
  { item: 'seed_pumpkin', count: 1 },
];

type Rect = { x0: number; x1: number; z0: number; z1: number };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}

/** 線が とおる マスの キー（firstBlockOnRay と 同じ 刻み） */
function rayKeys(ex: number, ey: number, ez: number, qx: number, qy: number, qz: number, out: Set<string>): void {
  const len = Math.hypot(qx - ex, qy - ey, qz - ez);
  const steps = Math.ceil(len / C.rayStep);
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, (i * C.rayStep) / len);
    out.add(`${Math.floor(ex + (qx - ex) * t)},${Math.floor(ey + (qy - ey) * t)},${Math.floor(ez + (qz - ez) * t)}`);
  }
}

const memo = new Map<number, FarmPlacement>();

export const computeFarmPlacement: FarmPlacementFn = (seed) => {
  const hit = memo.get(seed);
  if (hit) return structuredClone(hit);
  const result = place(seed);
  if (memo.size >= 8) memo.delete(memo.keys().next().value as number);
  memo.set(seed, result);
  return structuredClone(result);
};

function place(seed: number): FarmPlacement {
  const R = regionsOf(seed);
  const T = terrainFor(seed);
  const sp = spawnOf(seed);
  const S = surfaceFor(seed);
  const b = regionRect(seed);
  const inside = (x: number, z: number) => x >= b.x0 && z >= b.z0 && x < b.x1 && z < b.z1;
  const W = b.x1 - b.x0;
  const D = b.z1 - b.z0;

  // ---- 列ごとの 下ごしらえ
  const hCache = new Int16Array(W * D).fill(-2);
  const h = (x: number, z: number): number => {
    if (!inside(x, z)) return -1;
    const i = (z - b.z0) * W + (x - b.x0);
    let v = hCache[i]!;
    if (v === -2) {
      v = S.ground(x, z);
      hCache[i] = v;
    }
    return v;
  };
  const hasWater = (x: number, z: number) => inside(x, z) && h(x, z) < SEA_Y;
  const hasTree = (x: number, z: number) => S.treeCover(x, z);

  const features = startFeaturesOf(seed);
  const start5: Rect = { x0: sp.x - 2, x1: sp.x + 2, z0: sp.z - 2, z1: sp.z + 2 };
  const testArea: Rect = { x0: C.testArea.x0, x1: C.testArea.x1, z0: C.testArea.z0, z1: C.testArea.z1 };
  const rock = features.rock;
  const nearRock = (x: number, z: number, extra: number) => Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + extra;
  const mouths: Mouth[] = [];
  for (let cz = (b.z0 >> 4) - 2; cz <= ((b.z1 - 1) >> 4) + 2; cz++) {
    for (let cx = (b.x0 >> 4) - 2; cx <= ((b.x1 - 1) >> 4) + 2; cx++) {
      const m = mouthOfChunk(T, cx, cz);
      if (m) mouths.push(m);
    }
  }
  const nearMouths = (x: number, z: number, margin: number) => mouths.some((m) => inMouthFootprint(m, x, z, margin));

  // ---- 守る 見通しの 線（M5 AC7）: スタートから 岩山の頂上、北 ±45° の はじまりの木
  const ex = sp.x + 0.5;
  const ey = sp.h + 2.62;
  const ez = sp.z + 0.5;
  const rockRay = new Set<string>();
  const treeRays: Set<string>[] = [];
  {
    let best = { x: rock.cx, z: rock.cz, h: -1 };
    for (let z = Math.floor(rock.cz - rock.r); z <= Math.ceil(rock.cz + rock.r); z++) {
      for (let x = Math.floor(rock.cx - rock.r); x <= Math.ceil(rock.cx + rock.r); x++) {
        if (!inside(x, z) || !nearRock(x, z, 0)) continue;
        const hh = h(x, z);
        if (hh > best.h) best = { x, z, h: hh };
      }
    }
    if (best.h >= 0) rayKeys(ex, ey, ez, best.x + 0.5, best.h + 0.5, best.z + 0.5, rockRay);
    for (const t of features.trees) {
      const dx = t.x - sp.x;
      const dz = t.z - sp.z;
      if (dz >= 0 || Math.abs(dx) > -dz) continue;
      const s = new Set<string>();
      rayKeys(ex, ey, ez, t.x + 0.5, t.y + 1.5, t.z + 0.5, s);
      treeRays.push(s);
    }
  }
  const reserved = new Set<string>([...rockRay, ...treeRays.flatMap((s) => [...s])]);

  // ---- ふるい はたけ の あと
  const oldFarm = findOldFarm();

  function findOldFarm(): FarmPlacement['oldFarm'] {
    const rng = createRng((seed ^ 0x3c6ef372) >>> 0);
    const all: Array<{ x0: number; z0: number }> = [];
    for (let z0 = Math.max(b.z0 + 8, sp.z - 43); z0 <= Math.min(b.z1 - 15, sp.z + 40); z0++) {
      for (let x0 = Math.max(b.x0 + 8, sp.x - 43); x0 <= Math.min(b.x1 - 15, sp.x + 40); x0++) all.push({ x0, z0 });
    }
    shuffle(rng, all);
    for (let tier = 0; tier < OLD_FARM_TIERS.length; tier++) {
      const tr = OLD_FARM_TIERS[tier]!;
      for (const c of all) {
        const dist = Math.hypot(c.x0 + 3 - (sp.x + 0.5), c.z0 + 3 - (sp.z + 0.5));
        if (dist < tr.dMin || dist > tr.dMax) continue;
        // 段 0〜2 は スタートの 北東（北から東）だけ。最後の段は どの向きでも
        if (tier < 3 && !(c.x0 > sp.x && c.z0 + 5 < sp.z)) continue;
        const res = tryOldFarm(c.x0, c.z0, tr.deg, tier);
        if (res) return res;
      }
    }
    return null;
  }

  function tryOldFarm(x0: number, z0: number, maxDeg: number, tier: number): FarmPlacement['oldFarm'] {
    const frame = { x0: x0 - 1, x1: x0 + 6, z0: z0 - 1, z1: z0 + 6 };
    if (frame.x0 < b.x0 + 8 || frame.z0 < b.z0 + 8 || frame.x1 > b.x1 - 9 || frame.z1 > b.z1 - 9) return null;
    if (overlaps(frame, start5) || overlaps(frame, testArea) || overlaps(frame, R.flat)) return null;
    // 8×8: 木・みず・岩・洞くつの口 なし、一番上は くさ、高さは h0 か h0+1
    let lo = 999;
    let hi = -999;
    for (let z = frame.z0; z <= frame.z1; z++) {
      for (let x = frame.x0; x <= frame.x1; x++) {
        if (hasWater(x, z) || hasTree(x, z) || nearRock(x, z, 2) || nearMouths(x, z, 2)) return null;
        const hh = h(x, z);
        if (hh < SEA_Y + 2 || !S.groundIsGrass(x, z)) return null;
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
    }
    if (hi - lo > 1) return null;
    // 6×6 から 横 5 以内に みず なし
    for (let z = z0 - 5; z <= z0 + 10; z++) for (let x = x0 - 5; x <= x0 + 10; x++) if (hasWater(x, z)) return null;
    const h0 = lo;

    // 置く マス（さいごに 書いた ものが 勝つ）
    const m = new Map<string, FarmPlacedBlock>();
    const put = (x: number, y: number, z: number, id: BlockId) => m.set(`${x},${y},${z}`, { x, y, z, id });
    for (let lz = 0; lz < 6; lz++) {
      for (let lx = 0; lx < 6; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        if (h(x, z) === h0 + 1) {
          put(x, h0, z, 'grass');
          put(x, h0 + 1, z, 'air');
        }
      }
    }
    for (let lz = FARMLAND_LOCAL.z0; lz <= FARMLAND_LOCAL.z1; lz++) {
      for (let lx = FARMLAND_LOCAL.x0; lx <= FARMLAND_LOCAL.x1; lx++) put(x0 + lx, h0, z0 + lz, 'farmland');
    }
    for (const [lx, lz] of SAKU_LOCAL) put(x0 + lx, h0 + 1, z0 + lz, 'saku');
    const kx = x0 + KAKASHI_LOCAL[0];
    const kz = z0 + KAKASHI_LOCAL[1];
    put(kx, h0 + 1, kz, 'kakashi');
    put(kx, h0 + 2, kz, 'kakashi_head');
    const tx = x0 + TANSU_LOCAL[0];
    const tz = z0 + TANSU_LOCAL[1];
    put(tx, h0 + 1, tz, 'tansu');

    // 守る 線を さえぎらない
    const blocked = (set: Set<string>) => {
      for (const bl of m.values()) if (bl.id !== 'air' && set.has(`${bl.x},${bl.y},${bl.z}`)) return true;
      return false;
    };
    if (blocked(rockRay)) return null;
    if (treeRays.some((r) => blocked(r))) return null;

    // 目の位置から かかし の あたま への 向き と 見通し
    const qx = kx + 0.5;
    const qy = h0 + 2.5;
    const qz = kz + 0.5;
    const deg = (Math.atan2(qx - ex, -(qz - ez)) * 180) / Math.PI;
    if (maxDeg < 360 && (deg < 0 || deg > maxDeg)) return null;
    const line = new Set<string>();
    rayKeys(ex, ey, ez, qx, qy, qz, line);
    for (const key of line) {
      const [cx, cy, cz] = key.split(',').map(Number) as [number, number, number];
      const isTarget = cx === kx && cz === kz && cy === h0 + 2;
      if (isTarget) continue;
      const pre = S.blockAt(cx, cy, cz);
      if (pre !== 'air' && pre !== 'water') return null; // 置く前の 地形
      const now = m.get(key)?.id ?? pre;
      if (now !== 'air' && now !== 'water' && now !== 'saku' && now !== 'kakashi' && now !== 'kakashi_head') return null;
    }

    const blocks = [...m.values()].sort((a, c) => a.y - c.y || a.z - c.z || a.x - c.x);
    return {
      blocks,
      tansu: { x: tx, y: h0 + 1, z: tz },
      tansuItems: TANSU_ITEMS.map((t) => ({ item: t.item, count: t.count })),
      kakashi: { x: kx, y: h0 + 1, z: kz },
      box: { x0: frame.x0, z0: frame.z0, x1: frame.x1, z1: frame.z1, y0: h0 - 3, y1: h0 + 6 },
      tier: tier as 0 | 1 | 2 | 3,
    };
  }

  // ---- やせいの やさい（F2）
  const wild: FarmPlacement['wild'] = [];
  const farmFrame = oldFarm ? oldFarm.box : null;
  const eligible = (x: number, z: number): number | null => {
    if (x < b.x0 + 8 || z < b.z0 + 8 || x >= b.x1 - 8 || z >= b.z1 - 8) return null;
    const cheb = Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z));
    if (cheb < 8 || cheb > 56) return null;
    if (x >= testArea.x0 - 1 && x <= testArea.x1 + 1 && z >= testArea.z0 - 1 && z <= testArea.z1 + 1) return null;
    if (farmFrame && x >= farmFrame.x0 - 1 && x <= farmFrame.x1 + 1 && z >= farmFrame.z0 - 1 && z <= farmFrame.z1 + 1) return null;
    if (nearRock(x, z, 2) || nearMouths(x, z, 2)) return null;
    const hh = h(x, z);
    if (hh < SEA_Y + 2 || !S.groundIsGrass(x, z) || S.blockAt(x, hh + 1, z) !== 'air') return null;
    if (S.covered(x, z)) return null;
    if (reserved.has(`${x},${hh + 1},${z}`)) return null;
    return hh;
  };
  /** たまねぎ・トマトは はらっぱ、かぼちゃ・なすは もり を さきに さがす */
  const prefer: Record<CropKind, 'harappa' | 'mori'> = { onion: 'harappa', tomato: 'harappa', pumpkin: 'mori', eggplant: 'mori' };

  const taken: Array<{ x: number; z: number }> = [];
  const farEnough = (x: number, z: number) => taken.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) >= 3);
  CROP_KINDS.forEach((kind, ki) => {
    const rng = createRng((seed ^ (0x9e3779b9 + ki * 0x632be5ab)) >>> 0);
    const want = randInt(rng, 4, 6);
    const order: Array<{ x: number; z: number }> = [];
    for (let z = b.z0 + 8; z < b.z1 - 8; z++) for (let x = b.x0 + 8; x < b.x1 - 8; x++) order.push({ x, z });
    shuffle(rng, order);
    let got = 0;
    for (let level = 0; level < 2; level++) {
      if (level === 1 && got >= 4) break;
      for (const c of order) {
        if (got >= want) break;
        if (level === 0 && T.biome(c.x, c.z).kind !== prefer[kind]) continue;
        if (!farEnough(c.x, c.z)) continue;
        const hh = eligible(c.x, c.z);
        if (hh === null) continue;
        wild.push({ x: c.x, y: hh + 1, z: c.z, kind });
        taken.push({ x: c.x, z: c.z });
        got++;
      }
    }
  });

  return { wild, oldFarm };
}

/** 新しい世界に 置く（作った直後に 1 回。たんす の 中身は 置かない） */
export const applyFarmPlacement: ApplyFarmPlacement = (world: VoxelWorld, placement) => {
  for (const b of placement.oldFarm?.blocks ?? []) world.setBlock(b.x, b.y, b.z, b.id);
  for (const w of placement.wild) world.setBlock(w.x, w.y, w.z, WILD_BLOCK[w.kind]);
};
