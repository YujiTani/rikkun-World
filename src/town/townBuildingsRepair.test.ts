import { afterEach, describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { WORLD_HEIGHT } from '../contracts';
import { buildBlocks } from '../world/gen/chunk';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { GATE } from './townGate';
import { townBuildingCells } from './townBuildings';
import { createPlanReader } from './townPlanBlock';
import { TownRepairs } from './townRepairs';
import { activateTown, deactivateTown } from './townState';
import { CANAL, SURF, at, buildLayout } from './townLayout';
import { TOWN, type Facing } from './townTuning';

/** 1B-2 × 1.4: 建物・門・街の木・形ブロックも 設計（planBlock ＝ 街を 作る 道）から 同じ 中身が 出て、こわれても 朝に もどる */
afterEach(() => deactivateTown());

const LAYOUT = buildLayout();
const SEED = 1;
const GY = 40;
const X0 = 20;
const Z0 = 20;
const FACINGS: Facing[] = ['n', 'e', 's', 'w'];

/** 建物の 土台の 高さ（townWrite.ts と 同じ: 用水路は 地面・段の 上は 段の 高さ・みぞは その 高さ） */
function baseY(u: number, v: number): number {
  const L = LAYOUT;
  const k = at(u, v);
  if (L.canal[k] !== CANAL.none) return GY;
  const notch = L.notch[k]!;
  if (notch > 0) return GY - TOWN.canal.depth + notch;
  return L.surf[k] === SURF.terrace ? GY + TOWN.terrace.rise : GY;
}

function setup(facing: Facing) {
  deactivateTown();
  const plan = activateTown(SEED, { v: 1, x0: X0, z0: Z0, facing, groundY: GY } as never, null);
  const read = createPlanReader((cx, cz) => buildBlocks(SEED, cx, cz).blocks.slice());
  return { plan, read };
}

describe('planBlock が 建物・門・木の 中身を 出す', () => {
  for (const f of FACINGS) {
    it(`向き ${f}: 建物・門の ぜんぶの マスが 空気で なく、街の はんいの 中で、あきち以外は keeps でない`, () => {
      const { plan, read } = setup(f);
      let n = 0;
      for (const c of townBuildingCells()) {
        const w = plan.toWorld(c.u, c.v);
        expect(plan.inTown(w.x, w.z), `u${c.u} v${c.v} は 街の 中`).toBe(true);
        const y = baseY(c.u, c.v) + 1 + c.dy;
        expect(read(w.x, y, w.z), `${c.id} u${c.u} v${c.v} dy${c.dy}`).not.toBe('air');
        if (!plan.inLot(w.x, w.z) && plan.keeps(w.x, y, w.z)) throw new Error(`keeps が 建物に かかる u${c.u} v${c.v}`);
        n++;
      }
      expect(n).toBeGreaterThan(1000);
    });

    it(`向き ${f}: 街の 木の みきと はっぱが 設計から 出る。みきは 街の 中で まもられない`, () => {
      const { plan, read } = setup(f);
      const trees = plan.trees();
      expect(trees.length).toBeGreaterThan(0);
      for (const t of trees) {
        expect(plan.inTown(t.x, t.z)).toBe(true);
        expect(plan.keeps(t.x, t.y + 1, t.z), '木は あきち・石段に 立たない').toBe(false);
        expect(read(t.x, t.y + 1, t.z), 'みき').not.toBe('air');
      }
      expect(trees.some((t) => t.sakura)).toBe(true);
    });
  }

  it('門は 街の はんいの 中（はみ出さない）。門の 土台は あきち・石がきでは ない', () => {
    const { plan } = setup('n');
    const lay = [GATE.origin.u, GATE.origin.u + 18, GATE.wall.west[0], GATE.wall.east[1]];
    for (const u of lay) {
      const w = plan.toWorld(u, GATE.origin.v);
      expect(plan.inTown(w.x, w.z)).toBe(true);
    }
    expect(at(GATE.origin.u, GATE.origin.v)).toBeGreaterThanOrEqual(0);
    expect(SURF.lot).not.toBe(SURF.ground);
  });
});

describe('門・建物・木が こわれて 朝に もどる', () => {
  it('門と 木と 建物の マスを ぜんぶ 空気に すると、記録され、3 日の うちに 設計の 中身へ もどる', () => {
    const { plan, read } = setup('n');
    const world = new ArrayVoxelWorld({ x: 140, y: WORLD_HEIGHT, z: 140 });
    const cells: { x: number; y: number; z: number }[] = [];
    for (let x = X0; x < X0 + 100; x++) for (let z = Z0; z < Z0 + 100; z++) for (let y = GY - 1; y < GY + 32; y++) world.setBlock(x, y, z, read(x, y, z) as BlockId);
    for (const c of townBuildingCells()) {
      const w = plan.toWorld(c.u, c.v);
      if (c.u >= GATE.wall.west[0] && c.u <= GATE.wall.east[1] && c.v >= GATE.origin.v && c.v <= GATE.origin.v + 12) cells.push({ x: w.x, y: baseY(c.u, c.v) + 1 + c.dy, z: w.z });
    }
    for (const t of plan.trees()) for (let y = t.y + 1; y < t.y + 6; y++) cells.push({ x: t.x, y, z: t.z });
    const state = { day: 5 };
    const far = { who: 1 as const, x: 130.5, y: GY + 2, z: 130.5 };
    const reps = new TownRepairs({
      world: { getBlock: (x, y, z) => world.getBlock(x, y, z), setBlock: (x, y, z, id) => world.setBlock(x, y, z, id as BlockId), isLoaded: () => true, isSolid: (x, y, z) => world.isSolid(x, y, z) },
      plan: read,
      keeps: (x, y, z) => plan.keeps(x, y, z),
      inTown: (x, z) => plan.inTown(x, z),
      day: () => state.day,
      players: () => [far],
      overlaps: () => false,
      movePlayer: () => undefined,
      occupied: () => false,
      evict: () => undefined,
      giveBack: () => undefined,
      fallback: () => far,
    });
    reps.step();
    const changed = reps.damage(cells, 'air');
    expect(changed).toBeGreaterThan(200);
    expect(reps.repairs().cells.length).toBe(changed);
    for (let d = 0; d < 4 && reps.repairs().cells.length > 0; d++) {
      state.day++;
      for (let i = 0; i < 6000 && reps.repairs().cells.length > 0; i++) reps.step();
    }
    expect(reps.repairs().cells.length).toBe(0);
    for (const c of cells) expect(world.getBlock(c.x, c.y, c.z), `${c.x},${c.y},${c.z}`).toBe(read(c.x, c.y, c.z));
  }, 60000);
});
