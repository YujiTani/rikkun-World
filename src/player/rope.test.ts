import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { ROPE_TUNING } from '../world/blocks/rope';
import { PlayerController } from './PlayerController';

/** ROPE-1 AC8〜AC10（docs/design/ROPE-1.md）: ロープに つかまって のぼる・おりる・とまる */

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

/** x=5, z=5 の 列に 床（y=6 の すな）の 上 y=7〜20 の ロープ（いちばん 下は ロープだまり） */
function rig() {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  for (let y = 8; y <= 20; y++) world.setBlock(5, y, 5, 'rope');
  world.setBlock(5, 7, 5, 'rope_coil');
  player.set({ position: { x: 5.5, y: 12, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  return { world, player, actions, step };
}

describe('ロープに つかまる（AC8〜AC10）', () => {
  it('なにも おさないと 落ちずに その 高さで とまる', () => {
    const r = rig();
    r.step(60);
    expect(r.player.onRope()).toBe(true);
    expect(r.player.state.position.y).toBeCloseTo(12, 5);
  });
  it('ジャンプを おしつづけると 1 秒で climbSpeed マス のぼる', () => {
    const r = rig();
    r.actions.press('jump');
    r.step(60);
    expect(r.player.state.position.y).toBeCloseTo(12 + ROPE_TUNING.climbSpeed, 3);
  });
  it('うしろを おしつづけると おりて、ロープだまり（床の 上）に たつ', () => {
    const r = rig();
    r.actions.press('moveBack');
    r.step(60);
    expect(r.player.state.position.y).toBeCloseTo(12 - ROPE_TUNING.climbSpeed, 3);
    r.step(120);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
  });
  it('ロープの ない 所では ふつうに 落ちる', () => {
    const r = rig();
    r.player.set({ position: { x: 8.5, y: 12, z: 8.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 });
    r.step(60);
    expect(r.player.onRope()).toBe(false);
    expect(r.player.state.position.y).toBeCloseTo(7, 3);
  });
});
