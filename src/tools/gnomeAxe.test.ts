import { describe, expect, it } from 'vitest';
import type { LockStatus, ToolInfo } from '../contracts';
import { FakeYokaiWorld, P, at, settingsW3 } from '../combat/attackTestKit';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createDigConfig } from '../dig/config';
import { DigSystemImpl } from '../dig/DigSystem';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createBladeSystem } from './blade/BladeSystem';

/**
 * LEGEND-4 PR4 G4・G5（§7.7）: 本物の DigSystem・BladeSystem・PlayerController を つないで
 * ふりわけ（4 マス先の ブロック = ほる・空 = よこなぎ）と たいきゅう（当たった 1 回で 1・空ぶり 0）を 見る。
 */
const T = LEGEND4_TUNING.gnome;
const TOTAL = T.startup + T.active + T.recovery;

function rig() {
  const world = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, 8, z, 'dirt');
  const actions = new ActionState();
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const controller = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => ({ x: P.x, y: P.y, z: P.z, yawDeg: 0, pitchDeg: 0 }));
  const yokai = new FakeYokaiWorld();
  const inv = new InventoryImpl();
  inv.setSlot(0, { item: 'gnome_axe', count: 1 });
  inv.select(0);
  const info: ToolInfo = { item: 'gnome_axe', kind: 'pickaxe', power: 6, level: 0, damage: 7, reach: 3.5, ticks: 30 };
  const tools = { current: () => info, step() {}, pushSwing() {}, swingWhiff() {}, onPunchStart() {}, punchParams: () => ({ damage: 7, reach: 3.5, ticks: 30 }) };
  const settings = settingsW3();
  let tick = 0;
  const wear: number[] = [];
  const blade = createBladeSystem({
    world, yokai: () => yokai, settings, weaponDamage: () => 4, onHit: () => wear.push(T.wearPerHit),
    lunge: (dx, dz) => controller.lunge(dx, dz), tick: () => tick,
  });
  const combat = new PlayerCombatImpl({
    world, player: { get: () => controller.state, set: (v) => controller.set(v) }, inventory: inv, yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }), tool: tools, settings,
  });
  const dig = new DigSystemImpl(world, () => controller.state, actions, lock, inv, () => 1.62, createDigConfig(), undefined, combat, { tools, blade, w2: settings, yokai: () => yokai } as never);
  controller.set({ pitchDeg: 0, yawDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const bm = blade.motion();
      controller.motion.speedMul = bm.speedMul;
      controller.motion.jumpLocked = bm.jumpLocked;
      controller.motion.faceDeg = dig.attackFaceDeg();
      controller.update(1 / 60);
      dig.update();
      combat.update();
      actions.endFrame();
    }
  };
  step(2);
  return { world, yokai, dig, blade, actions, step, wear, inv };
}
const swings = (r: ReturnType<typeof rig>) => r.blade.peekEvents().filter((e) => e.type === 'sweepStart').length;

describe('G4 ふりわけ', () => {
  it('4 マス先の ブロックを ねらって 押す → ほる（よこなぎ しない）', () => {
    const r = rig();
    r.world.setBlock(Math.floor(P.x), 10, Math.floor(P.z) - 4, 'log');
    r.step(2);
    r.actions.press('primary');
    r.step(20);
    expect(swings(r)).toBe(0);
    expect(r.dig.state().progress).toBeGreaterThan(0);
  });
  it('G6 の 手順: 木（まるた 4 つ）の 根もとは 押しつづけだけでは きれない（M2 とどめの ひと押し）。押し直すと 下 2 つが 空気', () => {
    const r = rig();
    const x = Math.floor(P.x);
    const z = Math.floor(P.z) - 3;
    for (let y = 10; y <= 13; y++) r.world.setBlock(x, y, z, 'log');
    r.step(2);
    r.actions.press('primary');
    let n = 0;
    while (!r.dig.state().ready && n < 400) {
      r.step(1);
      n++;
    }
    expect(r.dig.state().ready, '400 ステップ 以内に ひびが MAX').toBe(true);
    r.step(50);
    expect(r.world.getBlock(x, 10, z), '押しつづけ だけでは こわれない').toBe('log');
    r.actions.release('primary');
    r.actions.press('primary');
    r.step(1);
    r.actions.release('primary');
    r.step(2);
    expect(r.world.getBlock(x, 10, z)).toBe('air');
    expect(r.world.getBlock(x, 11, z)).toBe('air');
    expect(r.world.getBlock(x, 12, z)).toBe('log');
    expect(swings(r)).toBe(0);
  });
  it('空を ねらって 押す → よこなぎ（ほらない）。46 ステップ すぎると 押しつづけで また 出る', () => {
    const r = rig();
    r.actions.press('primary');
    r.step(TOTAL);
    expect(swings(r)).toBe(1);
    expect(r.dig.state().progress).toBe(0);
    expect(r.blade.sweep!().frame).toBe(TOTAL);
    r.step(1);
    expect(swings(r)).toBe(2);
  });
  it('妖怪の 前で 押す → よこなぎで 7 へる（パンチは しない）', () => {
    const r = rig();
    const y = r.yokai.add('karakasa', at(0, 1.5));
    r.actions.press('primary');
    r.step(1);
    r.actions.release('primary');
    r.step(TOTAL);
    expect(r.yokai.damaged).toEqual([expect.objectContaining({ id: y.id, amount: T.damage })]);
  });
});

describe('G5 たいきゅう', () => {
  it('当たった よこなぎ 1 回で 1 へる・空ぶりは 0', () => {
    const r = rig();
    r.actions.press('primary');
    r.step(1);
    r.actions.release('primary');
    r.step(TOTAL);
    expect(r.wear).toEqual([]);
    r.yokai.add('karakasa', at(0, 1.5));
    r.actions.press('primary');
    r.step(1);
    r.actions.release('primary');
    r.step(TOTAL);
    expect(r.wear).toEqual([1]);
  });
});
