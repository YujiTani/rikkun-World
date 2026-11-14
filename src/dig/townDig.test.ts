import { afterEach, describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, ToolInfo } from '../contracts';
import { createCraftConfig } from '../craft/config';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { bindTownRepairs, townDigPort } from '../game/wire/townRepair';
import { activateTown, deactivateTown } from '../town/townState';
import { TownRepairs } from '../town/townRepairs';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';
import type { DigToolPort } from './digPorts';

/**
 * TOWN-1 1.4 AC9（プレイヤーの ほり）: 記録にも ふちにも ない 街の ブロックは 600 ステップ ほっても ひびなし・0 こ へる。
 * 記録の マス・ふちは ほれて アイテムに ならない（ふちは プレイヤーの 印つきで 記録に 入る）。置く 口も 同じ きまり。
 */

const CRAFT = createCraftConfig();
const DIG = createDigConfig();
const TARGET = { x: 5, y: 10, z: 6 };
/** 街の 西北の すみ（0, 0）・門が 南向き: (5, 6) は あきちでも 用水路でも ない ふつうの 街の マス */
const REC = { v: 12, x0: 0, z0: 0, facing: 's', groundY: 9 } as never;

afterEach(() => {
  deactivateTown();
  bindTownRepairs(null);
});

function rig(who: 1 | 2 = 1) {
  deactivateTown();
  activateTown(1, REC, null);
  const blocks = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const world = {
    size: { x: 64, y: 32, z: 64 },
    getBlock: (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64 ? 'outside' : (blocks.get(key(x, y, z)) ?? 'air')),
    setBlock: (x: number, y: number, z: number, id: BlockId) => (blocks.set(key(x, y, z), id), true),
    isSolid: (x: number, y: number, z: number) => {
      const b = blocks.get(key(x, y, z));
      return !!b && b !== 'air' && b !== 'water';
    },
    isLoaded: () => true,
  };
  blocks.set(key(TARGET.x, TARGET.y, TARGET.z), 'dirt');
  const reps = new TownRepairs({
    world: { getBlock: world.getBlock, setBlock: (x, y, z, id) => world.setBlock(x, y, z, id as BlockId), isLoaded: () => true, isSolid: world.isSolid },
    plan: () => 'air',
    keeps: () => false,
    inTown: (x, z) => x >= 0 && z >= 0 && x < 100 && z < 100,
    day: () => 3,
    players: () => [],
    overlaps: () => false,
    movePlayer: () => undefined,
    occupied: () => false,
    evict: () => undefined,
    giveBack: () => undefined,
    fallback: () => ({ x: 0, y: 0, z: 0 }),
  });
  bindTownRepairs(reps);
  const player: PlayerState = { position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  inv.select(0);
  const tools: DigToolPort = {
    current: (): ToolInfo => ({ item: null, kind: 'hand', power: DIG.handPower, level: DIG.handLevel, damage: 1, reach: 3.5, ticks: 30 }),
    step: () => undefined,
    pushSwing: () => undefined,
    swingWhiff: () => undefined,
  };
  const craft = { isFurnace: () => false, openFurnace: () => undefined, furnaceBroken: () => undefined, fixedDrop: (id: BlockId) => CRAFT.fixedDrop[id] ?? null };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), createRng(1), null, { tools, craft: craft as never, town: townDigPort(who) } as never);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  step(2);
  const at = () => world.getBlock(TARGET.x, TARGET.y, TARGET.z);
  const items = (): number => inv.slots().reduce((n, s) => n + (s?.count ?? 0), 0);
  /** 600 ステップ ほりつづける。ひびが 進んだ か・こわれた か */
  const dig600 = (): { cracked: boolean; broken: boolean } => {
    let cracked = false;
    actions.press('primary');
    for (let i = 0; i < 600; i++) {
      step();
      if (dig.state().progress > 0) cracked = true;
      if (dig.state().ready) {
        actions.release('primary');
        step();
        actions.press('primary');
        step(2);
      }
      if (at() === 'air') break;
    }
    actions.release('primary');
    return { cracked, broken: at() === 'air' };
  };
  return { reps, dig, world, blocks, key, step, at, items, dig600, inv, actions };
}

describe('AC9 プレイヤーの ほり（1.4）', () => {
  it('記録にも ふちにも ない 街の ブロックは 600 ステップ ほっても ひびなし・0 こ・ほれない（置けない）', () => {
    const r = rig();
    const out = r.dig600();
    expect(out.cracked, 'ひびが 入らない').toBe(false);
    expect(out.broken).toBe(false);
    expect(r.items()).toBe(0);
    expect(r.dig.state().blockedReason).toBe('unbreakable');
    expect(townDigPort(1).placeLocked!(TARGET.x, TARGET.y + 1, TARGET.z), '置けない').toBe(true);
  });

  it('外の 1 マス 先は ふつうに ほれる', () => {
    const r = rig();
    expect(r.at()).toBe('dirt');
    expect(townDigPort(1).locked(99, TARGET.y, TARGET.z), '街の いちばん 東の 列').toBe(true);
    expect(townDigPort(1).locked(100, TARGET.y, TARGET.z), '1 マス 先（街の 外）').toBe(false);
    expect(townDigPort(1).placeLocked!(100, TARGET.y, TARGET.z)).toBe(false);
  });

  it('妖怪が かえた 記録の マスは ほれて アイテムに ならない・記録には のこる', () => {
    const r = rig();
    r.reps.note(TARGET.x, TARGET.y, TARGET.z);
    const out = r.dig600();
    expect(out.broken, 'ほれた').toBe(true);
    expect(r.items(), 'アイテムに ならない').toBe(0);
    expect(r.reps.repairs().cells, '記録には のこる').toEqual([{ x: TARGET.x, y: TARGET.y, z: TARGET.z, day: 3 }]);
  });

  it('ふち（記録の マスと 面で となりあう）は 1 マス ほれて アイテムに ならない・プレイヤーの 印つきで 記録に 入る', () => {
    const r = rig();
    r.reps.note(TARGET.x + 1, TARGET.y, TARGET.z); // となりの マスが こわれて いる
    const out = r.dig600();
    expect(out.broken).toBe(true);
    expect(r.items()).toBe(0);
    const cell = r.reps.repairs().cells.find((c) => c.x === TARGET.x && c.y === TARGET.y && c.z === TARGET.z);
    expect(cell, '記録に 入った').toEqual({ x: TARGET.x, y: TARGET.y, z: TARGET.z, day: 3, byPlayer: true });
    expect(townDigPort(1).locked(TARGET.x - 1, TARGET.y, TARGET.z), '印の マスの となりは ふちに ならない').toBe(true);
  });

  it('自分で 置いた 物は もどる 前に ほれば ふつうに もちものへ', () => {
    const r = rig();
    r.reps.note(TARGET.x, TARGET.y, TARGET.z);
    townDigPort(2).placed!(TARGET.x, TARGET.y, TARGET.z, 'dirt' as ItemId);
    expect(r.reps.repairs().cells[0]!.placed).toEqual({ item: 'dirt', p: 2 });
    const out = r.dig600();
    expect(out.broken).toBe(true);
    expect(r.items(), 'ふつうの ドロップ').toBeGreaterThan(0);
    expect(r.reps.repairs().cells[0]!.placed).toBeUndefined();
  });

  for (const who of [1, 2] as const) {
    it(`(b1) ${who}P: 記録の マスに つちを 置くと 置いた 物と 人が 記録に 入る・記録の ない マスには 置けない`, () => {
      const r = rig(who);
      r.inv.setSlot(0, { item: 'dirt' as ItemId, count: 3 });
      const put = { x: TARGET.x - 1, y: TARGET.y, z: TARGET.z }; // ねらった ブロックの 手前（体と 重ならない）
      // 記録の ない マス: 置けない
      r.actions.press('secondary');
      r.step(3);
      r.actions.release('secondary');
      r.step(3);
      expect(r.world.getBlock(put.x, put.y, put.z), '記録の ない 街の マスには 置けない').toBe('air');
      expect(r.inv.count('dirt' as ItemId)).toBe(3);
      // 記録の マス: 置ける
      r.reps.note(put.x, put.y, put.z);
      r.actions.press('secondary');
      r.step(3);
      r.actions.release('secondary');
      r.step(3);
      expect(r.world.getBlock(put.x, put.y, put.z)).toBe('dirt');
      expect(r.inv.count('dirt' as ItemId), 'つちが 1 こ へる').toBe(2);
      expect(r.reps.repairs().cells.find((c) => c.x === put.x && c.y === put.y && c.z === put.z)!.placed).toEqual({ item: 'dirt', p: who });
    });
  }
});
