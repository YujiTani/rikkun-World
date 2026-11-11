import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import type { LockStatus, PlayerState, YokaiInfo, YokaiWorld } from '../contracts';
import { DigSystemImpl } from '../dig/DigSystem';
import { createP2Hammer } from '../duo/p2Hammer';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';

/**
 * LEGEND-4 PR5 D10・D11: 2P の ハンマーで こわれた 物は 2P の もちもの・1P の もちものは かわらない。2P の 急降下も D5 と 同じ 数。
 * 1 振りで ブロックを 見る 回数は 12 以下（奥行き 2 でも）。
 */
const FLOOR = 8;
const T = LEGEND4_TUNING.daichi;

function setup(noYokai = false) {
  const world = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) world.setBlock(x, FLOOR, z, 'stone');
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  inv2.add('daichi_hammer', 1);
  const body: PlayerState = { position: { x: 10.5, y: FLOOR + 1, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, facingDeg: 0, onGround: true, inWater: false, running: false, moving: false } as unknown as PlayerState;
  const actions = new ActionState();
  const lock = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true } as LockStatus;
  const dig2 = new DigSystemImpl(world, () => body, actions, lock, inv2, () => 1.5);
  const hp = { v: 99 };
  const list = (noYokai ? [] : [{ id: 7, kind: 'karakasa', position: { x: 10.5, y: FLOOR + 1, z: 9.5 }, yawDeg: 0, hp: 99, maxHp: 99, state: 'idle', attackTick: 0, scale: 1, name: '', title: 'none', m: 1, attack: 0 }]) as unknown as YokaiInfo[];
  const yokai = { list: () => list, damage: (_i: number, a: number) => { hp.v -= a; } } as unknown as YokaiWorld;
  let reads = 0;
  const counted = { getBlock: (x: number, y: number, z: number) => (reads++, world.getBlock(x, y, z)), isSolid: (x: number, y: number, z: number) => world.isSolid(x, y, z) };
  const ham = createP2Hammer({
    world: counted,
    yokai: () => yokai,
    breakAt: (x, y, z) => dig2.breakExternal(x, y, z),
    inventory: inv2,
    body: () => body,
    actions: { isHeld: () => held, wasPressed: () => pressed },
    active: () => true,
    sound: { playTones: () => {} },
    fx: { step: () => {}, dispose: () => {} },
    reduced: () => false,
  });
  let held = false;
  let pressed = false;
  const step = (h = false) => {
    pressed = h && !held;
    held = h;
    const m = ham.motion();
    if (m.hoverY !== null) body.position.y = Math.max(FLOOR + 1, body.position.y + Math.max(-0.5, Math.min(0.5, m.hoverY - body.position.y)));
    body.onGround = body.position.y <= FLOOR + 1 + 1e-9;
    ham.step();
  };
  return { world, inv1, inv2, body, step, hp, ham, reads: () => reads, resetReads: () => (reads = 0) };
}

describe('D10・D11 2P の 大地のハンマー', () => {
  it('2P の 振りで こわれた 石は 2P の もちものへ・1P は かわらない・見る 回数 12 以下', () => {
    const s = setup();
    s.world.fill(9, FLOOR + 1, 8, 11, FLOOR + 2, 9, 'stone');
    s.step(true);
    s.resetReads();
    for (let i = 0; i < 50; i++) s.step();
    expect(s.world.getBlock(10, FLOOR + 1, 9)).toBe('air');
    expect(s.world.getBlock(10, FLOOR + 1, 8)).toBe('stone');
    expect(s.inv2.count('stone')).toBeGreaterThan(0);
    expect(s.inv1.count('stone')).toBe(0);
    expect(s.hp.v).toBe(99 - T.damage);
    expect(s.world.getBlock(10, FLOOR + 1, 8)).toBe('stone');
  });
  it('2P の 急降下も 地面 + 6 マスで 32・奥行き 2 で 12 マス（見る 回数 12）', () => {
    const s = setup();
    s.world.fill(9, FLOOR + 1, 8, 11, FLOOR + 2, 9, 'stone');
    s.body.position.y = FLOOR + 1 + 6;
    s.body.onGround = false;
    s.step();
    s.step(true);
    s.resetReads();
    for (let i = 0; i < 40; i++) s.step();
    expect(s.hp.v).toBe(99 - 32);
    expect(s.ham.system.view().last?.broken.length).toBe(12);
    expect(s.world.getBlock(10, FLOOR + 1, 8)).toBe('air');
  });
  it('D11 ブロックを 見る 回数: 奥行き 2（12 マス）でも 12 以下', () => {
    const s = setup(true);
    s.world.fill(9, FLOOR + 1, 8, 11, FLOOR + 2, 9, 'stone');
    s.body.position.y = FLOOR + 1 + 6;
    s.body.onGround = false;
    s.step();
    s.step(true);
    for (let i = 0; i < 7; i++) s.step(); // ふりかぶり
    s.resetReads();
    for (let i = 0; i < 40; i++) s.step();
    expect(s.ham.system.view().last?.broken.length).toBe(12);
    expect(s.reads()).toBeLessThanOrEqual(12);
  });
});
