import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { createW2Settings } from '../contracts';
import { GADGET_TUNING, jumpHeightWith } from '../content/items/gadgetTuning';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createP2Gadgets } from '../duo/p2Gadgets';
import { ActionState } from '../input/actions';
import { legendMoveMulOf } from '../legend/defs';
import { PlayerController } from './PlayerController';
import { createPlayerSettings } from './config';

/**
 * LEGEND-4 PR1 K7（docs/design/LEGEND-4.md §4.3-5）: 黒龍を 持つ 間 歩く 4.8・走る 6.72・ジャンプの 高さ 2.5（わらじでも）。
 * ほかの 物に かえると 4.0・5.6・1.25（わらじなら 1.5）に もどる。持つ 物の 倍率は 1P の step.ts・2P も 同じ 口（legendMoveMulOf・createP2Gadgets）。
 */
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
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

const SPAWN: SpawnPoint = { x: 32.5, y: 12, z: 32.5, yawDeg: 0, pitchDeg: 0 };
const S = createW2Settings();
const base = createPlayerSettings();
const K = LEGEND4_TUNING.kokuryu;

function rig(held: ItemId | null, legs: ItemId | null) {
  const world = new FakeWorld();
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.setBlock(x, 8, z, 'stone');
  player.set({ position: { x: 4.5, y: 9, z: 32.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0 });
  // 1P の step.ts と 同じ 式: 持つ 物の 速さの 倍率 ／ 2P と 共通の 小物の 口（わらじ・黒龍の ジャンプの 高さ）
  player.motion.speedMul = legendMoveMulOf(S, held);
  const gadgets = createP2Gadgets({ body: player, held: () => held, legs: () => legs, tick: () => 0 });
  gadgets.step();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  step(2);
  const speed = (run: boolean): number => {
    actions.press('moveForward');
    if (run) actions.press('run');
    step(40);
    const v = Math.hypot(player.state.velocity.x, player.state.velocity.z);
    actions.release('moveForward');
    actions.release('run');
    return v;
  };
  const jumpPeak = (): number => {
    step(60);
    const y0 = player.state.position.y;
    actions.press('jump');
    step(1);
    actions.release('jump');
    let top = y0;
    for (let i = 0; i < 100; i++) {
      step(1);
      top = Math.max(top, player.state.position.y);
    }
    return top - y0;
  };
  return { speed, jumpPeak };
}

describe('K7 黒龍の 速さ・ジャンプ', () => {
  it('黒龍: 歩く 4.8・走る 6.72（±0.01）', () => {
    expect(rig('kokuryu', null).speed(false)).toBeCloseTo(base.walkSpeed * K.moveMul, 2);
    expect(rig('kokuryu', null).speed(true)).toBeCloseTo(base.runSpeed * K.moveMul, 2);
    expect(base.walkSpeed * K.moveMul).toBeCloseTo(4.8, 2);
    expect(base.runSpeed * K.moveMul).toBeCloseTo(6.72, 2);
  });
  it('ジャンプの 頂点は ＋ 2.5（±0.05）。わらじを はいても 2.5（高い ほう）', () => {
    expect(rig('kokuryu', null).jumpPeak()).toBeCloseTo(base.jumpHeight * K.jumpMul, 1);
    expect(rig('kokuryu', 'waraji').jumpPeak()).toBeCloseTo(base.jumpHeight * K.jumpMul, 1);
    expect(base.jumpHeight * K.jumpMul).toBe(2.5);
  });
  it('ほかの 物では 4.0・5.6・1.25（わらじなら 1.5）に もどる', () => {
    expect(rig('katana', null).speed(false)).toBeCloseTo(4.0, 2);
    expect(rig('katana', null).speed(true)).toBeCloseTo(5.6, 2);
    expect(rig(null, null).jumpPeak()).toBeCloseTo(1.25, 1);
    expect(rig('katana', 'waraji').jumpPeak()).toBeCloseTo(GADGET_TUNING.waraji.jumpHeight, 1);
    expect(rig('yumi', null).jumpPeak()).toBeCloseTo(1.25, 1);
  });
  it('jumpHeightWith(legs, base, held): 黒龍 = base × 2・わらじと 重ねると 高い ほう', () => {
    expect(jumpHeightWith(null, 1.25, 'kokuryu')).toBe(2.5);
    expect(jumpHeightWith('waraji', 1.25, 'kokuryu')).toBe(2.5);
    expect(jumpHeightWith('waraji', 1.25, 'katana')).toBe(GADGET_TUNING.waraji.jumpHeight);
    expect(jumpHeightWith(null, 1.25, null)).toBe(1.25);
    expect(jumpHeightWith(null, 1.25)).toBe(1.25);
  });
});
