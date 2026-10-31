import { describe, expect, it } from 'vitest';
import type { BlockId, DayPhase, Inventory, PlayerCombat, TimeOfDay } from '../../contracts';
import { createWorkHook } from '../../debug/workHook';
import { createYokaiConfig, type YokaiConfig } from '../../yokai/ai/config';
import type { HookYokaiEvent, YokaiManagerOptions } from '../../yokai/ai/managerTypes';
import { YokaiManager } from '../../yokai/ai/YokaiManager';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { SkyDarkness } from '../../world/light/skyDarkness';
import { WorldLight } from '../../world/light/WorldLight';
import { houseShape } from '../shape';
import { HouseBuilder, type ActiveBuild } from './builder';
import { NO_SPAWN_RADIUS } from './tuning';

/** ユニット 8（AC23・AC34 ②）: 建築中の 場所の まわりは 夜でも 湧かない（シード固定 800 ステップ）。湧きの ためし 1 回の 仕事は ちょうちんの 家が 2 倍でも 2 倍 くらい */

const SIZE = { x: 96, y: 24, z: 96 };
const GROUND = 9;
const MID = 48.5;
const STEPS = 800;
/** 対照（守りなし）と 仕事を 数える ステップ（有る・無いと 数を 見るだけなので 短く） */
const SHORT_STEPS = 200;
const BP: ActiveBuild['bp'] = { w: 5, d: 5, windows: 2, furniture: [], name: { front: 'もも', back: 'のいえ' } };
/** 外の 箱 7×7 の 北西。まん中が プレイヤーの 立つ 場所 */
const AT = { x: 45, y: GROUND, z: 45 };
const CENTER = { x: AT.x + 3.5, z: AT.z + 3.5 };

function flat(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 0, 0, SIZE.x - 1, GROUND, SIZE.z - 1, 'grass');
  return w;
}

const time = (phase: DayPhase): TimeOfDay =>
  ({ phase: () => phase, dayTick: () => 0, day: () => 0, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} }) as unknown as TimeOfDay;

const combat = (): PlayerCombat =>
  ({ hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] }) as unknown as PlayerCombat;

/** 出た 妖怪を 1 ステップごとに 消して、STEPS ステップ 回し、出た 場所を 返す。lantern ＝ 光（なければ 光の しらべなし） */
function spawns(world: ArrayVoxelWorld, canSpawnAt: ((x: number, z: number) => boolean) | undefined, light?: YokaiManagerOptions['light'], steps = STEPS): Array<{ x: number; z: number }> {
  const config = { ...createYokaiConfig(), yokaiSpawnInterval: 1, yokaiMax: 100_000, yokaiForgetSteps: 1e9 } as YokaiConfig;
  const inv = { add: () => 0 } as unknown as Inventory;
  const m = new YokaiManager({
    world,
    time: time('night'),
    getPlayer: () => ({ position: { x: MID, y: GROUND + 1, z: MID } }),
    combat: combat(),
    inventory: inv,
    seed: 20261031,
    config,
    groundY: () => GROUND,
    drops: { scatter: () => 0 },
    ...(canSpawnAt ? { canSpawnAt } : {}),
    ...(light ? { light } : {}),
  });
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < steps; i++) {
    m.update(1 / 60);
    for (const e of m.takeHookEvents() as HookYokaiEvent[]) if (e.type === 'spawn') out.push({ x: e.position.x, z: e.position.z });
    m.clear();
  }
  return out;
}

const rangeOf = (p: { x: number; z: number }): number => Math.hypot(p.x - CENTER.x, p.z - CENTER.z);

describe('AC23 建築中は 夜でも 湧かない（まん中から 横 16 マス 以内）', () => {
  function builder(world: ArrayVoxelWorld): HouseBuilder {
    const b = new HouseBuilder({ world, shape: () => undefined, record: () => undefined });
    b.start({ number: 1, bp: BP, at: AT, architect: 'first', home: null }, 100_000);
    return b;
  }

  it('シード固定 800 ステップ: 守りが ないと 16 マス 以内にも 湧く（対照）。守りが あると 16 マス 以内は 0、17 マス 以上は 今どおり 湧く', () => {
    const world = flat();
    const none = spawns(world, undefined, undefined, SHORT_STEPS);
    expect(none.filter((p) => rangeOf(p) <= NO_SPAWN_RADIUS).length, '対照: 守りなし').toBeGreaterThan(0);
    const b = builder(world);
    const guarded = spawns(world, (x, z) => !b.noSpawn(x, z));
    expect(guarded.length, '遠くには 湧く').toBeGreaterThan(0);
    expect(guarded.filter((p) => rangeOf(p) <= NO_SPAWN_RADIUS), '16 マス 以内').toEqual([]);
    expect(guarded.some((p) => rangeOf(p) > NO_SPAWN_RADIUS && rangeOf(p) < NO_SPAWN_RADIUS + 4), '17 マス すぐ そとにも 湧く').toBe(true);
  });

  it('完成したら この 場所は ふつうに もどる', () => {
    const world = flat();
    const b = new HouseBuilder({ world, shape: () => undefined, record: () => undefined });
    b.start({ number: 1, bp: BP, at: AT, architect: 'first', home: null }, 30);
    expect(b.noSpawn(CENTER.x + 10, CENTER.z)).toBe(true);
    for (let i = 0; i < 30; i++) b.update();
    expect(b.active()).toBeNull();
    expect(b.noSpawn(CENTER.x + 10, CENTER.z)).toBe(false);
  });
});

describe('AC34 ② 湧きの ためし 1 回の 仕事は、ちょうちんの 家を 2 倍に しても 2 倍 くらいまで', () => {
  /** 家（天井の ちょうちん）を n 軒 ならべた 夜の 世界で、湧きの ためし 1 回あたりの getBlock の 数 */
  function readsPerTry(n: number): number {
    const world = flat();
    const dark = new SkyDarkness();
    dark.value = 11; // 夜
    const light = new WorldLight(world, dark);
    for (let k = 0; k < n; k++) {
      const shape = houseShape({ w: 5, d: 5, windows: 0, furniture: [] });
      const at = { x: 8 + (k % 4) * 20, y: GROUND + 1, z: 8 + Math.floor(k / 4) * 20 };
      for (const c of shape.cells) world.setBlock(at.x + c.x, at.y + c.y, at.z + c.z, c.id as BlockId);
    }
    light.update();
    light.flush();
    let tries = 0;
    const hook = createWorkHook(() => 0, world);
    hook.start();
    spawns(world, () => (tries++, true), light as unknown as YokaiManagerOptions['light'], SHORT_STEPS);
    const reads = hook.read().getBlock;
    hook.stop();
    expect(tries, 'ためしを 実際に した').toBeGreaterThan(0);
    return reads / tries;
  }

  it('1 → 2 → 4 けん: 1 回の ためしの 仕事（getBlock）は 前の 2.2 倍 以下', () => {
    const per = [1, 2, 4].map(readsPerTry);
    for (let i = 1; i < per.length; i++) expect(per[i]!, `${per[i - 1]} → ${per[i]}`).toBeLessThanOrEqual(per[i - 1]! * 2.2);
  });
});
