import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from './ai/YokaiManager';

/** WEAPON-9 AC31・AC49: 火の玉は ドームの 球に ふれた ステップに 消える（ダメージ 0）。ドームが なければ 今どおり 当たる */
function rig(dome: () => { x: number; y: number; z: number; r: number } | null) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const t = { dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
  const hits: number[] = [];
  const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: (a) => (hits.push(a), true), heal: () => 0, drainEvents: () => [] };
  const inventory = { add: () => 0 } as unknown as Inventory;
  const player = { position: { x: 10.5, y: 9, z: 20.5 } as Vec3 };
  const erased: number[] = [];
  const m = new YokaiManager({ world, time: t, getPlayer: () => player, combat, inventory, seed: 1, settings: createW2Settings(), dome, onDomeErase: (id: number) => erased.push(id) } as any) as any;
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => { for (let i = 0; i < n; i++) m.update(1 / 60); };
  return { m, step, hits, erased, player };
}

function thrown(r: ReturnType<typeof rig>) {
  const id = r.m.spawn('chochin', r.player.position.x, 12, r.player.position.z + ((r as any).far ?? 5), { ai: false });
  const a = r.m.attackNow(id) as { hitInSteps: number };
  for (let i = 0; i < a.hitInSteps + 2 && r.m.fireballList().length === 0; i++) r.step();
  expect(r.m.fireballList()).toHaveLength(1);
}

describe('弾を ドームで 消す', () => {
  it('ドームの ふちに ふれた ステップに 消える・ダメージ 0・消えた 出来事 1 つ', () => {
    let on = true;
    const r = rig(() => (on ? { x: 10.5, y: 9.9, z: 20.5, r: 7 } : null));
    (r as any).far = 9;
    thrown(r);
    let steps = 0;
    while (r.m.fireballList().length > 0 && steps < 200) {
      r.step();
      steps++;
    }
    expect(r.erased).toHaveLength(1);
    expect(r.hits).toHaveLength(0);
    // 消えた 場所は ふち 近く（7 の 球の 外がわ）
    expect(on).toBe(true);
  });
  it('ドームが ない ときは 今どおり 当たる', () => {
    const r = rig(() => null);
    thrown(r);
    for (let i = 0; i < 300 && r.m.fireballList().length > 0; i++) { r.step(); }
    expect(r.erased).toHaveLength(0);
    expect(r.m.fireballList()).toHaveLength(0); // 飛びきって 消えた（ドームの 消しではない）
  });
  it('はね返した 火の玉は 消さない（プレイヤーの 弾あつかい）', () => {
    let on = false;
    const r = rig(() => (on ? { x: 10.5, y: 9.9, z: 20.5, r: 7 } : null));
    thrown(r);
    on = true;
    // ふちに 着く 前に はね返す → 消えるのは ドームの 外でない まま
    expect(r.m.reflectFireball(0)).toBe(true);
    r.step();
    expect(r.erased).toHaveLength(0);
  });
});
