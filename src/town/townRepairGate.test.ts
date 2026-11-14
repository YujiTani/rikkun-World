import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { TOWN } from './townTuning';
import { TownRepairs, type RepairGate, type RepairJob, type TownRepairDeps } from './townRepairs';

/** TOWN-1 1.4 1B-2（試作）: 建築士さんの 口（着いて いる まとまり だけ もどる）・足場の 一覧・もどった ときの 知らせ。数と 状態の うつり変わり だけ。 */
const GROUND = 8;
const design = (_x: number, y: number, _z: number): string => (y < 1 ? 'air' : y < GROUND ? 'stone' : y === GROUND ? 'grass' : 'air');

function rig(gate?: RepairGate) {
  const real = new ArrayVoxelWorld({ x: 128, y: 32, z: 128 });
  for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) for (let y = 1; y <= GROUND; y++) real.setBlock(x, y, z, design(x, y, z) as BlockId);
  const state = { day: 5 };
  const writes = { n: 0 };
  const shown: { x: number; y: number; z: number; id: string }[] = [];
  const deps: TownRepairDeps = {
    world: { getBlock: (x, y, z) => real.getBlock(x, y, z), setBlock: (x, y, z, id) => (writes.n++, real.setBlock(x, y, z, id as BlockId)), isLoaded: () => true, isSolid: (x, y, z) => real.isSolid(x, y, z) },
    plan: design,
    keeps: () => false,
    inTown: () => true,
    day: () => state.day,
    players: () => [{ who: 1, x: 120.5, y: GROUND + 1, z: 120.5 }],
    overlaps: () => false,
    movePlayer: () => undefined,
    occupied: () => false,
    evict: () => undefined,
    giveBack: () => undefined,
    fallback: () => ({ x: 64.5, y: GROUND + 1, z: 64.5 }),
    ...(gate ? { gate } : {}),
  };
  const t = new TownRepairs(deps);
  t.onRestore = (x, y, z, id) => shown.push({ x, y, z, id });
  t.step();
  return { t, state, shown, writes, blockOf: (x: number, y: number, z: number) => real.getBlock(x, y, z), step: (n: number) => { for (let i = 0; i < n; i++) t.step(); } };
}
const cells = (x0: number, z0: number, n: number) => Array.from({ length: n }, (_, i) => ({ x: x0 + i, y: GROUND, z: z0 }));

describe('建築士さんの 口（gate）', () => {
  it('着いて いない まとまりは もどらず、allows の まとまりだけ 2 ステップに 1 マス もどる。もどった ぶん onRestore', () => {
    let allowed: RepairJob | null = null;
    const r = rig({ allows: (j) => j === allowed, rush: () => false });
    r.t.damage(cells(20, 40, 4));
    r.t.damage(cells(60, 40, 4));
    r.state.day++;
    r.step(40);
    expect(r.t.size(), '誰も 着いて いない').toBe(8);
    const jobs = r.t.jobs();
    expect(jobs).toHaveLength(2);
    allowed = jobs.find((j) => j.minX === 20)!;
    r.step(40);
    expect(r.t.size(), '半分（2 マス）だけ もどる').toBe(6);
    expect(r.shown).toHaveLength(2);
    expect(r.blockOf(20, GROUND, 40)).toBe('grass');
    expect(r.blockOf(60, GROUND, 40)).toBe('air');
  });

  it('rush（見て いない）の まとまりは ぜんぶ すぐ もどる（知らせは 出さない）', () => {
    const r = rig({ allows: () => false, rush: () => true });
    r.t.damage(cells(20, 40, 6));
    r.state.day++;
    r.step(2);
    expect(r.t.size()).toBe(3);
    expect(r.shown).toHaveLength(0);
  });

  it('1 つの まとまりが おわると finished（足場が きえる 合図）', () => {
    const r = rig();
    r.t.damage(cells(20, 40, 1));
    r.state.day++;
    r.step(1);
    const job = r.t.jobs()[0]!;
    expect(job.finished).toBe(true);
    r.step(2);
    expect(r.t.jobs()).toHaveLength(0);
  });
});

describe('足場の 一覧', () => {
  it('足場が 出ても 世界の ブロックは 1 つも 書きかえない（街の チャンクの 作りなおし 0）・足場が きえる ときも', () => {
    const r = rig({ allows: () => false, rush: () => false });
    r.t.damage(cells(20, 40, 5));
    r.t.damage(cells(60, 40, 1));
    const before = r.writes.n; // こわした 分（damage）は 数えない
    r.state.day++;
    r.step(200);
    expect(r.t.scaffolds.list(), '足場は 出て いる').toHaveLength(2);
    expect(r.writes.n, '足場が 出た だけで ブロックを 書かない').toBe(before);
  });

  it('d+1 の 朝に まとまりごとに 1 つ・半分の 日は のこり・ぜんぶ もどす 日は 仕事が おわって から 60 ステップ 以内に きえる', () => {
    const r = rig();
    r.t.damage(cells(20, 40, 5));
    r.t.damage(cells(60, 40, 1));
    expect(r.t.scaffolds.list()).toHaveLength(0);
    r.state.day++;
    r.step(1);
    expect(r.t.scaffolds.list()).toHaveLength(2);
    const v = r.t.scaffolds.version;
    r.step(100);
    // 1 マスの まとまりは ぜんぶ もどった ので きえた。5 マスの 方は 半分（3 マス）だけ もどって 足場は のこる
    expect(r.t.scaffolds.list()).toHaveLength(1);
    expect(r.t.scaffolds.version).toBeGreaterThan(v);
    expect(r.t.size()).toBe(2);
    r.state.day++;
    r.step(1);
    expect(r.t.scaffolds.list()).toHaveLength(1);
    r.step(20);
    expect(r.t.size()).toBe(0);
    r.step(TOWN.repair.scaffoldGoneSteps + 1);
    expect(r.t.scaffolds.list()).toHaveLength(0);
  });
});
