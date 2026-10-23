import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { PlayerController } from './PlayerController';

/** WEAPON-9 §5.2: うかぶ（motion.hoverY）。重力を 使わず 目標の 高さへ。天井で 止まる。やめたら 落ちる */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  private b = new Map<string, BlockId>();
  isLoaded(): boolean { return true; }
  loadedBounds() { return { x0: 0, z0: 0, x1: 32, z1: 32 }; }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 32 || y >= 32 || z >= 32) return 'outside';
    return this.b.get(`${x},${y},${z}`) ?? (y <= 7 ? 'stone' : 'air');
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean { this.b.set(`${x},${y},${z}`, id); return true; }
  isSolid(x: number, y: number, z: number): boolean { const g = this.getBlock(x, y, z); return g !== 'outside' && g !== 'air' && g !== 'water'; }
}
const SPAWN: SpawnPoint = { x: 16.5, y: 8, z: 16.5, yawDeg: 0, pitchDeg: 0 };
const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };

function rig() {
  const world = new W();
  const p = new PlayerController(world, new ActionState(), look, lock, () => SPAWN);
  for (let i = 0; i < 10; i++) p.update(1 / 60);
  return { world, p };
}

describe('hoverY', () => {
  it('目標へ 動く（重力で 落ちない）。いったん 止まる', () => {
    const { p } = rig();
    expect(p.state.position.y).toBeCloseTo(8, 3);
    for (let i = 0; i < 60; i++) {
      p.motion.hoverY = 10;
      p.update(1 / 60);
    }
    expect(p.state.position.y).toBeCloseTo(10, 2);
    expect(p.state.onGround).toBe(false);
    expect(p.state.velocity.y).toBe(0);
  });
  it('1 ステップに 動く 量は 0.5 まで（ふわっと）', () => {
    const { p } = rig();
    p.motion.hoverY = 12;
    p.update(1 / 60);
    expect(p.state.position.y - 8).toBeLessThanOrEqual(0.5 + 1e-9);
  });
  it('天井(1.5 上)の 下で 止まる', () => {
    const { world, p } = rig();
    world.setBlock(16, 10, 16, 'stone'); // 体の たかさ 1.8 → 頭が 10 に ぶつかる = y 8.2 まで
    for (let i = 0; i < 60; i++) {
      p.motion.hoverY = 10;
      p.update(1 / 60);
    }
    expect(p.state.position.y).toBeLessThan(8.3);
    expect(p.state.position.y).toBeGreaterThan(8.0);
  });
  it('天井が 3 上(y=11)なら 頭が ぶつかる 9.2 の 手前で 止まる', () => {
    const { world, p } = rig();
    world.setBlock(16, 11, 16, 'stone');
    for (let i = 0; i < 80; i++) {
      p.motion.hoverY = 11;
      p.update(1 / 60);
    }
    expect(p.state.position.y).toBeGreaterThan(9.0);
    expect(p.state.position.y).toBeLessThanOrEqual(9.2 + 1e-3);
  });
  it('null に もどすと 落ちる', () => {
    const { p } = rig();
    for (let i = 0; i < 30; i++) {
      p.motion.hoverY = 10;
      p.update(1 / 60);
    }
    p.motion.hoverY = null;
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    expect(p.state.position.y).toBeCloseTo(8, 2);
    expect(p.state.onGround).toBe(true);
  });
});
