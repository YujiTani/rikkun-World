import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';

/** LEGEND-4 PR1: 黒龍の や が 1 ステップの 線分に かかる 妖怪を ぜんぶ（近い 順・1 体 1 回）返す 口 */
function setup() {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const phase: DayPhase = 'day';
  const time = { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
  const combat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] } as unknown as PlayerCombat;
  const inventory = { add: () => 0 } as unknown as Inventory;
  const player = { position: { x: 2.5, y: 9, z: 6.5 } };
  const m = new YokaiManager({ world, time, getPlayer: () => player, combat, inventory, seed: 1 });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  return m;
}

describe('YokaiManager.raycastAll', () => {
  const o = { x: 2.5, y: 10.62, z: 6.5 };
  const d = { x: 1, y: 0, z: 0 };
  it('線に かかる 妖怪を ぜんぶ、近い 順に 1 体 1 つ ずつ', () => {
    const m = setup();
    const c = m.spawn('karakasa', 12.5, 9, 6.5, { ai: false });
    const a = m.spawn('karakasa', 4.5, 9, 6.5, { ai: false });
    const b = m.spawn('karakasa', 8.5, 9, 6.5, { ai: false });
    m.spawn('karakasa', 8.5, 9, 12.5, { ai: false }); // 線から はなれた 体
    const hits = m.raycastAll(o, d, 20);
    expect(hits.map((h) => h.id)).toEqual([a, b, c]);
    expect(hits[0]!.distance).toBeCloseTo(m.raycast(o, d, 20)!.distance, 9); // 最初の 1 体は raycast と 同じ
    expect(hits[0]!.distance).toBeLessThan(hits[1]!.distance);
  });
  it('maxDistance より 遠い 体は 入らない。何も なければ 空', () => {
    const m = setup();
    m.spawn('karakasa', 12.5, 9, 6.5, { ai: false });
    expect(m.raycastAll(o, d, 5)).toHaveLength(0);
    expect(m.raycastAll(o, { x: -1, y: 0, z: 0 }, 20)).toHaveLength(0);
  });
});
