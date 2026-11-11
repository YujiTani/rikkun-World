import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState } from '../contracts';
import { createLiveSettings } from '../contracts';
import { DigSystemImpl } from '../dig/DigSystem';
import { createHarapanRoll } from '../drops/harapan';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { chestBlockId, CHEST_RIGHT } from '../world/blocks/chestBlock';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createP2Dig, type P2DigDeps } from './p2Dig';
import { P2State } from './p2State';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c)・§8 の 5b の 行・AC132〜AC135・AC148）の 先行テスト（赤）。2P の ほる・おく係に 1P と 同じ 口を つなぐ。
 * いま 2P の ほる係は m4 に これらを 受けとる 口が ない（1P だけ）。実績は 共有・もちものは その人の 物・乱数は 1 つの くじを 2 人で 引く。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Dig.ts   P2DigDeps に 足す（どれも 省ける。createP2Dig が m4 に 組みこむ。`game/wire/duoPlay.ts` は 渡す 行だけ）:
 *     onPickup?: (item: ItemId, count: number) => void          … 2P が ほって もちものに 入った（AC132）。m4.onPickup に つなぐ。配線は 2P の つくる の notifyPickup（実績 obtain:*）
 *     harapan?: (id: string, y: number) => boolean              … こわした ブロックから はらぱんみみず が 出る くじ（AC133）。m4.harapan に つなぐ。**1P と 同じ くじ**（配線は 1 つの createHarapanRoll の block を 2 人に 渡す）。当たれば m4.scatterItem で 'harapan_mimizu' 1 こ
 *     armor?: Pick<ArmorSystemImpl, 'tryEquip' | 'slotFor'>     … ZL で 着る（AC134）。m4.armor = { tryEquip: (i) => armor.tryEquip(i), canEquip: (i) => armor.slotFor(i) !== null }。配線は p2.armor（1P の armor ではない）
 *     build?: NonNullable<DigM4Deps['build']>                    … 建築中の 家の 守り・みずもり・どうづき（AC135）。m4.build に そのまま。**1P と 同じ 守り**（配線は game/wire/combat.ts の createBuildPort を 2 人に 渡す。combatPorts.test.ts）
 *     chestPort?: NonNullable<DigSystemImpl['chestPort']>        … ダンジョンの 宝箱（AC148）。createP2Dig が dig.chestPort に 入れる
 *   src/dig/DigSystem.ts   public `chestWho: 1 | 2 = 1` … 右クリックで 宝箱を あける とき `chestPort.open(x, y, z, this.chestWho)`（いまは 0 固定）。createP2Dig は 2 に する。
 *     chestPort の 型は `{ open(x: number, y: number, z: number, who: 1 | 2): void }`（who に 既定は ない。ほかの 所と そろえて 1 = 1P・2 = 2P。今の コメント「1P は 0」は やめる）。
 *     DigSystem.ts は 722 行 なので 足すのは この 1 欄と 呼ぶ 1 行だけ。
 *   1 人の ときは かわらない（AC130・AC146）: 1P の DigSystemImpl は chestWho 1 の まま・m4 に 2P の 口は 入らない。
 */

const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
const mkPlayer = (x: number, y: number, z: number, yaw: number): PlayerState => ({
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  yawDeg: yaw,
  pitchDeg: 0,
  onGround: true,
  inWater: false,
  moving: false,
  facingDeg: 0,
  running: false,
});
const EYE = 1.62;

/** 2P だけの 小さな 世界。目の 前 (5,10,6) に つち・その 手前 (4,10,6) が 置く 場所。床は y=8 */
function rig(extra: Partial<P2DigDeps> | ((p2: P2State) => Partial<P2DigDeps>) = {}) {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  world.fill(0, 0, 0, 63, 8, 63, 'stone');
  world.setBlock(5, 10, 6, 'dirt');
  const p2 = new P2State();
  const actions = new ActionState();
  const state = mkPlayer(2.5, 9, 6.5, 90);
  const dig = createP2Dig({ world, p2, actions, position: () => state, lock, eyeHeight: () => EYE, partner: () => null, ...(typeof extra === 'function' ? extra(p2) : extra) });
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      dig.update();
      actions.endFrame();
    }
  };
  tick(2);
  const tapSecondary = (): void => {
    actions.press('secondary');
    tick(1);
    actions.release('secondary');
    tick(3);
  };
  /** ZR を 押して ひびが MAX → 押し直して こわす */
  const digTarget = (): void => {
    actions.press('primary');
    for (let i = 0; i < 3000 && !dig.state().ready; i++) tick(1);
    actions.release('primary');
    tick(1);
    actions.press('primary');
    tick(1);
    actions.release('primary');
    tick(2);
  };
  const hold = (item: ItemId, count = 2): void => {
    p2.inventory.setSlot(0, { item, count });
    p2.inventory.select(0);
  };
  return { world, p2, actions, state, dig, tick, tapSecondary, digTarget, hold };
}

describe('AC132: 2P が ほって もちものに 入った → onPickup（実績 obtain:* の もと）', () => {
  it('ほった 物と 数を 1 回 しらせる。2P の もちものに 入った 数と 同じ', () => {
    const got: Array<{ item: string; count: number }> = [];
    const r = rig({ onPickup: (item, count) => void got.push({ item, count }) });
    r.digTarget();
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(got).toHaveLength(1);
    expect(got[0]!.item).toBe('dirt');
    expect(got[0]!.count).toBe(r.p2.inventory.count('dirt' as ItemId));
  });

  it('対照: 口を 渡さない 2P は そのまま ほれる（しらせは 出ない）', () => {
    const r = rig();
    r.digTarget();
    expect(r.world.getBlock(5, 10, 6)).toBe('air');
    expect(r.p2.inventory.count('dirt' as ItemId)).toBeGreaterThanOrEqual(1);
  });
});

describe('AC133: はらぱんみみず（1 つの くじを 2 人で 引く）', () => {
  const live = { ...createLiveSettings(), harapanBlock: 1, harapanLog: 1, harapanUnderY: 100 }; // かならず 当たる
  it('2P が こわした ブロックで くじを 引き、当たると はらぱんみみずが その 場に 出る（scatterItem）。くじは 1 回', () => {
    const roll = createHarapanRoll(1, () => live);
    const draws: Array<{ id: string; y: number }> = [];
    const scattered: Array<{ item: string; count: number }> = [];
    const r = rig({
      harapan: (id, y) => {
        draws.push({ id, y });
        return roll.block(id, y);
      },
      m4: { scatterItem: (_pos, item, count) => void scattered.push({ item, count }) },
    });
    r.digTarget();
    expect(draws).toEqual([{ id: 'dirt', y: 10 }]);
    expect(scattered).toEqual([{ item: 'harapan_mimizu', count: 1 }]);
  });

  it('1P と 2P が 同じ くじ(1 つの 関数)を 引く: 1P が 1 回・2P が 1 回 で、くじは 合わせて 2 回だけ(2P が 別の くじを 作らない)', () => {
    const draws: string[] = [];
    const shared = (id: string, y: number): boolean => {
      draws.push(`${id}@${y}`);
      return false;
    };
    const r = rig({ harapan: shared });
    // 1P: 同じ 世界の 別の 場所 (z=10) に 立って、同じ くじを 渡された DigSystemImpl で ほる
    r.world.setBlock(5, 10, 10, 'dirt');
    const a1 = new ActionState();
    const s1 = mkPlayer(2.5, 9, 10.5, 90);
    const dig1 = new DigSystemImpl(r.world as never, () => s1, a1, lock, new InventoryImpl(), () => EYE, undefined, undefined, null, { harapan: shared });
    const step1 = (): void => {
      dig1.update();
      a1.endFrame();
    };
    step1();
    a1.press('primary');
    for (let i = 0; i < 3000 && !dig1.state().ready; i++) step1();
    a1.release('primary');
    step1();
    a1.press('primary');
    step1();
    a1.release('primary');
    step1();
    r.digTarget();
    expect(draws).toEqual(['dirt@10', 'dirt@10']);
  });

  it('当たらない ときは 何も 出ない', () => {
    const scattered: string[] = [];
    const r = rig({ harapan: () => false, m4: { scatterItem: (_p, item) => void scattered.push(item) } });
    r.digTarget();
    expect(scattered).toEqual([]);
  });
});

describe('AC134: ZL で 着る（2P の そうびに 着る）', () => {
  it('2P が かぶとを 持って ZL → 2P の そうびの あたまに 着て、もちものから 1 つ へる。別の 持ち主の そうびは かわらない', () => {
    const other = new P2State(); // 1P の そうびの かわり
    const r = rig((p2) => ({ armor: p2.armor }));
    r.hold('kabuto' as ItemId, 1);
    r.tapSecondary();
    expect(r.p2.armor.equipped('head')).toBe('kabuto');
    expect(r.p2.inventory.count('kabuto' as ItemId)).toBe(0);
    expect(other.armor.equipped('head')).toBeNull();
    expect(r.world.getBlock(4, 10, 6), '着ると 同時に ブロックは 置かない').toBe('air');
  });

  it('着られない 物（つち）を 持った ZL は 今までどおり 置く。そうびは はだかの まま', () => {
    const r = rig((p2) => ({ armor: p2.armor }));
    r.hold('dirt' as ItemId, 3);
    r.tapSecondary();
    expect(r.world.getBlock(4, 10, 6)).toBe('dirt');
    for (const slot of ['head', 'body', 'arms', 'legs'] as const) expect(r.p2.armor.equipped(slot)).toBeNull();
  });
});

describe('AC135: 建築中の 家（守られた ブロックは 2P も こわせない・置けない。みずもり・どうづきは 2P も 使える）', () => {
  const locked = (x: number, y: number, z: number): boolean => x === 5 && y === 10 && z === 6;
  const lockedPlace = (x: number, y: number, z: number): boolean => x === 4 && y === 10 && z === 6;

  it('こわせない: ひびが MAX に なって 押し直しても ブロックは そのまま・つちも 手に 入らない', () => {
    const calls: string[] = [];
    const r = rig({ build: { locked, level: () => void calls.push('level'), tamp: () => void calls.push('tamp') } });
    r.digTarget();
    expect(r.world.getBlock(5, 10, 6)).toBe('dirt');
    expect(r.p2.inventory.count('dirt' as ItemId)).toBe(0);
  });

  it('置けない: 置く 場所が 守られて いれば ブロックも 持ち物も かわらない', () => {
    const r = rig({ build: { locked: lockedPlace, level() {}, tamp() {} } });
    r.hold('stone' as ItemId, 2);
    r.tapSecondary();
    expect(r.world.getBlock(4, 10, 6)).toBe('air');
    expect(r.p2.inventory.held()?.count).toBe(2);
  });

  it('みずもり: 右クリック(ZL) で はかる（level に ねらった ブロック）。持ち物は へらない', () => {
    const calls: string[] = [];
    const r = rig({ build: { locked: () => false, level: (x, y, z) => void calls.push(`level ${x},${y},${z}`), tamp: () => void calls.push('tamp') } });
    r.hold('mizumori' as ItemId);
    const before = r.p2.inventory.held()?.count;
    r.tapSecondary();
    expect(calls).toEqual(['level 5,10,6']);
    expect(r.p2.inventory.held()?.count).toBe(before);
  });

  it('どうづき: ZL を 押している あいだ tamp に ねらった ブロックが わたる', () => {
    const calls: string[] = [];
    const r = rig({ build: { locked: () => false, level() {}, tamp: (x, y, z) => void calls.push(`tamp ${x},${y},${z}`) } });
    r.hold('dotsuki' as ItemId);
    r.actions.press('secondary');
    r.tick(1);
    r.actions.release('secondary');
    r.tick(2);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(new Set(calls)).toEqual(new Set(['tamp 5,10,6']));
  });

  it('対照: 守られて いなければ 2P も ほれる・置ける', () => {
    const dug = rig({ build: { locked: () => false, level() {}, tamp() {} } });
    dug.digTarget();
    expect(dug.world.getBlock(5, 10, 6)).toBe('air');
    const placed = rig({ build: { locked: () => false, level() {}, tamp() {} } });
    placed.hold('stone' as ItemId, 2);
    placed.tapSecondary();
    expect(placed.world.getBlock(4, 10, 6)).toBe('stone');
    expect(placed.p2.inventory.held()?.count).toBe(1);
  });
});

describe('AC148: 宝箱（2P が ZL で あける → chestPort.open に who = 2 が とどく）', () => {
  const [RX, RZ] = CHEST_RIGHT.n;
  function chestRig(extra: Partial<P2DigDeps> = {}) {
    const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
    world.fill(0, 0, 0, 47, 9, 47, 'stone');
    const p2 = new P2State();
    const actions = new ActionState();
    const state = mkPlayer(24.5, 10, 24.5, 0);
    const opened: Array<{ x: number; y: number; z: number; who: 1 | 2 }> = [];
    const chestPort = { open: (x: number, y: number, z: number, who: 1 | 2) => void opened.push({ x, y, z, who }) };
    const dig = createP2Dig({ world, p2, actions, position: () => state, lock, eyeHeight: () => EYE, partner: () => null, chestPort, ...extra });
    const tick = (n = 1): void => {
      for (let i = 0; i < n; i++) {
        dig.update();
        actions.endFrame();
      }
    };
    tick(2);
    const x = 26;
    const y = 10;
    const z = 24;
    world.setBlock(x, y, z, chestBlockId(2, false, false) as BlockId);
    world.setBlock(x - RX, y, z - RZ, chestBlockId(2, false, true) as BlockId);
    const look = (px: number, py: number, pz: number): void => {
      const p = state.position;
      state.yawDeg = (Math.atan2(px - p.x, -(pz - p.z)) * 180) / Math.PI;
      state.pitchDeg = (Math.atan2(py - (p.y + EYE), Math.hypot(px - p.x, pz - p.z)) * 180) / Math.PI;
      tick(2);
    };
    const click = (): void => {
      actions.press('secondary');
      tick(2);
      actions.release('secondary');
      tick(3);
    };
    return { world, p2, dig, opened, look, click, x, y, z };
  }

  it('2P の ZL は chestPort.open(x, y, z, 2) を 1 回 よぶ（who 2 = 2P）。手の ブロックは 置かない', () => {
    const r = chestRig();
    r.p2.inventory.setSlot(0, { item: 'dirt' as ItemId, count: 5 });
    r.p2.inventory.select(0);
    r.look(r.x + 0.5, r.y + 0.5, r.z + 0.5);
    r.click();
    expect(r.opened).toEqual([{ x: r.x, y: r.y, z: r.z, who: 2 }]);
    expect(r.p2.inventory.held()?.count).toBe(5);
  });

  it('1P の DigSystemImpl は who 1 の まま（1 人の ときは かわらない・AC146）', () => {
    const world = new ArrayVoxelWorld({ x: 48, y: 24, z: 48 });
    world.fill(0, 0, 0, 47, 9, 47, 'stone');
    world.setBlock(26, 10, 24, chestBlockId(1, false, false) as BlockId);
    world.setBlock(26 - RX, 10, 24 - RZ, chestBlockId(1, false, true) as BlockId);
    const actions = new ActionState();
    const state = mkPlayer(24.5, 10, 24.5, 90);
    const inv = new InventoryImpl();
    const dig = new DigSystemImpl(world as never, () => state, actions, lock, inv, () => EYE);
    const whos: Array<1 | 2> = [];
    dig.chestPort = { open: (_x, _y, _z, who) => void whos.push(who) };
    expect(dig.chestWho).toBe(1);
    const tick = (n: number): void => {
      for (let i = 0; i < n; i++) {
        dig.update();
        actions.endFrame();
      }
    };
    tick(2);
    state.pitchDeg = (Math.atan2(10.5 - (10 + EYE), 1.5) * 180) / Math.PI;
    tick(2);
    actions.press('secondary');
    tick(2);
    actions.release('secondary');
    tick(3);
    expect(whos).toEqual([1]);
  });

  it('口(chestPort)を 渡さない 2P の ZL は 何も 起きない(落ちない)', () => {
    const r = chestRig({ chestPort: undefined });
    r.look(r.x + 0.5, r.y + 0.5, r.z + 0.5);
    expect(() => r.click()).not.toThrow();
    expect(r.opened).toEqual([]);
  });
});
