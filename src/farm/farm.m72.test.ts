import { describe, expect, it } from 'vitest';
import {
  createM7Settings,
  type BlockId,
  type FarmEvent,
  type ItemStack,
  type PetPort,
  type SprinklerPort,
  type Vec3,
} from '../contracts';
import { itemType } from '../inventory/items';
import { SaveManager, type KeyValueStore } from '../save/SaveManager';
import { canCapacity, copyStack, itemClassOf, readWater } from '../tools/durability';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { WaterDropFx, WaterDropModel, DROP_LIFE, DROP_POOL } from '../fx/waterFx';
import { wateringTiltDeg } from '../camera/heldTools';
import { createFarmSystem } from './FarmSystem';
import { computeWaterRay, createWatering } from './watering';

const DAY = 91800;
void SaveManager;
void (null as unknown as KeyValueStore);

/** 仮の スプリンクラー: 決まった 表 を 引く */
function fakeSprinkler(list: Vec3[], radius = 2): SprinklerPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    covers: (x, y, z) => list.some((s) => Math.abs(x - s.x) <= radius && Math.abs(z - s.z) <= radius && y >= s.y - 2 && y <= s.y),
    list: () => list.map((s) => ({ ...s })),
    onBlockChanged: (x, y, z, b, a) => calls.push(`${x},${y},${z}:${b}>${a}`),
    rescan: () => calls.push('rescan'),
  };
}

/** 仮の ごきげん: growFactor が いつも 1.1。のこり は 持つ */
function fakePet(): PetPort & { map: Map<string, number> } {
  const map = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  return {
    map,
    growFactor: (x, y, z) => (map.has(k(x, y, z)) ? 1.1 : 1),
    isHappy: (x, y, z) => map.has(k(x, y, z)),
    left: (x, y, z) => map.get(k(x, y, z)) ?? 0,
    pet(x, y, z, c) {
      if (c.wild) return 'wild';
      if (map.has(k(x, y, z))) return 'again';
      map.set(k(x, y, z), DAY);
      return 'happy';
    },
    tick() {
      for (const [kk, v] of map) if (v <= 1) map.delete(kk);
      else map.set(kk, v - 1);
    },
    onCropRemoved: (x, y, z) => void map.delete(k(x, y, z)),
    serialize() {
      const out: number[] = [];
      for (const [kk, v] of map) out.push(...kk.split(',').map(Number), v);
      return out;
    },
    deserialize(flat, isCrop) {
      map.clear();
      if (!Array.isArray(flat)) return;
      for (let i = 0; i + 3 < flat.length; i += 4) if (flat[i + 3] > 0 && isCrop(flat[i], flat[i + 1], flat[i + 2])) map.set(k(flat[i], flat[i + 1], flat[i + 2]), flat[i + 3]);
    },
  };
}

function make(opts: { sprinklers?: Vec3[]; light?: number; seed?: number } = {}) {
  const world = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  world.fill(0, 0, 0, 31, 6, 31, 'dirt');
  world.fill(0, 7, 0, 31, 7, 31, 'grass');
  const settings = createM7Settings();
  const state = { tick: 0, light: opts.light ?? 15 };
  const spr = fakeSprinkler(opts.sprinklers ?? []);
  const pet = fakePet();
  const farm = createFarmSystem({
    world,
    light: { skyLight: () => state.light, blockLight: () => 0, level: () => state.light },
    seed: opts.seed ?? 1,
    dayLength: () => DAY,
    settings,
    tick: () => state.tick,
    fillTansu: () => {},
    placement: () => ({ wild: [], oldFarm: null }),
    sprinkler: spr,
    pet,
  });
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick++;
      farm.update({ playerPos: { x: 0, y: 8, z: 0 } });
    }
  };
  /** かわいた はたけ（y=8 に つち を 置いて たがやす。みず は 無い） */
  const field = (x0: number, z0: number, x1: number, z1: number, y = 8) => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        world.setBlock(x, y, z, 'dirt');
        expect(farm.till(x, y, z)).toBe(true);
      }
  };
  return { world, farm, settings, state, step, spr, pet, field };
}

const wetAt = (m: ReturnType<typeof make>, x: number, z: number, y = 8) => m.farm.soil(x, y, z)!.wet;

describe('AC2 まく（じょうろ 1 マス）', () => {
  it('まん中 だけ しめる。canLeft 1 にち。tiles 1。作物 を ねらっても 同じ', () => {
    const m = make();
    m.field(10, 10, 12, 12);
    const tiles = m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'watering_can', 1, 0);
    expect(tiles).toBe(1);
    expect(wetAt(m, 11, 11)).toBe(true);
    expect(m.farm.soil(11, 8, 11)!.canLeft).toBe(DAY);
    let wet = 0;
    for (let z = 10; z <= 12; z++) for (let x = 10; x <= 12; x++) if (wetAt(m, x, z)) wet++;
    expect(wet).toBe(1);
    expect(m.farm.peekEvents().find((e) => e.type === 'pour')).toMatchObject({ tiles: 1, item: 'watering_can' });
    // 作物 を ねらう
    expect(m.farm.plant(10, 8, 10, 'tomato')).toBe(true);
    expect(m.farm.pourAt({ x: 10, y: 9, z: 10 }, 'watering_can', 1, 0)).toBe(1);
    expect(wetAt(m, 10, 10)).toBe(true);
    expect(m.farm.crop(10, 9, 10)).not.toBeNull();
  });
  it('はたけ でも 作物 でも ない ものを ねらうと 0 マス（出来事 は 出る）', () => {
    const m = make();
    m.field(10, 10, 12, 12);
    expect(m.farm.pourAt({ x: 5, y: 7, z: 5 }, 'watering_can', 1, 0)).toBe(0);
    expect(m.farm.peekEvents().filter((e) => e.type === 'pour')).toMatchObject([{ tiles: 0 }]);
  });
  it('もう ① で しめっていても tiles 1', () => {
    const m = make();
    m.world.setBlock(10, 8, 11, 'water');
    m.field(11, 11, 11, 11);
    expect(wetAt(m, 11, 11)).toBe(true);
    expect(m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'watering_can', 1, 0)).toBe(1);
  });
});

describe('AC3 ながい じょうろ の 向き', () => {
  const cases: Array<[string, number, number, number, number]> = [
    ['東 から 30° 北', Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6), 1, 0],
    ['西', -1, 0, -1, 0],
    ['南 から 20° 西', -Math.sin((20 * Math.PI) / 180), Math.cos((20 * Math.PI) / 180), 0, 1],
    ['北', 0, -1, 0, -1],
    ['ちょうど 北東 45°', Math.SQRT1_2, -Math.SQRT1_2, 1, 0],
  ];
  for (const [name, dx, dz, ox, oz] of cases)
    it(name, () => {
      const m = make();
      m.field(10, 10, 12, 12);
      expect(m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'long_watering_can', dx, dz)).toBe(2);
      let wet = 0;
      for (let z = 10; z <= 12; z++) for (let x = 10; x <= 12; x++) if (wetAt(m, x, z)) wet++;
      expect(wet).toBe(2);
      expect(wetAt(m, 11, 11)).toBe(true);
      expect(wetAt(m, 11 + ox, 11 + oz)).toBe(true);
    });
  it('むこう が y+1・y-1 の はたけ なら しめる。y+2・くさ なら 1 こ だけ', () => {
    for (const [dy, tiles] of [[1, 2], [-1, 2], [2, 1]] as const) {
      const m = make();
      m.field(11, 11, 11, 11);
      m.world.setBlock(12, 8 + dy - 1 >= 7 ? 8 + dy - 1 : 7, 11, 'dirt');
      m.world.setBlock(12, 8 + dy, 11, 'dirt');
      m.world.setBlock(12, 9 + dy, 11, 'air');
      m.farm.till(12, 8 + dy, 11);
      expect(m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'long_watering_can', 1, 0)).toBe(tiles);
    }
    const m = make();
    m.field(11, 11, 11, 11);
    expect(m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'long_watering_can', 1, 0)).toBe(1);
  });
});

describe('AC6 しめる 時間・もう 1 回 まく', () => {
  it('1 にち しめって 91,800+60 以内 に かわく。50,000 で まきなおす と 戻る', () => {
    const m = make();
    m.field(10, 10, 10, 10);
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    m.step(DAY - 1);
    expect(wetAt(m, 10, 10)).toBe(true);
    m.step(61);
    expect(wetAt(m, 10, 10)).toBe(false);

    const n = make();
    n.field(10, 10, 10, 10);
    n.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    n.step(50000);
    expect(n.farm.soil(10, 8, 10)!.canLeft).toBe(DAY - 50000);
    n.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    expect(n.farm.soil(10, 8, 10)!.canLeft).toBe(DAY);
    n.step(DAY - 1);
    expect(wetAt(n, 10, 10)).toBe(true);
    n.step(61);
    expect(wetAt(n, 10, 10)).toBe(false);
  });
});

describe('たがやしなおした はたけ は まえ の じょうろ を おぼえていない', () => {
  it('まいた はたけ を こわさずに 石 で うめ、すぐ たがやしなおすと かわいた まま', () => {
    const m = make();
    m.field(10, 10, 12, 10);
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    expect(wetAt(m, 10, 10)).toBe(true);
    // world.fill など 掘らずに ブロック が かわる（しめり の 見直し が まだ 来ない うち）
    m.world.fill(10, 8, 10, 12, 8, 10, 'dirt');
    for (let x = 10; x <= 12; x++) expect(m.farm.till(x, 8, 10)).toBe(true);
    expect(m.farm.soil(10, 8, 10)!.canLeft).toBe(0);
    m.step(120);
    expect(wetAt(m, 10, 10)).toBe(false);
  });
});

describe('AC7 しめり と そだつ・① ③ は ② が おわっても', () => {
  it('② の 作物 は wet。おわると false', () => {
    const m = make();
    m.settings.farmWaterDays = 0.01; // 918 ステップ
    m.field(10, 10, 10, 10);
    m.farm.plant(10, 8, 10, 'tomato');
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    expect(m.farm.crop(10, 9, 10)!.wet).toBe(true);
    m.step(918 + 61);
    expect(m.farm.crop(10, 9, 10)!.wet).toBe(false);
  });
  it('① の はんい は ② が おわっても しめった まま', () => {
    const m = make();
    m.settings.farmWaterDays = 0.01;
    m.world.setBlock(9, 8, 10, 'water');
    m.field(10, 10, 10, 10);
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    m.step(2000);
    expect(wetAt(m, 10, 10)).toBe(true);
  });
  it('③ の はんい も 同じ', () => {
    const m = make({ sprinklers: [{ x: 10, y: 9, z: 10 }] });
    m.settings.farmWaterDays = 0.01;
    m.field(11, 11, 11, 11);
    m.farm.pourAt({ x: 11, y: 8, z: 11 }, 'watering_can', 1, 0);
    m.step(2000);
    expect(wetAt(m, 11, 11)).toBe(true);
    expect(m.farm.soil(11, 8, 11)!.sprinkler).toBe(true);
  });
  it('スプリンクラー の はんい の はたけ は 60 ステップ 以内 に しめる。外 は かわく', () => {
    const m = make({ sprinklers: [{ x: 15, y: 9, z: 15 }] });
    m.field(10, 10, 20, 20);
    m.step(61);
    for (let z = 10; z <= 20; z++)
      for (let x = 10; x <= 20; x++) expect(wetAt(m, x, z)).toBe(Math.abs(x - 15) <= 2 && Math.abs(z - 15) <= 2);
  });
  it('onBlockChanged: 口 へ 伝え、出来事 を 出す', () => {
    const m = make();
    m.farm.onBlockChanged(3, 8, 3, 'air', 'sprinkler');
    m.farm.onBlockChanged(3, 8, 3, 'sprinkler', 'air');
    const types = m.farm.peekEvents().map((e) => e.type);
    expect(types).toEqual(['sprinklerPlaced', 'sprinklerBroken']);
    expect(m.spr.calls).toEqual(['3,8,3:air>sprinkler', '3,8,3:sprinkler>air']);
  });
});

describe('AC17 もうすぐ かわく', () => {
  it('② だけ で のこり ≤ 22,950 の とき true', () => {
    const m = make();
    m.field(10, 10, 10, 10);
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    expect(m.farm.aim(10, 8, 10)!.wetSoon).toBe(false);
    m.step(DAY - 22951);
    expect(m.farm.soil(10, 8, 10)!.canLeft).toBe(22951);
    expect(m.farm.aim(10, 8, 10)!.wetSoon).toBe(false);
    m.step(1);
    expect(m.farm.aim(10, 8, 10)!.wetSoon).toBe(true);
  });
  it('みず の そば・スプリンクラー の はんい では false。作物 を ねらっても 下 の はたけ で 決まる', () => {
    const m = make({ sprinklers: [{ x: 20, y: 9, z: 20 }] });
    m.field(10, 10, 10, 10);
    m.field(19, 19, 19, 19);
    m.farm.plant(10, 8, 10, 'tomato');
    m.farm.pourAt({ x: 10, y: 8, z: 10 }, 'watering_can', 1, 0);
    m.farm.pourAt({ x: 19, y: 8, z: 19 }, 'watering_can', 1, 0);
    m.step(DAY - 100);
    expect(m.farm.aim(10, 9, 10)!.wetSoon).toBe(true);
    expect(m.farm.aim(19, 8, 19)!.wetSoon).toBe(false);
  });
  it('ごきげん の 作物 は happy', () => {
    const m = make();
    m.field(10, 10, 10, 10);
    m.farm.plant(10, 8, 10, 'tomato');
    expect(m.farm.aim(10, 9, 10)!.happy).toBe(false);
    expect(m.farm.petCrop(10, 9, 10)).toBe('happy');
    expect(m.farm.aim(10, 9, 10)!.happy).toBe(true);
    expect(m.farm.crop(10, 9, 10)).toMatchObject({ happy: true, happyLeft: DAY });
    expect(m.farm.peekEvents().filter((e) => e.type === 'pet')).toHaveLength(1);
    m.farm.harvest(10, 9, 10); // まだ 実っていない
    m.farm.setStage(10, 9, 10, 3);
    const r = m.farm.harvest(10, 9, 10);
    expect(r.ok && (r as { happy?: boolean }).happy).toBe(true);
    expect((m.farm.peekEvents().find((e) => e.type === 'harvest') as unknown as { happy?: boolean }).happy).toBe(true);
    expect(m.pet.map.size).toBe(0);
  });
});

describe('AC13 ごきげん の ボーナス', () => {
  it('ずっと ごきげん は T ÷ 1.1・比 0.86〜0.96・ばらつき・再現', () => {
    const { farm } = make();
    const stats = (a: number[]) => {
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length);
      return { mean, sd, max: Math.max(...a) };
    };
    for (const kind of ['onion', 'tomato', 'pumpkin', 'eggplant'] as const)
      for (const wet of [false, true])
        for (let seed = 1; seed <= 5; seed++) {
          const T = farm.growTicks(kind, wet);
          const h = stats(farm.simulateGrowth(kind, wet, 2000, seed, true));
          const n = stats(farm.simulateGrowth(kind, wet, 2000, seed));
          expect(Math.abs(h.mean / (T / 1.1) - 1)).toBeLessThan(0.05);
          expect(h.mean / n.mean).toBeGreaterThan(0.86);
          expect(h.mean / n.mean).toBeLessThan(0.96);
          expect(h.sd / h.mean).toBeGreaterThan(0.45);
          expect(h.sd / h.mean).toBeLessThan(0.57);
          expect(h.max).toBeLessThanOrEqual((3.2 * T) / 1.1);
        }
    expect(farm.simulateGrowth('tomato', false, 50, 3, true)).toEqual(farm.simulateGrowth('tomato', false, 50, 3, true));
  });
  it('update でも ごきげん の 作物 は はやい', () => {
    const grow = (happy: boolean) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const m = make({ seed });
        m.world.setBlock(9, 8, 10, 'water');
        m.field(10, 10, 10, 10);
        m.farm.plant(10, 8, 10, 'tomato');
        if (happy) m.pet.map.set('10,9,10', 1e9);
        let t = 0;
        while (m.farm.crop(10, 9, 10)!.stage < 1 && t < 200000) {
          m.step();
          t++;
        }
        total += t;
      }
      return total;
    };
    expect(grow(true)).toBeLessThan(grow(false));
  });
});

describe('AC22 保存', () => {
  it('じょうろ・ごきげん・スプリンクラー が 同じ に 戻り、同じ 入力 で 同じ に 進む', () => {
    const m = make({ sprinklers: [{ x: 3, y: 9, z: 3 }, { x: 25, y: 9, z: 25 }] });
    m.world.setBlock(20, 7, 20, 'water');
    m.field(10, 10, 19, 10);
    for (let i = 0; i < 10; i++) {
      m.farm.pourAt({ x: 10 + i, y: 8, z: 10 }, 'watering_can', 1, 0);
      m.step(7 * i + 1);
    }
    for (let i = 0; i < 5; i++) {
      m.farm.plant(10 + i, 8, 10, 'tomato');
      m.farm.petCrop(10 + i, 9, 10);
    }
    m.step(100);
    const data = JSON.parse(JSON.stringify(m.farm.serialize()));
    expect(data.v).toBe(2);
    expect(data.watered.length).toBe(40);
    expect(data.happy.length).toBe(20);

    const r = make({ sprinklers: [{ x: 3, y: 9, z: 3 }, { x: 25, y: 9, z: 25 }] });
    r.world.setBlock(20, 7, 20, 'water');
    for (let x = 10; x <= 19; x++) r.world.setBlock(x, 8, 10, m.world.getBlock(x, 8, 10) as BlockId);
    for (let i = 0; i < 5; i++) r.world.setBlock(10 + i, 9, 10, m.world.getBlock(10 + i, 9, 10) as BlockId);
    r.farm.deserialize(data);
    r.state.tick = m.state.tick;
    for (let x = 10; x <= 19; x++) {
      expect(r.farm.soil(x, 8, 10)!.canLeft).toBe(m.farm.soil(x, 8, 10)!.canLeft);
      expect(r.farm.soil(x, 8, 10)!.wet).toBe(m.farm.soil(x, 8, 10)!.wet);
    }
    for (let i = 0; i < 5; i++) expect(r.farm.crop(10 + i, 9, 10)).toMatchObject({ happy: true, happyLeft: m.farm.crop(10 + i, 9, 10)!.happyLeft });
    expect(r.farm.sprinklers()).toEqual(m.farm.sprinklers());
    expect(r.spr.calls).toContain('rescan');
    // 同じ 乱数 と 時間 で 進める
    m.step(1000);
    r.step(1000);
    expect(r.farm.crops()).toEqual(m.farm.crops());
    for (let x = 10; x <= 19; x++) expect(r.farm.soil(x, 8, 10)).toEqual(m.farm.soil(x, 8, 10));
  });
  it('v:1 の 保存 は 読める（watered・happy は 空）', () => {
    const m = make();
    m.field(10, 10, 10, 10);
    m.farm.plant(10, 8, 10, 'onion');
    const v1 = { v: 1, placed: true, rng: 5, kakashi: null, crops: [10, 9, 10, 0, 33] };
    const r = make();
    r.world.setBlock(10, 8, 10, 'farmland');
    r.world.setBlock(10, 9, 10, m.world.getBlock(10, 9, 10) as BlockId);
    expect(() => r.farm.deserialize(v1)).not.toThrow();
    expect(r.farm.crop(10, 9, 10)).toMatchObject({ kind: 'onion', stageTicks: 33, happy: false });
    expect(r.farm.soil(10, 8, 10)!.canLeft).toBe(0);
  });
  it('おかしい 行 は 飛ばす', () => {
    const r = make();
    r.world.setBlock(10, 8, 10, 'farmland');
    r.farm.deserialize({ v: 2, placed: true, rng: 1, kakashi: null, crops: [], watered: [10, 8, 10, 500, 11, 8, 10, 500, 10, 8, 10, 0, 1, 'x', 3, 4, 10, 8], happy: [] });
    expect(r.farm.soil(10, 8, 10)!.canLeft).toBe(500);
    expect(r.farm.soil(11, 8, 10)).toBeNull();
  });
});

describe('AC23 保存 の 大きさ', () => {
  it('作物 480・ぜんぶ ②・ぜんぶ ごきげん・スプリンクラー 20 で farm が 32,000 文字 以下', () => {
    const sp: Vec3[] = [];
    for (let i = 0; i < 20; i++) sp.push({ x: i, y: 12, z: 1 });
    const m = make({ sprinklers: sp });
    m.field(0, 4, 29, 19);
    expect(m.farm.crops()).toHaveLength(0);
    for (let z = 4; z <= 19; z++) for (let x = 0; x < 30; x++) m.farm.plant(x, 8, z, 'tomato');
    expect(m.farm.crops()).toHaveLength(480);
    for (let z = 4; z <= 19; z++)
      for (let x = 0; x < 30; x++) {
        m.farm.pourAt({ x, y: 8, z }, 'watering_can', 1, 0);
        m.farm.petCrop(x, 9, z);
      }
    m.step(12345);
    const text = JSON.stringify(m.farm.serialize());
    expect(text.length).toBeLessThanOrEqual(32000);
  });
  it('農業 の 計算 は 1 ステップ 0.4 ミリ秒 以下（中央値）', () => {
    const m = make({ sprinklers: [{ x: 5, y: 12, z: 5 }] });
    m.field(0, 4, 29, 19);
    for (let z = 4; z <= 19; z++) for (let x = 0; x < 30; x++) m.farm.plant(x, 8, z, 'tomato');
    for (let z = 4; z <= 19; z++) for (let x = 0; x < 30; x++) m.farm.pourAt({ x, y: 8, z }, 'watering_can', 1, 0);
    m.step(300);
    const t: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      m.step();
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    expect(t[30]!).toBeLessThan(0.4);
  });
});

describe('AC1 ねらいの 線（computeWaterRay）', () => {
  const build = () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    w.fill(0, 0, 0, 31, 6, 31, 'dirt');
    w.fill(0, 7, 0, 31, 7, 31, 'grass');
    return w;
  };
  it('4 マス先 の みず を 通る。6 マス先 は とどかない', () => {
    const w = build();
    w.setBlock(14, 7, 10, 'water');
    const r = computeWaterRay(w, 10.5, 8.5, 10.5, 1, 0, 0, 5);
    // 目 の 高さ 8.5 の まま 横 → みず は y=7 なので 通らない
    expect(r.throughWater).toBe(false);
    w.setBlock(14, 8, 10, 'water');
    expect(computeWaterRay(w, 10.5, 8.5, 10.5, 1, 0, 0, 5)).toMatchObject({ throughWater: true, waterCell: { x: 14, y: 8, z: 10 } });
    const f = build();
    f.setBlock(16, 8, 10, 'water');
    expect(computeWaterRay(f, 10.5, 8.5, 10.5, 1, 0, 0, 5).throughWater).toBe(false);
  });
  it('固い ブロック に 当たる より 先 の みず だけ。目 の マス の みず は 数えない', () => {
    const w = build();
    w.setBlock(12, 8, 10, 'stone');
    w.setBlock(13, 8, 10, 'water');
    expect(computeWaterRay(w, 10.5, 8.5, 10.5, 1, 0, 0, 5)).toMatchObject({ throughWater: false, hit: { x: 12, y: 8, z: 10 } });
    const e = build();
    e.setBlock(10, 8, 10, 'water');
    expect(computeWaterRay(e, 10.5, 8.5, 10.5, 1, 0, 0, 5).throughWater).toBe(false);
    e.setBlock(11, 8, 10, 'water');
    expect(computeWaterRay(e, 10.5, 8.5, 10.5, 1, 0, 0, 5).throughWater).toBe(true);
  });
});

describe('WateringPort', () => {
  const setup = (slot: ItemStack | null) => {
    const m = make();
    m.field(10, 10, 12, 12);
    const slots: Array<ItemStack | null> = [slot];
    const port = createWatering({
      farm: m.farm,
      inventory: { slots: () => slots, setSlot: (i, s) => void (slots[i] = s) },
      settings: m.settings,
      tick: () => m.state.tick,
    });
    return { m, slots, port };
  };
  const water = (n: number, item: 'watering_can' | 'long_watering_can' = 'watering_can'): ItemStack => ({ item, count: 1, ...(n > 0 ? { water: n } : {}) });
  it('canPreview: 4a > 4b > 4c', () => {
    const { port } = setup(null);
    const ray = (through: boolean, hit: boolean) => ({ throughWater: through, waterCell: through ? { x: 1, y: 1, z: 1 } : null, hit: hit ? { x: 2, y: 2, z: 2 } : null });
    expect(port.canPreview(null, ray(true, true), false)).toBeNull();
    expect(port.canPreview({ item: 'katana', count: 1 }, ray(true, true), false)).toBeNull();
    expect(port.canPreview(water(5), ray(true, true), false)).toBe('fill');
    expect(port.canPreview(water(5), ray(true, true), true)).toBeNull();
    expect(port.canPreview(water(5), ray(false, true), false)).toBe('pour');
    expect(port.canPreview(water(5), ray(false, true), true)).toBe('pour');
    expect(port.canPreview(water(5), ray(false, false), false)).toBeNull();
    expect(port.canPreview(water(0), ray(false, true), false)).toBe('fillHint');
    expect(port.canPreview(water(0), ray(false, false), false)).toBe('fillHint');
    expect(port.canPreview(water(0), ray(false, true), true)).toBeNull();
  });
  it('fill: まんたん（10 / 20）。もう 1 回 でも 変わらない', () => {
    const { port, slots, m } = setup(water(0));
    expect(port.fill(0, { x: 1, y: 1, z: 1 })).toBe(10);
    expect(slots[0]).toEqual({ item: 'watering_can', count: 1, water: 10 });
    expect(port.fill(0, { x: 1, y: 1, z: 1 })).toBe(10);
    expect(m.farm.peekEvents().filter((e) => e.type === 'fill')).toHaveLength(2);
    const l = setup(water(3, 'long_watering_can'));
    expect(l.port.fill(0, { x: 1, y: 1, z: 1 })).toBe(20);
  });
  it('pour: 1 へる・tiles。はたけ 0 なら へらない', () => {
    const { port, slots, m } = setup(water(5));
    expect(port.pour(0, { x: 11, y: 8, z: 11 }, { dx: 1, dz: 0 })).toBe(1);
    expect(slots[0]!.water).toBe(4);
    expect(port.pour(0, { x: 5, y: 7, z: 5 }, { dx: 1, dz: 0 })).toBe(0);
    expect(slots[0]!.water).toBe(4);
    const ev = m.farm.peekEvents().filter((e): e is Extract<FarmEvent, { type: 'pour' }> => e.type === 'pour');
    expect(ev.map((e) => e.tiles)).toEqual([1, 0]);
    // 空
    const e = setup(water(0));
    expect(e.port.pour(0, { x: 11, y: 8, z: 11 }, { dx: 1, dz: 0 })).toBe(0);
    // ながい: 2 マス で 1 へる
    const l = setup(water(20, 'long_watering_can'));
    expect(l.port.pour(0, { x: 11, y: 8, z: 11 }, { dx: 1, dz: 0 })).toBe(2);
    expect(l.slots[0]!.water).toBe(19);
  });
});

describe('AC8 みず を 運ぶ・読む', () => {
  it('copyStack・readWater・永久（permanent）', () => {
    expect(copyStack({ item: 'watering_can', count: 1, water: 7 })).toEqual({ item: 'watering_can', count: 1, water: 7 });
    expect(copyStack({ item: 'watering_can', count: 1, water: 0 })).toEqual({ item: 'watering_can', count: 1 });
    expect(readWater(12, 'watering_can')).toBe(10);
    expect(readWater(-3, 'watering_can')).toBe(0);
    expect(readWater('x', 'watering_can')).toBe(0);
    expect(readWater(25, 'long_watering_can')).toBe(20);
    expect(readWater(7.9, 'watering_can')).toBe(7);
    expect(readWater(5, 'katana')).toBe(0);
    expect(canCapacity('long_watering_can')).toBe(20);
    expect(itemClassOf('watering_can')).toBe('permanent');
    expect(itemClassOf('long_watering_can')).toBe('permanent');
  });
});

// 持ち物・たんす・落とし物 の 通し は、B が アイテム 3 こ の 行 を 足した あと で 動く（足す前は 飛ばす）
const hasCan = itemType('watering_can') !== undefined;
describe.skipIf(!hasCan)('AC8 持ち物・たんす・落とし物', () => {
  it('持ち物: 動かす・シフト・保存', async () => {
    const { InventoryImpl } = await import('../inventory/Inventory');
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'watering_can', count: 1, water: 7 });
    inv.click(0);
    inv.click(12);
    expect(inv.slots()[12]).toEqual({ item: 'watering_can', count: 1, water: 7 });
    expect(inv.shiftMove(12)).toBe(1);
    expect(inv.slots()[0]).toEqual({ item: 'watering_can', count: 1, water: 7 });
    expect(inv.takeFromSlot(0, true)).toEqual({ item: 'watering_can', count: 1, water: 7 });
    inv.setSlot(1, { item: 'long_watering_can', count: 1, water: 25 });
    expect(inv.slots()[1]!.water).toBe(20);
    inv.setSlot(2, { item: 'watering_can', count: 1, water: 7 });
    const saved = JSON.parse(JSON.stringify(inv.serialize()));
    const inv2 = new InventoryImpl();
    inv2.deserialize(saved);
    expect(inv2.slots()[2]).toEqual({ item: 'watering_can', count: 1, water: 7 });
    saved.slots[2].water = 12;
    saved.slots[1].water = 'x';
    inv2.deserialize(saved);
    expect(inv2.slots()[2]!.water).toBe(10);
    expect(inv2.slots()[1]!.water).toBeUndefined();
  });
});

describe('waterFx（しずく）', () => {
  it('1 マス 3 こ・20 ステップ で 消える・上限', () => {
    const f = new WaterDropModel();
    f.spawn([{ x: 1, y: 8, z: 1 }]);
    expect(f.count()).toBe(3);
    for (let i = 0; i < DROP_LIFE; i++) f.tick();
    expect(f.count()).toBe(0);
    f.spawn([{ x: 1, y: 8, z: 1 }, { x: 2, y: 8, z: 1 }]);
    expect(f.count()).toBe(6);
    for (let i = 0; i < 10; i++) f.spawn([{ x: 1, y: 8, z: 1 }, { x: 2, y: 8, z: 1 }]);
    expect(f.count()).toBeLessThanOrEqual(DROP_POOL);
  });
  it('落ちる: 上 1 マス から はたけ の 上の面 へ', () => {
    const f = new WaterDropModel();
    f.spawn([{ x: 1, y: 8, z: 1 }]);
    const v = { x: 0, y: 0, z: 0, age: 0 };
    expect(f.read(0, v)).toBe(true);
    expect(v.y).toBeCloseTo(10, 5);
    for (let i = 0; i < 19; i++) f.tick();
    f.read(0, v);
    expect(v.y).toBeLessThan(9.1);
    expect(v.y).toBeGreaterThanOrEqual(9);
  });
  it('描画 は 箱 1 つ の InstancedMesh', () => {
    const fx = new WaterDropFx();
    fx.pour([{ x: 1, y: 8, z: 1 }]);
    fx.step();
    expect(fx.particles()).toHaveLength(3);
    expect(fx.mesh.count).toBe(DROP_POOL);
    fx.dispose();
  });
  it('かたむき', () => {
    expect(wateringTiltDeg('pour', 0)).toBe(35);
    expect(wateringTiltDeg('fill', 0)).toBe(20);
    expect(wateringTiltDeg('pour', 20)).toBe(0);
    expect(wateringTiltDeg('pour', 10)).toBeCloseTo(17.5);
  });
});
