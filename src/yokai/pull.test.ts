import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { createW2Settings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from './ai/YokaiManager';

/** WEAPON-9 AC55〜AC57: すいこみ(pull)・大きな はじき(24 ステップ・9 マス)・ぬりかべ・とぶ 妖怪 */
function rig() {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 60; x++) for (let z = 0; z <= 60; z++) world.setBlock(x, 8, z, 'stone');
  const t = { dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
  const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
  const player = { position: { x: 30.5, y: 9, z: 30.5 } as Vec3 };
  const m = new YokaiManager({ world, time: t, getPlayer: () => player, combat, inventory: { add: () => 0 } as unknown as Inventory, seed: 1, settings: createW2Settings() } as any) as any;
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => { for (let i = 0; i < n; i++) m.update(1 / 60); };
  const pos = (id: number) => m.list().find((y: any) => y.id === id).position as Vec3;
  return { m, step, world, pos };
}

describe('pull（すいこみ）', () => {
  it('体の 中心の ほうへ 水平に dist だけ 動く（y は そのまま）', () => {
    const { m, pos } = rig();
    const id = m.spawn('karakasa', 40.5, 9, 30.5, { ai: false });
    const y0 = pos(id).y;
    m.pull(id, 30.5, 30.5, 0.05);
    expect(pos(id).x).toBeCloseTo(40.45, 3);
    expect(pos(id).z).toBeCloseTo(30.5, 3);
    expect(pos(id).y).toBeCloseTo(y0, 3);
  });
  it('かべ（高さ 3）の 手前で 止まる。ブロックに 重ならない', () => {
    const { m, world, pos } = rig();
    world.fill(36, 9, 25, 36, 11, 35, 'stone');
    const id = m.spawn('karakasa', 40.5, 9, 30.5, { ai: false });
    for (let i = 0; i < 200; i++) m.pull(id, 30.5, 30.5, 0.05);
    expect(pos(id).x).toBeGreaterThanOrEqual(37 + 0.2);
    expect(pos(id).x).toBeLessThan(40.5);
  });
  it('ちょうちん(とぶ)は 水平だけ: 高さを かえない', () => {
    const { m, step, pos } = rig();
    const id = m.spawn('chochin', 40.5, 11, 30.5, { ai: false });
    step(30);
    const y0 = pos(id).y;
    const x0 = pos(id).x;
    for (let i = 0; i < 20; i++) m.pull(id, 30.5, 30.5, 0.05);
    expect(pos(id).x).toBeLessThan(x0 - 0.9);
    expect(Math.abs(pos(id).y - y0)).toBeLessThan(0.3);
  });
  it('やられて おわった 妖怪は すわない', () => {
    const { m } = rig();
    const id = m.spawn('karakasa', 40.5, 9, 30.5, { ai: false });
    m.setHp(id, 0);
    expect(() => m.pull(id, 30.5, 30.5, 0.05)).not.toThrow();
    const p = m.list().find((y: any) => y.id === id)?.position;
    if (p) expect(p.x).toBeCloseTo(40.5, 3);
  });
});

describe('大きな はじき（ticks 24・水平 9・上 6）', () => {
  it('24 ステップで 外向き 9（±0.1）・1 ステップ 1.0 以下', () => {
    const { m, step, pos } = rig();
    const id = m.spawn('karakasa', 36.5, 9, 30.5, { ai: false });
    m.damage(id, 1, { x: 30.5, y: 10, z: 30.5 }, { dist: 9, up: 6, ticks: 24, heavy: true });
    let prev = pos(id).x;
    const start = prev;
    let maxStep = 0;
    for (let i = 0; i < 24; i++) {
      step();
      const x = pos(id).x;
      maxStep = Math.max(maxStep, x - prev);
      prev = x;
    }
    expect(prev - start).toBeGreaterThan(8.9);
    expect(prev - start).toBeLessThan(9.1);
    expect(maxStep).toBeLessThanOrEqual(1.0);
    step(5);
    expect(pos(id).x - start).toBeLessThan(9.1);
  });
  it('ぬりかべも はじかれる（heavy）。ふつうの 押しでは 今どおり 動かない', () => {
    const { m, step, pos } = rig();
    const a = m.spawn('nurikabe', 36.5, 9, 30.5, { ai: false });
    m.damage(a, 1, { x: 30.5, y: 10, z: 30.5 }, { dist: 9, up: 6, ticks: 24, heavy: true });
    step(26);
    expect(pos(a).x - 36.5).toBeGreaterThan(8.5);
    const b = m.spawn('nurikabe', 36.5, 9, 40.5, { ai: false });
    m.damage(b, 1, { x: 30.5, y: 10, z: 40.5 }, { dist: 3, up: 2 });
    step(26);
    expect(pos(b).x).toBeCloseTo(36.5, 2);
  });
  it('はじく 力を わたさない ふつうの ダメージは 今の 10 ステップ', () => {
    const { m, step, pos } = rig();
    const id = m.spawn('karakasa', 36.5, 9, 30.5, { ai: false });
    m.damage(id, 1, { x: 30.5, y: 10, z: 30.5 }, { dist: 1, up: 0 });
    step(10);
    expect(pos(id).x - 36.5).toBeCloseTo(1, 1);
  });
  it('上 6: からかさ・ぬりかべとも いちばん 高い 所が 5.5〜6.5 マス（足もとから）。おりても たいりょくは へらない', () => {
    for (const kind of ['karakasa', 'nurikabe'] as const) {
      const { m, step, pos } = rig();
      const id = m.spawn(kind, 36.5, 9, 30.5, { ai: false });
      const hp0 = m.list().find((y: any) => y.id === id).hp;
      const y0 = pos(id).y;
      m.damage(id, 1, { x: 30.5, y: 10, z: 30.5 }, { dist: 9, up: 6, ticks: 24, heavy: true });
      const hp1 = m.list().find((y: any) => y.id === id).hp;
      let top = y0;
      for (let i = 0; i < 200; i++) {
        step();
        top = Math.max(top, pos(id).y);
      }
      expect(top - y0, `${kind} の 高さ`).toBeGreaterThan(5.5);
      expect(top - y0, `${kind} の 高さ`).toBeLessThan(6.5);
      expect(m.list().find((y: any) => y.id === id).hp, `${kind} は おりて も へらない`).toBe(hp1);
      expect(hp1).toBeLessThan(hp0);
    }
  });
});
