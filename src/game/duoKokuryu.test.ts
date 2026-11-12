import { describe, expect, it } from 'vitest';
import type { BowStepContext, DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { createW2Settings } from '../contracts';
import { jumpHeightWith } from '../content/items/gadgetTuning';
import { createP2Gadgets } from '../duo/p2Gadgets';
import { bindWho } from '../duo/credit';
import { p2SpeedMul } from '../duo/p2Legend';
import { InventoryImpl } from '../inventory/Inventory';
import { createPlayerSettings } from '../player/config';
import { createBowSystem } from '../tools/bow/BowSystem';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from '../yokai/ai/YokaiManager';

/**
 * LEGEND-4 PR1 K11（§4.6）: 2P が 黒龍で うつと 2P の もちものから 矢が 1 へり、つらぬいた 妖怪の たおした 人は 2P。2P の 歩く 速さ・ジャンプも 1P と 同じ 数。
 * 2P の 矢は 2P の 人（bindWho(…, 2)）で 妖怪を 見る（1P と 同じ 部品を 2P の もちもので 使う。COOP-1 §3.3）。
 */
function setup() {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 60; x++) for (let z = 0; z <= 60; z++) world.setBlock(x, 8, z, 'stone');
  const phase: DayPhase = 'day';
  const time = { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} } as unknown as TimeOfDay;
  const combat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] } as unknown as PlayerCombat;
  const defeated: { kind: string; who: 1 | 2 }[] = [];
  const m = new YokaiManager({
    world,
    time,
    getPlayer: () => ({ position: { x: 2.5, y: 9, z: 6.5 } }),
    combat,
    inventory: { add: () => 0 } as unknown as Inventory,
    seed: 1,
    onDefeat: (kind, info) => defeated.push({ kind, who: info.who }),
  });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  return { world, m, defeated };
}

describe('K11 2P の 黒龍', () => {
  it('2P の 矢が 1 へる・つらぬいた 妖怪 2 体 とも たおした 人は 2P・1P の 矢は へらない', () => {
    const { world, m, defeated } = setup();
    const inv1 = new InventoryImpl();
    const inv2 = new InventoryImpl();
    inv1.add('ya', 10);
    inv2.add('ya', 10);
    const a = m.spawn('karakasa', 6.5, 9, 6.5, { ai: false });
    const b = m.spawn('karakasa', 9.5, 9, 6.5, { ai: false });
    m.setHp(a, 1);
    m.setHp(b, 1);
    // 2P の ゆみ（2P の もちもの・2P の 人で 妖怪を 見る）
    const bow = createBowSystem({ world, yokai: () => bindWho(m, 2), settings: createW2Settings(), inventory: inv2, onShot: () => {}, tick: () => 0 });
    const eye: Vec3 = { x: 2.5, y: 10.62, z: 6.5 };
    let held = false;
    let prev = false;
    const step = () => {
      const ctx: BowStepContext = { item: 'kokuryu', pressed: held && !prev, held, eye, dir: { x: 1, y: 0, z: 0 }, position: { x: 2.5, y: 9, z: 6.5 }, active: true };
      prev = held;
      bow.update(ctx);
      m.update(1 / 60);
    };
    held = true;
    for (let i = 0; i < 45; i++) step();
    held = false;
    for (let i = 0; i < 60; i++) step();
    expect(inv2.count('ya')).toBe(9);
    expect(inv1.count('ya')).toBe(10);
    expect(defeated.map((d) => d.who)).toEqual([2, 2]);
    expect(bow.stuck().length + bow.arrows().length).toBeLessThanOrEqual(1);
  });
  it('2P の 歩く 速さ 1.2 倍・ジャンプの 高さ 2.5（1P の K7 と 同じ 口）', () => {
    const S = createW2Settings();
    expect(p2SpeedMul(1, 1, S, 'kokuryu')).toBeCloseTo(1.2, 9);
    const base = createPlayerSettings().jumpHeight;
    let jump: number | null = null;
    const g = createP2Gadgets({
      body: { state: { position: { x: 0, y: 0, z: 0 }, yawDeg: 0 }, settings: { jumpHeight: base }, setJumpHeight: (h) => (jump = h) },
      held: () => 'kokuryu' as ItemId,
      legs: () => 'waraji' as ItemId,
      tick: () => 0,
    });
    g.step();
    expect(jump).toBe(jumpHeightWith('waraji', base, 'kokuryu'));
    expect(jump).toBe(2.5);
  });
});
