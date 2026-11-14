import { afterEach, describe, expect, it } from 'vitest';
import type { BlockId, DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, YokaiKind } from '../contracts';
import { crushAt } from '../gasha/gashaBigCrush';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from '../yokai/ai/YokaiManager';
import { AI_CONST } from '../yokai/ai/config';
import { townGuards } from './townGuard';
import { activateTown, deactivateTown } from './townState';

/** AC9（1.3）: 街の ブロックは 妖怪の 技（ぬりかべの たおれこみ・水で 石・がしゃどくろの たたきつけ）で こわれない。外では 今までどおり */
afterEach(() => deactivateTown());

const GY = 8; // 地面の ブロックの y
const IN = { x: 60, z: 60 }; // 街の はんいの 中（x0 20・z0 20 の 100×100）
const OUT = { x: 10, z: 60 }; // 街の 外

function rig() {
  deactivateTown();
  activateTown(1, { v: 1, x0: 20, z0: 20, facing: 'n', groundY: GY } as never, null);
  const world = new ArrayVoxelWorld({ x: 140, y: 32, z: 140 });
  for (let x = 0; x < 140; x++) for (let z = 0; z < 140; z++) world.setBlock(x, GY, z, 'stone');
  const time = { phase: (): DayPhase => 'day', dayTick: () => 0, day: () => 0, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set() {}, update() {}, onPhaseChange: () => () => {} } as TimeOfDay;
  const combat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] } as unknown as PlayerCombat;
  const inventory = { add: (_i: ItemId, _c: number) => 0 } as unknown as Inventory;
  const player = { position: { x: 0.5, y: 9, z: 0.5 } };
  let defeats = 0;
  const m = new YokaiManager({
    world, time, getPlayer: () => player, combat, inventory, seed: 1,
    protectAt: (x, y, z) => townGuards(x, y, z),
    onDefeat: () => defeats++,
  });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  return { world, m, player, defeats: () => defeats };
}

/** わざの あと まわりの 箱で いくつ かわったか（地面の 石の 段が こわれる か） */
function diffAround(world: ArrayVoxelWorld, p: { x: number; z: number }, run: () => void): number {
  const cells: [number, number, number][] = [];
  for (let dz = -5; dz <= 5; dz++) for (let dy = -2; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) cells.push([p.x + dx, GY + 1 + dy, p.z + dz]);
  const before = cells.map(([x, y, z]) => world.getBlock(x, y, z));
  run();
  return cells.filter(([x, y, z], i) => world.getBlock(x, y, z) !== before[i]).length;
}

describe('AC9 妖怪の 技で 街は こわれない', () => {
  it('townGuards: 街の はんい（あきち 込み）は true・外は false・街なしは false', () => {
    rig();
    expect(townGuards(IN.x, GY + 1, IN.z)).toBe(true);
    expect(townGuards(OUT.x, GY + 1, OUT.z)).toBe(false);
    deactivateTown();
    expect(townGuards(IN.x, GY + 1, IN.z)).toBe(false);
  });

  it('ぬりかべの たおれこみ: 街の 中は 0 こ・外は こわれる', () => {
    const t = rig();
    const run = (p: { x: number; z: number }) => () => {
      t.player.position = { x: p.x + 0.5, y: GY + 1, z: p.z - 1.5 };
      t.m.spawn('nurikabe', p.x + 0.5, GY + 1, p.z + 0.5, { yawDeg: 0 });
      for (let i = 0; i < 240; i++) t.m.update(1 / 60);
      t.m.clear();
    };
    expect(diffAround(t.world, OUT, run(OUT)), '外では こわれる').toBeGreaterThan(0);
    expect(diffAround(t.world, IN, run(IN)), '街の 中は かわらない').toBe(0);
  });

  it('ぬりかべが 街の 水で 石に なっても 石を 置かない・たおれて 経験値は 出る。外の 水では 石に なる', () => {
    const t = rig();
    const pond = (p: { x: number; z: number }) => {
      for (let x = p.x - 4; x <= p.x + 4; x++) for (let z = p.z - 4; z <= p.z + 4; z++) for (let y = GY + 1; y <= GY + 4; y++) t.world.setBlock(x, y, z, 'water');
    };
    const stones = (p: { x: number; z: number }): number => {
      let n = 0;
      for (let x = p.x - 4; x <= p.x + 4; x++) for (let z = p.z - 4; z <= p.z + 4; z++) for (let y = GY + 1; y <= GY + 4; y++) if (t.world.getBlock(x, y, z) === ('stone' as BlockId)) n++;
      return n;
    };
    for (const [p, expectStone] of [[OUT, true], [IN, false]] as const) {
      pond(p);
      const d0 = t.defeats();
      t.player.position = { x: p.x + 0.5, y: GY + 12, z: p.z + 0.5 };
      t.m.spawn('nurikabe', p.x + 0.5, GY + 1, p.z + 0.5, { ai: false });
      for (let i = 0; i < AI_CONST.stoneTicks + 60; i++) t.m.update(1 / 60);
      expect(t.defeats() - d0, '石に なっても ならなくても たおれて 経験値').toBe(1);
      if (expectStone) expect(stones(p)).toBeGreaterThan(0);
      else expect(stones(p), '街の 水では 石に ならない').toBe(0);
    }
  });

  it('がしゃどくろの たたきつけ（crushAt）: protect が true の マスは こわさない', () => {
    const t = rig();
    const io = (p: (x: number, y: number, z: number) => boolean) => ({
      getBlock: (x: number, y: number, z: number) => t.world.getBlock(x, y, z) as string,
      setAir: (x: number, y: number, z: number) => t.world.setBlock(x, y, z, 'air'),
      protect: p,
    });
    const slam = (p: { x: number; z: number }) => () => crushAt(p.x + 0.5, GY + 1, p.z + 0.5, io(townGuards), { crushRadius: 4, crushDepth: 2, crushUp: 3 });
    expect(diffAround(t.world, OUT, slam(OUT)), '外では こわれる').toBeGreaterThan(0);
    expect(diffAround(t.world, IN, slam(IN)), '街の 中は かわらない').toBe(0);
  });
});

describe('AC8（1.3）妖怪は 街に 歩いて 入れる', () => {
  it('わかない はんい（街 ＋ 8 マス）の ふちで 止まらない', () => {
    const t = rig();
    // 街の 西の ふち（x 20）の 外 12 マス（わかない はんいの 外）から プレイヤー（街の 中）へ
    t.player.position = { x: 24.5, y: GY + 1, z: 60.5 };
    const id = t.m.spawn('karakasa' as YokaiKind, 8.5, GY + 1, 60.5, { yawDeg: 90 });
    expect(id).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 600; i++) t.m.update(1 / 60);
    const e = t.m.list()[0];
    expect(e, '妖怪が いる').toBeDefined();
    expect(e!.position.x, '街の はんい（x ≧ 20）まで 入った').toBeGreaterThan(20);
  });
});

