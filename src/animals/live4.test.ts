import { describe, expect, it } from 'vitest';
import type { DayPhase, ItemId, Vec3 } from '../contracts';
import { createLiveSettings, W2_SETTING_DEFAULTS } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks } from './coop';

/**
 * LIVE-4 A（docs/design/LIVE-4.md 版 2 §2.1・§4.1・§4.3・AC1・AC16・AC17）: たたかえる マッチョ・設定 6 こ・保存 は v 4 の まま。
 * 窓口 `fighters()`・`list()` の `target`/`hits` は まだ 無い ので `any` で 読む（実装 の あと 型 が 付く）。
 * 世界 は ArrayVoxelWorld（床 y=8）。
 */
const SIZE = 60;

function setup() {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const player = { position: { x: 30.5, y: 9, z: 36.5 } as Vec3 };
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: 7,
      settings,
      dropEgg: () => {},
      addItem: (_it: ItemId) => true,
      day: () => 0,
      phase: () => 'day' as DayPhase,
      countryAt: () => ({ kind: 'harappa' }),
      placeCoopBlocks: (x: number, y: number, z: number, dir: 0 | 1 | 2 | 3) => {
        for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, b.block);
        return true;
      },
      removeCoopBlocks: () => {},
      dropItem: () => {},
    },
  });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const fighters = (): number[] => (m as any).fighters();
  const macho = (dx: number, o: Record<string, unknown> = {}) => m.spawn(30.5 + dx, 9, 34.5, { friend: true, follow: 100, stage: 'adult', breed: 'macho', ...o } as any)!;
  return { m, settings, step, fighters, macho, player };
}

describe('LIVE-4 設定（§4.1）', () => {
  it('machoAtk 2・machoReach 1.2・machoRunSpeed 5.0・machoLeash 12・machoForget 600・machoFighters 1。machoAtkTicks は 無い（版 2 で 消えた）', () => {
    const s = createLiveSettings() as any;
    expect([s.machoAtk, s.machoReach, s.machoRunSpeed, s.machoLeash, s.machoForget, s.machoFighters]).toEqual([2, 1.2, 5.0, 12, 600, 1]);
    expect('machoAtkTicks' in s).toBe(false);
  });
});

describe('AC1 たたかう マッチョ（fighters）', () => {
  it('(a) 大人 マッチョ なかま follow 100 だけ。(b) follow 0・(c) ひよこ・(d) ふつう の 大人・(e) とりごや の 子 は 入らない', () => {
    const s = setup();
    const b = s.macho(-4, { follow: 0 });
    const c = s.macho(-3, { stage: 'chick' });
    const d = s.macho(-2, { breed: 'normal' });
    const a = s.macho(0);
    s.step(5);
    expect(typeof (s.m as any).fighters, '窓口 fighters()').toBe('function');
    expect(s.fighters()).toEqual([a]);
    void [b, c, d];
    // (e) とりごや の 子（home）: 小屋 を 置いて その 子 に する
    const id = s.m.placeCoop(10, 9, 10, 0);
    expect(typeof id).toBe('number');
    const coop = s.m.coops().find((x) => x.id === id)!;
    const kid = s.m.spawn(coop.x + 0.5, 9, coop.z + 0.5, { friend: true, home: coop.id, stage: 'adult', breed: 'macho', follow: 100 } as any)!;
    s.step(5);
    expect(s.fighters()).toEqual([a]);
    expect(s.fighters()).not.toContain(kid);
  });

  it('同じ 子 が 3 わ → なかま に なった 順 の いちばん 早い 1 わ だけ。その 子 が たたかえなく なる（follow 0）と 次 の ステップ から 2 番目', () => {
    const s = setup();
    const a = s.macho(-1, { follow: 4 });
    const b = s.macho(0);
    const c = s.macho(1);
    s.step(1);
    expect(s.fighters(), 'いちばん 早い 1 わ').toEqual([a]);
    s.step(10);
    expect(s.m.list().find((x) => x.id === a)!.follow, 'a は follow 0').toBe(0);
    expect(s.fighters(), '次 に 早い 1 わ').toEqual([b]);
    void c;
  });

  it('machoFighters を 2 に すると 2 わ（設定 を 読んで いる）', () => {
    const s = setup();
    const a = s.macho(-1);
    const b = s.macho(0);
    s.macho(1);
    (s.settings as any).machoFighters = 2;
    s.step(2);
    expect(s.fighters()).toEqual([a, b]);
  });
});

describe('AC1 追加・AC13 ユニット', () => {
  it('machoFighters 0 → fighters() は 空', () => {
    const s = setup();
    s.macho(0);
    s.macho(1);
    (s.settings as any).machoFighters = 0;
    s.step(3);
    expect(s.fighters()).toEqual([]);
  });

  it('AC1 だっこ → fighters は 空（1 わ だけ の とき）。3 わ の いちばん 早い 子 を だっこ → 次 の ステップ に 2 番目', () => {
    const one = setup();
    const only = one.macho(0);
    one.step(3);
    expect(one.fighters()).toEqual([only]);
    expect(one.m.carryHold(only, 40)).toBe('lifted');
    one.step(1);
    expect(one.fighters(), 'だっこ 中 は たたかわない').toEqual([]);
    const s = setup();
    const ids = [s.macho(-2), s.macho(0), s.macho(2)];
    s.step(3);
    expect(s.fighters()).toEqual([ids[0]]);
    expect(s.m.carryHold(ids[0]!, 40)).toBe('lifted');
    s.step(1);
    expect(s.fighters(), '次 の ステップ に 2 番目').toEqual([ids[1]]);
  });

  it('(g) いただきます 中 の とりごや の 子 は たたかわない（fighters に 入らない）', () => {
    const s = setup();
    const a = s.macho(-2);
    const id = s.m.placeCoop(10, 9, 10, 0) as number;
    const coop = s.m.coops().find((x) => x.id === id)!;
    const kid = s.m.spawn(coop.x + 0.5, 9, coop.z + 0.5, { friend: true, home: coop.id, stage: 'adult', raised: true, breed: 'macho', follow: 100 } as never)!;
    s.step(5);
    const r = s.m.meat(coop.id, kid);
    expect(r.ok).toBe(true);
    s.step(20);
    expect(s.fighters()).toEqual([a]);
  });

  it('AC13: マッチョ は 体力 を もたない（list の 行 に hp が 無い）・妖怪 の 的 に なる 窓口 が 無い', () => {
    const s = setup();
    const a = s.macho(0);
    const row = s.m.list().find((x) => x.id === a) as unknown as Record<string, unknown>;
    expect('hp' in row).toBe(false);
    expect('maxHp' in row).toBe(false);
  });
});

describe('AC17 保存（§4.3）', () => {
  it('animals は v 4 の まま・新しい 項目 なし（target・hits・punch を 保存 しない）。〔SAVE_GEN の 固定は MINE-1A で 外した〕', () => {
    const s = setup();
    s.macho(0, { follow: 5000 });
    s.step(3);
    const sv = s.m.serialize() as any;
    expect(sv.v).toBe(4);
    const row = (sv.friends ?? [])[0];
    expect(row, '保存 の なかま').toBeTruthy();
    for (const k of ['target', 'hits', 'punch', 'macho', 'fight']) expect(k in row, k).toBe(false);
    expect(Object.keys(sv).sort()).toEqual(['coops', 'friends', 'kits', 'machoMiss', 'v']);
  });
});

describe('AC16 妖怪 の 数 に さわらない（設定 の 値）', () => {
  it('bladeTech・bladeDamageMul・bladeKnock の 今 の 数 を 固定（マッチョ は これ を 読む だけ）', () => {
    expect(W2_SETTING_DEFAULTS.bladeTech.thrust).toEqual({ startup: 4, active: 2, recovery: 35 });
    expect(W2_SETTING_DEFAULTS.bladeTech.kiriage).toEqual({ startup: 19, active: 3, recovery: 30 });
    expect(W2_SETTING_DEFAULTS.bladeDamageMul).toEqual({ thrust: 0.75, kiriage: 1.15, kesa: 2.5 });
    expect(W2_SETTING_DEFAULTS.bladeKnock).toEqual({ thrust: [0.8, 0], kesa: [6, 3], kiriage: [1.0, 7] });
  });
});
