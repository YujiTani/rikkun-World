import type {
  ApplyFarmPlacement,
  BlockId,
  CropKind,
  FarmPlacedBlock,
  FarmPlacement,
  FarmPlacementFn,
  IslandInfo,
  RegionRect,
  VoxelWorld,
} from '../../contracts';
import { CROP_KINDS, WILD_BLOCK, WORLD_SIZE } from '../../contracts';
import { blockIdFromIndex, blockIndexOf } from '../blocks/blockTypes';
import { GEN_CONFIG as C } from './config';
import { generateIsland } from './generateIsland';
import { createRng, randInt, shuffle } from './random';

/**
 * 置きもの の 場所（M7 §4.5 (0)〜(3)）。シード と 島を作った直後の 地形 だけ で 決まる 純粋な 計算。
 * 世界は 変えない。
 */

const TEST_AREA = { x0: 0, x1: 12, z0: 0, z1: 12 };
const START_AREA = { x0: 59, x1: 69, z0: 59, z1: 69 };
const START_5 = { x0: 62, x1: 66, z0: 62, z1: 66 };
const ROCK_BOX = { x0: 58, x1: 70, z0: 45, z1: 59 };

/** ふるい はたけ の ゆるめ方（段ごと: 距離の はんい・角度） */
const OLD_FARM_TIERS: ReadonlyArray<{ dMin: number; dMax: number; deg: number }> = [
  { dMin: 7, dMax: 12, deg: 40 },
  { dMin: 7, dMax: 16, deg: 40 },
  { dMin: 7, dMax: 20, deg: 60 },
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

const k3 = (x: number, y: number, z: number) => (y * 128 + z) * 128 + x;

function overlaps(a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }) {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
}

/** E から Q への 線が とおる マス（firstBlockOnRay と 同じ 刻み） */
function rayCells(ex: number, ey: number, ez: number, qx: number, qy: number, qz: number): number[][] {
  const len = Math.hypot(qx - ex, qy - ey, qz - ez);
  const steps = Math.ceil(len / C.rayStep);
  const out: number[][] = [];
  let lx = NaN;
  let ly = NaN;
  let lz = NaN;
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, (i * C.rayStep) / len);
    const x = Math.floor(ex + (qx - ex) * t);
    const y = Math.floor(ey + (qy - ey) * t);
    const z = Math.floor(ez + (qz - ez) * t);
    if (x !== lx || y !== ly || z !== lz) out.push([x, y, z]);
    lx = x;
    ly = y;
    lz = z;
  }
  return out;
}

export const computeFarmPlacement: FarmPlacementFn = (seed, pristine) => {
  let world: VoxelWorld;
  let info: IslandInfo;
  if (pristine) {
    world = pristine.world;
    info = pristine.info;
  } else {
    // 同じ シードで 島を作り直す（ArrayVoxelWorld は 重いので 動的 import せず、配列だけの 世界を 作る）
    const made = makeScratchWorld();
    world = made;
    info = generateIsland(seed, made);
  }
  const R = info.regions();
  const SX = world.size.x;
  const SZ = world.size.z;
  const SY = world.size.y;

  // ---- 列ごとの 下ごしらえ
  const hCache = new Int16Array(SX * SZ).fill(-2);
  const h = (x: number, z: number): number => {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return -1;
    const i = z * SX + x;
    let v = hCache[i]!;
    if (v === -2) {
      v = info.groundHeight(x, z);
      hCache[i] = v;
    }
    return v;
  };
  // bit0 = みず、bit1 = 木（みき・はっぱ）
  const flags = new Uint8Array(SX * SZ);
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      let f = 0;
      for (let y = 1; y < SY; y++) {
        const id = world.getBlock(x, y, z);
        if (id === 'water') f |= 1;
        else if (id === 'log' || id === 'leaves') f |= 2;
      }
      flags[z * SX + x] = f;
    }
  }
  const hasWater = (x: number, z: number) => x >= 0 && z >= 0 && x < SX && z < SZ && (flags[z * SX + x]! & 1) !== 0;
  const hasTree = (x: number, z: number) => (flags[z * SX + x]! & 2) !== 0;

  // ---- 守る 見通しの 線（M5 AC7）: 岩山 と、スタートから 見える 木
  const h0S = h(C.spawn.x, C.spawn.z);
  const ex = C.spawn.x + 0.5;
  const ey = h0S + 2.62;
  const ez = C.spawn.z + 0.5;
  const reserved = new Set<number>(); // 岩山の線 と 見える木の線（やせいの やさい は ぜんぶ よける）
  const rockCells = new Set<number>(); // 岩山の線（ふるい はたけ は 1 マスも さえぎらない）
  const treeRays: Set<number>[] = []; // 見える木ごとの線（ふるい はたけ は 1 本は のこす）
  const addRay = (qx: number, qy: number, qz: number) => {
    for (const [x, y, z] of rayCells(ex, ey, ez, qx, qy, qz)) {
      reserved.add(k3(x!, y!, z!));
      rockCells.add(k3(x!, y!, z!));
    }
  };
  {
    let maxH = -1;
    let best: [number, number] = [0, 0];
    for (let z = ROCK_BOX.z0; z <= 59; z++) {
      for (let x = ROCK_BOX.x0; x <= ROCK_BOX.x1; x++) {
        const hh = h(x, z);
        const top = world.getBlock(x, hh, z);
        if (top !== 'stone' && top !== 'coal_ore') continue;
        const better = hh > maxH || (hh === maxH && (z > best[1] || (z === best[1] && Math.abs(x - 64) < Math.abs(best[0] - 64))));
        if (better) {
          maxH = hh;
          best = [x, z];
        }
      }
    }
    if (maxH >= 0) addRay(best[0] + 0.5, maxH + 0.5, best[1] + 0.5);
    // スタートから 見える 木
    for (let z = 0; z < C.centerZ; z++) {
      for (let x = 0; x < SX; x++) {
        const D = 64 - z;
        if (D < 1 || Math.abs(x - 64) > D) continue;
        for (let y = 1; y < SY - 1; y++) {
          if (world.getBlock(x, y, z) !== 'log' || world.getBlock(x, y - 1, z) === 'log') continue;
          let top = y;
          while (world.getBlock(x, top + 1, z) === 'log') top++;
          if (Math.abs(top + 0.5 - ey) > 0.75 * D) continue;
          const cells = rayCells(ex, ey, ez, x + 0.5, top + 0.5, z + 0.5);
          let hit: BlockId | 'outside' = 'air';
          for (const [cx, cy, cz] of cells) {
            const id = world.getBlock(cx!, cy!, cz!);
            if (id !== 'air' && id !== 'water') {
              hit = id;
              break;
            }
          }
          if (hit === 'leaves' || hit === 'log') {
            const set = new Set<number>();
            for (const [cx, cy, cz] of cells) set.add(k3(cx!, cy!, cz!));
            for (const k of set) reserved.add(k);
            treeRays.push(set);
          }
        }
      }
    }
  }

  // 木の みき（根もと base〜てっぺん top）
  const trunks: Array<{ x: number; z: number; base: number; top: number }> = [];
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      if (!hasTree(x, z)) continue;
      for (let y = 1; y < SY - 1; y++) {
        if (world.getBlock(x, y, z) !== 'log' || world.getBlock(x, y - 1, z) === 'log') continue;
        let top = y;
        while (world.getBlock(x, top + 1, z) === 'log') top++;
        trunks.push({ x, z, base: y, top });
      }
    }
  }
  const nearTrunks = trunks.filter((t) => Math.hypot(t.x - 64, t.z - 64) <= 12).length;

  // ---- ふるい はたけ の あと
  const oldFarm = findOldFarm();

  function findOldFarm(): FarmPlacement['oldFarm'] {
    const rng = createRng((seed ^ 0x3c6ef372) >>> 0);
    const all: Array<{ x0: number; z0: number }> = [];
    for (let z0 = 0; z0 <= 63 - 5; z0++) for (let x0 = 65; x0 + 5 < SX; x0++) all.push({ x0, z0 });
    shuffle(rng, all);
    const steps: Array<{ T: { dMin: number; dMax: number; deg: number }; tier: number; trees: boolean }> = [
      ...OLD_FARM_TIERS.map((T, tier) => ({ T, tier, trees: false })),
      // 段 3: 8×8（と まわり 1 列）の 木を 差分として とりのぞく
      { T: { dMin: 7, dMax: 12, deg: 40 }, tier: 3, trees: true },
      { T: { dMin: 7, dMax: 16, deg: 60 }, tier: 3, trees: true },
      { T: { dMin: 7, dMax: 20, deg: 60 }, tier: 3, trees: true },
    ];
    for (const st of steps) {
      for (const c of all) {
        const dist = Math.hypot(c.x0 + 3 - 64.5, c.z0 + 3 - 64.5);
        if (dist < st.T.dMin || dist > st.T.dMax) continue;
        const res = tryOldFarm(c.x0, c.z0, st.T.deg, st.tier, st.trees);
        if (res) return res;
      }
    }
    return null;
  }

  function tryOldFarm(x0: number, z0: number, maxDeg: number, tier: number, removeTrees: boolean): FarmPlacement['oldFarm'] {
    const frame = { x0: x0 - 1, x1: x0 + 6, z0: z0 - 1, z1: z0 + 6 };
    if (frame.x0 < 1 || frame.z0 < 1 || frame.x1 > SX - 2 || frame.z1 > SZ - 2) return null;
    if (overlaps(frame, START_5) || overlaps(frame, TEST_AREA)) return null;
    if (overlaps(frame, R.flat)) return null;
    // 8×8: 木・みず なし、一番上は くさ、高さは h0 か h0+1
    let lo = 999;
    let hi = -999;
    for (let z = frame.z0; z <= frame.z1; z++) {
      for (let x = frame.x0; x <= frame.x1; x++) {
        if (hasWater(x, z) || (hasTree(x, z) && !removeTrees)) return null;
        const hh = h(x, z);
        if (hh < 8 || world.getBlock(x, hh, z) !== 'grass') return null;
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
    }
    if (hi - lo > 1) return null;
    // 6×6 から 横 5 以内に みず なし
    for (let z = z0 - 5; z <= z0 + 10; z++) for (let x = x0 - 5; x <= x0 + 10; x++) if (hasWater(x, z)) return null;
    const h0 = lo;

    // 置く マス（さいごに 書いた ものが 勝つ）
    const m = new Map<number, FarmPlacedBlock>();
    const put = (x: number, y: number, z: number, id: BlockId) => m.set(k3(x, y, z), { x, y, z, id });
    let maxY = h0 + 6;
    if (removeTrees) {
      const ring = { x0: x0 - 2, x1: x0 + 7, z0: z0 - 2, z1: z0 + 7 };
      const inRing = (x: number, z: number) => x >= ring.x0 && x <= ring.x1 && z >= ring.z0 && z <= ring.z1;
      let removedNear = 0;
      for (const t of trunks) {
        if (!inRing(t.x, t.z)) continue;
        for (let y = t.base; y <= t.top; y++) put(t.x, y, t.z, 'air');
        for (let y = t.top - 1; y <= t.top + 2; y++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (world.getBlock(t.x + dx, y, t.z + dz) === 'leaves') put(t.x + dx, y, t.z + dz, 'air');
            }
          }
        }
        maxY = Math.max(maxY, t.top + 2);
        if (Math.hypot(t.x - 64, t.z - 64) <= 12) removedNear++;
      }
      if (nearTrunks - removedNear < 3) return null;
      for (let z = ring.z0; z <= ring.z1; z++) {
        for (let x = ring.x0; x <= ring.x1; x++) {
          if (!hasTree(x, z)) continue;
          for (let y = 1; y < SY; y++) {
            const id = world.getBlock(x, y, z);
            if (id === 'leaves' || id === 'log') {
              put(x, y, z, 'air');
              maxY = Math.max(maxY, y);
            }
          }
        }
      }
    }
    for (let lz = 0; lz < 6; lz++) {
      for (let lx = 0; lx < 6; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        if (h(x, z) === h0 + 1) {
          put(x, h0 - 3, z, 'dirt'); // 地層（くさ の下は つち 3 まい）
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
    const blocked = (set: Set<number>) => {
      for (const b of m.values()) if (b.id !== 'air' && set.has(k3(b.x, b.y, b.z))) return true;
      return false;
    };
    const cut = (set: Set<number>) => {
      for (const b of m.values()) if (b.id === 'air' && set.has(k3(b.x, b.y, b.z)) && world.getBlock(b.x, b.y, b.z) !== 'air') return true;
      return false;
    };
    if (blocked(rockCells) || cut(rockCells)) return null;
    if (treeRays.length > 0 && treeRays.every((r) => blocked(r) || cut(r))) return null;

    // (b) 目の位置から かかし の あたま への 向き と 見通し
    const qx = kx + 0.5;
    const qy = h0 + 2.5;
    const qz = kz + 0.5;
    const deg = (Math.atan2(qx - ex, -(qz - ez)) * 180) / Math.PI;
    if (deg < 0 || deg > maxDeg) return null;
    const cells = rayCells(ex, ey, ez, qx, qy, qz);
    for (const [cx, cy, cz] of cells) {
      const key = k3(cx!, cy!, cz!);
      const pre = m.get(key)?.id ?? world.getBlock(cx!, cy!, cz!);
      const isTarget = cx === kx && cz === kz && cy === h0 + 2;
      if (!isTarget && pre !== 'air' && pre !== 'water') return null; // 置く前の 地形
      const now = m.get(key)?.id ?? pre;
      if (isTarget) continue;
      if (now !== 'air' && now !== 'water' && now !== 'saku' && now !== 'kakashi' && now !== 'kakashi_head') return null;
    }

    const blocks = [...m.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
    return {
      blocks,
      tansu: { x: tx, y: h0 + 1, z: tz },
      tansuItems: TANSU_ITEMS.map((t) => ({ item: t.item, count: t.count })),
      kakashi: { x: kx, y: h0 + 1, z: kz },
      box: { x0: frame.x0, z0: frame.z0, x1: frame.x1, z1: frame.z1, y0: h0 - 3, y1: maxY },
      tier: tier as 0 | 1 | 2 | 3,
    };
  }

  // ---- やせいの やさい
  const wild: FarmPlacement['wild'] = [];
  const farmFrame = oldFarm ? oldFarm.box : null;
  const inFlat = (x: number, z: number) => x >= R.flat.x0 && x <= R.flat.x1 && z >= R.flat.z0 && z <= R.flat.z1;
  const rectDist = (x: number, z: number, r: RegionRect) =>
    Math.max(Math.max(0, r.x0 - x, x - r.x1), Math.max(0, r.z0 - z, z - r.z1));
  const nearPond = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (Math.hypot(x + dx - R.pond.cx, z + dz - R.pond.cz) <= R.pond.r) return true;
    return false;
  };

  const eligibleBase = (x: number, z: number): number | null => {
    if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) return null;
    if (x >= TEST_AREA.x0 && x <= TEST_AREA.x1 && z >= TEST_AREA.z0 && z <= TEST_AREA.z1) return null;
    if (x >= START_AREA.x0 && x <= START_AREA.x1 && z >= START_AREA.z0 && z <= START_AREA.z1) return null;
    if (farmFrame && x >= farmFrame.x0 - 1 && x <= farmFrame.x1 + 1 && z >= farmFrame.z0 - 1 && z <= farmFrame.z1 + 1) return null;
    const hh = h(x, z);
    if (hh < 7 || world.getBlock(x, hh, z) !== 'grass' || world.getBlock(x, hh + 1, z) !== 'air') return null;
    if (hasTree(x, z) && world.getBlock(x, hh + 1, z) !== 'air') return null;
    if (reserved.has(k3(x, hh + 1, z))) return null;
    return hh;
  };

  const rules: Record<CropKind, Array<(x: number, z: number) => boolean>> = {
    tomato: [1, 2].map((_, i) => {
      const w = i === 0 ? 2 : 4;
      return (x: number, z: number) => {
        if (inFlat(x, z)) return false;
        const d = rectDist(x, z, R.flat);
        if (d < 1 || d > w) return false;
        return z < R.flat.z0 || x > R.flat.x1; // 北と東がわ
      };
    }),
    pumpkin: [12, 15].map(
      (r) => (x: number, z: number) => Math.hypot(x - R.meadow.cx, z - R.meadow.cz) <= r && !nearPond(x, z) && h(x, z) !== 7,
    ),
    eggplant: [3, 5].map((w) => (x: number, z: number) => {
      if (inFlat(x, z)) return false;
      const d = Math.min(...R.river.map((r) => rectDist(x, z, r)));
      return d >= 1 && d <= w;
    }),
    onion: [
      [9, 12],
      [7, 14],
    ].map(([a, b]) => (x: number, z: number) => {
      const d = Math.hypot(x - R.forest.cx, z - R.forest.cz);
      return d >= a! && d <= b!;
    }),
  };

  const taken: Array<{ x: number; z: number }> = [];
  const farEnough = (x: number, z: number) => taken.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) >= 3);
  CROP_KINDS.forEach((kind, ki) => {
    const rng = createRng((seed ^ (0x9e3779b9 + ki * 0x632be5ab)) >>> 0);
    const want = randInt(rng, 4, 6);
    const order: Array<{ x: number; z: number }> = [];
    for (let z = 1; z < SZ - 1; z++) for (let x = 1; x < SX - 1; x++) order.push({ x, z });
    shuffle(rng, order);
    let got = 0;
    for (let level = 0; level < 2; level++) {
      if (level === 1 && got >= 4) break;
      const rule = rules[kind][level]!;
      for (const c of order) {
        if (got >= want) break;
        if (!rule(c.x, c.z) || !farEnough(c.x, c.z)) continue;
        const hh = eligibleBase(c.x, c.z);
        if (hh === null) continue;
        wild.push({ x: c.x, y: hh + 1, z: c.z, kind });
        taken.push({ x: c.x, z: c.z });
        got++;
      }
    }
  });

  return { wild, oldFarm };
};

/** 新しい世界に 置く（島を作った直後に 1 回。たんす の 中身は 置かない） */
export const applyFarmPlacement: ApplyFarmPlacement = (world, placement) => {
  for (const b of placement.oldFarm?.blocks ?? []) world.setBlock(b.x, b.y, b.z, b.id);
  for (const w of placement.wild) world.setBlock(w.x, w.y, w.z, WILD_BLOCK[w.kind]);
};

// ---------------------------------------------------------------- 島を作り直す用の 配列だけの 世界

function makeScratchWorld(): VoxelWorld {
  const size = { ...WORLD_SIZE };
  const data = new Uint8Array(size.x * size.y * size.z);
  const inside = (x: number, y: number, z: number) =>
    Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= 0 && y >= 0 && z >= 0 && x < size.x && y < size.y && z < size.z;
  const idx = (x: number, y: number, z: number) => (y * size.z + z) * size.x + x;
  return {
    size,
    getBlock: (x, y, z) => (inside(x, y, z) ? blockIdFromIndex(data[idx(x, y, z)]!) : 'outside'),
    setBlock: (x, y, z, id) => {
      const b = blockIndexOf(id);
      if (b < 0 || !inside(x, y, z)) return false;
      data[idx(x, y, z)] = b;
      return true;
    },
    isSolid: (x, y, z) => {
      if (!inside(x, y, z)) return false;
      const id = blockIdFromIndex(data[idx(x, y, z)]!);
      return id !== 'air' && id !== 'water' && id !== 'torch' && id !== 'start_torch';
    },
  } as VoxelWorld;
}
