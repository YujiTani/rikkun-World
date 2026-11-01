import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { tetherOf } from '../world/blocks/ropeTether';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from './PlayerController';

/** ROPE-1 版 3（つなぎ・AC26〜AC29）: たいらで くいに つなぐ → 長さより 先へ 行けない・がけから 落ちると ぶら下がる・スペースで のぼる・ダメージ なし */

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  private blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 64 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? (y <= 6 ? 'sand' : 'air');
  }
  setBlock(x: number, y: number, z: number, id: BlockId) {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== 'rope' && b !== 'rope_coil';
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, id);
  }
}

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };

/** 台地 x=0〜10・y=7〜30（上は y=31）。くい (5,31,5)。x=11 から 先は がけ（床は y=6） */
function rig(ropes: number) {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  world.fill(0, 7, 0, 10, 30, 63, 'sand');
  world.setBlock(5, 31, 5, 'rope_stake');
  tetherOf(world).tie({ x: 5, y: 31, z: 5 }, ropes);
  player.set({ position: { x: 5.5, y: 31, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  return { world, player, actions, step };
}

describe('つなぎ（ROPE-1 版 3）', () => {
  it('たいらでは くいから 長さ（1 本 = 10 マス）より 先へ 行けない', () => {
    const { player, actions, step } = rig(1);
    player.set({ yawDeg: 180 }); // +z へ
    actions.press('moveForward');
    step(600);
    expect(player.state.position.z).toBeGreaterThan(13);
    expect(player.state.position.z).toBeLessThan(5.5 + 10.05);
    expect(player.state.onGround).toBe(true);
  });

  it('がけから 落ちると 長さで ぶら下がる → スペースで のぼる （ダメージ 0）', () => {
    const rig0 = rig(2);
    const { player, actions, step } = rig0;
    const combat = new PlayerCombatImpl({
      world: rig0.world,
      player: { get: () => player.state, set: (v: never) => player.set(v) },
      inventory: new InventoryImpl(),
      yokai: () => ({ occupies: () => false }) as never,
      spawn: () => SPAWN,
      noFall: () => player.onRope(),
    } as never);
    const hp0 = combat.hp();
    const tickFall = () => combat.update();
    player.set({ yawDeg: 90 }); // +x へ（がけ）
    actions.press('moveForward');
    for (let i = 0; i < 120; i++) {
      step();
      tickFall();
    }
    actions.release('moveForward');
    for (let i = 0; i < 180; i++) {
      step();
      tickFall();
    }
    const hangY = player.state.position.y;
    expect(player.state.position.x).toBeGreaterThan(11);
    expect(hangY).toBeGreaterThan(9); // 床（y=7）まで 落ちて いない
    expect(player.onRope()).toBe(true);
    step(60);
    expect(Math.abs(player.state.position.y - hangY)).toBeLessThan(0.05); // とまる
    actions.press('jump');
    for (let i = 0; i < 60; i++) {
      step();
      tickFall();
    }
    actions.release('jump');
    expect(player.state.position.y).toBeGreaterThan(hangY + 1.5);
    expect(combat.hp()).toBe(hp0);
  });

  it('くいが なくなると つなぎは きれる', () => {
    const { world, player, step } = rig(1);
    world.setBlock(5, 31, 5, 'air');
    step(2);
    expect(tetherOf(world).anchor).toBeNull();
    expect(player.onRope()).toBe(false);
  });
});
