import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';

/** やかたの 「のこり」は `has` で 数える。体力 0〔たおれる 演出の 間〕の 妖怪は もう 生きて いない 数に する */
const time: TimeOfDay = {
  dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1,
  set: () => {}, update: () => {}, onPhaseChange: () => () => {},
};
const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };

describe('YokaiManager.has', () => {
  it('体力 0 に した 妖怪は すぐ 生きて いない あつかい・やがて 消える', () => {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
    const inventory = { add: () => 0 } as unknown as Inventory;
    const m = new YokaiManager({ world, time, getPlayer: () => ({ position: { x: 2.5, y: 9, z: 6.5 } }), combat, inventory, seed: 1 });
    m.config.yokaiAutoSpawn = false;
    m.config.yokaiWander = false;
    const id = m.spawn('karakasa', 10.5, 9, 10.5, { ai: false });
    expect(m.has(id)).toBe(true);
    m.setHp(id, 0);
    expect(m.has(id)).toBe(false);
    for (let i = 0; i < 300; i++) m.update(1 / 60);
    expect(m.has(id)).toBe(false);
    expect(m.list().some((y) => y.id === id)).toBe(false);
  });
});
