import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from './ai/YokaiManager';

/** COOP-1 4d-2: 2P の ドームも 妖怪の 弾を 消す（domes = [1P, 2P]）。消した ドームの 持ち主が onDomeErase の who で わかる */
type Ball = { x: number; y: number; z: number; r: number } | null;
function rig(domes: () => readonly Ball[]) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const t = { dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
  const hits: number[] = [];
  const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: (a) => (hits.push(a), true), heal: () => 0, drainEvents: () => [] };
  const inventory = { add: () => 0 } as unknown as Inventory;
  const player = { position: { x: 10.5, y: 9, z: 20.5 } as Vec3 };
  const erased: Array<[number, number]> = [];
  const m = new YokaiManager({ world, time: t, getPlayer: () => player, combat, inventory, seed: 1, settings: createW2Settings(), domes, onDomeErase: (id: number, who: number) => erased.push([id, who]) } as any) as any;
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const id = m.spawn('chochin', player.position.x, 12, player.position.z + 9, { ai: false });
  const a = m.attackNow(id) as { hitInSteps: number };
  for (let i = 0; i < a.hitInSteps + 2 && m.fireballList().length === 0; i++) m.update(1 / 60);
  expect(m.fireballList()).toHaveLength(1);
  for (let i = 0; i < 300 && m.fireballList().length > 0; i++) m.update(1 / 60);
  return { erased, hits };
}

const BALL: Ball = { x: 10.5, y: 9.9, z: 20.5, r: 7 };

describe('弾を 2 人分の ドームで 消す', () => {
  it('2P の ドームに ふれた 弾は 消える（ダメージ 0・who = 2）', () => {
    const r = rig(() => [null, BALL]);
    expect(r.erased).toHaveLength(1);
    expect(r.erased[0]![1]).toBe(2);
    expect(r.hits).toHaveLength(0);
  });
  it('1P の ドームなら who = 1', () => {
    const r = rig(() => [BALL, null]);
    expect(r.erased.map((e) => e[1])).toEqual([1]);
    expect(r.hits).toHaveLength(0);
  });
  it('どちらの ドームも なければ 消えない', () => {
    const r = rig(() => [null, null]);
    expect(r.erased).toHaveLength(0);
  });
});
