import type { BlockId, GenerateIsland, IslandInfo, RegionRect, SpawnPoint, TestArea, VoxelWorld, WorldRegions } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { createRng, randInt, shuffle, valueNoise, type Rng } from './random';

type Change = [x: number, y: number, z: number, prev: BlockId | 'outside'];

/** 見通しの判定（AC7 (4)(8)）。E から Q へ 0.05 マスごとに調べ、air・water 以外で最初のブロックを返す */
export function firstBlockOnRay(
  world: VoxelWorld,
  ex: number,
  ey: number,
  ez: number,
  qx: number,
  qy: number,
  qz: number,
): { id: BlockId | 'outside'; x: number; y: number; z: number } {
  const dx = qx - ex;
  const dy = qy - ey;
  const dz = qz - ez;
  const len = Math.hypot(dx, dy, dz);
  const steps = Math.ceil(len / C.rayStep);
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, (i * C.rayStep) / len);
    const x = Math.floor(ex + dx * t);
    const y = Math.floor(ey + dy * t);
    const z = Math.floor(ez + dz * t);
    const id = world.getBlock(x, y, z);
    if (id !== 'air' && id !== 'water') return { id, x, y, z };
  }
  return { id: 'air', x: Math.floor(qx), y: Math.floor(qy), z: Math.floor(qz) };
}

/** M7 の 固くない ブロック（やせいの やさい・作物・かかし・さく）は 「一番上」に 数えない */
function isSoftM7(id: BlockId): boolean {
  return id.startsWith('wild_') || id.startsWith('crop_') || id === 'kakashi' || id === 'kakashi_head' || id === 'saku';
}

/** 一番上の「地形」ブロック（き・はっぱ・みず・くうきを除く）の y。なければ -1 */
function terrainTop(world: VoxelWorld, x: number, z: number): number {
  for (let y = world.size.y - 1; y >= 0; y--) {
    const id = world.getBlock(x, y, z);
    if (id === 'outside') return -1;
    if (id !== 'air' && id !== 'water' && id !== 'log' && id !== 'leaves' && id !== 'torch' && id !== 'start_torch' && !isSoftM7(id)) return y;
  }
  return -1;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inRect = (x: number, z: number, r: RegionRect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** 「中心からの角度」ごとの岸の半径 R(x,z)。d < R の列が陸（4-2） */
function makeCoast(rng: Rng): (x: number, z: number) => number {
  const k = C.coast;
  const phN = k.northWobble.map(() => rng() * Math.PI * 2);
  const phO = k.otherWobble.map(() => rng() * Math.PI * 2);
  const baseN = k.northMean[0] + rng() * (k.northMean[1] - k.northMean[0]);
  const baseO = k.otherMean[0] + rng() * (k.otherMean[1] - k.otherMean[0]);
  return (x, z) => {
    const th = Math.atan2(z - C.centerZ, x - C.centerX);
    if (z < k.northZ) {
      let r = baseN;
      k.northWobble.forEach((a, i) => (r += a * Math.sin(th * (i + 2) + phN[i]!)));
      return clamp(r, k.northMin, k.northMax);
    }
    let r = baseO;
    k.otherWobble.forEach((a, i) => (r += a * Math.sin(th * (i + 2) + phO[i]!)));
    const deg = (th * 180) / Math.PI;
    for (const s of k.farSectors) {
      const center = (s.fromDeg + s.toDeg) / 2;
      const half = (s.toDeg - s.fromDeg) / 2;
      const diff = ((((deg - center) % 360) + 540) % 360) - 180;
      if (Math.abs(diff) <= half) r = Math.max(r, s.min);
    }
    return clamp(r, k.otherMin, k.otherMax);
  };
}

export const generateIsland: GenerateIsland = (seed: number, world: VoxelWorld): IslandInfo => {
  const t0 = performance.now();
  const sx = world.size.x;
  const sy = world.size.y;
  const sz = world.size.z;
  const N = sx * sz;
  const rng = createRng(seed);
  const idx = (x: number, z: number) => z * sx + x;
  const CX = C.centerX;
  const CZ = C.centerZ;
  const dist = (x: number, z: number) => Math.hypot(x - CX, z - CZ);

  // ---- 決めごと（シードで変わる）
  const h0 = C.plateauHeightMin + Math.floor(rng() * C.plateauHeightChoices);
  const rk = C.rock;
  const rock = {
    cx: randInt(rng, rk.cxMin, rk.cxMax),
    cz: randInt(rng, rk.czMin, rk.czMax),
    r: rk.radiusMin + rng() * (rk.radiusMax - rk.radiusMin),
  };
  const rockPeak = h0 + randInt(rng, rk.peakOverPlateauMin, rk.peakOverPlateauMax);
  const mt = C.mountain;
  const mtn = { cx: randInt(rng, mt.cxMin, mt.cxMax), cz: randInt(rng, mt.czMin, mt.czMax), r: mt.radius };
  const fo = C.forest;
  const forest = { cx: randInt(rng, fo.cxMin, fo.cxMax), cz: randInt(rng, fo.czMin, fo.czMax), r: fo.radius };
  const fl = C.flat;
  const fx0 = randInt(rng, fl.x0Min, fl.x0Max);
  const fz0 = randInt(rng, fl.z0Min, fl.z0Max);
  const flat: RegionRect = { x0: fx0, z0: fz0, x1: fx0 + fl.w - 1, z1: fz0 + fl.d - 1 };
  const spring = { cx: fx0 - 2, cz: randInt(rng, C.spring.czMin, C.spring.czMax), r: C.spring.radius };
  const river: RegionRect[] = [
    { x0: fx0 - C.riverWidth, z0: spring.cz, x1: fx0 - 1, z1: fz0 + fl.d + 2 },
    { x0: fx0 - C.riverWidth, z0: fz0 + fl.d, x1: sx - 1, z1: fz0 + fl.d + 2 },
  ];
  const me = C.meadow;
  const meadow = { cx: randInt(rng, me.cxMin, me.cxMax), cz: randInt(rng, me.czMin, me.czMax), r: me.radius };
  const pondCfg = C.pond;
  let pond = { cx: meadow.cx, cz: meadow.cz - pondCfg.maxFromMeadowCenter, r: pondCfg.radiusMin };
  for (let tries = 0; tries < 60; tries++) {
    const ang = rng() * Math.PI * 2;
    const dd = rng() * pondCfg.maxFromMeadowCenter;
    const cand = {
      cx: Math.round(meadow.cx + Math.cos(ang) * dd),
      cz: Math.round(meadow.cz + Math.sin(ang) * dd),
      r: pondCfg.radiusMin + rng() * (pondCfg.radiusMax - pondCfg.radiusMin),
    };
    if (dist(cand.cx, cand.cz) <= pondCfg.maxFromWorldCenter) {
      pond = cand;
      break;
    }
  }
  const coastR = makeCoast(rng);
  const noiseSeed = (seed ^ 0x5bd1e995) | 0;
  const hillSeed = (seed ^ 0x2545f491) | 0;

  // ---- 水・陸の地図
  const land = new Uint8Array(N);
  const fresh = new Uint8Array(N); // かわ・いずみ・いけ
  const pondWater = new Uint8Array(N);
  const isWater = new Uint8Array(N);
  const rockCol = new Uint8Array(N);
  const rockPin = new Int32Array(N);
  const coastMap = new Float32Array(N);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      coastMap[i] = coastR(x, z);
      land[i] = dist(x, z) < coastMap[i]! ? 1 : 0;
      const inPond = Math.hypot(x - pond.cx, z - pond.cz) <= pond.r;
      if (inPond) pondWater[i] = 1;
      if (inPond || Math.hypot(x - spring.cx, z - spring.cz) <= spring.r || river.some((r) => inRect(x, z, r))) {
        fresh[i] = 1;
      }
      isWater[i] = !land[i] || fresh[i] ? 1 : 0;
      const dm = Math.hypot(x - rock.cx, z - rock.cz);
      if (dm <= rock.r) {
        rockCol[i] = 1;
        rockPin[i] = rockPeak - Math.floor(dm);
      }
    }
  }
  const inFlat = new Uint8Array(N);
  for (let z = flat.z0; z <= flat.z1; z++) for (let x = flat.x0; x <= flat.x1; x++) inFlat[idx(x, z)] = 1;
  const rim = new Uint8Array(N);
  for (let z = 1; z < sz - 1; z++) {
    for (let x = 1; x < sx - 1; x++) {
      if (isWater[idx(x, z)]) continue;
      for (let dz = -1; dz <= 1 && !rim[idx(x, z)]; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (pondWater[idx(x + dx, z + dz)]) {
            rim[idx(x, z)] = 1;
            break;
          }
        }
      }
    }
  }
  const plateau = new Uint8Array(N);
  for (let z = CZ - C.plateauHalf; z <= CZ + C.plateauHalf; z++) {
    for (let x = CX - C.plateauHalf; x <= CX + C.plateauHalf; x++) plateau[idx(x, z)] = 1;
  }

  // ---- 高さの下書き（ゆるい丘）
  const raw = new Int32Array(N);
  const topPlain = h0 + C.terrainOverPlateau;
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (isWater[i]) {
        raw[i] = C.seaH;
        continue;
      }
      const d = dist(x, z);
      const u = clamp(1 - d / coastMap[i]!, 0, 1);
      const b = C.beachH + (topPlain - C.beachH) * Math.pow(u, 0.6);
      const n = valueNoise(noiseSeed, x, z, 7) - 0.5;
      let v = Math.round(b + n * 2.4);
      const w = clamp((d - C.hillStart) / C.hillRamp, 0, 1);
      if (w > 0) v += Math.round(w * (valueNoise(hillSeed, x, z, 18) - 0.35) * 7);
      raw[i] = clamp(v, C.beachH, C.landMaxH);
    }
  }
  // 岩山・スタートの平らな所から、傾き 1 のすそ野（固定した所がならしで下がらないように）
  const base = raw.slice();
  const lowFixed = (i: number) => isWater[i] === 1 || inFlat[i] === 1 || rim[i] === 1;
  const raiseCone = (px: number, pz: number, pin: number, radius: number) => {
    for (let z = Math.max(0, pz - radius); z <= Math.min(sz - 1, pz + radius); z++) {
      for (let x = Math.max(0, px - radius); x <= Math.min(sx - 1, px + radius); x++) {
        const i = idx(x, z);
        if (lowFixed(i)) continue;
        const c = pin - (Math.abs(x - px) + Math.abs(z - pz));
        if (c > base[i]!) base[i] = c;
      }
    }
  };
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (rockCol[i]) raiseCone(x, z, rockPin[i]!, 9);
      if (plateau[i]) raiseCone(x, z, h0, 8);
    }
  }
  // 固定する所と、はんいをしぼる所
  const fixed: [number, number][] = [];
  const clamps: [number, number, number][] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (isWater[i]) fixed.push([i, C.seaH]);
      else if (inFlat[i] || rim[i]) fixed.push([i, C.beachH]);
      else if (plateau[i]) fixed.push([i, h0]);
      else if (rockCol[i]) fixed.push([i, rockPin[i]!]);
      else if (Math.hypot(x - meadow.cx, z - meadow.cz) <= meadow.r) clamps.push([i, me.hMin, me.hMax]);
      else if (dist(x, z) <= C.plateauNearRadius) clamps.push([i, C.beachH, topPlain]);
    }
  }

  /** となりとの差を 1 以下にする（下げる方向だけ） */
  const smooth = (hm: Int32Array) => {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const i = idx(x, z);
        if (x > 0) hm[i] = Math.min(hm[i]!, hm[i - 1]! + 1);
        if (z > 0) hm[i] = Math.min(hm[i]!, hm[i - sx]! + 1);
      }
    }
    for (let z = sz - 1; z >= 0; z--) {
      for (let x = sx - 1; x >= 0; x--) {
        const i = idx(x, z);
        if (x < sx - 1) hm[i] = Math.min(hm[i]!, hm[i + 1]! + 1);
        if (z < sz - 1) hm[i] = Math.min(hm[i]!, hm[i + sx]! + 1);
      }
    }
  };

  /** やま の頂上 (px,pz,ph) を仮にきめて、高さの地図を作る */
  const buildHeights = (px: number, pz: number, ph: number): Int32Array => {
    const hm = base.slice();
    const R = 30;
    for (let z = Math.max(0, pz - R); z <= Math.min(sz - 1, pz + R); z++) {
      for (let x = Math.max(0, px - R); x <= Math.min(sx - 1, px + R); x++) {
        const i = idx(x, z);
        if (lowFixed(i)) continue;
        const c = ph - Math.ceil(mt.slope * Math.hypot(x - px, z - pz));
        if (c > hm[i]!) hm[i] = c;
      }
    }
    for (const [i, lo, hi] of clamps) hm[i] = clamp(hm[i]!, lo, hi);
    for (const [i, v] of fixed) hm[i] = v;
    hm[idx(px, pz)] = Math.max(hm[idx(px, pz)]!, ph);
    smooth(hm);
    return hm;
  };

  // ---- やま の頂上をえらぶ（段差 1 以下が守れる所・高さを幅の中から）
  const cands: number[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (Math.hypot(x - mtn.cx, z - mtn.cz) <= mt.peakSearchRadius && !lowFixed(i) && !rockCol[i]) cands.push(i);
    }
  }
  shuffle(rng, cands);
  let hmFound: Int32Array | null = null;
  let peak = { x: mtn.cx, z: mtn.cz, h: mt.peakHMin };
  let bestAny: { hm: Int32Array; x: number; z: number; h: number } | null = null;
  search: for (const i of cands.slice(0, 60)) {
    const px = i % sx;
    const pz = (i - px) / sx;
    const want = randInt(rng, mt.peakHMin, mt.peakHMax);
    for (let ph = want; ph >= mt.peakHMin; ph--) {
      const t = buildHeights(px, pz, ph);
      const got = t[i]!;
      if (got === ph) {
        hmFound = t;
        peak = { x: px, z: pz, h: ph };
        break search;
      }
      if (!bestAny || got > bestAny.h) bestAny = { hm: t, x: px, z: pz, h: got };
    }
  }
  if (!hmFound) {
    const b = bestAny ?? { hm: buildHeights(mtn.cx, mtn.cz, mt.peakHMin), x: mtn.cx, z: mtn.cz, h: mt.peakHMin };
    hmFound = b.hm;
    peak = { x: b.x, z: b.z, h: b.h };
  }
  const H: Int32Array = hmFound;

  // ---- 地層
  // 「うみ」から 3 マス以内（x・z とも）の列
  const nearSea = new Uint8Array(N);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (land[idx(x, z)]) continue;
      for (let dz = -3; dz <= 3; dz++) {
        const zz = z + dz;
        if (zz < 0 || zz >= sz) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < sx) nearSea[idx(xx, zz)] = 1;
        }
      }
    }
  }
  const mountainCols: number[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (Math.hypot(x - mtn.cx, z - mtn.cz) <= mtn.r && !isWater[i] && !rockCol[i]) mountainCols.push(i);
    }
  }
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      const h = H[i]!;
      world.setBlock(x, 0, z, 'bedrock');
      if (isWater[i]) {
        const bottom: BlockId = land[i] ? 'dirt' : 'sand';
        world.setBlock(x, h, z, bottom);
        world.setBlock(x, h - 1, z, bottom);
        for (let y = 1; y <= h - 2; y++) world.setBlock(x, y, z, 'stone');
        world.setBlock(x, C.waterY, z, 'water');
      } else if (rockCol[i] || h >= mt.stoneFromH) {
        for (let y = 1; y <= h; y++) world.setBlock(x, y, z, 'stone');
      } else if (h <= C.beachH && nearSea[i] && !inFlat[i]) {
        world.setBlock(x, h, z, 'sand');
        world.setBlock(x, h - 1, z, 'sand');
        for (let y = 1; y <= h - 2; y++) world.setBlock(x, y, z, 'stone');
      } else {
        world.setBlock(x, h, z, 'grass');
        for (let y = h - 3; y < h; y++) world.setBlock(x, y, z, 'dirt');
        for (let y = 1; y <= h - 4; y++) world.setBlock(x, y, z, 'stone');
      }
    }
  }

  placeOres(world, rng, sx, sz);
  placeMountainOres(world, rng, H, mountainCols, sx);
  placeVisibleCoal(world, rng, H, rockCol, sx, sz, h0);
  placeTrees(world, rng, { H, sx, sz, forest, meadow, flat });
  placeStartTorch(world, H);

  const regions: WorldRegions = {
    center: { x: CX, z: CZ },
    startH0: h0,
    mountain: { cx: mtn.cx, cz: mtn.cz, r: mtn.r, peak: { x: peak.x, z: peak.z, h: H[idx(peak.x, peak.z)]! } },
    rock: { cx: rock.cx, cz: rock.cz, r: rock.r },
    forest: { ...forest },
    flat: { ...flat },
    spring: { ...spring },
    river: river.map((r) => ({ ...r })),
    meadow: { ...meadow },
    pond: { ...pond },
  };

  const genTimeMs = performance.now() - t0;
  const spawnCfg = C.spawn;
  return {
    seed,
    genTimeMs,
    groundHeight: (x, z) => terrainTop(world, x, z),
    spawn(): SpawnPoint {
      let top = -1;
      for (let y = sy - 1; y >= 0; y--) {
        if (world.isSolid(spawnCfg.x, y, spawnCfg.z)) {
          top = y;
          break;
        }
      }
      return {
        x: spawnCfg.x + 0.5,
        y: top + 1,
        z: spawnCfg.z + 0.5,
        yawDeg: spawnCfg.yawDeg,
        pitchDeg: spawnCfg.pitchDeg,
      };
    },
    testArea(): TestArea {
      return { ...C.testArea };
    },
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
  };
};

/** スタートのすぐ横（平らな所の中）に、こわれない たいまつ を置く */
function placeStartTorch(world: VoxelWorld, H: Int32Array): void {
  const x = C.spawn.x + C.startTorch.dx;
  const z = C.spawn.z + C.startTorch.dz;
  world.setBlock(x, H[z * world.size.x + x]! + 1, z, 'start_torch');
}

// ------------------------------------------------------------------ 見えるせきたん（岩山の表面）

function placeVisibleCoal(
  world: VoxelWorld,
  rng: Rng,
  H: Int32Array,
  rockCol: Uint8Array,
  sx: number,
  sz: number,
  h0: number,
): void {
  const exposed = (x: number, y: number, z: number) =>
    world.getBlock(x + 1, y, z) === 'air' ||
    world.getBlock(x - 1, y, z) === 'air' ||
    world.getBlock(x, y, z + 1) === 'air' ||
    world.getBlock(x, y, z - 1) === 'air' ||
    world.getBlock(x, y + 1, z) === 'air';
  const south: [number, number, number][] = [];
  const other: [number, number, number][] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      if (!rockCol[z * sx + x]) continue;
      const h = H[z * sx + x]!;
      for (let y = Math.max(1, h0 - 1); y <= Math.min(h, C.rock.coalMaxY); y++) {
        if (world.getBlock(x, y, z) !== 'stone' || !exposed(x, y, z)) continue;
        if (world.getBlock(x, y, z + 1) === 'air') south.push([x, y, z]);
        else other.push([x, y, z]);
      }
    }
  }
  shuffle(rng, south);
  shuffle(rng, other);
  const half = Math.ceil(C.rock.visibleCoal / 2);
  const picks = [...south.slice(0, half), ...other, ...south.slice(half)];
  for (const [x, y, z] of picks.slice(0, C.rock.visibleCoal)) world.setBlock(x, y, z, 'coal_ore');
}

// ------------------------------------------------------------------ 鉱石

const DIRS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

function placeOres(world: VoxelWorld, rng: Rng, sx: number, sz: number): void {
  const run = (
    id: 'coal_ore' | 'iron_ore',
    cfg: { minY: number; maxY: number; clusterMin: number; clusterMax: number; wantAtLeast: number },
  ) => {
    let have = 0;
    for (let c = 0; c < C.ores.maxClusters && have < cfg.wantAtLeast; c++) {
      let x = randInt(rng, 0, sx - 1);
      let y = randInt(rng, cfg.minY, cfg.maxY);
      let z = randInt(rng, 0, sz - 1);
      const size = randInt(rng, cfg.clusterMin, cfg.clusterMax);
      for (let i = 0; i < size; i++) {
        if (y >= cfg.minY && y <= cfg.maxY && world.getBlock(x, y, z) === 'stone') {
          world.setBlock(x, y, z, id);
          have++;
        }
        const d = DIRS[randInt(rng, 0, 5)]!;
        x += d[0];
        y += d[1];
        z += d[2];
      }
    }
  };
  run('coal_ore', C.ores.coal);
  run('iron_ore', C.ores.iron);
}

/** やま の中（y ≥ 8）と表面の鉱石（4-4）。やまの列の中だけに置く */
function placeMountainOres(world: VoxelWorld, rng: Rng, H: Int32Array, cols: number[], sx: number): void {
  const O = C.ores;
  if (cols.length === 0) return;
  const inSet = new Set(cols);
  const countIn = (id: BlockId, minY: number, maxY: number) => {
    let n = 0;
    for (const i of cols) {
      const x = i % sx;
      const z = (i - x) / sx;
      for (let y = minY; y <= Math.min(maxY, H[i]!); y++) if (world.getBlock(x, y, z) === id) n++;
    }
    return n;
  };
  const cluster = (id: 'coal_ore' | 'iron_ore', minY: number, maxY: number, cmin: number, cmax: number) => {
    const i = cols[randInt(rng, 0, cols.length - 1)]!;
    const top = Math.min(maxY, H[i]!);
    if (top < minY) return;
    let x = i % sx;
    let z = (i - x) / sx;
    let y = randInt(rng, minY, top);
    const size = randInt(rng, cmin, cmax);
    for (let k = 0; k < size; k++) {
      if (y >= minY && y <= maxY && inSet.has(z * sx + x) && world.getBlock(x, y, z) === 'stone') world.setBlock(x, y, z, id);
      const d = DIRS[randInt(rng, 0, 5)]!;
      x += d[0];
      y += d[1];
      z += d[2];
    }
  };
  let coal = countIn('coal_ore', O.mountainMinY, 99);
  let iron = countIn('iron_ore', O.mountainIronMinY, O.mountainIronMaxY);
  for (let t = 0; t < 3000 && (coal < O.mountainCoalWant || iron < O.mountainIronWant); t++) {
    if (coal < O.mountainCoalWant) cluster('coal_ore', O.mountainMinY, 99, 2, 5);
    if (iron < O.mountainIronWant) cluster('iron_ore', O.mountainIronMinY, O.mountainIronMaxY, 2, 3);
    if (t % 10 === 9) {
      coal = countIn('coal_ore', O.mountainMinY, 99);
      iron = countIn('iron_ore', O.mountainIronMinY, O.mountainIronMaxY);
    }
  }
  // 表面（くうき にふれている面がある石）
  const exposed = (x: number, y: number, z: number) => DIRS.some((d) => world.getBlock(x + d[0], y + d[1], z + d[2]) === 'air');
  const surf: [number, number, number][] = [];
  for (const i of cols) {
    const x = i % sx;
    const z = (i - x) / sx;
    const h = H[i]!;
    if (h >= C.mountain.stoneFromH && world.getBlock(x, h, z) === 'stone' && exposed(x, h, z)) surf.push([x, h, z]);
  }
  shuffle(rng, surf);
  let k = 0;
  for (let n = 0; n < O.mountainSurfaceCoal && k < surf.length; n++, k++) world.setBlock(surf[k]![0], surf[k]![1], surf[k]![2], 'coal_ore');
  for (let n = 0; n < O.mountainSurfaceIron && k < surf.length; n++, k++) world.setBlock(surf[k]![0], surf[k]![1], surf[k]![2], 'iron_ore');
}

// ------------------------------------------------------------------ 木

interface TreeCtx {
  H: Int32Array;
  sx: number;
  sz: number;
  forest: { cx: number; cz: number; r: number };
  meadow: { cx: number; cz: number; r: number };
  flat: RegionRect;
}

function inNoTrunkBox(x: number, z: number): boolean {
  return C.noTrunkBoxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
}

function placeTrees(world: VoxelWorld, rng: Rng, ctx: TreeCtx): void {
  const { H, sx, sz, forest, meadow, flat } = ctx;
  const T = C.trees;
  const trunks: { x: number; z: number; f: boolean }[] = [];
  const dist = (x: number, z: number) => Math.hypot(x - C.centerX, z - C.centerZ);
  const inForest = (x: number, z: number) => Math.hypot(x - forest.cx, z - forest.cz) <= forest.r;

  const set = (changes: Change[], x: number, y: number, z: number, id: BlockId, onlyAir: boolean) => {
    const prev = world.getBlock(x, y, z);
    if (onlyAir && prev !== 'air') return;
    if (world.setBlock(x, y, z, id)) changes.push([x, y, z, prev]);
  };

  const canPlace = (x: number, z: number): boolean => {
    if (x < 3 || z < 3 || x > sx - 4 || z > sz - 4) return false;
    if (inNoTrunkBox(x, z)) return false;
    if (Math.hypot(x - meadow.cx, z - meadow.cz) <= meadow.r) return false;
    const fx = Math.max(0, flat.x0 - x, x - flat.x1);
    const fz = Math.max(0, flat.z0 - z, z - flat.z1);
    if (Math.max(fx, fz) < T.flatMargin) return false;
    const h = H[z * sx + x]!;
    if (h > C.landMaxH || world.getBlock(x, h, z) !== 'grass') return false;
    const f = inForest(x, z);
    return trunks.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) >= (f && t.f ? T.forestSpacing : T.spacing));
  };

  const place = (x: number, z: number, trunk: number): Change[] => {
    const changes: Change[] = [];
    const h = H[z * sx + x]!;
    const top = h + trunk;
    for (let y = h + 1; y <= top; y++) set(changes, x, y, z, 'log', false);
    for (let y = top - 1; y <= top + 2; y++) {
      const r = y <= top ? 2 : 1;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (y <= top && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (y === top + 2 && Math.abs(dx) + Math.abs(dz) > 1) continue;
          set(changes, x + dx, y, z + dz, 'leaves', true);
        }
      }
    }
    trunks.push({ x, z, f: inForest(x, z) });
    return changes;
  };

  const undo = (changes: Change[]) => {
    for (let i = changes.length - 1; i >= 0; i--) {
      const [x, y, z, prev] = changes[i]!;
      if (prev !== 'outside') world.setBlock(x, y, z, prev);
    }
    trunks.pop();
  };

  // 1) スタートから見える木（M1-01 §4-5）。見えなければ元にもどして次の候補へ
  const ex = C.centerX + 0.5;
  const ey = H[C.centerZ * sx + C.centerX]! + 1 + C.eyeHeight;
  const ez = C.centerZ + 0.5;
  const cands: { x: number; z: number; trunk: number }[] = [];
  for (let z = 0; z < C.centerZ; z++) {
    for (let x = 0; x < sx; x++) {
      const dx = Math.abs(x - C.centerX);
      const depth = C.centerZ - z;
      if (dx < T.visibleMinDx || depth < 1 || dx > depth || depth > 36) continue;
      for (let trunk = T.trunkMin; trunk <= T.trunkMax; trunk++) cands.push({ x, z, trunk });
    }
  }
  shuffle(rng, cands);
  let nearCount = 0;
  let tries = 0;
  for (const c of cands) {
    if (!canPlace(c.x, c.z)) continue;
    const topY = H[c.z * sx + c.x]! + c.trunk;
    const depth = C.centerZ - c.z;
    if (Math.abs(topY + 0.5 - ey) > 0.75 * depth) continue;
    if (++tries > 400) break;
    const changes = place(c.x, c.z, c.trunk);
    const hit = firstBlockOnRay(world, ex, ey, ez, c.x + 0.5, topY + 0.5, c.z + 0.5);
    if (hit.id === 'leaves' || hit.id === 'log') {
      if (dist(c.x, c.z) <= T.nearDistance) nearCount++;
      break;
    }
    undo(changes);
  }

  // 2) スタートの近く（d ≤ 12）に 3 本以上
  const pool: { x: number; z: number }[] = [];
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) pool.push({ x, z });
  shuffle(rng, pool);
  for (const p of pool) {
    if (nearCount >= T.nearMin) break;
    if (dist(p.x, p.z) > T.nearDistance || !canPlace(p.x, p.z)) continue;
    place(p.x, p.z, randInt(rng, T.trunkMin, T.trunkMax));
    nearCount++;
  }

  // 3) もり: 間かく 3 の格子（行ごとにずらす）から、25 本以上
  const lattice: { x: number; z: number }[] = [];
  for (let z = forest.cz - forest.r; z <= forest.cz + forest.r; z += T.forestSpacing) {
    const shift = randInt(rng, 0, T.forestSpacing - 1);
    for (let x = forest.cx - forest.r + shift; x <= forest.cx + forest.r; x += T.forestSpacing) {
      if (inForest(x, z)) lattice.push({ x, z });
    }
  }
  shuffle(rng, lattice);
  const wantForest = randInt(rng, C.forest.wantAtLeast, C.forest.wantMax);
  let inForestCount = trunks.filter((t) => t.f).length;
  for (const pass of [0, 1]) {
    for (const p of lattice) {
      if (inForestCount >= wantForest) break;
      if (pass === 0 && rng() > 0.85) continue;
      if (!canPlace(p.x, p.z)) continue;
      place(p.x, p.z, randInt(rng, T.trunkMin, T.trunkMax));
      inForestCount++;
    }
  }

  // 4) のこりをばらまく（世界全体で totalMin〜totalMax 本）
  const want = randInt(rng, T.totalMin, T.totalMax);
  for (const p of pool) {
    if (trunks.length >= want) break;
    if (!canPlace(p.x, p.z)) continue;
    place(p.x, p.z, randInt(rng, T.trunkMin, T.trunkMax));
  }
}
