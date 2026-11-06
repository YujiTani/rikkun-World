import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, TargetInfo } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import type { Ent } from '../yokai/ai/entity';
import { YokaiStone } from '../yokai/ai/stone';
import { chestBlockId, CHEST_RIGHT, type ChestTier } from '../world/blocks/chestBlock';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createRng } from '../world/gen/random';
import { createDigConfig } from './config';
import { BlockBreaker } from './digBreak';
import type { DigCore } from './digCore';
import { DigSystemImpl } from './DigSystem';

/**
 * MINE-1C コードレビュー B〔重大 1・4、軽微 13〕で 見つかった 穴の テスト〔直す 前に 赤〕。仕様 docs/design/MINE-1.md §4.4・§4.6・§5・C8。
 *
 *   ・RB1a: ぬりかべの たおれこみ〔YokaiStone.crush〕で 宝箱〔段 4 つ × あいた／あいてない × 2 マス〕が こわれない
 *   ・RB1b: こわす 処理〔BlockBreaker.breakBlock〕を 直接 よんで 1 マスを こわすと 2 マス とも 消える・何も 持ち物に 入らない〔こたつと 同じ〕
 *   ・RB4: あいた 宝箱を 右クリック → 宝箱の 窓口〔chestPort.open〕に 伝わる〔ログ「からっぽ だよ」は 窓口が 出す〕。手の ブロックは 置かれない
 *   ・RB13: 相手の いない 1 マスの 宝箱を 右クリックしても 落ちない・何も 置かれない・持ち物は ふえない
 *   ブロックの 向きは 北向き〔本体の 左どなりが のこりの マス＝ CHEST_RIGHT.n〕。
 */

const TIERS: readonly ChestTier[] = [1, 2, 3, 4];
const [RX, RZ] = CHEST_RIGHT.n;

/** 北向きの 宝箱 2 マスを 置く。本体 (x, z)・のこり 本体 + 右 */
function putChest(w: ArrayVoxelWorld, x: number, y: number, z: number, tier: ChestTier, open: boolean): { main: BlockId; rest: BlockId; restX: number; restZ: number } {
  const main = chestBlockId(tier, open, false) as BlockId;
  const rest = chestBlockId(tier, open, true) as BlockId;
  expect(w.setBlock(x, y, z, main)).toBe(true);
  expect(w.setBlock(x - RX, y, z - RZ, rest)).toBe(true);
  return { main, rest, restX: x - RX, restZ: z - RZ };
}

describe('RB1a〔重大 1〕: ぬりかべの たおれこみは 宝箱を こわさない', () => {
  it.each(TIERS.flatMap((t) => [false, true].map((o) => [t, o] as const)))('段 %i・あいた %s: 2 マス とも のこる〔土は こわれる〕', (tier, open) => {
    const w = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    const y = 10;
    const chests: { main: BlockId; rest: BlockId; x: number; z: number; restX: number; restZ: number; y: number }[] = [];
    for (let x = 28; x <= 36; x++) for (let z = 28; z <= 36; z++) w.setBlock(x, y - 1, z, 'dirt');
    // 体の まわり: 下の 段〔y - 1〕と 同じ 高さ〔y〕の 両方に 宝箱を ならべる
    for (const yy of [y - 1, y]) {
      for (let z = 29; z <= 35; z += 2) {
        const x = yy === y ? 30 : 33;
        const c = putChest(w, x, yy, z, tier, open);
        chests.push({ ...c, x, z, y: yy });
      }
    }
    const crushed: { from: string }[] = [];
    const stone = new YokaiStone({ world: w, reward: { defeat: () => {} }, opts: { onBlocks: (cells) => crushed.push(...cells) } });
    stone.crush({ x: 32.5, y, z: 32.5, yaw: 0 } as unknown as Ent);
    expect(crushed.length, '土は こわれる〔たおれこみは 動いて いる〕').toBeGreaterThan(0);
    expect(crushed.some((c) => c.from.startsWith('takarabako')), '宝箱は こわれない').toBe(false);
    for (const c of chests) {
      expect(w.getBlock(c.x, c.y, c.z), `(${c.x}, ${c.y}, ${c.z}) 本体`).toBe(c.main);
      expect(w.getBlock(c.restX, c.y, c.restZ), `(${c.restX}, ${c.y}, ${c.restZ}) のこり`).toBe(c.rest);
    }
  });
});

// ------------------------------------------------------------------ RB1b こわす 処理を 直接

function breakerRig() {
  const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  world.fill(0, 0, 0, 47, 9, 47, 'stone');
  const inventory = new InventoryImpl();
  const events: unknown[] = [];
  const core = {
    world,
    inventory,
    m4: {},
    config: createDigConfig(),
    lock: { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true } as LockStatus,
    gate: null,
    player: () => ({ position: { x: 24.5, y: 10, z: 24.5 } }) as PlayerState,
    tgt: () => null,
    bodyTgt: () => false,
    tick: () => 0,
    emit: (e: unknown) => void events.push(e),
  } as unknown as DigCore;
  return { world, inventory, events, breaker: new BlockBreaker(core, createRng(1)) };
}

describe('RB1b〔重大 1〕: こわす 処理を 直接 よんで 1 マスを こわすと 2 マス とも 消える', () => {
  it.each(TIERS.flatMap((t) => [false, true].flatMap((o) => [false, true].map((r) => [t, o, r] as const))))('段 %i・あいた %s・のこりの マスを こわす %s', (tier, open, viaRest) => {
    const { world, inventory, breaker } = breakerRig();
    const x = 24;
    const z = 24;
    const c = putChest(world, x, 10, z, tier, open);
    const hit = viaRest ? { x: c.restX, z: c.restZ, id: c.rest } : { x, z, id: c.main };
    const t: TargetInfo = { block: { x: hit.x, y: 10, z: hit.z }, id: hit.id, face: { x: 0, y: 1, z: 0 }, place: { x: hit.x, y: 11, z: hit.z }, distance: 2 };
    breaker.breakBlock(t, false);
    expect(world.getBlock(x, 10, z), '本体').toBe('air');
    expect(world.getBlock(c.restX, 10, c.restZ), 'のこりの マス').toBe('air');
    expect(inventory.slots().filter((s) => s !== null), '宝箱は 持ち物に 入らない').toEqual([]);
  });
});

// ------------------------------------------------------------------ RB4・RB13 右クリック

function clickRig() {
  const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
  world.fill(0, 0, 0, 47, 9, 47, 'stone');
  const player: PlayerState = {
    position: { x: 24.5, y: 10, z: 24.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0,
    onGround: true, inWater: false, moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const actions = new ActionState();
  const inv = new InventoryImpl();
  inv.setSlot(0, { item: 'dirt', count: 5 });
  inv.select(0);
  const tools = {
    current: () => ({ item: null, kind: 'hand', power: 1, level: 0, damage: 1, reach: 3.5, ticks: 30 }),
    step: () => undefined,
    pushSwing: () => undefined,
    swingWhiff: () => undefined,
  };
  const craft = { isFurnace: () => false, openFurnace: () => undefined, furnaceBroken: () => undefined, fixedDrop: () => null };
  const dig = new DigSystemImpl(world as never, () => player, actions, lock, inv, () => 1.62, createDigConfig(), createRng(1), null, { tools: tools as never, craft: craft as never });
  const opened: { x: number; y: number; z: number }[] = [];
  dig.chestPort = { open: (x, y, z) => void opened.push({ x, y, z }) };
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  tick(2);
  const look = (px: number, py: number, pz: number): void => {
    const p = player.position;
    player.yawDeg = (Math.atan2(px - p.x, -(pz - p.z)) * 180) / Math.PI;
    player.pitchDeg = (Math.atan2(py - (p.y + 1.62), Math.hypot(px - p.x, pz - p.z)) * 180) / Math.PI;
    tick(2);
  };
  const click = (): void => {
    actions.press('secondary');
    tick(2);
    actions.release('secondary');
    tick(3);
  };
  return { world, inv, dig, opened, look, click };
}

const bagOf = (inv: InventoryImpl): number => inv.slots().reduce((n, s) => n + (s && s.item !== 'dirt' ? s.count : 0), 0);

describe('RB4〔重大 4〕: あいた 宝箱を 右クリックすると 宝箱の 窓口に 伝わる〔ログ「からっぽ だよ」の もと〕', () => {
  it.each(TIERS)('段 %i: あいた 宝箱〔どちらの マスでも〕を 右クリック → chestPort.open が 1 回 よばれ、手の ブロックは 置かれない', (tier) => {
    for (const viaRest of [false, true]) {
      const r = clickRig();
      const c = putChest(r.world, 26, 10, 24, tier, true);
      const at = viaRest ? { x: c.restX, z: c.restZ } : { x: 26, z: 24 };
      r.look(at.x + 0.5, 10.99, at.z + 0.5); // 上の 面を ねらう〔横から だと 手前の マスに 当たる〕
      r.click();
      expect(r.opened, `${viaRest ? 'のこりの マス' : '本体'}を ねらって 右クリック`).toEqual([{ x: at.x, y: 10, z: at.z }]);
      expect(r.inv.slots()[0], '手の ブロックは へらない').toMatchObject({ item: 'dirt', count: 5 });
    }
  });
});

describe('RB4 の 対照', () => {
  it('まだ あいて いない 宝箱なら 同じ しかけで chestPort.open が よばれる〔ねらい・クリックの しかけが 正しい〕', () => {
    const r = clickRig();
    putChest(r.world, 26, 10, 24, 1, false);
    r.look(26.5, 10.5, 24.5);
    r.click();
    expect(r.opened).toEqual([{ x: 26, y: 10, z: 24 }]);
  });
});

describe('RB13〔軽微 13〕: 相手の いない 1 マスの 宝箱を 右クリックしても こまらない', () => {
  it.each([false, true])('のこりの マス だけ／本体 だけ〔のこり %s〕: 何も 置かれず 持ち物も ふえず 落ちない', (restOnly) => {
    const r = clickRig();
    const id = chestBlockId(2, false, restOnly) as BlockId;
    expect(r.world.setBlock(26, 10, 24, id)).toBe(true);
    r.look(26.5, 10.5, 24.5);
    expect(() => r.click()).not.toThrow();
    expect(r.world.getBlock(26, 10, 24), '宝箱は そのまま').toBe(id);
    expect(r.inv.slots()[0], '手の ブロックは 置かれない').toMatchObject({ item: 'dirt', count: 5 });
    expect(bagOf(r.inv), '持ち物は ふえない').toBe(0);
  });
});
