import { describe, expect, it } from 'vitest';
import type { BlockId, DigFarmPort, ItemId, LockStatus, PlayerState } from '../contracts';
import { M7_SETTING_DEFAULTS } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

function rig(held: ItemId | null, target: BlockId | null, opts: { above?: BlockId; hp?: number; ripe?: boolean } = {}) {
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: () => false,
  };
  if (target) blocks.set(key(5, 10, 6), target);
  if (opts.above) blocks.set(key(5, 11, 6), opts.above);
  const player: PlayerState = { position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 3 });
  inv.select(0);
  const log: string[] = [];
  let hp = opts.hp ?? 10;
  const farm: DigFarmPort = {
    crop: () => (target?.startsWith('crop') || target?.startsWith('wild') ? ({ kind: 'tomato', stage: opts.ripe ? 3 : 1, stageTicks: 0, wet: false, lit: true, ripe: !!opts.ripe }) : null),
    soil: () => null,
    settings: () => M7_SETTING_DEFAULTS,
    till: (x, y, z) => (log.push('till'), world.setBlock(x, y, z, 'farmland')),
    noteTillPress: (_x, _y, _z, n) => void log.push(`press${n}`),
    plant: () => (log.push('plant'), true),
    harvest: () => (opts.ripe ? (log.push('harvest'), world.setBlock(5, 10, 6, 'air'), { ok: true, kind: 'tomato', wild: false, wet: false, items: [{ item: 'tomato', count: 2 }, { item: 'seed_tomato', count: 1 }] }) : (log.push('notRipe'), { ok: false, reason: 'notRipe' })),
    onBlockBroken: () => [],
    grassSeed: () => 'seed_pumpkin',
    eatHeal: () => 2,
    noteEat: (i, h) => void log.push(`eat ${i} ${h}`),
    noteHint: (h) => void log.push(`hint ${h}`),
  };
  const vitals = { hp: () => hp, maxHp: () => 20, heal: (n: number) => { const g = Math.min(n, 20 - hp); hp += g; return g; } };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, { farm, vitals });
  const step = (n = 1, btn?: 'primary' | 'secondary') => {
    for (let i = 0; i < n; i++) {
      if (btn && i === 0) actions.press(btn);
      dig.update();
      actions.endFrame();
    }
    if (btn) {
      actions.release(btn);
      actions.endFrame();
    }
  };
  const tap = (btn: 'primary' | 'secondary') => {
    actions.press(btn);
    dig.update();
    actions.release(btn);
    actions.endFrame();
  };
  return { dig, inv, world, log, actions, tap, step, hp: () => hp };
}

describe('M7 DigSystem 押しっぱなしの たがやし', () => {
  const hold = (r: ReturnType<typeof rig>, n: number) => {
    for (let i = 0; i < n; i++) {
      r.dig.update();
      r.actions.endFrame();
    }
  };
  it('たねを使い切ったあとも 押しつづけても 素手で たがやさない', () => {
    const r = rig('seed_tomato', 'grass');
    r.actions.press('secondary');
    hold(r, 5); // たねを持っている間（ヒントだけ）
    r.inv.setSlot(0, null); // たねを使い切った
    hold(r, 200);
    expect(r.log).not.toContain('till');
    expect(r.log.some((l) => l.startsWith('press'))).toBe(false);
  });
  it('最初から素手で 押しっぱなしなら 今まで通り たがやせる', () => {
    const r = rig(null, 'grass');
    r.actions.press('secondary');
    hold(r, 200);
    expect(r.log).toContain('till');
  });
});

describe('M7 DigSystem', () => {
  it('くわ で くさ を 1 回 → たがやす', () => {
    const r = rig('kuwa', 'grass');
    r.tap('secondary');
    expect(r.log).toEqual(['till']);
    expect(r.world.getBlock(5, 10, 6)).toBe('farmland');
  });
  it('すで は 3 回。つち ブロックを持つと 置く', () => {
    const r = rig(null, 'dirt');
    r.tap('secondary');
    r.tap('secondary');
    expect(r.log).toEqual(['press1', 'press2']);
    r.tap('secondary');
    expect(r.log.at(-1)).toBe('till');
    const d = rig('dirt', 'grass');
    d.tap('secondary');
    expect(d.log).toEqual([]);
  });
  it('上が くうき でない つち は たがやさない', () => {
    const r = rig('kuwa', 'dirt', { above: 'stone' });
    r.tap('secondary');
    expect(r.log).toEqual([]);
  });
  it('たね: はたけ に まく・たねが へる。くさ は 合図', () => {
    const r = rig('seed_tomato', 'farmland');
    r.tap('secondary');
    expect(r.log).toEqual(['plant']);
    expect(r.inv.held()!.count).toBe(2);
    const g = rig('seed_tomato', 'grass');
    g.tap('secondary');
    expect(g.log).toEqual(['hint till']);
  });
  it('たべる: 体力 +2、まんたんは 合図、押しっぱなしは 1 こ', () => {
    const r = rig('tomato', null);
    r.step(120, 'secondary');
    expect(r.hp()).toBe(12);
    expect(r.inv.held()!.count).toBe(2);
    const f = rig('tomato', null, { hp: 20 });
    f.tap('secondary');
    expect(f.log).toEqual(['hint full']);
    expect(f.inv.held()!.count).toBe(3);
  });
  it('しゅうかく: みのった作物は 1 押しで 入る。まだ は こわれず 1 回だけ ゆれる', () => {
    const r = rig('katana', 'crop_tomato', { ripe: true });
    r.tap('primary');
    expect(r.log).toEqual(['harvest']);
    expect(r.inv.count('tomato')).toBe(2);
    expect(r.inv.count('seed_tomato')).toBe(1);
    expect(r.dig.state().progress).toBe(0);
    const n = rig(null, 'crop_tomato');
    n.step(600, 'primary');
    expect(n.log).toEqual(['notRipe']);
    expect(n.world.getBlock(5, 10, 6)).toBe('crop_tomato');
  });
  it('はたけ は つち 1、さく は き 1、くさ は たね', () => {
    const f = rig(null, 'farmland');
    f.step(40, 'primary');
    f.step(1);
    f.tap('primary');
    expect(f.inv.count('dirt')).toBe(1);
    const g = rig(null, 'grass');
    g.step(40, 'primary');
    g.step(1);
    g.tap('primary');
    expect(g.inv.count('seed_pumpkin')).toBe(1);
  });
});
