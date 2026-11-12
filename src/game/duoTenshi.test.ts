import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, LookSource, SpawnPoint, VoxelWorld } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { ActionState } from '../input/actions';
import { PlayerController } from '../player/PlayerController';
import { applyTenshiMotion } from '../player/tenshiMove';

/**
 * LEGEND-4 PR3 T11（§6.6・§3.3）: 2P の 空中ジャンプの のこりは 1P と 別の 体に ある（1P が 3 回 使っても 2P は 3）。
 * 2P の 入力は 2P の ActionState（パッドの B = jump の 押しなおし）。持って いる 物は 人ごと（applyTenshiMotion を 人ごとに 呼ぶ）。
 */
class W implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  isLoaded() { return true; }
  loadedBounds() { return { x0: 0, z0: 0, x1: 64, z1: 64 }; }
  getBlock(_x: number, y: number, _z: number): BlockId | 'outside' { return y <= 8 ? 'stone' : 'air'; }
  setBlock() { return true; }
  isSolid(_x: number, y: number, _z: number): boolean { return y <= 8; }
}
const SPAWN: SpawnPoint = { x: 10.5, y: 9, z: 10.5, yawDeg: 0, pitchDeg: 0 };
const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const look: LookSource = { consume: () => ({ dx: 0, dy: 0 }) };

function person(x: number) {
  const actions = new ActionState();
  const body = new PlayerController(new W(), actions, look, lock, () => SPAWN);
  body.set({ position: { x, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 } });
  return { actions, body };
}

describe('T11 2P の 空中ジャンプ', () => {
  it('1P が 3 回 使っても 2P の のこりは 3。2P も 押しなおしで とべる', () => {
    const p1 = person(10.5);
    const p2 = person(20.5);
    const all = (held2: boolean, n = 1) => {
      for (let i = 0; i < n; i++) {
        applyTenshiMotion(p1.body.motion, 'tenshi_yumi');
        applyTenshiMotion(p2.body.motion, held2 ? 'tenshi_yumi' : null);
        p1.body.update(1 / 60);
        p2.body.update(1 / 60);
        p1.actions.endFrame();
        p2.actions.endFrame();
      }
    };
    const tap = (p: ReturnType<typeof person>, held2: boolean) => {
      p.actions.press('jump');
      all(held2);
      p.actions.release('jump');
    };
    const apex = (held2: boolean) => {
      for (let i = 0; i < 120 && p1.body.state.velocity.y > 0.5; i++) all(held2);
      all(held2, 2);
    };
    all(true, 3);
    tap(p1, true);
    for (let k = 0; k < LEGEND4_TUNING.tenshi.airJumps; k++) {
      apex(true);
      tap(p1, true);
    }
    expect(p1.body.airJumpsLeft).toBe(0);
    expect(p2.body.airJumpsLeft).toBe(LEGEND4_TUNING.tenshi.airJumps);
    // 2P（天使の弓を 持つ）も 地面で とんで 空中で 押しなおす
    for (let i = 0; i < 400 && !p1.body.state.onGround; i++) all(true);
    tap(p2, true);
    for (let i = 0; i < 12; i++) all(true);
    tap(p2, true);
    expect(p2.body.airJumpsLeft).toBe(LEGEND4_TUNING.tenshi.airJumps - 1);
  });
});
