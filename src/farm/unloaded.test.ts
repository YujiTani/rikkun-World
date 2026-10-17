import { describe, expect, it } from 'vitest';
import { createM7Settings, type ChunkColumn } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { createFarmSystem } from './FarmSystem';
import { Pet } from './pet';
import { Sprinklers } from './sprinkler';

const DAY = 91800;

function make() {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, 6, 31, 'dirt');
  world.fill(0, 7, 0, 31, 7, 31, 'grass');
  const settings = createM7Settings();
  const state = { tick: 0 };
  const sprinkler = new Sprinklers();
  const pet = new Pet({ settings, dayLength: () => DAY });
  const farm = createFarmSystem({
    world,
    light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 },
    seed: 1,
    dayLength: () => DAY,
    settings,
    tick: () => state.tick,
    fillTansu: () => {},
    placement: () => ({ wild: [], oldFarm: null }),
    sprinkler,
    pet,
  });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      farm.update({ playerPos: { x: 0, y: 8, z: 0 } });
    }
  };
  /** 列 (1, 1)（x, z = 16〜31）を 捨てる / もどす */
  let saved: ChunkColumn | undefined;
  const drop = () => {
    saved = world.column(1, 1);
    world.unloadColumn(1, 1);
  };
  const back = () => {
    world.loadColumn(saved!);
    farm.rescan();
  };
  return { world, farm, settings, step, drop, back, pet, sprinkler };
}

describe('畑と 読みこんでいない列（VOX-D）', () => {
  it('列が捨てられている間は 作物がそだたず、記録も消えない。もどったら つづきから', () => {
    const { world, farm, settings, step, drop, back } = make();
    settings.farmGrowDays.wet.tomato = 0.001;
    world.setBlock(19, 7, 20, 'water');
    farm.till(20, 7, 20);
    farm.plant(20, 7, 20, 'tomato');
    step(3);
    const before = farm.crop(20, 8, 20)!;
    drop();
    step(3000);
    back();
    const after = farm.crop(20, 8, 20)!;
    expect(after.kind).toBe('tomato');
    expect(after.stage).toBe(before.stage);
    expect(after.stageTicks).toBe(before.stageTicks);
    step(2000);
    expect(farm.crop(20, 8, 20)!.stage).toBeGreaterThan(before.stage);
  });
  it('じょうろの のこり・ごきげんの のこりも 止まる', () => {
    const { farm, step, drop, back, pet } = make();
    farm.till(20, 7, 20);
    farm.plant(20, 7, 20, 'tomato');
    farm.pourAt({ x: 20, y: 7, z: 20 }, 'wood_can' as never, 1, 0);
    pet.pet(20, 8, 20, { ...farm.crop(20, 8, 20)!, wild: false });
    const can0 = farm.canLeft(20, 7, 20);
    const happy0 = pet.left(20, 8, 20);
    expect(can0).toBeGreaterThan(0);
    step(5);
    const can1 = farm.canLeft(20, 7, 20);
    const happy1 = pet.left(20, 8, 20);
    drop();
    step(500);
    back();
    expect(farm.canLeft(20, 7, 20)).toBe(can1);
    expect(pet.left(20, 8, 20)).toBe(happy1);
    expect(can1).toBeLessThan(can0);
    expect(happy1).toBeLessThan(happy0);
  });
  it('捨てられている間に 見直しが 走っても はたけの記録を 消さない（もどったら また見直す）', () => {
    const { world, farm, settings, step, drop, back } = make();
    farm.till(20, 7, 20);
    drop();
    step(settings.farmWetRecheckTicks * 3);
    back();
    world.setBlock(21, 7, 20, 'water');
    step(settings.farmWetRecheckTicks + 5);
    expect(farm.soil(20, 7, 20)!.wet).toBe(true);
  });
  it('保存から読んだとき 読みこんでいない列の作物は 記録を残す', () => {
    const { world, farm, settings, step, drop, back } = make();
    settings.farmGrowDays.wet.tomato = 0.001;
    world.setBlock(19, 7, 20, 'water');
    farm.till(20, 7, 20);
    farm.plant(20, 7, 20, 'tomato');
    const data = JSON.parse(JSON.stringify(farm.serialize()));
    drop();
    farm.deserialize(data);
    back();
    expect(farm.crops().some((c) => c.x === 20 && c.z === 20)).toBe(true);
    step(1);
    expect(farm.crop(20, 8, 20)!.kind).toBe('tomato');
  });
  it('スプリンクラー: 捨てられても 覚えている', () => {
    const { world, farm, drop, back, sprinkler } = make();
    world.setBlock(20, 8, 20, 'sprinkler');
    farm.onBlockChanged(20, 8, 20, 'air', 'sprinkler');
    expect(sprinkler.covers(21, 7, 20)).toBe(true);
    drop();
    sprinkler.rescan(world);
    expect(sprinkler.list()).toHaveLength(1);
    back();
    expect(sprinkler.list()).toHaveLength(1);
  });
});
