import { describe, expect, it } from 'vitest';
import type { BlockId, DigFarmPort, ItemId, LockStatus, PlayerState } from '../contracts';
import { M7_SETTING_DEFAULTS, createM7Settings } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createFarmSystem } from '../farm/FarmSystem';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * FLORA-75 AC6〜8: くさ（kusa）・のばな（nobana）を こわす・置く・たがやす・たね。
 * 目の高さ 10.62 で 東（+x）を 向く → (5,10,6) を ねらう。ほかは DigSystem.farm.test.ts と同じ組み立て。
 */
function rig(held: ItemId | null, target: BlockId | null, opts: { below?: BlockId; above?: BlockId; behind?: BlockId } = {}) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const SOLID = new Set<string>(['grass', 'dirt', 'stone', 'farmland']);
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => SOLID.has(blocks.get(key(x, y, z)) ?? 'air'),
  };
  if (target) blocks.set(key(5, 10, 6), target);
  if (opts.below) blocks.set(key(5, 9, 6), opts.below);
  if (opts.above) blocks.set(key(5, 11, 6), opts.above);
  if (opts.behind) blocks.set(key(4, 9, 6), opts.behind);
  const player: PlayerState = { position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 3 });
  inv.select(0);
  const log: string[] = [];
  const farm: DigFarmPort = {
    crop: () => null,
    soil: () => null,
    settings: () => M7_SETTING_DEFAULTS,
    till: (x, y, z) => (log.push(`till ${x},${y},${z}`), world.setBlock(x, y, z, 'farmland')),
    noteTillPress: (_x, _y, _z, n) => void log.push(`press${n}`),
    plant: () => true,
    harvest: () => ({ ok: false, reason: 'none' }),
    onBlockBroken: () => [],
    grassSeed: () => (log.push('grassSeed'), null),
    eatHeal: () => 0,
    noteEat: () => undefined,
    noteHint: (h) => void log.push(`hint ${h}`),
    ripen: () => false,
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0.999, null, { farm });
  dig.update(); // ねらいを決める
  actions.endFrame();
  /** 左ボタンを 押し続けて（MAX まで）、はなして 押しなおして こわす */
  const step = (n: number, btn: 'primary' | 'secondary') => {
    actions.press(btn);
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
    actions.release(btn);
    actions.endFrame();
    actions.press(btn);
    dig.update();
    actions.endFrame();
    actions.release(btn);
    actions.endFrame();
  };
  const tap = (btn: 'primary' | 'secondary') => {
    actions.press(btn);
    dig.update();
    actions.release(btn);
    actions.endFrame();
  };
  const total = () => inv.slots().reduce((n, s) => n + (s ? s.count : 0), 0);
  return { dig, inv, world, log, tap, step, total };
}

describe('AC6: こわす・置く', () => {
  it('くさ を 1 回こわす → 消える・持ち物は ふえない・たね は 出ない', () => {
    const r = rig(null, 'kusa', { below: 'grass' });
    r.step(30, 'primary');
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.total() - r.inv.count('hemp')).toBe(0); // ROPE-1: あさ（1/3）だけは でる ことが ある
    expect(r.log).not.toContain('grassSeed');
  });
  it('のばな を こわす → のばな ＋1', () => {
    const r = rig(null, 'nobana', { below: 'grass' });
    r.step(30, 'primary');
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.inv.count('nobana')).toBe(1);
    expect(r.total() - r.inv.count('hemp')).toBe(1); // ROPE-1: あさ（1/3）だけは でる ことが ある
  });
  it('のばな は くさ・つち（上が くうき）に 置ける。ほかには 置けない', () => {
    // 東を向いて (5,10,6) の くさ ブロックを ねらうと、置く場所は 西どなり (4,10,6)。その下 (4,9,6) が 地面かどうか
    for (const under of ['grass', 'dirt'] as const) {
      const r = rig('nobana', 'grass', { behind: under });
      r.tap('secondary');
      expect(r.world.getBlock(4, 10, 6), `下が ${under}`).toBe('nobana');
      expect(r.inv.held()!.count).toBe(2);
    }
    for (const under of ['stone', 'sand', 'log'] as const) {
      const r = rig('nobana', 'grass', { behind: under });
      r.tap('secondary');
      expect(r.world.getBlock(4, 10, 6), `下が ${under}`).toBe('air');
      expect(r.inv.held()!.count).toBe(3);
    }
    const none = rig('nobana', 'grass');
    none.tap('secondary');
    expect(none.world.getBlock(4, 10, 6)).toBe('air');
  });
  it('ブロックを持って くさ を ねらって 置くと、くさ の マスに 置けて くさ は 消える', () => {
    const r = rig('dirt', 'kusa', { below: 'grass' });
    r.tap('secondary');
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    expect(r.inv.held()!.count).toBe(2);
    expect(r.inv.count('nobana')).toBe(0);
  });
  it('のばな を くさ を ねらって 置くと、くさ の マス（下が 地面）に 置ける', () => {
    const r = rig('nobana', 'kusa', { below: 'grass' });
    r.tap('secondary');
    expect(r.world.getBlock(5, 10, 6)).toBe('nobana');
  });
  it('のばな を ねらって ブロックを 置いても のばな の マスには 置けない（となりに 置く）', () => {
    const r = rig('dirt', 'nobana', { below: 'grass' });
    r.tap('secondary');
    expect(r.world.getBlock(5, 10, 6)).toBe('nobana');
  });
});

describe('AC7: 下の くさ ブロック を こわすと 上の くさ・のばな も 消える', () => {
  it('くさ（上）が 消える・何も 出ない（くさ ブロック は 今のまま 1 こ）', () => {
    const r = rig(null, 'grass', { above: 'kusa' });
    r.step(120, 'primary');
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.world.getBlock(5, 11, 6)).toBe('air');
    expect(r.inv.count('nobana')).toBe(0);
  });
  it('のばな（上）が 消える・のばな ＋1', () => {
    const r = rig(null, 'grass', { above: 'nobana' });
    r.step(120, 'primary');
    expect(r.world.getBlock(5, 11, 6)).toBe('air');
    expect(r.inv.count('nobana')).toBe(1);
  });
});

describe('AC8: くわ で たがやす・たね', () => {
  it('くわ で くさ（板）を 右クリック 1 回 → 下が はたけ・上は くうき', () => {
    const r = rig('kuwa', 'kusa', { below: 'grass' });
    r.tap('secondary');
    expect(r.log).toEqual(['till 5,9,6']);
    expect(r.world.getBlock(5, 9, 6)).toBe('farmland');
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.inv.count('nobana')).toBe(0);
  });
  it('くわ で その下の くさ ブロック を ねらっても（上に くさ）→ はたけ・上は くうき', () => {
    const r = rig('kuwa', 'grass', { above: 'kusa' });
    r.tap('secondary');
    expect(r.log).toEqual(['till 5,10,6']);
    expect(r.world.getBlock(5, 11, 6)).toBe('air');
  });
  it('のばな を くわ で たがやす → のばな ＋1・下が はたけ', () => {
    const r = rig('kuwa', 'nobana', { below: 'dirt' });
    r.tap('secondary');
    expect(r.log).toEqual(['till 5,9,6']);
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.inv.count('nobana')).toBe(1);
  });
  it('たね を持って くさ を ねらうと 下の くさ ブロック を ねらったのと 同じ（合図）', () => {
    const r = rig('seed_tomato', 'kusa', { below: 'grass' });
    r.tap('secondary');
    expect(r.log).toEqual(['hint till']);
  });
  it('くさ ブロック から たね が出る わりあいは 1/8 のまま（1 万回で 0.11〜0.14）。くさ（板）からは 0', () => {
    const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    const settings = createM7Settings();
    const farm = createFarmSystem({
      world,
      light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
      seed: 3,
      dayLength: () => 91800,
      settings,
      tick: () => 0,
      fillTansu: () => undefined,
      placement: () => ({ wild: [], oldFarm: null }),
    });
    let n = 0;
    for (let i = 0; i < 10000; i++) if (farm.grassSeed(3, 3)) n++;
    expect(n / 10000).toBeGreaterThanOrEqual(0.11);
    expect(n / 10000).toBeLessThanOrEqual(0.14);
    // くさ（板）を こわす → grassSeed を 呼ばない（上の 'くさ を 1 回こわす' で 確認）
    const r = rig(null, 'kusa', { below: 'grass' });
    r.step(30, 'primary');
    expect(r.log.filter((l) => l === 'grassSeed')).toHaveLength(0);
    const g = rig(null, 'grass');
    g.step(120, 'primary');
    expect(g.log.filter((l) => l === 'grassSeed')).toHaveLength(1);
  });
});
