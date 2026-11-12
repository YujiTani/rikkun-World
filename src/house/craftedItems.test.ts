import { describe, expect, it } from 'vitest';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import type { SpawnPoint, YokaiWorld } from '../contracts';
import { craftRig } from './recipes/craftKit';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerController } from '../player/PlayerController';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { furnCells } from '../world/blocks/houseBlocks';
import { createHouseHook } from './hook';
import { makeFakeWorld } from './fakeWorld';
import { HouseSystem } from './system';
import { NOD_STEPS } from './architect';
import { SeatSystem } from './seat';
import type { Vec3 } from '../contracts';

/** HOUSE-2C の 回帰: 「つくる」で 作った 家の 物が、エディター・座る・家の 名前の 帯を こわさない（仕様 3.4 版 §2.6） */

describe('つくった いすに 座れる', () => {
  it('「つくる」で いすを 作る → 置く（placeBlock）→ 右クリックで 座れる', () => {
    const r = craftRig([]);
    r.inv.add('log' as never, 99);
    expect(r.craft.make('chair').ok).toBe(true);
    expect(r.inv.count('chair' as never)).toBeGreaterThan(0);

    const FEET = 5;
    const start: SpawnPoint = { x: 6.5, y: FEET, z: 6.5, yawDeg: 0, pitchDeg: 0 };
    const world = new ArrayVoxelWorld({ x: 24, y: 16, z: 24 });
    world.fill(0, 0, 0, 23, 4, 23, 'stone');
    const actions = new ActionState();
    const lock = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
    const controller = new PlayerController(world, actions, { consume: () => ({ dx: 0, dy: 0 }) }, lock, () => start);
    const none: YokaiWorld = { list: () => [], raycast: () => null, damage: () => {}, occupies: () => false, drainEvents: () => [] };
    const combat = new PlayerCombatImpl({
      world,
      player: { get: () => controller.state, set: () => {} },
      inventory: new InventoryImpl(),
      yokai: () => none,
      spawn: () => start,
    });
    const seat = new SeatSystem({ world, controller, actions, combat });
    const [cell] = furnCells('chair', 0, 12, 12);
    world.setBlock(cell!.x, FEET, cell!.z, cell!.id);
    expect(seat.use(cell!.x, FEET, cell!.z)).toBe(true);
    expect(seat.seat()?.kind).toBe('sit');
  });
});

describe('つくった 物は エディターの need() を かえない', () => {
  it('持ち物に つくった 家の 物が 入っても 「ひつよう」の 行の need は 同じ', () => {
    const bag = new InventoryImpl();
    const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };
    const sys = new HouseSystem({
      seed: 77,
      world: makeFakeWorld(),
      spawn: () => SPAWN,
      player: () => ({ x: SPAWN.x, y: 11, z: SPAWN.z }),
      bag,
      voice: () => undefined,
      gave: () => undefined,
      onOpen: () => undefined,
      onClose: () => undefined,
      isLand: () => true,
    });
    sys.state.record.toolsGiven = true;
    sys.state.record.fudeGiven = true;
    sys.update();
    sys.talkTo(sys.architects()[0]!.id);
    for (let i = 0; i < NOD_STEPS; i++) sys.update();
    const hook = createHouseHook(sys);
    bag.add('paper', 2);
    bag.add('fude', 1);
    sys.press('editor');
    for (const op of [{ op: 'place', kind: 'futon', x: 0, z: 0 }, { op: 'place', kind: 'chair', x: 4, z: 0 }]) expect(hook.edit(op)).toBe(true);
    sys.press('next');
    sys.press('next');
    for (const ch of 'もも') expect(hook.edit({ op: 'char', ch })).toBe(true);
    sys.press('done');
    const slot = hook.blueprints().at(-1)!.slot;
    const needs = (): Array<[string, number]> => hook.need(slot).map((x) => [x.item, x.need]);
    const before = needs();
    expect(before.length).toBeGreaterThan(0);
    for (const item of ['house_wall', 'house_floor', 'house_roof', 'shoji', 'house_door', 'chair', 'table']) bag.add(item as never, 5);
    expect(needs()).toEqual(before);
  });
});

describe('つくった 戸を 通っても 家の 名前の 帯は 出ない', () => {
  it('手で 置いた 戸（house_door）は 家の 記録に ないので 通っても 帯は 0 回', () => {
    const bands: string[] = [];
    const p: Vec3 = { x: 64.5, y: 11, z: 64.5 };
    const world = makeFakeWorld({ height: () => 9 });
    const sys = new HouseSystem({
      seed: 77,
      world,
      spawn: () => ({ x: 64.5, z: 64.5, yawDeg: 0 }),
      player: () => p,
      bag: new InventoryImpl(),
      voice: () => {},
      gave: () => {},
      onOpen: () => {},
      onClose: () => {},
      isLand: () => true,
      nameBand: (t: string) => bands.push(t),
    });
    world.setBlock(64, 10, 64, 'house_door' as never);
    world.setBlock(64, 11, 64, 'house_door_top' as never);
    for (const dz of [2, 1, 0, -1, -2]) {
      p.z = 64.5 + dz;
      sys.update();
    }
    expect(bands).toEqual([]);
  });
});
