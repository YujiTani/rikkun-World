import { describe, expect, it } from 'vitest';
import type { ItemId, LockStatus, PlayerState } from '../../contracts';
import { createLiveSettings } from '../../contracts';
import { DigSystemImpl } from '../../dig/DigSystem';
import { createHarapanRoll } from '../../drops/harapan';
import { createP2Dig } from '../../duo/p2Dig';
import { P2State } from '../../duo/p2State';
import { ActionState } from '../../input/actions';
import { InventoryImpl } from '../../inventory/Inventory';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { createBuildPort, createHarapanPort } from './combat';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c)・§8 の 5b の 行「`game/wire/combat.ts`（`build`・`harapan` の 作り方を 関数に）」・AC133・AC135）の 先行テスト（赤）。
 * 1P の `m4.build`・`m4.harapan` を combat.ts の wireFighters の 中で 直接 書いて いるので、2P に 同じ 物を 渡せない。関数に 出して 2 人に 同じ 物を 渡す（式の コピーを 作らない）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/game/wire/combat.ts（export を 足す。wireFighters の 1P の m4 も これを 使う）
 *     createBuildPort(house: () => HouseLike | null | undefined): NonNullable<DigM4Deps['build']>
 *       HouseLike = { build: { builder: { locked(x, y, z): boolean }; useLevel(x, y, z): void; useTamp(x, y, z): void } }
 *       … 今の `build: { locked, level, tamp }`（shared.house を 関数で 包んだ 物）と 同じ。家が まだ ない(null)ときは locked は false・level／tamp は 何もしない。
 *     createHarapanPort(roll: Pick<HarapanRoll, 'block'>): NonNullable<DigM4Deps['harapan']>
 *       … `(id, y) => roll.block(id, y)`。**1 つの くじを 1P と 2P が 引く**（wireFighters が 1 回 作って 両方に 渡す。2P の ほる係には P2DigDeps.harapan として）。
 *   2P の 渡し方: createP2Dig({ ..., build: buildPort, harapan: harapanPort })（p2Dig5b.test.ts）。
 *   1 人の ときは かわらない（AC130・AC146）: 1P の 守り・くじの 順は 今の まま（くじは 1 回 ほる ごとに 1 回）。
 */

describe('createBuildPort', () => {
  const calls: string[] = [];
  const house = {
    build: {
      builder: { locked: (x: number, y: number, z: number) => x === 5 && y === 10 && z === 6 },
      useLevel: (x: number, y: number, z: number) => void calls.push(`level ${x},${y},${z}`),
      useTamp: (x: number, y: number, z: number) => void calls.push(`tamp ${x},${y},${z}`),
    },
  };

  it('家が あれば 守り・みずもり・どうづきは 家に とどく', () => {
    calls.length = 0;
    const port = createBuildPort(() => house);
    expect(port.locked(5, 10, 6)).toBe(true);
    expect(port.locked(4, 10, 6)).toBe(false);
    port.level(1, 2, 3);
    port.tamp(4, 5, 6);
    expect(calls).toEqual(['level 1,2,3', 'tamp 4,5,6']);
  });

  it('家が まだ ない(null)ときは 守らず、何も 起きない(落ちない)', () => {
    const port = createBuildPort(() => null);
    expect(port.locked(5, 10, 6)).toBe(false);
    expect(() => {
      port.level(1, 2, 3);
      port.tamp(1, 2, 3);
    }).not.toThrow();
  });

  it('あとから 家が できても 追いつく(関数で 包む)', () => {
    let h: typeof house | null = null;
    const port = createBuildPort(() => h);
    expect(port.locked(5, 10, 6)).toBe(false);
    h = house;
    expect(port.locked(5, 10, 6)).toBe(true);
  });
});

describe('createHarapanPort', () => {
  it('くじ(roll.block)を そのまま 引く: id と 高さが わたり、引いた 回数も 同じ', () => {
    const seen: string[] = [];
    const port = createHarapanPort({ block: (id, y) => (seen.push(`${id}@${y}`), id === 'log') });
    expect(port('log', 12)).toBe(true);
    expect(port('dirt', 3)).toBe(false);
    expect(seen).toEqual(['log@12', 'dirt@3']);
  });

  it('1 つの くじを 1P と 2P が 引く: 並びは 1 人で 続けて 引いた 並びと 同じ', () => {
    const live = { ...createLiveSettings(), harapanBlock: 0.5, harapanLog: 0.5, harapanUnderY: 100 };
    const alone = createHarapanRoll(3, () => live);
    const expected = Array.from({ length: 6 }, () => alone.block('dirt', 10));
    const port = createHarapanPort(createHarapanRoll(3, () => live));
    const got = Array.from({ length: 6 }, () => port('dirt', 10)); // 1P・2P が 交互に 同じ port を 引く つもり
    expect(got).toEqual(expected);
  });
});

describe('AC135: 1P と 2P が 同じ 守りを 使う', () => {
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const mk = (z: number): PlayerState => ({ position: { x: 2.5, y: 9, z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false });

  it('同じ createBuildPort で 1P も 2P も 守られた ブロックを こわせない(となりの 守られて いない ブロックは こわせる)', () => {
    const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    world.fill(0, 0, 0, 63, 8, 63, 'stone');
    world.setBlock(5, 10, 6, 'dirt'); // 2P の 前: 守られて いる
    world.setBlock(5, 10, 10, 'dirt'); // 1P の 前: 守られて いる
    world.setBlock(5, 10, 14, 'dirt'); // 2P の ならびの 守られて いない ブロック(対照)
    const port = createBuildPort(() => ({ build: { builder: { locked: (x: number, _y: number, z: number) => x === 5 && (z === 6 || z === 10), }, useLevel() {}, useTamp() {} } }));
    const a1 = new ActionState();
    const a2 = new ActionState();
    const s1 = mk(10.5);
    const s2 = mk(6.5);
    const s3 = mk(14.5);
    const dig1 = new DigSystemImpl(world as never, () => s1, a1, lock, new InventoryImpl(), () => 1.62, undefined, undefined, null, { build: port });
    const p2 = new P2State();
    const dig2 = createP2Dig({ world, p2, actions: a2, position: () => s2, lock, eyeHeight: () => 1.62, partner: () => null, build: port });
    const a3 = new ActionState();
    const dig3 = createP2Dig({ world, p2: new P2State(), actions: a3, position: () => s3, lock, eyeHeight: () => 1.62, partner: () => null, build: port });
    const digOnce = (dig: { update(): void; state(): { ready: boolean } }, a: ActionState): void => {
      const t = (): void => {
        dig.update();
        a.endFrame();
      };
      t();
      a.press('primary');
      for (let i = 0; i < 3000 && !dig.state().ready; i++) t();
      a.release('primary');
      t();
      a.press('primary');
      t();
      a.release('primary');
      t();
    };
    digOnce(dig1, a1);
    digOnce(dig2, a2);
    digOnce(dig3, a3);
    expect(world.getBlock(5, 10, 10), '1P').toBe('dirt');
    expect(world.getBlock(5, 10, 6), '2P').toBe('dirt');
    expect(world.getBlock(5, 10, 14), '対照: 守られて いない').toBe('air');
    expect(p2.inventory.count('dirt' as ItemId)).toBe(0);
  });
});
