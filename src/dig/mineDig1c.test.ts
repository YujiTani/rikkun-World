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

/**
 * MINE-1C（docs/design/MINE-1.md §4.4・§5・受け入れ基準 C3〔わくは ほれる・き 1〕・C8〔宝箱は ほっても こわれない〕）: 坑道の わくと 宝箱を ほる。
 *
 *   こうどうの わく〔`kodo_waku`〕: ほれる〔すでで 固さ 5 ÷ 1〕・ほると 持ち物に き〔`log`〕1〔わくは 持てない ので き に なる〕。
 *   宝箱〔`takarabako_1`〕: ほっても こわれない〔ひびが 入らない・ブロックは のこる・何も 出ない〕。てつの つるはしでも 同じ。
 *   本番と 同じ 部品〔DigSystemImpl〕を 使う〔mineDig.test.ts と 同じ つなぎ〕。時間では 決めず、十分な ステップを 進めて 結果を 見る。
 */

const TOOLS = createToolConfig();
const DIG = createDigConfig();
const EYE = 1.62;
const FLOOR = 10;
const B = (id: string): BlockId => id as BlockId;

function rig(held: ItemId | null) {
  const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  world.fill(0, 0, 0, 47, FLOOR - 1, 47, 'stone');
  const player: PlayerState = {
    position: { x: 24.5, y: FLOOR, z: 24.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
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
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => EYE, createDigConfig(), createRng(1), null, { tools, craft: craft as never });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  tick(2);
  /** 目から 点を 見る */
  const look = (px: number, py: number, pz: number): void => {
    const p = player.position;
    player.yawDeg = (Math.atan2(px - p.x, -(pz - p.z)) * 180) / Math.PI;
    player.pitchDeg = (Math.atan2(py - (p.y + EYE), Math.hypot(px - p.x, pz - p.z)) * 180) / Math.PI;
    tick(2);
  };
  return { world, inv, actions, dig, tick, look };
}

/** 押して ひびを MAX に して、はなして 押しなおして こわす */
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

describe('C3: こうどうの わく は ほれる〔き 1〕', () => {
  it('すでで ほる → ブロックが 消えて、持ち物に き〔log〕1。わくは 持ち物に 入らない', () => {
    const r = rig(null);
    expect(r.world.setBlock(26, FLOOR, 24, B('kodo_waku')), 'わくを 置ける').toBe(true);
    r.tick(2);
    r.look(26.5, FLOOR + 0.5, 24.5);
    expect(r.dig.target(), 'ねらいが わくに 乗った').toMatchObject({ id: 'kodo_waku', block: { x: 26, y: FLOOR, z: 24 } });
    digOut(r);
    expect(r.world.getBlock(26, FLOOR, 24)).toBe('air');
    expect(bag(r.inv)).toEqual({ log: 1 });
  });
});

describe('C8: 宝箱は ほっても こわれない', () => {
  it.each([null, 'iron_pickaxe'] as const)('%s で 長おし → ひびが 入らず、ブロックは のこり、何も 出ない', (tool) => {
    const r = rig(tool as ItemId | null);
    expect(r.world.setBlock(26, FLOOR, 24, B('takarabako_1'))).toBe(true);
    r.tick(2);
    r.look(26.5, FLOOR + 0.5, 24.5);
    r.actions.press('primary');
    r.tick(600);
    const st = r.dig.state();
    r.actions.release('primary');
    r.tick(30);
    expect(st.progress, 'ひびが 入らない').toBe(0);
    expect(r.world.getBlock(26, FLOOR, 24), 'のこる').toBe('takarabako_1');
    expect(bag(r.inv), '何も 出ない').toEqual(tool ? { iron_pickaxe: 1 } : {});
  });
});
