import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint } from '../contracts';
import { ActionState } from '../input/actions';
import { waterId } from '../world/blocks/water';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { PlayerController } from './PlayerController';

/**
 * WATER-1 AC14（判定の つかい分け）のうち、プレイヤー: 浅い 水（量 1〜3）は 歩いて 通る。
 * `inWater` は「その 点が 量 4〜8 の 水の マスの 中 かつ 水面（y + 量/8）より 下」（§4.6）。
 * 実装の まえに 書いた テスト（`water.ts` が まだ 無いので 落ちるのが 正しい）。
 */

const SPAWN: SpawnPoint = { x: 2.5, y: 8, z: 6.5, yawDeg: 90, pitchDeg: 0 };
const SURFACE_CELL = 7; // 水の マスの 高さ（床の すな は y 6 まで）

function rig(top: BlockId) {
  const world = new ArrayVoxelWorld({ x: 40, y: 32, z: 16 });
  world.fill(0, 0, 0, 39, 6, 15, 'sand');
  if (top !== 'air') world.fill(0, SURFACE_CELL, 0, 39, SURFACE_CELL, 15, top);
  const actions = new ActionState();
  const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player = new PlayerController(world, actions, look, lock, () => SPAWN);
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      player.update(1 / 60);
      actions.endFrame();
    }
  };
  return { world, actions, player, step };
}

/** 水の マスの 中の 高さ y（小数）に 立たせて、inWater を 返す（`set` は すぐ 判定する） */
function inWaterAt(top: BlockId, y: number): boolean {
  const r = rig(top);
  r.player.set({ position: { x: 10.5, y, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0 });
  return r.player.state.inWater;
}

describe('AC14 プレイヤー: inWater は 深い 水（量 4〜8）の 水面より 下', () => {
  it('量 1〜3 の 水の 中では inWater は false（底に 立っていても・マスの 上の ほうでも）', () => {
    for (const a of [1, 2, 3]) {
      for (const dy of [0, 0.1, 0.2, 0.3]) expect(inWaterAt(waterId(a), SURFACE_CELL + dy), `量 ${a}・底から ${dy}`).toBe(false);
    }
  });

  it('量 4〜8 の 水の 中で 水面より 下なら inWater は true', () => {
    for (const a of [4, 5, 6, 7, 8]) {
      expect(inWaterAt(waterId(a), SURFACE_CELL), `量 ${a}・底`).toBe(true);
      expect(inWaterAt(waterId(a), SURFACE_CELL + a / 8 - 0.05), `量 ${a}・水面の すこし 下`).toBe(true);
    }
  });

  it('量 4 では 水面（マスの 半分 = 7.5）より 上に 足が あれば false', () => {
    expect(inWaterAt(waterId(4), SURFACE_CELL + 0.45)).toBe(true);
    expect(inWaterAt(waterId(4), SURFACE_CELL + 0.6)).toBe(false);
    expect(inWaterAt(waterId(4), SURFACE_CELL + 0.8)).toBe(false);
  });

  it('量 6 では 水面（6/8）の 上下で 分かれる', () => {
    expect(inWaterAt(waterId(6), SURFACE_CELL + 0.7)).toBe(true);
    expect(inWaterAt(waterId(6), SURFACE_CELL + 0.8)).toBe(false);
  });

  it('量 8 は 今と 同じ（マスの 中は ぜんぶ 水の 中）', () => {
    expect(inWaterAt('water', SURFACE_CELL)).toBe(true);
    expect(inWaterAt('water', SURFACE_CELL + 0.9)).toBe(true);
    expect(inWaterAt('air', SURFACE_CELL)).toBe(false);
  });
});

describe('AC14 プレイヤー: 浅い 水は 歩く 速さ そのまま、深い 水は 半分', () => {
  const walkedIn = (top: BlockId): number => {
    const r = rig(top);
    r.player.set({ position: { x: 2.5, y: SURFACE_CELL, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0 });
    r.step(60); // 落ちつく
    const x0 = r.player.state.position.x;
    r.actions.press('moveForward');
    r.step(60);
    return r.player.state.position.x - x0;
  };

  it('量 1〜3 の 水の 中を 60 ステップ 歩くと 3.75〜4.05（地上と 同じ）', () => {
    for (const a of [1, 3]) {
      const d = walkedIn(waterId(a));
      expect(d, `量 ${a}`).toBeGreaterThan(3.75);
      expect(d, `量 ${a}`).toBeLessThan(4.05);
    }
  });

  it('量 4 の 水の 中を 60 ステップ 歩くと 1.85〜2.05（今の 水と 同じ 半分）', () => {
    const d = walkedIn(waterId(4));
    expect(d).toBeGreaterThan(1.85);
    expect(d).toBeLessThan(2.05);
  });
});
