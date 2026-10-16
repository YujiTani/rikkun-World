import { describe, expect, it } from 'vitest';
import { CROP_KINDS, M7_SETTING_DEFAULTS, createM7Settings, type BlockId, type CropKind, type FarmPlacement, type ItemStack } from '../contracts';
import { MemoryBackend, SAVE_ID } from '../save/backend';
import { restoreStoredWorld } from '../save/restore';
import { SaveManager, saveKey, type KeyValueStore } from '../save/SaveManager';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { generateIsland } from '../world/gen/generateIsland';
import { createFarmSystem } from './FarmSystem';
import { makeLegacySaveText } from './legacy';

const DAY = 91800;

function make(opts: { lightLevel?: number; placement?: FarmPlacement; seed?: number } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, 6, 31, 'dirt');
  world.fill(0, 7, 0, 31, 7, 31, 'grass');
  const tansu: Array<{ pos: unknown; items: ItemStack[] }> = [];
  const settings = createM7Settings();
  const state = { tick: 0, light: opts.lightLevel ?? 15 };
  const farm = createFarmSystem({
    world,
    light: { skyLight: () => state.light, blockLight: () => 0, level: () => state.light },
    seed: opts.seed ?? 1,
    dayLength: () => DAY,
    settings,
    tick: () => state.tick,
    fillTansu: (pos, items) => tansu.push({ pos, items }),
    placement: () => opts.placement ?? { wild: [], oldFarm: null },
  });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      farm.update({ playerPos: { x: 0, y: 8, z: 0 } });
    }
  };
  return { world, farm, settings, state, step, tansu };
}

const stats = (a: number[]) => {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  return { m, sd, max: Math.max(...a) };
};

describe('育つ時間（AC7・AC8）', () => {
  it('平均・ばらつき・最大・再現性', () => {
    const { farm } = make();
    for (const kind of CROP_KINDS)
      for (const wet of [false, true])
        for (let seed = 1; seed <= 3; seed++) {
          const T = farm.growTicks(kind, wet);
          const s = stats(farm.simulateGrowth(kind, wet, 2000, seed));
          expect(Math.abs(s.m / T - 1)).toBeLessThan(0.05);
          expect(s.sd / s.m).toBeGreaterThan(0.45);
          expect(s.sd / s.m).toBeLessThan(0.57);
          expect(s.max).toBeLessThanOrEqual(T * 3.2);
        }
    expect(farm.simulateGrowth('tomato', false, 50, 3)).toEqual(farm.simulateGrowth('tomato', false, 50, 3));
  });
  it('やさい ごとの はやさ と 水', () => {
    const { farm } = make();
    const mean = (k: CropKind, w: boolean) => stats(farm.simulateGrowth(k, w, 2000, 1)).m;
    expect(mean('tomato', false)).toBeLessThan(mean('onion', false));
    expect(mean('onion', false)).toBeLessThan(mean('pumpkin', false));
    for (const k of CROP_KINDS) {
      const r = mean(k, true) / mean(k, false);
      expect(r).toBeGreaterThan(0.62);
      expect(r).toBeLessThan(0.72);
    }
  });
});

describe('たがやす・まく・しゅうかく', () => {
  it('till は 上が くうき の くさ・つち だけ', () => {
    const { world, farm } = make();
    expect(farm.till(5, 7, 5)).toBe(true);
    expect(farm.soil(5, 7, 5)).toMatchObject({ wet: false, water: false, canLeft: 0, sprinkler: false });
    expect(farm.till(5, 6, 5)).toBe(false);
    world.setBlock(6, 8, 6, 'torch');
    expect(farm.till(6, 7, 6)).toBe(false);
    expect(farm.peekEvents().filter((e) => e.type === 'till')).toHaveLength(1);
  });
  it('植える→育つ→とる。明るさ 低いと 育たない', () => {
    const { world, farm, settings, state, step } = make();
    settings.farmGrowDays.wet.tomato = 0.001;
    world.setBlock(4, 7, 5, 'water');
    farm.till(5, 7, 5);
    expect(farm.plant(5, 7, 5, 'tomato')).toBe(true);
    expect(farm.plant(5, 7, 5, 'tomato')).toBe(false);
    expect(farm.crop(5, 8, 5)).toMatchObject({ kind: 'tomato', stage: 0, stageTicks: 0 });
    state.light = 8;
    step(5000);
    expect(farm.crop(5, 8, 5)).toMatchObject({ stage: 0, stageTicks: 0, lit: false });
    expect(farm.aim(5, 8, 5)?.dark).toBe(true);
    state.light = 15;
    let prev = 0;
    for (let i = 0; i < 3000 && farm.crop(5, 8, 5)!.stage < 3; i++) {
      step();
      const s = farm.crop(5, 8, 5)!.stage;
      expect(s - prev).toBeLessThanOrEqual(1);
      prev = s;
    }
    expect(farm.crop(5, 8, 5)?.ripe).toBe(true);
    expect(farm.aim(5, 8, 5)).toMatchObject({ dots: 4, ripe: true });
    const r = farm.harvest(5, 8, 5);
    expect(r.ok && r.items[0]!.count >= 1 && r.items[1]!.count >= 1).toBe(true);
    expect(world.getBlock(5, 8, 5)).toBe('air');
    expect(farm.soil(5, 7, 5)).not.toBeNull();
  });
  it('かわいた はたけ では 育たない。ぬれたら つづきから', () => {
    const { world, farm, settings, step } = make();
    settings.farmGrowDays.wet.tomato = 0.001;
    settings.farmGrowDays.dry.tomato = 0.001;
    farm.till(5, 7, 5);
    farm.plant(5, 7, 5, 'tomato');
    step(5000);
    expect(farm.crop(5, 8, 5)).toMatchObject({ stage: 0, stageTicks: 0 });
    world.setBlock(4, 7, 5, 'water');
    for (let i = 0; i < 3000 && farm.crop(5, 8, 5)!.stage < 3; i++) step();
    expect(farm.crop(5, 8, 5)?.ripe).toBe(true);
  });
  it('まだ のとき notRipe・こわれない', () => {
    const { world, farm } = make();
    farm.till(5, 7, 5);
    farm.plant(5, 7, 5, 'onion');
    expect(farm.harvest(5, 8, 5)).toEqual({ ok: false, reason: 'notRipe' });
    expect(world.getBlock(5, 8, 5)).toBe('crop_onion');
    expect(farm.harvest(9, 8, 9)).toEqual({ ok: false, reason: 'none' });
  });
  it('はたけ を こわす: 未熟は たね 1・熟は しゅうかく と同じ', () => {
    const { world, farm } = make();
    farm.till(5, 7, 5);
    farm.plant(5, 7, 5, 'pumpkin');
    world.setBlock(5, 7, 5, 'air');
    expect(farm.onBlockBroken(5, 7, 5, 'farmland')).toEqual([{ item: 'seed_pumpkin', count: 1 }]);
    expect(world.getBlock(5, 8, 5)).toBe('air');
    farm.till(6, 7, 5);
    farm.plant(6, 7, 5, 'pumpkin');
    farm.setStage(6, 8, 5, 3);
    world.setBlock(6, 7, 5, 'air');
    const items = farm.onBlockBroken(6, 7, 5, 'farmland');
    expect(items[0]).toEqual({ item: 'pumpkin', count: 1 });
    expect(farm.peekEvents().some((e) => e.type === 'harvest')).toBe(true);
  });
  it('やせいの やさい: くさ ごと こわしても とれる', () => {
    const { world, farm } = make();
    world.setBlock(3, 8, 3, 'wild_eggplant');
    expect(farm.crop(3, 8, 3)).toMatchObject({ kind: 'eggplant', stage: 3, ripe: true });
    world.setBlock(3, 7, 3, 'air');
    const items = farm.onBlockBroken(3, 7, 3, 'grass');
    expect(items[0]!.item).toBe('eggplant');
    expect(world.getBlock(3, 8, 3)).toBe('air');
    world.setBlock(4, 8, 4, 'wild_onion');
    const r = farm.harvest(4, 8, 4);
    expect(r.ok && r.wild).toBe(true);
  });
});

describe('しめり（AC10）', () => {
  it('横 4・y か y+1 に 水', () => {
    const { world, farm, step } = make();
    world.setBlock(9, 8, 5, 'water');
    expect(farm.till(5, 7, 5)).toBe(true);
    expect(farm.soil(5, 7, 5)?.wet).toBe(true);
    world.setBlock(10, 8, 12, 'water');
    farm.till(5, 7, 12);
    expect(farm.soil(5, 7, 12)?.wet).toBe(false);
    world.setBlock(9, 8, 5, 'dirt');
    step(60);
    expect(farm.soil(5, 7, 5)?.wet).toBe(false);
    world.setBlock(9, 8, 5, 'water');
    step(60);
    expect(farm.soil(5, 7, 5)?.wet).toBe(true);
    expect(world.getBlock(5, 7, 5)).toBe('farmland_wet');
  });
  it('かわいた はたけ は つち に もどらない', () => {
    const { world, farm, step } = make();
    farm.till(5, 7, 5);
    step(5000);
    expect(world.getBlock(5, 7, 5)).toBe('farmland');
  });
});

describe('くさ から たね（AC17）', () => {
  it('確率', () => {
    const { farm, settings } = make();
    let n = 0;
    for (let i = 0; i < 800; i++) if (farm.grassSeed(3, 3)) n++;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
    settings.farmGrassSeedChance = 1;
    expect(farm.grassSeed(3, 3)).not.toBeNull();
    settings.farmGrassSeedChance = 0;
    expect(farm.grassSeed(3, 3)).toBeNull();
  });
  it('場所で 出やすい たね', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    const rg = {
      center: { x: 16, z: 16 }, startH0: 7, mountain: { cx: 99, cz: 99, r: 1, peak: { x: 99, z: 99, h: 9 } }, rock: { cx: 99, cz: 99, r: 1 },
      forest: { cx: 25, cz: 25, r: 3 }, flat: { x0: 2, z0: 2, x1: 6, z1: 6 }, spring: { cx: -50, cz: -50, r: 1 }, river: [], meadow: { cx: 15, cz: 15, r: 3 }, pond: { cx: -50, cz: -50, r: 1 },
    };
    const settings = createM7Settings();
    settings.farmGrassSeedChance = 1;
    const farm = createFarmSystem({ world: w, light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 }, seed: 1, dayLength: () => DAY, settings, tick: () => 0, fillTansu: () => {}, placement: () => ({ wild: [], oldFarm: null }), regions: () => rg });
    expect(farm.grassSeedKind(4, 4)).toBe('tomato');
    expect(farm.grassSeedKind(15, 15)).toBe('pumpkin');
    expect(farm.grassSeedKind(25, 25)).toBe('onion');
    expect(farm.grassSeedKind(20, 4)).toBeNull();
    let t = 0;
    for (let i = 0; i < 700; i++) if (farm.grassSeed(4, 4) === 'seed_tomato') t++;
    expect(t).toBeGreaterThan(330);
    expect(t).toBeLessThan(470);
    const c: Record<string, number> = {};
    for (let i = 0; i < 700; i++) {
      const s = farm.grassSeed(20, 4)!;
      c[s] = (c[s] ?? 0) + 1;
    }
    for (const v of Object.values(c)) {
      expect(v).toBeGreaterThan(120);
      expect(v).toBeLessThan(230);
    }
  });
});

describe('保存（AC20・AC21）', () => {
  it('読み直して 同じ入力で 同じ結果', () => {
    const a = make();
    a.settings.farmGrowDays.dry = { onion: 0.01, tomato: 0.01, pumpkin: 0.01, eggplant: 0.01 };
    for (let i = 0; i < 10; i++) {
      a.farm.till(2 + i, 7, 2);
      a.farm.plant(2 + i, 7, 2, CROP_KINDS[i % 4]!);
    }
    a.step(200);
    const data = JSON.parse(JSON.stringify(a.farm.serialize()));
    const b = make();
    b.settings.farmGrowDays.dry = a.settings.farmGrowDays.dry;
    for (let i = 0; i < 10; i++) b.world.setBlock(2 + i, 7, 2, 'farmland');
    for (const c of a.farm.crops()) b.world.setBlock(c.x, c.y, c.z, a.world.getBlock(c.x, c.y, c.z) as BlockId);
    b.farm.deserialize(data);
    expect(b.farm.crops()).toEqual(a.farm.crops());
    a.step(1000);
    b.step(1000);
    expect(b.farm.crops().map((c) => [c.stage, c.stageTicks])).toEqual(a.farm.crops().map((c) => [c.stage, c.stageTicks]));
  });
  it('farm の保存がこわれていても 新しい保存なら 置いた印は のこる。前の保存（なし）は まだ', () => {
    const a = make();
    a.farm.deserialize({});
    expect(a.farm.placedM7()).toBe(true);
    a.farm.deserialize(null);
    expect(a.farm.placedM7()).toBe(false);
  });
  it('作物 480 こ の 大きさ', () => {
    const a = make();
    for (let i = 0; i < 480; i++) {
      const x = i % 30, z = Math.floor(i / 30);
      a.farm.till(x, 7, z);
      a.farm.plant(x, 7, z, CROP_KINDS[i % 4]!);
    }
    a.step(300);
    expect(JSON.stringify(a.farm.serialize()).length).toBeLessThan(15000);
  });
  it('update 480 こ は 速い', () => {
    const a = make();
    for (let i = 0; i < 480; i++) {
      const x = i % 30, z = Math.floor(i / 30);
      a.farm.till(x, 7, z);
      a.farm.plant(x, 7, z, CROP_KINDS[i % 4]!);
    }
    const ts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      a.step();
      ts.push(performance.now() - t0);
    }
    ts.sort((p, q) => p - q);
    expect(ts[10]).toBeLessThan(0.3 * 4);
  });
});

describe('前の保存（AC35）', () => {
  const placement: FarmPlacement = {
    wild: [
      { x: 3, y: 8, z: 3, kind: 'tomato' },
      { x: 5, y: 8, z: 5, kind: 'onion' },
    ],
    oldFarm: {
      blocks: [
        { x: 10, y: 7, z: 10, id: 'farmland' },
        { x: 10, y: 8, z: 10, id: 'kakashi' },
        { x: 12, y: 8, z: 10, id: 'tansu' },
      ],
      tansu: { x: 12, y: 8, z: 10 },
      tansuItems: [{ item: 'seed_onion', count: 2 }],
      kakashi: { x: 10, y: 8, z: 10 },
      box: { x0: 9, z0: 9, x1: 13, z1: 13, y0: 6, y1: 13 },
      tier: 0,
    },
  };
  const key = (w: ArrayVoxelWorld, x: number, y: number, z: number) => (y * w.loadedBounds().z1 + z) * w.loadedBounds().x1 + x;
  it('変えていなければ ぜんぶ 置く・2 回 しない', () => {
    const { world, farm, tansu } = make({ placement });
    expect(farm.placeLegacy(new Set())).toBe(true);
    expect(world.getBlock(3, 8, 3)).toBe('wild_tomato');
    expect(world.getBlock(10, 8, 10)).toBe('kakashi');
    expect(tansu).toHaveLength(1);
    expect(farm.placedM7()).toBe(true);
    expect(farm.placeLegacy(new Set())).toBe(false);
    expect(tansu).toHaveLength(1);
  });
  it('変えたマスが あれば その分だけ とばす', () => {
    const { world, farm, tansu } = make({ placement });
    farm.placeLegacy(new Set([key(world, 11, 9, 11), key(world, 3, 7, 3)]));
    expect(world.getBlock(10, 8, 10)).toBe('air');
    expect(tansu).toHaveLength(0);
    expect(world.getBlock(3, 8, 3)).toBe('air');
    expect(world.getBlock(5, 8, 5)).toBe('wild_onion');
  });
  it('SaveManager: 前の保存を 読む', async () => {
    const store = new Map<string, string>();
    const kv: KeyValueStore = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
    store.set(saveKey(777), makeLegacySaveText(777, []));
    const world = new ArrayVoxelWorld();
    const island = generateIsland(777, world);
    world.resetSaveTracking();
    const db = new MemoryBackend();
    const restored = await restoreStoredWorld({ world, db, store: kv, seed: 777, saveId: SAVE_ID, reset: false });
    const farm = createFarmSystem({
      world, light: { skyLight: () => 15, blockLight: () => 0, level: () => 15 }, seed: 777, dayLength: () => DAY, settings: createM7Settings(),
      tick: () => 0, fillTansu: () => {},
      placement: () => ({ wild: [{ x: 64, y: 30, z: 64, kind: 'onion' }], oldFarm: null }),
    });
    const sp = island.spawn();
    const save = new SaveManager({
      world, seed: 777, db, restored,
      inventory: { serialize: () => null, deserialize: () => {}, clear: () => {} } as never,
      player: { get: () => ({ position: sp, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false }), set: () => {} },
      spawn: () => sp, store: kv, tick: () => 0, settings: { saveIntervalTicks: 600 }, farm,
    });
    expect(save.load()).toBe(true);
    expect(farm.placedM7()).toBe(true);
    expect(world.getBlock(64, 30, 64)).toBe('wild_onion');
    await save.now();
    expect((db.metas.get(SAVE_ID)!.farm as { placed: boolean }).placed).toBe(true);
    void M7_SETTING_DEFAULTS;
  });
});

describe('かかし・合図', () => {
  it('近づくと 出来事・合図は 120 ステップ', () => {
    const { farm, state } = make({ placement: undefined });
    farm.noteHint('till', { x: 1, y: 1, z: 1 });
    expect(farm.lastHint()).toBe('till');
    state.tick = 121;
    expect(farm.lastHint()).toBeNull();
  });
});
