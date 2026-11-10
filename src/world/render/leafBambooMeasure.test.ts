import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { plantsOfChunk } from '../gen/plants';
import { populateWorld } from '../gen/populate';
import { spawnOf, terrainFor } from '../gen/terrain';
import { startTrees } from '../gen/trees';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { clearLookCache } from './looks';
import { setLeafBamboo, type BambooMode, type LeafMode } from './leafBambooMode';
import { columnDistance } from './voxel/tier';
import { syncProtoOcc } from './voxel/sectionConsts';
import { SectionMesher } from './voxel/sectionMesher';

/**
 * いつもの島（seed 20261012）で、スタートから 小ブロック 28・箱 48 の 輪を メッシュする。
 * `LEAF_MEASURE=1` のときだけ（CI では 走らない）。
 */

const SEED = 20261012;
const RUN = process.env.LEAF_MEASURE === '1';

interface Pass {
  leaf: LeafMode;
  bamboo: BambooMode;
  microTris: number;
  boxTris: number;
  microMs: number;
  boxMs: number;
  microDraws: number;
  boxDraws: number;
  microSections: number;
  boxSections: number;
  leafTrisMicro: number;
}

function drawsOf(pieces: number, extras: number, water: number): number {
  return (pieces > 0 ? 1 : 0) + (extras > 0 ? 1 : 0) + (water > 0 ? 1 : 0);
}

describe.skipIf(!RUN)('LEAF-BAMBOO 計測', () => {
  it('スタートの 輪（micro 28・box 48）', { timeout: 300_000 }, () => {
    const world = new ArrayVoxelWorld();
    const tGen = performance.now();
    populateWorld(world, SEED);
    const genMs = performance.now() - tGen;
    const sp = spawnOf(SEED);
    const leaves = new Set([BLOCK_INDEX.leaves, BLOCK_INDEX.momiji_leaves, BLOCK_INDEX.matsu_leaves]);
    let leafBlocks = 0;
    let bambooBlocks = 0;
    const cols = world.loadedColumns();
    const jobs: { cx: number; cz: number; tier: 'micro' | 'box' }[] = [];
    for (const { cx, cz } of cols) {
      const d = columnDistance(cx, cz, sp.x + 0.5, sp.z + 0.5);
      const tier = d <= 28 ? 'micro' : d <= 48 ? 'box' : null;
      if (!tier) continue;
      jobs.push({ cx, cz, tier });
      const x0 = cx * 16;
      const z0 = cz * 16;
      for (let y = 0; y < world.size.y; y++) {
        for (let z = z0; z < z0 + 16; z++) {
          for (let x = x0; x < x0 + 16; x++) {
            const b = world.getIndex(x, y, z);
            if (leaves.has(b)) leafBlocks++;
            else if (b === BLOCK_INDEX.bamboo) bambooBlocks++;
          }
        }
      }
    }

    const modes: { leaf: LeafMode; bamboo: BambooMode }[] = [
      { leaf: 'current', bamboo: 'current' },
      { leaf: 'shell', bamboo: 'current' },
      { leaf: 'cross', bamboo: 'current' },
      { leaf: 'none', bamboo: 'current' },
      { leaf: 'current', bamboo: 'voxel' },
      { leaf: 'current', bamboo: 'sprite' },
    ];
    const syMax = Math.ceil(world.size.y / 16);
    const passes: Pass[] = [];
    for (const mode of modes) {
      setLeafBamboo(mode);
      clearLookCache();
      syncProtoOcc();
      const mesher = new SectionMesher(world);
      const pass: Pass = { ...mode, microTris: 0, boxTris: 0, microMs: 0, boxMs: 0, microDraws: 0, boxDraws: 0, microSections: 0, boxSections: 0, leafTrisMicro: 0 };
      for (const job of jobs) {
        for (let sy = 0; sy < syMax; sy++) {
          const t0 = performance.now();
          const d = mesher.build(job.cx, sy, job.cz, job.tier);
          const ms = performance.now() - t0;
          const draws = drawsOf(d.pieces.length, d.extras.faceCount, d.water.faceCount);
          if (job.tier === 'micro') {
            pass.microTris += d.triangles;
            pass.microMs += ms;
            pass.microDraws += draws;
            pass.microSections++;
          } else {
            pass.boxTris += d.triangles;
            pass.boxMs += ms;
            pass.boxDraws += draws;
            pass.boxSections++;
          }
        }
      }
      passes.push(pass);
    }
    setLeafBamboo({ leaf: 'current', bamboo: 'current' });
    clearLookCache();
    syncProtoOcc();

    const T = terrainFor(SEED);
    const trees = startTrees(T).map((t) => ({ x: t.x, z: t.z, y: t.y, trunk: t.trunk, leaves: t.leaves }));
    let bambooNear: { x: number; z: number; height: number; d: number } | null = null;
    const scx = Math.floor(sp.x / 16);
    const scz = Math.floor(sp.z / 16);
    for (let dz = -6; dz <= 6; dz++) {
      for (let dx = -6; dx <= 6; dx++) {
        for (const p of plantsOfChunk(T, scx + dx, scz + dz)) {
          if (p.id !== 'bamboo') continue;
          const d = Math.hypot(p.x - sp.x, p.z - sp.z);
          if (!bambooNear || d < bambooNear.d) bambooNear = { x: p.x, z: p.z, height: p.height, d };
        }
      }
    }
    const out = { seed: SEED, spawn: { x: sp.x, z: sp.z, h: sp.h }, genMs, leafBlocks, bambooBlocks, columns: jobs.length, trees, bambooNear, passes };
    // 計測の 結果（人が 読む）
    console.log(JSON.stringify(out));
    expect(passes[0]!.microTris).toBeGreaterThan(0);
    expect(leafBlocks).toBeGreaterThan(0);
  });
});
