import { describe, expect, it } from 'vitest';
import type { AnimalEvent, DayPhase, ItemId, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks } from './coop';

/**
 * LIVE-3 A: えらべる 子・いただきます の 演出（docs/design/LIVE-3.md §2.1・§2.4・§4.4・§5・AC1・AC6・AC8〜AC10・AC18）。
 * 世界は ArrayVoxelWorld（床 y=8）。数え方: `meat()` を 呼んだ 直後 = 0 ステップ目、`step(n)` の あと = n ステップ目。
 */
const SIZE = 100;

function setup(opts: { full?: boolean } = {}) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const st = { day: 0, phase: 'day' as DayPhase, full: opts.full === true };
  const player = { position: { x: 50.5, y: 9, z: 56.5 } as Vec3 };
  const bag: ItemId[] = [];
  const dropped: { at: Vec3; item: ItemId }[] = [];
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: 7,
      settings,
      dropEgg: () => {},
      addItem: (it) => {
        bag.push(it);
        return true;
      },
      tryAddItem: (it) => {
        if (st.full) return false;
        bag.push(it);
        return true;
      },
      day: () => st.day,
      phase: () => st.phase,
      countryAt: () => ({ kind: 'harappa' }),
      placeCoopBlocks: (x, y, z, dir) => {
        for (const b of coopBlocks(x, y, z, dir)) world.setBlock(b.x, b.y, b.z, b.block);
        return true;
      },
      removeCoopBlocks: () => {},
      dropItem: (at, item) => dropped.push({ at: { ...at }, item }),
    },
  });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const ev = <T extends AnimalEvent['type']>(type: T) => m.events().filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === type);
  const one = (id: number) => m.list().find((a) => a.id === id) ?? null;
  const coop = (x = 50, z = 50) => {
    const id = m.placeCoop(x, 9, z, 0);
    if (typeof id !== 'number') throw new Error('置けない');
    return m.coops().find((c) => c.id === id)!;
  };
  const kid = (c: { id: number; x: number; z: number }, o: Record<string, unknown> = {}, dx = 0, dz = 0) =>
    m.spawn(c.x + 0.5 + dx, 9, c.z + 0.5 + dz, { friend: true, home: c.id, stage: 'adult', raised: true, ...o })!;
  return { m, world, st, player, bag, dropped, settings, step, ev, one, coop, kid };
}

describe('LIVE-3 設定（§4.1）', () => {
  it('meatPerBird 2・meatHeal 10・meatTicks 220', () => {
    const s = createLiveSettings();
    expect([s.meatPerBird, s.meatHeal, s.meatTicks]).toEqual([2, 10, 220]);
  });
});

describe('AC1 えらべる 子（meatList）', () => {
  it('raised の 大人（ふつう・マッチョ）だけ。野原の 大人・ひよこ・だっこ中・演出中・べつの 小屋 は 入らない', () => {
    const s = setup();
    const c = s.coop(50, 50);
    const a = s.kid(c, {}, -1, -1);
    const b = s.kid(c, { breed: 'macho' }, 0, -1);
    const cc = s.kid(c, { raised: false }, 1, -1);
    const d = s.kid(c, { stage: 'chick', raised: false }, -1, 1);
    const e = s.kid(c, {}, 0, 1);
    const f = s.kid(c, {}, 1, 1);
    const c2 = s.coop(70, 50);
    const other = s.kid(c2);
    const sort = (x: number[]) => x.slice().sort((p, q) => p - q);
    expect(sort(s.m.meatList(c.id))).toEqual(sort([a, b, e, f]));
    expect(s.m.meatList(c2.id)).toEqual([other]);
    expect(s.m.meatList(999)).toEqual([]);
    // だっこ中
    s.player.position.x = c.x + 0.5 - 1.5;
    s.player.position.z = c.z + 0.5 + 1;
    expect(s.m.carryHold(e, 40)).toBe('lifted');
    expect(sort(s.m.meatList(c.id))).toEqual(sort([a, b, f]));
    // 演出中
    expect(s.m.meat(c.id, f)).toEqual({ ok: true, reason: null });
    expect(sort(s.m.meatList(c.id))).toEqual(sort([a, b]));
    expect(s.one(f)!.state).toBe('meat');
    // 理由: 食べられない 子 が 先（演出 中 でも notEligible）・同じ 小屋 の 2 わ目 は busy
    expect(s.m.meat(c.id, cc)).toEqual({ ok: false, reason: 'notEligible' });
    expect(s.m.meat(c.id, d)).toEqual({ ok: false, reason: 'notEligible' });
    expect(s.m.meat(c.id, other)).toEqual({ ok: false, reason: 'notEligible' });
    expect(s.m.meat(c.id, e)).toEqual({ ok: false, reason: 'notEligible' }); // だっこ中
    expect(s.m.meat(c.id, a)).toEqual({ ok: false, reason: 'busy' });
    expect(s.m.coops().find((x) => x.id === c.id)!.meatBusy).toBe(f);
    expect(s.m.coops().find((x) => x.id === c2.id)!.meatBusy).toBeNull();
    expect(s.m.meat(c2.id, other)).toEqual({ ok: true, reason: null });
  });
});

describe('AC6 演出の 時計（meatTicks 220）', () => {
  it('0 meatStart・60 ねぐら の 中・60〜80 とびら・80 一言・199 まだ いる・200 消えて にく 2・220 とびら ひらく', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c, -1, -1);
    const other = kid(s, c, 1, 1);
    const door = () => s.m.coops()[0]!.door;
    const t0 = s.one(other)!;
    s.m.events();
    expect(s.m.meat(c.id, pick).ok).toBe(true);
    expect(s.ev('meatStart')).toEqual([{ type: 'meatStart', id: pick, coop: c.id }]);
    expect(door()).toBe('open');
    expect(s.m.meatSay()).toBeNull();
    s.step(50);
    expect(door()).toBe('open');
    s.step(10);
    const p = s.one(pick)!;
    expect(Math.abs(p.x - (c.x + 0.5)) < 1.5 && Math.abs(p.z - (c.z + 0.5)) < 1.5).toBe(true);
    expect(p.state).toBe('meat');
    s.step(10);
    expect(door()).toBe('moving');
    expect(s.m.coops()[0]!.doorT).toBeCloseTo(0.5, 5);
    expect(s.m.meatSay()).toBeNull();
    s.step(9);
    expect(s.m.meatSay()).toBeNull(); // 79
    expect(s.ev('meatSay')).toHaveLength(0);
    s.step(1); // 80
    expect(s.m.meatSay()).not.toBeNull();
    expect(s.ev('meatSay')).toEqual([{ type: 'meatSay', id: pick, coop: c.id }]);
    expect(door()).toBe('closed');
    expect(s.m.coops()[0]!.doorT).toBe(1);
    s.step(119); // 199
    expect(s.m.meatSay()).toBe(1);
    expect(s.one(pick)).not.toBeNull();
    expect(s.bag).toEqual([]);
    expect(s.m.coops()[0]!.kids).toContain(pick);
    expect(door()).toBe('closed');
    s.step(1); // 200
    expect(s.one(pick)).toBeNull();
    expect(s.m.coops()[0]!.kids).not.toContain(pick);
    expect(s.bag).toEqual(['momo_nama', 'momo_nama']);
    expect(s.ev('meat')).toEqual([{ type: 'meat', id: pick, coop: c.id, count: 2, dropped: 0 }]);
    s.step(10);
    expect(door()).toBe('moving');
    s.step(10); // 220
    expect(door()).toBe('open');
    expect(s.m.meatSay()).toBeNull();
    expect(s.m.coops()[0]!.meatBusy).toBeNull();
    // ほか の 子 は かわらない（AC18）
    const t1 = s.one(other)!;
    expect(t1.state).not.toBe('meat');
    expect(t1.bugs).toBe(t0.bugs);
    expect(t1.goldMiss).toBe(t0.goldMiss);
    expect(t1.grow).toBe(t0.grow);
    expect(t1.stage).toBe(t0.stage);
  });

  it('meatDoor の 出来事: 80 で closed・220 で open', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c);
    s.m.events();
    s.m.meat(c.id, pick);
    s.step(80);
    expect(s.ev('meatDoor')).toEqual([{ type: 'meatDoor', coop: c.id, closed: true }]);
    s.step(140);
    expect(s.ev('meatDoor')).toEqual([{ type: 'meatDoor', coop: c.id, closed: false }]);
  });

  it('演出 中 の 子 は ねらえない・なでる／むし／だっこ できない・小屋 は こわせない（子 として 数える）', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c);
    const other = kid(s, c, 1, 1);
    s.m.meat(c.id, pick);
    s.step(100);
    const p = s.one(pick)!;
    expect(s.m.rayHit({ x: p.x, y: p.y + 0.5, z: p.z - 3 }, { x: 0, y: 0, z: 1 }, 5)).toBeNull();
    expect(s.m.preview(pick, null)).toBeNull();
    expect(s.m.feed(pick, 'mushi')).toBeNull();
    expect(s.m.pet(pick)).toBeNull();
    expect(s.m.carryHold(pick, 40)).toBeNull();
    expect(s.m.breakCoop(c.id, true)).toBe('locked');
    s.step(120); // 220
    expect(s.one(other)).not.toBeNull();
    expect(s.m.breakCoop(c.id, true)).toBe('locked');
  });

  it('夜 に えらんだ 子 は おきて 歩く（ねている 子 は ねた まま）', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c, -1, -1);
    const other = kid(s, c, 1, 1);
    s.st.phase = 'night';
    s.step(5);
    expect(s.one(pick)!.state).toBe('sleep');
    s.m.meat(c.id, pick);
    s.step(10);
    expect(s.one(pick)!.state).toBe('meat');
    expect(s.one(other)!.state).toBe('sleep');
  });
});

describe('AC9 持ち物 いっぱい', () => {
  it('入らない 分 は プレイヤー の 足もと に おとしもの（meat の dropped）', () => {
    const s = setup({ full: true });
    const c = s.coop();
    const pick = kid(s, c);
    s.m.events();
    s.m.meat(c.id, pick);
    s.step(200);
    expect(s.bag).toEqual([]);
    expect(s.dropped.map((d) => d.item)).toEqual(['momo_nama', 'momo_nama']);
    for (const d of s.dropped) expect(Math.hypot(d.at.x - s.player.position.x, d.at.z - s.player.position.z)).toBeLessThan(1);
    expect(s.ev('meat')).toEqual([{ type: 'meat', id: pick, coop: c.id, count: 2, dropped: 2 }]);
  });
  it('meatPerBird を かえる と その 数', () => {
    const s = setup();
    s.settings.meatPerBird = 3;
    const c = s.coop();
    const pick = kid(s, c);
    s.m.meat(c.id, pick);
    s.step(200);
    expect(s.bag).toHaveLength(3);
  });
  it('meatTicks を かえる と 長さ が かわる（にく は meatTicks − 20）', () => {
    const s = setup();
    s.settings.meatTicks = 140;
    const c = s.coop();
    const pick = kid(s, c);
    s.m.meat(c.id, pick);
    s.step(119);
    expect(s.one(pick)).not.toBeNull();
    s.step(1);
    expect(s.one(pick)).toBeNull();
    s.step(20);
    expect(s.m.coops()[0]!.door).toBe('open');
  });
});

describe('AC10 保存・おわらせる（§4.4・§5）', () => {
  it('finishMeat: 演出 100 ステップ目 → 子 は いない・にく は 持ち物・とびら open・出来事 meat 1 つ。保存 は v 4 の まま・子 は 保存 に 出ない', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c, -1, -1);
    kid(s, c, 1, 1);
    s.m.events();
    s.m.meat(c.id, pick);
    s.step(100);
    s.m.finishMeat();
    expect(s.one(pick)).toBeNull();
    expect(s.bag).toEqual(['momo_nama', 'momo_nama']);
    expect(s.m.coops()[0]!.door).toBe('open');
    expect(s.m.coops()[0]!.meatBusy).toBeNull();
    expect(s.m.meatSay()).toBeNull();
    expect(s.ev('meat')).toHaveLength(1);
    const sv = s.m.serialize();
    expect(sv.v).toBe(4);
    expect(sv.coops[0]!.kids).toHaveLength(1);
    // 読み直しても 演出 の 続き は 出ない
    s.m.deserialize(JSON.parse(JSON.stringify(sv)));
    s.step(240);
    expect(s.bag).toHaveLength(2);
    expect(s.m.list()).toHaveLength(1);
    // 何も して いない とき は 何も おきない
    s.m.finishMeat();
    expect(s.bag).toHaveLength(2);
  });

  it('読みこまない 所 に なった らその場 で おわらせる（にく は 持ち物 へ）', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c);
    s.m.meat(c.id, pick);
    s.step(50);
    s.world.isLoaded = () => false;
    s.step(1);
    expect(s.one(pick)).toBeNull();
    expect(s.bag).toHaveLength(2);
    expect(s.m.coops()[0]!.door).toBe('open');
  });

  it('小屋 を 消す と 演出 の 記録 も 消える（子 0 の とき だけ 消せる）', () => {
    const s = setup();
    const c = s.coop();
    const pick = kid(s, c);
    s.m.meat(c.id, pick);
    s.step(210); // 200 の あと は 子 0
    expect(s.m.removeCoop(c.id)).toBe(true);
    s.step(30);
    expect(s.m.coops()).toEqual([]);
  });
});

function kid(s: ReturnType<typeof setup>, c: { id: number; x: number; z: number }, dx = 0, dz = 0): number {
  return s.kid(c, {}, dx, dz);
}
