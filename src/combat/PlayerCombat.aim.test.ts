import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState, Vec3, VoxelWorld, YokaiEvent, YokaiRayHit, YokaiWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerCombatImpl } from './PlayerCombat';

/** CHAR-1 第 5.2 版 §4.5: 妖怪のねらい（届く距離は P から・やさしい ねらい補助） */

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  getBlock(): BlockId | 'outside' {
    return 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(): boolean {
    return false;
  }
}

/** 東向きの線に当たる、面が x0 にある仮の妖怪 */
class FakeYokai implements YokaiWorld {
  x0 = 5.5;
  list = () => [];
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null {
    if (dir.x <= 0.5) return null;
    const d = (this.x0 - origin.x) / dir.x;
    return d >= 0 && d <= maxDistance ? { id: 3, kind: 'karakasa', distance: d } : null;
  }
  damage() {}
  occupies() {
    return false;
  }
  drainEvents(): YokaiEvent[] {
    return [];
  }
}

function make(assist?: (eye: Vec3, dir: Vec3, reach: number) => number | null) {
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 5.8 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const yokai = new FakeYokai();
  const combat = new PlayerCombatImpl({
    world: new FakeWorld(),
    player: { get: () => player, set: () => {} },
    inventory: new InventoryImpl(),
    yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }),
    closeInventory: () => {},
    requestSave: () => {},
    reachOrigin: (out) => {
      out.x = 2.5;
      out.y = 11.12;
      out.z = 5.8;
      return out;
    },
    assist,
  });
  return { combat, yokai };
}

const S: Vec3 = { x: 2.5, y: 10.4, z: 6.5 };
const EAST: Vec3 = { x: 1, y: 0, z: 0 };

describe('妖怪のねらい（届く距離は P から）', () => {
  it('S から 3.0 の妖怪は P から 約 3.1 で 素手の 3.5 に届く', () => {
    const { combat } = make();
    expect(combat.aimedYokai(S, EAST, null)).toBe(3);
  });
  it('S から 3.7 の妖怪は P から 約 3.8 で 3.5 を こえるので ねらえない', () => {
    const { combat, yokai } = make();
    yokai.x0 = 6.2;
    expect(combat.aimedYokai(S, EAST, null)).toBeNull();
  });
});

describe('やさしい ねらい補助', () => {
  it('線が妖怪に当たらないとき 補助の妖怪を使う。lastAssist にも入る', () => {
    const { combat, yokai } = make(() => 9);
    yokai.x0 = 0; // 線に当たらない（うしろ）
    expect(combat.aimedYokai(S, EAST, null)).toBe(9);
    expect(combat.lastAssist).toBe(9);
  });
  it('線がそのまま当たるときは 補助を使わない（lastAssist は null）', () => {
    const { combat } = make(() => 9);
    expect(combat.aimedYokai(S, EAST, null)).toBe(3);
    expect(combat.lastAssist).toBeNull();
  });
  it('ブロックに当たっていても 補助で選べた妖怪を ねらう', () => {
    const { combat, yokai } = make(() => 9);
    yokai.x0 = 0;
    expect(combat.aimedYokai(S, EAST, 1.0)).toBe(9);
  });
  it('補助がなければ（null）今までどおり ブロックが手前なら ねらわない', () => {
    const { combat } = make(() => null);
    expect(combat.aimedYokai(S, EAST, 1.0)).toBeNull();
  });
});
