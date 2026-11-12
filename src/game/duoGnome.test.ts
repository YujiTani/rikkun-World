import { describe, expect, it } from 'vitest';
import type { LockStatus, PlayerState } from '../contracts';
import { DigSystemImpl } from '../dig/DigSystem';
import { createDigConfig } from '../dig/config';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';

/**
 * LEGEND-4 PR4 G7（§7.7）: 2P が ノームの斧で きった まるたは 2P の もちものへ（2 つ ぶん）。1P の もちものは かわらない。
 * 2P の 掘る係は 1P と 同じ 部品（DigSystemImpl）を 2P の もちもの・入力で 使う（COOP-1 §3.3）。
 */
describe('G7 2P の ノームの斧', () => {
  it('2P が きった まるた 2 つは 2P の もちものに 入る・1P の まるたは ふえない', () => {
    const world = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
    world.setBlock(8, 9, 5, 'log');
    world.setBlock(8, 10, 5, 'log');
    const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
    const inv1 = new InventoryImpl();
    const inv2 = new InventoryImpl();
    inv1.add('gnome_axe', 1);
    inv2.add('gnome_axe', 1);
    const p2: PlayerState = { position: { x: 5.5, y: 8, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
    const actions2 = new ActionState();
    const dig2 = new DigSystemImpl(world, () => p2, actions2, lock, inv2, () => 1.62, createDigConfig(), () => 0);
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        dig2.update();
        actions2.endFrame();
      }
    };
    step(1);
    actions2.press('primary');
    step(300);
    actions2.release('primary');
    actions2.press('primary');
    step(1);
    expect(world.getBlock(8, 9, 5)).toBe('air');
    expect(world.getBlock(8, 10, 5)).toBe('air');
    expect(inv2.count('log')).toBe(2);
    expect(inv1.count('log')).toBe(0);
  });
});
