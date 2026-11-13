import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_Y, WORLD_HEIGHT } from '../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { generateChunk } from '../world/gen/chunk';
import { LAYER } from '../world/gen/columnLayout';
import { terrainFor } from '../world/gen/terrain';
import { sectionToArray } from '../world/sections';
import { SURF, CANAL } from './townLayout';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { attach } from '../world/water/waterTestKit';
import { chooseTown } from './townPlace';
import { activateTown, deactivateTown } from './townState';
import { TOWN } from './townTuning';

/** 街の 地面: 草・すその 段（高さ 2 以上の がけなし）・海の 水・あきちの くい・用水路の 水 */
afterEach(() => deactivateTown());

function reader(seed: number): (x: number, y: number, z: number) => number {
  const cols = new Map<string, Uint16Array>();
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let col = cols.get(key);
    if (!col) {
      const c = generateChunk(seed, cx, cz);
      col = new Uint16Array(LAYER * c.sections.length * CHUNK_SIZE);
      c.sections.forEach((s, i) => col!.set(sectionToArray(s), i * LAYER * CHUNK_SIZE));
      cols.set(key, col);
    }
    return col[y * LAYER + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)]!;
  };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

describe('街の 地面', () => {
  it('門の 前から ひろばまで と、すその 外から 門まで、となりの マスの 高さの 差が 1 以下（歩いて 入れる）。20 シード', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const rec = chooseTown(seed)!;
      const T = terrainFor(seed);
      const sp = T.spawn();
      const plan = activateTown(seed, rec, { x: sp.x, z: sp.z });
      const at = reader(seed);
      const top = (x: number, z: number): number => {
        for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
          const b = at(x, y, z);
          if (BLOCK_TYPES[b]!.solid && b !== BLOCK_INDEX.town_ishi_tesuri) return y;
        }
        return 0;
      };
      const info = plan.info();
      const walk = (ax: number, az: number, bx: number, bz: number, from: number, to: number, what: string): void => {
        const len = Math.hypot(bx - ax, bz - az);
        let prev: number | null = null;
        let prevCell = '';
        for (let t = from * len; t <= to * len; t += 0.25) {
          const x = Math.floor(ax + ((bx - ax) * t) / len);
          const z = Math.floor(az + ((bz - az) * t) / len);
          const cell = `${x},${z}`;
          if (cell === prevCell) continue;
          prevCell = cell;
          const h = top(x, z);
          if (prev !== null) expect(Math.abs(h - prev), `シード ${seed} ${what} (${x}, ${z})`).toBeLessThanOrEqual(1);
          prev = h;
        }
      };
      // ひろばの まん中 → 門 → すその 外（スタートの 方へ）。街の すその 12 マス ぶん
      const g = info.gate.pos;
      walk(info.plaza.x, info.plaza.z, g.x, g.z, 0, 1, '門→ひろば');
      const dx = sp.x + 0.5 - g.x;
      const dz = sp.z + 0.5 - g.z;
      const L = Math.hypot(dx, dz);
      const reach = Math.min(L, TOWN.skirt + 1);
      walk(g.x, g.z, g.x + (dx / L) * reach, g.z + (dz / L) * reach, 0, 1, '門→すそ');
      deactivateTown();
    }
  });

  it('地面の いちばん 上は 草（ひろば・道・用水路・あきち以外）。海に 穴が ない', () => {
    const rec = chooseTown(1)!;
    const sp = terrainFor(1).spawn();
    const plan = activateTown(1, rec, { x: sp.x, z: sp.z });
    const at = reader(1);
    const info = plan.info();
    deactivateTown();
    const before = reader(1); // 街 なしの 同じ 世界
    activateTown(1, rec, { x: sp.x, z: sp.z });
    const G = info.groundY;
    let grass = 0;
    let n = 0;
    for (let z = rec.z0; z < rec.z0 + TOWN.size; z += 3) {
      for (let x = rec.x0; x < rec.x0 + TOWN.size; x += 3) {
        const p = plan.toLocal(x, z)!;
        const k = p.v * TOWN.size + p.u;
        if (plan.layout.surf[k] !== SURF.ground || plan.layout.canal[k] !== CANAL.none) continue;
        n++;
        if (at(x, G, z) === BLOCK_INDEX.grass) grass++;
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(grass, '地面の マスは ぜんぶ 草（柱・どうろうの 下は 除く）').toBeGreaterThan(n * 0.9);
    // すその 外がわの 海: 水の 高さより 下が 空気に なって いない
    for (let z = rec.z0 - TOWN.skirt; z < rec.z0 + TOWN.size + TOWN.skirt; z += 2) {
      for (let x = rec.x0 - TOWN.skirt; x < rec.x0 + TOWN.size + TOWN.skirt; x += 2) {
        if (plan.inTown(x, z)) continue;
        if (before(x, SEA_Y, z) === BLOCK_INDEX.water) expect(at(x, SEA_Y, z), `(${x}, ${z}) の 海面`).not.toBe(BLOCK_INDEX.air);
      }
    }
  });

  it('あきちの 四すみの 外がわに くい（区画の 中は 空いて いる）', () => {
    const rec = chooseTown(3)!;
    const sp = terrainFor(3).spawn();
    const plan = activateTown(3, rec, { x: sp.x, z: sp.z });
    const at = reader(3);
    const info = plan.info();
    expect(plan.lotPostAt.size).toBeGreaterThanOrEqual(info.lots.length * 4);
    for (const lot of info.lots) {
      expect(at(lot.min.x - 1, info.groundY + 1, lot.min.z - 1)).toBe(BLOCK_INDEX.town_hashira);
      expect(at(lot.max.x + 1, info.groundY + 1, lot.max.z + 1)).toBe(BLOCK_INDEX.town_hashira);
      for (let z = lot.min.z; z <= lot.max.z; z++) for (let x = lot.min.x; x <= lot.max.x; x++) expect(at(x, info.groundY + 1, z)).toBe(BLOCK_INDEX.air);
    }
  });
});

describe('用水路の 水（AC39）', () => {
  it('3,600 ステップ 回しても 水の マスの 集まりが はじめと 同じ（ひろがらない・へらない・外の 水と つながらない）', { timeout: 300_000 }, () => {
    const seed = 2;
    const rec = chooseTown(seed)!;
    const sp = terrainFor(seed).spawn();
    const plan = activateTown(seed, rec, { x: sp.x, z: sp.z });
    const info = plan.info();
    const world = new ArrayVoxelWorld({ x: 0, z: 0 });
    const cx0 = Math.floor((rec.x0 - 16) / CHUNK_SIZE);
    const cx1 = Math.floor((rec.x0 + TOWN.size + 16) / CHUNK_SIZE);
    const cz0 = Math.floor((rec.z0 - 16) / CHUNK_SIZE);
    const cz1 = Math.floor((rec.z0 + TOWN.size + 16) / CHUNK_SIZE);
    const cols: [number, number][] = [];
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) cols.push([cx, cz]);
    for (const [cx, cz] of cols) world.loadColumn(generateChunk(seed, cx, cz) as never);
    const rig = attach(world, seed);
    for (const [cx, cz] of cols) rig.sys.onColumnLoaded(cx, cz, 'generated');
    const X0 = cx0 * CHUNK_SIZE;
    const X1 = (cx1 + 1) * CHUNK_SIZE - 1;
    const Z0 = cz0 * CHUNK_SIZE;
    const Z1 = (cz1 + 1) * CHUNK_SIZE - 1;
    const snap = (): string[] => {
      const out: string[] = [];
      for (let y = info.groundY - TOWN.canal.depth - 1; y <= info.groundY + 2; y++) {
        for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
          const a = rig.sys.amount(x, y, z);
          if (a > 0) out.push(`${x},${y},${z}:${a}`);
        }
      }
      return out;
    };
    const before = snap();
    rig.step(3600);
    const after = snap();
    // 街の はんいの 中の 水は、水の すじの マス（底の 上の 面）だけ
    const inTownWater = after.filter((s) => { const [x, y, z] = s.split(':')[0]!.split(',').map(Number); return plan.inTown(x!, z!) && y! >= info.groundY - TOWN.canal.depth - 1; });
    const waterCells = new Set(info.canal.water.map((c) => `${c.x},${info.groundY - TOWN.canal.depth},${c.z}`));
    expect(inTownWater.length).toBe(waterCells.size);
    for (const s of inTownWater) expect(waterCells.has(s.split(':')[0]!), s).toBe(true);
    expect(after).toEqual(before);
  });
});
