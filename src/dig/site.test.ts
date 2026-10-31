import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * HOUSE-1C PR-2（AC16・AC17・AC39）: みずもり・どうづきを 持って 右クリック ＝ はかる・かためる。建築中の 場所（locked）は ほれず、置けない。
 * 世界・持ち物は 小さな 作りもの。ねらいは 目の 前の ブロック (5, 10, 6)・置く 場所は その 手前 (4, 10, 6)。
 */
function rig(held: ItemId | null, locked: (x: number, y: number, z: number) => boolean = () => false) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => {
      blocks.set(key(x, y, z), id);
      return true;
    },
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
  };
  for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) blocks.set(key(x, 8, z), 'stone');
  blocks.set(key(5, 10, 6), 'dirt');
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 2 });
  inv.select(0);
  const calls: string[] = [];
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    build: {
      locked,
      level: (x, y, z) => calls.push(`level ${x},${y},${z}`),
      tamp: (x, y, z) => calls.push(`tamp ${x},${y},${z}`),
    },
  });
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, world, calls };
}

function tapSecondary(r: ReturnType<typeof rig>): void {
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
}

/** 左クリックを 押して ひびが MAX に なるまで 待ち、押し直して ほる（最大 600 ステップ） */
function digTarget(r: ReturnType<typeof rig>): void {
  r.actions.press('primary');
  for (let i = 0; i < 600 && !r.dig.state().ready; i++) {
    r.dig.update();
    r.actions.endFrame();
  }
  r.actions.release('primary');
  r.dig.update();
  r.actions.endFrame();
  r.actions.press('primary');
  r.dig.update();
  r.actions.release('primary');
  r.actions.endFrame();
}

describe('みずもり・どうづき（右クリック）', () => {
  it('みずもりを 持って ねらった ブロックを 右クリック → はかる（level に ねらった ブロック）。持ち物は へらない', () => {
    const r = rig('mizumori' as ItemId);
    const before = r.inv.held()?.count;
    tapSecondary(r);
    expect(r.calls).toEqual(['level 5,10,6']);
    expect(r.inv.held()?.count).toBe(before);
  });

  it('どうづきを 持って 右クリック → かためる（tamp に ねらった ブロック）。持ち物は へらない', () => {
    const r = rig('dotsuki' as ItemId);
    const before = r.inv.held()?.count;
    tapSecondary(r);
    expect(r.calls).toEqual(['tamp 5,10,6']);
    expect(r.inv.held()?.count).toBe(before);
  });

  it('ほかの 物を 持って いれば はからない・かためない', () => {
    const r = rig('dirt' as ItemId);
    tapSecondary(r);
    expect(r.calls).toEqual([]);
  });
});

describe('建築中の 場所（locked）', () => {
  it('ほれない: ひびが MAX に なって 押し直しても ブロックは そのまま・つちも 手に 入らない', () => {
    const r = rig(null, (x, y, z) => x === 5 && y === 10 && z === 6);
    digTarget(r);
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    expect(r.inv.count('dirt' as ItemId)).toBe(0);
  });

  it('対照: locked でなければ ほれる（つち 1 こ）', () => {
    const r = rig(null);
    digTarget(r);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.inv.count('dirt' as ItemId)).toBeGreaterThanOrEqual(1);
  });

  it('置けない: 置く 場所が locked なら ブロックも 持ち物も かわらない', () => {
    const r = rig('stone' as ItemId, (x, y, z) => x === 4 && y === 10 && z === 6);
    tapSecondary(r);
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.inv.held()?.count).toBe(2);
  });

  it('対照: locked でなければ 置ける', () => {
    const r = rig('stone' as ItemId);
    tapSecondary(r);
    expect(r.world.getBlock(4, 10, 6)).toBe('stone');
    expect(r.inv.held()?.count).toBe(1);
  });
});
