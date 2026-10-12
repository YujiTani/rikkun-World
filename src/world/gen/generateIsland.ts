import type { BlockId, GenerateIsland, IslandInfo, SpawnPoint, TestArea, VoxelWorld } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { createRng, randInt, shuffle, valueNoise, type Rng } from './random';

type Change = [x: number, y: number, z: number, prev: BlockId | 'outside'];

/** 見通しの判定（AC7 (5)・AC9 (4)）。E から Q へ 0.05 マスごとに調べ、air・water 以外で最初のブロックを返す */
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

/** 一番上の「地形」ブロック（き・はっぱ・みず・くうきを除く）の y。なければ -1 */
function terrainTop(world: VoxelWorld, x: number, z: number): number {
  for (let y = world.size.y - 1; y >= 0; y--) {
    const id = world.getBlock(x, y, z);
    if (id === 'outside') return -1;
    if (id !== 'air' && id !== 'water' && id !== 'log' && id !== 'leaves') return y;
  }
  return -1;
}

export const generateIsland: GenerateIsland = (seed: number, world: VoxelWorld): IslandInfo => {
  const t0 = performance.now();
  const sx = world.size.x;
  const sy = world.size.y;
  const sz = world.size.z;
  const rng = createRng(seed);
  const idx = (x: number, z: number) => z * sx + x;
  const dist = (x: number, z: number) => Math.hypot(x - C.centerX, z - C.centerZ);

  // ---- 決めごと（シードで変わる）
  const h0 = C.plateauHeightMin + Math.floor(rng() * C.plateauHeightChoices);
  const m = C.mountain;
  const peak = h0 + randInt(rng, m.peakOverPlateauMin, m.peakOverPlateauMax);
  const mcx = randInt(rng, m.cxMin, m.cxMax);
  const mcz = randInt(rng, m.czMin, m.czMax);
  const mr = m.radiusMin + rng() * (m.radiusMax - m.radiusMin);
  const phases = C.radiusWobble.map(() => rng() * Math.PI * 2);
  const noiseSeed = (seed ^ 0x5bd1e995) | 0;

  // ---- 高さの地図
  const raw = new Int32Array(sx * sz);
  const pinned = new Int32Array(sx * sz).fill(-1);
  const isMountain = new Uint8Array(sx * sz);
  const pins: number[] = [];

  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      const d = dist(x, z);
      const th = Math.atan2(z - C.centerZ, x - C.centerX);
      let radius = C.radiusMean;
      C.radiusWobble.forEach((amp, k) => {
        radius += amp * Math.sin(th * (k + 2) + phases[k]!);
      });
      if (d < radius) {
        const u = 1 - d / radius;
        const top = h0 + C.terrainOverPlateau;
        const base = C.beachH + (top - C.beachH) * Math.pow(u, 0.6);
        const n = valueNoise(noiseSeed, x, z, 7) - 0.5;
        raw[i] = Math.max(C.beachH, Math.min(top, Math.round(base + n * 2.4)));
      } else {
        raw[i] = C.seaH;
      }
    }
  }
  // 固定する所: スタートの平ら 5×5 と岩山
  for (let z = C.centerZ - C.plateauHalf; z <= C.centerZ + C.plateauHalf; z++) {
    for (let x = C.centerX - C.plateauHalf; x <= C.centerX + C.plateauHalf; x++) {
      pinned[idx(x, z)] = h0;
      pins.push(idx(x, z));
    }
  }
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const dm = Math.hypot(x - mcx, z - mcz);
      if (dm <= mr) {
        const i = idx(x, z);
        pinned[i] = peak - Math.floor(dm);
        isMountain[i] = 1;
        pins.push(i);
      }
    }
  }
  // 固定した所から傾き 1 のすそ野をつけ（ならしても固定した所が下がらないように）、
  // そのあと全体を「となりとの差が 1 以下」にならす（下げる方向だけ）
  const hm = new Int32Array(sx * sz);
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      if (pinned[i]! >= 0) {
        hm[i] = pinned[i]!;
        continue;
      }
      let v = raw[i]!;
      for (const p of pins) {
        const px = p % sx;
        const pz = (p - px) / sx;
        const c = pinned[p]! - (Math.abs(px - x) + Math.abs(pz - z));
        if (c > v) v = c;
      }
      hm[i] = v;
    }
  }
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

  // ---- 地層
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const i = idx(x, z);
      const h = hm[i]!;
      world.setBlock(x, 0, z, 'bedrock');
      if (isMountain[i]) {
        for (let y = 1; y <= h; y++) world.setBlock(x, y, z, 'stone');
      } else if (h <= C.beachH) {
        world.setBlock(x, h, z, 'sand');
        world.setBlock(x, h - 1, z, 'sand');
        for (let y = 1; y <= h - 2; y++) world.setBlock(x, y, z, 'stone');
        if (h === C.seaH) world.setBlock(x, C.waterY, z, 'water');
      } else {
        world.setBlock(x, h, z, 'grass');
        for (let y = h - 3; y < h; y++) world.setBlock(x, y, z, 'dirt');
        for (let y = 1; y <= h - 4; y++) world.setBlock(x, y, z, 'stone');
      }
    }
  }

  placeVisibleCoal(world, rng, hm, isMountain, sx, sz, h0);
  placeOres(world, rng, sx, sy, sz);
  placeTrees(world, rng, hm, sx, sz);

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
  };
};

// ------------------------------------------------------------------ 見えるせきたん（岩山の表面）

function placeVisibleCoal(
  world: VoxelWorld,
  rng: Rng,
  hm: Int32Array,
  isMountain: Uint8Array,
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
      if (!isMountain[z * sx + x]) continue;
      const h = hm[z * sx + x]!;
      for (let y = Math.max(1, h0 - 1); y <= Math.min(h, C.mountain.coalMaxY); y++) {
        if (world.getBlock(x, y, z) !== 'stone' || !exposed(x, y, z)) continue;
        if (world.getBlock(x, y, z + 1) === 'air') south.push([x, y, z]);
        else other.push([x, y, z]);
      }
    }
  }
  shuffle(rng, south);
  shuffle(rng, other);
  const half = Math.ceil(C.mountain.visibleCoal / 2);
  const picks = [...south.slice(0, half), ...other, ...south.slice(half)];
  for (const [x, y, z] of picks.slice(0, C.mountain.visibleCoal)) world.setBlock(x, y, z, 'coal_ore');
}

// ------------------------------------------------------------------ 鉱石

function placeOres(world: VoxelWorld, rng: Rng, sx: number, sy: number, sz: number): void {
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;
  const count = (id: BlockId) => {
    let n = 0;
    for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) if (world.getBlock(x, y, z) === id) n++;
    return n;
  };
  const run = (
    id: 'coal_ore' | 'iron_ore',
    cfg: { minY: number; maxY: number; clusterMin: number; clusterMax: number; wantAtLeast: number },
  ) => {
    let have = count(id);
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
        const d = dirs[randInt(rng, 0, 5)]!;
        x += d[0];
        y += d[1];
        z += d[2];
      }
    }
  };
  run('coal_ore', C.ores.coal);
  run('iron_ore', C.ores.iron);
}

// ------------------------------------------------------------------ 木

function inNoTrunkBox(x: number, z: number): boolean {
  return C.noTrunkBoxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
}

function placeTrees(world: VoxelWorld, rng: Rng, hm: Int32Array, sx: number, sz: number): void {
  const T = C.trees;
  const trunks: { x: number; z: number }[] = [];
  const dist = (x: number, z: number) => Math.hypot(x - C.centerX, z - C.centerZ);

  const set = (changes: Change[], x: number, y: number, z: number, id: BlockId, onlyAir: boolean) => {
    const prev = world.getBlock(x, y, z);
    if (onlyAir && prev !== 'air') return;
    if (world.setBlock(x, y, z, id)) changes.push([x, y, z, prev]);
  };

  const canPlace = (x: number, z: number): boolean => {
    if (x < 3 || z < 3 || x > sx - 4 || z > sz - 4) return false;
    if (dist(x, z) > T.maxDistance) return false;
    if (inNoTrunkBox(x, z)) return false;
    if (world.getBlock(x, hm[z * sx + x]!, z) !== 'grass') return false;
    return trunks.every((t) => Math.max(Math.abs(t.x - x), Math.abs(t.z - z)) >= T.spacing);
  };

  const place = (x: number, z: number, trunk: number): Change[] => {
    const changes: Change[] = [];
    const h = hm[z * sx + x]!;
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
    trunks.push({ x, z });
    return changes;
  };

  const undo = (changes: Change[]) => {
    for (let i = changes.length - 1; i >= 0; i--) {
      const [x, y, z, prev] = changes[i]!;
      if (prev !== 'outside') world.setBlock(x, y, z, prev);
    }
    trunks.pop();
  };

  // 1) スタートから見える木（4-5）。見えなければ元にもどして次の候補へ
  const ex = C.centerX + 0.5;
  const ey = hm[C.centerZ * sx + C.centerX]! + 1 + C.eyeHeight;
  const ez = C.centerZ + 0.5;
  const cands: { x: number; z: number; trunk: number }[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      const dx = Math.abs(x - C.centerX);
      const depth = C.centerZ - z;
      if (dx < T.visibleMinDx || depth < 1 || dx > depth) continue;
      for (let trunk = T.trunkMin; trunk <= T.trunkMax; trunk++) cands.push({ x, z, trunk });
    }
  }
  shuffle(rng, cands);
  let nearCount = 0;
  for (const c of cands) {
    if (!canPlace(c.x, c.z)) continue;
    const topY = hm[c.z * sx + c.x]! + c.trunk;
    const depth = C.centerZ - c.z;
    if (Math.abs(topY + 0.5 - ey) > 0.75 * depth) continue;
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

  // 3) のこりをばらまく
  const want = randInt(rng, T.countMin, T.countMax);
  for (const p of pool) {
    if (trunks.length >= want) break;
    if (!canPlace(p.x, p.z)) continue;
    place(p.x, p.z, randInt(rng, T.trunkMin, T.trunkMax));
  }
}
