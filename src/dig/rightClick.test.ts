import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { actionHintLines } from '../ui/actionHintModel';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

const ARMOR = new Set(['kabuto', 'yoroi', 'kote', 'suneate']);

function rig(held: ItemId | null, target: BlockId | null, opts: { body?: boolean } = {}) {
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
  if (target) blocks.set(key(5, 10, 6), target);
  const player: PlayerState = {
    position: opts.body ? { x: 4.5, y: 9, z: 6.5 } : { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 2 });
  inv.select(0);
  const opened: string[] = [];
  const equipped: ItemId[] = [];
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), () => 0, null, {
    craft: {
      isFurnace: (x, y, z) => world.getBlock(x, y, z) === 'furnace',
      openFurnace: (x, y, z) => opened.push(`furnace ${x},${y},${z}`),
      furnaceBroken: () => {},
      fixedDrop: () => null,
    },
    armor: { canEquip: (i) => ARMOR.has(i), tryEquip: (i) => (ARMOR.has(i) ? (equipped.push(i), inv.consumeHeld(), true) : false) },
    storage: {
      isTansu: (x, y, z) => world.getBlock(x, y, z) === 'tansu',
      open: (x, y, z) => (opened.push(`tansu ${x},${y},${z}`), true),
      placed: () => {},
      broken: () => 0,
    },
  });
  dig.update();
  actions.endFrame();
  return { dig, actions, inv, world, opened, equipped };
}

/** 右クリックを 1 回押して、実際に起きたことを 'storage' 'furnace' 'armor' 'place' 'none' で返す */
function actual(r: ReturnType<typeof rig>): string {
  const before = r.inv.held()?.count ?? 0;
  r.actions.press('secondary');
  r.dig.update();
  r.actions.release('secondary');
  r.actions.endFrame();
  if (r.opened.some((s) => s.startsWith('tansu'))) return 'storage';
  if (r.opened.some((s) => s.startsWith('furnace'))) return 'furnace';
  if (r.equipped.length > 0) return 'armor';
  if ((r.inv.held()?.count ?? 0) < before) return 'place';
  return 'none';
}

describe('previewRightClick と 実際の右クリックが同じ', () => {
  const helds: (ItemId | null)[] = [null, 'dirt', 'torch', 'tansu', 'furnace', 'kabuto', 'yoroi', 'katana', 'yumi', 'ya'];
  const targets: (BlockId | null)[] = [null, 'stone', 'tansu', 'furnace', 'water'];
  for (const held of helds)
    for (const target of targets)
      for (const body of [false, true])
        it(`${held ?? 'て'} × ${target ?? 'なし'}${body ? '（体が重なる）' : ''}`, () => {
          const probe = rig(held, target, { body });
          const pv = probe.dig.previewRightClick();
          const real = rig(held, target, { body });
          expect(actual(real)).toBe(pv?.kind ?? 'none');
        });
});

describe('出る絵と語', () => {
  const lines = (held: ItemId | null, target: BlockId | null) => {
    const r = rig(held, target);
    return actionHintLines(r.dig.previewRightClick(), r.dig.previewLeftClick(), {
      held,
      heldIsPickaxe: held === 'wood_pickaxe',
      heldIsBlade: held === 'katana',
    });
  };
  it('右: たんす・かまど・防具・置く・なし', () => {
    expect(lines('dirt', 'tansu').right).toEqual({ icon: 'tansu', word: 'ひらく' });
    expect(lines('dirt', 'furnace').right).toEqual({ icon: 'furnace', word: 'ひらく' });
    expect(lines('kabuto', null).right).toEqual({ icon: 'kabuto', word: 'きる' });
    expect(lines('dirt', 'stone').right).toEqual({ icon: 'dirt', word: 'おく' });
    expect(lines('katana', 'stone').right).toBeUndefined();
    expect(lines('dirt', null).right).toBeUndefined();
  });
  it('左: ほる・うつ・なし', () => {
    expect(lines('wood_pickaxe', 'stone').left).toEqual({ icon: 'wood_pickaxe', word: 'ほる' });
    expect(lines(null, 'stone').left).toEqual({ icon: 'wood_pickaxe', word: 'ほる' });
    expect(lines(null, 'bedrock').left).toBeUndefined();
    expect(lines(null, null).left).toBeUndefined();
  });
  it('左: 妖怪が手前なら たたく', () => {
    const r = rig('katana', 'stone');
    const gate = { blocksInput: () => false, primaryStep: () => false, placeBlocked: () => false, aimedYokai: () => 7 };
    const d = new DigSystemImpl(r.world as never, () => ({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false }), new ActionState(), { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true }, r.inv, () => 1.62, createDigConfig(), () => 0, gate);
    d.update();
    expect(d.previewLeftClick()).toBe('hit');
    expect(actionHintLines(null, 'hit', { held: 'katana', heldIsPickaxe: false, heldIsBlade: true }).left).toEqual({ icon: 'katana', word: 'きる' });
  });
});
