import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemId, LockStatus, PlayerState } from '../contracts';
import { createM7Settings } from '../contracts';
import { itemDef } from '../content/items/registry';
import { createFarmSystem } from '../farm/FarmSystem';
import { Pet } from '../farm/pet';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import * as PickupLog from '../ui/pickupLogModel';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * MINE-1E（docs/design/MINE-1E.md §3.1・§4.9・§5・受け入れ基準 E13）: かびた パン〔`kabita_pan`〕を たべる。
 *
 *   ・体力が 上限の 2 下で 右クリック → 上限に なる〔回復は 登録表の `food.heal` から 読む〕・1 こ へる・出来事 `eat`
 *   ・体力が 上限〔いっぱい〕では たべず へらない
 *   ・ログ: `eatLogLine(item)`〔`src/ui/pickupLogModel.ts`。かびた パンなら「うぇ〜 かびてる…」・ほかは null〕
 *   農業は 本物の `createFarmSystem` を `DigSystemImpl` の 口に わたす〔たべる 道は 本番と 同じ〕。ハート〔vitals〕だけ 仮。
 */

const ID = 'kabita_pan' as ItemId;
const MAX = 20;
const FLOOR = 9;

function rig(hp: number, count = 3) {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, FLOOR - 1, 31, 'stone');
  const settings = createM7Settings();
  const state = { tick: 0 };
  const pet = new Pet({ settings, dayLength: () => 91800 });
  const farm = createFarmSystem({
    world,
    light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
    seed: 1,
    dayLength: () => 91800,
    settings,
    tick: () => state.tick,
    fillTansu: () => undefined,
    placement: () => ({ wild: [], oldFarm: null }),
    pet,
  });
  const player: PlayerState = { position: { x: 10.5, y: FLOOR, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  inv.setSlot(0, { item: ID, count });
  inv.select(0);
  let now = hp;
  const vitals = {
    hp: () => now,
    maxHp: () => MAX,
    heal: (n: number) => {
      const g = Math.min(n, MAX - now);
      now += g;
      return g;
    },
  };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), createRng(1), null, { farm, pet, vitals, emitFarm: (e) => farm.emit(e), nowTick: () => state.tick });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  tick(2);
  const eat = (): void => {
    actions.press('secondary');
    dig.update();
    actions.release('secondary');
    actions.endFrame();
    tick(3);
  };
  const events = (): FarmEvent[] => farm.drainEvents();
  return { dig, inv, eat, hp: () => now, events };
}

const heal = (): number => itemDef(ID)?.food?.heal ?? -1;

describe('E13: かびた パンを たべる', () => {
  it('右クリックの ねらいが「たべる」になる', () => {
    const r = rig(MAX - 2);
    expect(r.dig.previewRightClick()).toEqual({ kind: 'eat', item: ID });
  });

  it('体力の 上限の 2 下で たべると 上限に なる・1 こ へる・出来事 eat〔回復は 登録表の food.heal〕', () => {
    expect(heal(), '登録表の food.heal').toBeGreaterThanOrEqual(2);
    const r = rig(MAX - 2);
    r.eat();
    expect(r.hp(), '上限に なる').toBe(MAX);
    expect(r.inv.held()?.count, '1 こ へる').toBe(2);
    expect(r.events().filter((e) => e.type === 'eat')).toMatchObject([{ type: 'eat', item: ID }]);
  });

  it('もどる 量は 登録表の food.heal〔上限より 十分 下で たべる〕', () => {
    const r = rig(MAX - 8);
    r.eat();
    expect(r.hp()).toBe(MAX - 8 + heal());
    expect(r.inv.held()?.count).toBe(2);
  });

  it('体力が 上限〔いっぱい〕では たべず へらない・eat の 出来事も 出ない', () => {
    const r = rig(MAX);
    r.eat();
    expect(r.hp()).toBe(MAX);
    expect(r.inv.held()?.count, 'へらない').toBe(3);
    expect(r.events().filter((e) => e.type === 'eat')).toEqual([]);
  });

  it('最後の 1 こを たべると 手が からに なる', () => {
    const r = rig(MAX - 4, 1);
    r.eat();
    expect(r.inv.held()).toBeNull();
    expect(r.hp()).toBe(MAX - 4 + heal());
  });
});

describe('E13: ログ「うぇ〜 かびてる…」', () => {
  const eatLogLine = (PickupLog as unknown as { eatLogLine?: (item: ItemId) => string | null }).eatLogLine;

  it('`eatLogLine` が ある', () => {
    expect(eatLogLine, '`eatLogLine`〔src/ui/pickupLogModel.ts〕が まだ ない').toBeTypeOf('function');
  });

  it('かびた パンは「うぇ〜 かびてる…」・ほかの たべものは null〔いつもの ログのまま〕', () => {
    expect(eatLogLine!(ID)).toBe('うぇ〜 かびてる…');
    for (const other of ['egg', 'momo_yaki', 'tomato', 'onion'] as const) expect(eatLogLine!(other as ItemId), other).toBeNull();
  });
});
