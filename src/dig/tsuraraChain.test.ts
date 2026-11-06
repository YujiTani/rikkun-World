import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, ToolInfo } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createToolConfig } from '../tools/config';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';

/** MINE-1D: 下に 2 本 つづく つららも、上の ブロックを こわすと 2 本とも 消えて せっかいせき 2（digBreak の dropHangingTsurara） */
const B = (id: string): BlockId => id as BlockId;
const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };

// ------------------------------------------------------------------ ほる

const TOOLS = createToolConfig();
const DIG = createDigConfig();
const EYE = 1.62;
const FLOOR = 10;

function rig(held: ItemId | null) {
  const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  world.fill(0, 0, 0, 47, FLOOR - 1, 47, 'stone');
  const player: PlayerState = {
    position: { x: 24.5, y: FLOOR, z: 24.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  if (held) inv.setSlot(0, { item: held, count: 1 });
  inv.select(0);
  const tools: DigToolPort = {
    current: (): ToolInfo => {
      const item = inv.held()?.item ?? null;
      return {
        item, kind: item && item.endsWith('_pickaxe') ? 'pickaxe' : 'hand',
        power: (item && TOOLS.toolPower[item]) || DIG.handPower,
        level: item && TOOLS.toolLevel[item] !== undefined ? TOOLS.toolLevel[item]! : DIG.handLevel,
        damage: 1, reach: 3.5, ticks: 30,
      };
    },
    step: () => undefined,
    pushSwing: () => undefined,
    swingWhiff: () => undefined,
  };
  const craft = { isFurnace: () => false, openFurnace: () => undefined, furnaceBroken: () => undefined, fixedDrop: () => null };
  const system = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => EYE, createDigConfig(), createRng(1), null, { tools, craft: craft as never });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      system.update();
      actions.endFrame();
    }
  };
  tick(2);
  const lookAt = (px: number, py: number, pz: number): void => {
    const p = player.position;
    player.yawDeg = (Math.atan2(px - p.x, -(pz - p.z)) * 180) / Math.PI;
    player.pitchDeg = (Math.atan2(py - (p.y + EYE), Math.hypot(px - p.x, pz - p.z)) * 180) / Math.PI;
    tick(2);
  };
  return { world, inv, actions, dig: system, tick, look: lookAt };
}

function digOut(r: ReturnType<typeof rig>, steps = 900): void {
  r.actions.press('primary');
  for (let i = 0; i < steps && !r.dig.state().ready; i++) r.tick();
  r.actions.release('primary');
  r.tick();
  r.actions.press('primary');
  r.tick(2);
  r.actions.release('primary');
  r.tick(30);
}

const bag = (inv: InventoryImpl): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of inv.slots()) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
  return out;
};

describe('つららが 2 本 つづく とき', () => {
  it('天井の 石を ほる → 下の つらら 2 本とも 消えて せっかいせき 2', () => {
    const r = rig('iron_pickaxe' as ItemId);
    expect(r.world.setBlock(26, FLOOR + 3, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR + 2, 24, B('stone'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR + 1, 24, B('tsurara'))).toBe(true);
    expect(r.world.setBlock(26, FLOOR, 24, B('tsurara'))).toBe(true);
    r.tick(2);
    r.look(26.5, FLOOR + 2.5, 24.5);
    digOut(r);
    expect(r.world.getBlock(26, FLOOR + 2, 24)).toBe('air');
    expect(r.world.getBlock(26, FLOOR + 1, 24)).toBe('air');
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('air');
    expect(bag(r.inv)['sekkaiseki']).toBe(2);
  });
});
