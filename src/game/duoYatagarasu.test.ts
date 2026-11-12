import { describe, expect, it } from 'vitest';
import type { BowStepContext, DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { createW2Settings } from '../contracts';
import { bindWho } from '../duo/credit';
import { InventoryImpl } from '../inventory/Inventory';
import { createBowSystem } from '../tools/bow/BowSystem';
import { createSaveRoll } from '../tools/bow/yatagarasu';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from '../yokai/ai/YokaiManager';

/**
 * LEGEND-4 PR2 Y7（§5.6）: 2P の 矢の ほのおで たおした 妖怪の たおした 人は 2P。2P の くじは 1P が 何本 うっても かわらない。
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

describe('Y7 2P の 八咫烏', () => {
  it('2P の ほのおで たおした 妖怪（矢が 当たった 体も となりも）は たおした 人が 2P', () => {
    const { world, m, defeated } = setup();
    const inv2 = new InventoryImpl();
    inv2.add('ya', 10);
    const a = m.spawn('karakasa', 9.5, 9, 6.5, { ai: false });
    const b = m.spawn('karakasa', 9.5, 9, 8, { ai: false }); // 矢の 線から 1.5 マス よこ
    m.setHp(a, 1);
    m.setHp(b, 1);
    const bow = createBowSystem({ world, yokai: () => bindWho(m, 2), settings: createW2Settings(), inventory: inv2, onShot: () => {}, tick: () => 0, who: 2, saveRoll: () => 0.9 });
    const eye: Vec3 = { x: 2.5, y: 10.62, z: 6.5 };
    let held = false;
    let prev = false;
    const step = () => {
      const ctx: BowStepContext = { item: 'yatagarasu', pressed: held && !prev, held, eye, dir: { x: 1, y: 0.02, z: 0 }, position: { x: 2.5, y: 9, z: 6.5 }, active: true };
      prev = held;
      bow.update(ctx);
      m.update(1 / 60);
    };
    held = true;
    for (let i = 0; i < 45; i++) step();
    held = false;
    for (let i = 0; i < 60; i++) step();
    expect(defeated.map((d) => d.who).sort()).toEqual([2, 2]);
    expect(inv2.count('ya')).toBe(9);
  });
  it('くじは 人ごとに 別の 列: 1P が 何本 引いても 2P の 列は かわらない・1P と 2P は 別の 値', () => {
    const p2a = createSaveRoll(2);
    const first = [p2a(), p2a(), p2a(), p2a()];
    const p1 = createSaveRoll(1);
    for (let i = 0; i < 37; i++) p1();
    const p2b = createSaveRoll(2);
    expect([p2b(), p2b(), p2b(), p2b()]).toEqual(first);
    const p1c = createSaveRoll(1);
    expect([p1c(), p1c(), p1c(), p1c()]).not.toEqual(first);
  });
});
