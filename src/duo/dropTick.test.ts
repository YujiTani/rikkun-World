import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import type { DropField } from '../drops/DropField';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { pickableMate } from './rules';

/** COOP-1 3a 直し: 2P が いても 世界の 落とし物は 1 ステップに 1 回だけ 進む。倒れた 2P は ひろわない */
const world = {
  size: { x: 64, y: 32, z: 64 },
  isLoaded: () => true,
  loadedBounds: () => ({ x0: 0, z0: 0, x1: 64, z1: 64 }),
  getBlock: (_x: number, y: number): BlockId | 'outside' => (y === 8 ? 'stone' : 'air'),
  setBlock: () => true,
  isSolid: (_x: number, y: number) => y === 8,
};

function make(tickDrops: boolean | undefined, drops: { update: (c: boolean) => number[] }) {
  const state = { position: { x: 2.5, y: 9, z: 2.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0 };
  return new PlayerCombatImpl({
    world: world as never,
    player: { get: () => state as never, set: () => {} },
    inventory: new InventoryImpl(),
    yokai: (() => ({ list: () => [], raycast: () => null, damage: () => {}, occupies: () => false, drainEvents: () => [] })) as never,
    spawn: () => ({ x: 2.5, y: 9, z: 2.5, yawDeg: 0, pitchDeg: 0 }),
    rng: createRng(1),
    drops: drops as unknown as DropField,
    tickDrops,
  });
}

describe('落とし物の 進み', () => {
  it('1P と 2P の 両方が 同じ DropField を 持っても 1 ステップに 1 回', () => {
    let n = 0;
    const drops = { update: () => (n++, []) };
    const p1 = make(undefined, drops);
    const p2 = make(false, drops);
    for (let i = 0; i < 5; i++) {
      p1.update();
      p2.update();
    }
    expect(n).toBe(5);
  });
  it('倒れた 2P は ひろわない', () => {
    const mate = { position: { x: 0, y: 0, z: 0 } };
    expect(pickableMate(mate, true)).toBeNull();
    expect(pickableMate(mate, false)).toBe(mate);
    expect(pickableMate(null, false)).toBeNull();
  });
});
