import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { PlayerController } from './PlayerController';

/** どこまでも ひろがる 平らな世界（y <= 8 が いし。読みこんである列は 全部） */
class FlatWorld implements VoxelWorld {
  readonly size = { y: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: -1e9, z0: -1e9, x1: 1e9, z1: 1e9 };
  }
  getBlock(_x: number, y: number): BlockId | 'outside' {
    if (y < 0 || y >= 64) return 'outside';
    return y <= 8 ? 'stone' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y);
    return z === z && b !== 'air' && b !== 'water';
  }
}

const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
const lock: LockStatus = {
  locked: () => true,
  overlayVisible: () => false,
  realtimeAllowed: () => true,
  playInputEnabled: () => true,
};

function run(x: number, z: number, yawDeg: number, steps: number) {
  const spawn: SpawnPoint = { x, y: 9, z, yawDeg, pitchDeg: 0 };
  const actions = new ActionState();
  const p = new PlayerController(new FlatWorld(), actions, look, lock, () => spawn);
  p.set({ position: { x, y: 9, z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg, pitchDeg: 0 });
  actions.press('moveForward');
  for (let i = 0; i < steps; i++) {
    p.update(1 / 60);
    actions.endFrame();
  }
  return p.state;
}

describe('見えない壁（プレイヤー W1〜W3）', () => {
  it('東: x は 29999.7 で止まり、z には動ける（ななめ）', () => {
    const s = run(29990.5, 0.5, 90, 300);
    expect(s.position.x).toBeCloseTo(29999.7, 2);
    const d = run(29990.5, 0.5, 135, 300);
    expect(d.position.x).toBeCloseTo(29999.7, 2);
    expect(d.position.z).toBeGreaterThan(5);
  });
  it('西: x は -29999.7 で止まる', () => {
    const s = run(-29990.5, 0.5, 270, 300);
    expect(s.position.x).toBeCloseTo(-29999.7, 2);
  });
  it('南: z は 29999.7 で止まる', () => {
    const s = run(0.5, 29990.5, 180, 300);
    expect(s.position.z).toBeCloseTo(29999.7, 2);
  });
  it('北: z は -29999.7 で止まる', () => {
    const s = run(0.5, -29990.5, 0, 300);
    expect(s.position.z).toBeCloseTo(-29999.7, 2);
  });
  it('負の座標でも ふつうに歩ける', () => {
    const s = run(-100.5, -100.5, 90, 60);
    expect(s.position.x).toBeGreaterThan(-97);
  });
});
