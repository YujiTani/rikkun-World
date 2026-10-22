import { describe, expect, it } from 'vitest';
import type { AnimalEvent, BlockId, DayPhase, ItemId, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';

const SIZE = 100;

function setup(opts: { floor?: BlockId; kind?: string; phase?: DayPhase; px?: number; pz?: number; seed?: number } = {}) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  const floor = opts.floor ?? 'grass';
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, floor);
  const st = { day: 0, phase: (opts.phase ?? 'day') as DayPhase, kind: opts.kind ?? 'harappa' };
  const player = { position: { x: opts.px ?? 50.5, y: 9, z: opts.pz ?? 50.5 } as Vec3 };
  const eggs: Vec3[] = [];
  const items: ItemId[] = [];
  const bag = { full: false };
  const carried = { before: false };
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: opts.seed ?? 7,
      settings,
      dropEgg: (at) => eggs.push({ ...at }),
      addItem: (it) => {
        if (bag.full) return false;
        items.push(it);
        return true;
      },
      carriedBefore: () => carried.before,
      day: () => st.day,
      phase: () => st.phase,
      countryAt: () => ({ kind: st.kind }),
    },
  });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const ev = () => m.events();
  const one = (id: number) => m.list().find((a) => a.id === id)!;
  return { world, st, player, eggs, items, bag, carried, settings, m, step, ev, one };
}
type S = ReturnType<typeof setup>;

const hd = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('AC1 出る所と時', () => {
  it('ひる・はらっぱ・くさ の上: 水平 16〜40・上 2 マス くうき・空が見える', () => {
    const s = setup();
    let n = 0;
    for (let i = 0; i < 30; i++) {
      s.m.clear();
      const id = s.m.trySpawn();
      if (id === null) continue;
      n++;
      const a = s.one(id);
      const d = hd(a, s.player.position);
      expect(d).toBeGreaterThanOrEqual(16 - 1e-6);
      expect(d).toBeLessThanOrEqual(40 + 1e-6);
      expect(s.world.getBlock(Math.floor(a.x), Math.floor(a.y) - 1, Math.floor(a.z))).toBe('grass');
      expect(s.world.isSolid(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z))).toBe(false);
      expect(s.world.isSolid(Math.floor(a.x), Math.floor(a.y) + 1, Math.floor(a.z))).toBe(false);
      expect(a.state).toBe('appear');
    }
    expect(n).toBeGreaterThan(20);
  });

  it('すな・くさ でない・もりの くに・上がふさがった所 は 0 わ', () => {
    for (const o of [{ floor: 'sand' as BlockId }, { floor: 'stone' as BlockId }, { kind: 'mori' }]) {
      const s = setup(o);
      for (let i = 0; i < 50; i++) expect(s.m.trySpawn()).toBeNull();
      expect(s.m.list()).toHaveLength(0);
    }
    const s = setup();
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) s.world.setBlock(x, 12, z, 'stone');
    for (let i = 0; i < 50; i++) expect(s.m.trySpawn()).toBeNull();
  });

  it('はなばたけ でも 出る', () => {
    const s = setup({ kind: 'hana' });
    let got = 0;
    for (let i = 0; i < 5; i++) if (s.m.trySpawn() !== null) got++;
    expect(got).toBeGreaterThan(0);
  });

  it('dusk・night・dawn は 0 わ', () => {
    for (const phase of ['dusk', 'night', 'dawn'] as DayPhase[]) {
      const s = setup({ phase });
      for (let i = 0; i < 100; i++) expect(s.m.trySpawn()).toBeNull();
    }
  });

  it('やせい 3 わ(64 以内) の ときは 0 わ。遠い 分は 数えない', () => {
    const s = setup();
    for (let i = 0; i < 3; i++) s.m.spawn(50.5, 9, 60.5 + i);
    expect(s.m.trySpawn()).toBeNull();
    s.m.clear();
    s.m.spawn(0.5, 9, 0.5);
    s.m.spawn(1.5, 9, 0.5);
    s.m.spawn(2.5, 9, 0.5);
    s.player.position.x = 80.5;
    s.player.position.z = 80.5;
    expect(s.m.trySpawn()).not.toBeNull();
  });

  it('同じシード・同じ操作 → 同じ場所。ほかの シードとは ちがう', () => {
    const run = (seed: number) => {
      const s = setup({ seed });
      const out: number[] = [];
      for (let i = 0; i < 6; i++) {
        s.m.clear();
        const id = s.m.trySpawn()!;
        out.push(s.one(id).x, s.one(id).z);
      }
      return out;
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('自動: ひる 10 秒ごとに 出て、いつも 3 わ 以下', () => {
    const s = setup();
    s.settings.animalAutoSpawn = true;
    for (let i = 0; i < 8; i++) {
      s.step(600);
      expect(s.m.list().length).toBeLessThanOrEqual(3);
    }
    expect(s.m.list().length).toBeGreaterThanOrEqual(1);
  });
});

/** 台(3×3, 上面 y=9)のまわりを 作り変える */
function platform(s: S, ring: 'cliff' | 'step1' | 'step2' | 'water') {
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) s.world.setBlock(x, 8, z, 'air');
  for (let x = 49; x <= 51; x++) for (let z = 49; z <= 51; z++) s.world.setBlock(x, 8, z, 'stone');
  for (let x = 46; x <= 54; x++) {
    for (let z = 46; z <= 54; z++) {
      if (x >= 49 && x <= 51 && z >= 49 && z <= 51) continue;
      if (ring === 'water') {
        s.world.setBlock(x, 7, z, 'stone');
        s.world.setBlock(x, 8, z, 'water');
      } else if (ring === 'step1') {
        s.world.setBlock(x, 8, z, 'stone');
        s.world.setBlock(x, 9, z, 'stone');
      } else if (ring === 'step2') {
        s.world.setBlock(x, 8, z, 'stone');
        s.world.setBlock(x, 9, z, 'stone');
        s.world.setBlock(x, 10, z, 'stone');
      }
    }
  }
}

describe('AC3 うろうろ・消える', () => {
  it('速さ は 1.0 マス/秒 以下', () => {
    const s = setup();
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    s.step(31);
    let prev = { ...s.one(id) };
    let maxV = 0;
    let moved = 0;
    for (let i = 0; i < 1500; i++) {
      s.step(1);
      const a = s.one(id);
      maxV = Math.max(maxV, hd(a, prev) * 60);
      moved += hd(a, prev);
      prev = { ...a };
    }
    expect(maxV).toBeLessThanOrEqual(1.0 + 1e-6);
    expect(moved).toBeGreaterThan(1);
  });

  it('1 段 は のぼる', () => {
    const s = setup();
    platform(s, 'step1');
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    let up = false;
    for (let i = 0; i < 8000 && !up; i++) {
      s.step(1);
      if (s.one(id).y > 9.5) up = true;
    }
    expect(up).toBe(true);
  });

  it('2 段 は のぼらない', () => {
    const s = setup();
    platform(s, 'step2');
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    for (let i = 0; i < 6000; i++) {
      s.step(1);
      const a = s.one(id);
      expect(a.y).toBeLessThan(9.5);
      expect(Math.abs(a.x - 50.5)).toBeLessThanOrEqual(1.5 + 1e-6);
      expect(Math.abs(a.z - 50.5)).toBeLessThanOrEqual(1.5 + 1e-6);
    }
  });

  it('4 マス の がけ は おりない', () => {
    const s = setup();
    platform(s, 'cliff');
    for (let x = 44; x <= 56; x++) {
      for (let z = 44; z <= 56; z++) {
        if (x >= 49 && x <= 51 && z >= 49 && z <= 51) continue;
        s.world.setBlock(x, 4, z, 'stone'); // 上面 5: 台(9)から 4 マス
      }
    }
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    for (let i = 0; i < 6000; i++) {
      s.step(1);
      expect(s.one(id).y).toBeGreaterThanOrEqual(9 - 1e-6);
    }
  });

  it('3 マス の がけ は おりる', () => {
    const s = setup();
    platform(s, 'cliff');
    for (let x = 44; x <= 56; x++) {
      for (let z = 44; z <= 56; z++) {
        if (x >= 49 && x <= 51 && z >= 49 && z <= 51) continue;
        s.world.setBlock(x, 5, z, 'stone'); // 上面 6: 3 マス
      }
    }
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    let down = false;
    for (let i = 0; i < 8000 && !down; i++) {
      s.step(1);
      if (s.one(id).y < 8) down = true;
    }
    expect(down).toBe(true);
  });

  it('みず の マス に は 入らない', () => {
    const s = setup();
    platform(s, 'water');
    s.player.position.x = 30.5;
    const id = s.m.spawn(50.5, 9, 50.5)!;
    for (let i = 0; i < 6000; i++) {
      s.step(1);
      const a = s.one(id);
      expect(a.inWater).toBe(false);
      expect(Math.abs(a.x - 50.5)).toBeLessThanOrEqual(1.5 + 1e-6);
    }
  });

  it('ハート 0 は 水平 70 で 次のステップに 消える(far)・y < -10 で 消える(void)', () => {
    const s = setup();
    s.player.position.x = 5.5;
    const far = s.m.spawn(90.5, 9, 50.5)!;
    s.m.spawn(10.5, -11, 50.5);
    s.ev();
    s.step(1);
    const ev = s.ev().filter((e) => e.type === 'remove') as Extract<AnimalEvent, { type: 'remove' }>[];
    expect(ev.map((e) => e.reason).sort()).toEqual(['far', 'void']);
    expect(s.m.list().find((a) => a.id === far)).toBeUndefined();
  });

  it('ハート 1 の やせい は 70 で 消えず 100 で 消える', () => {
    const s = setup();
    s.player.position.x = 5.5;
    const near = s.m.spawn(75.5, 9, 50.5, { hearts: 1 })!;
    const far = s.m.spawn(104.5, 9, 50.5, { hearts: 1 })!;
    const zero = s.m.spawn(75.5, 9, 52.5, { hearts: 0 })!;
    s.ev();
    s.step(1);
    const ids = s.m.list().map((a) => a.id);
    expect(ids).toContain(near);
    expect(ids).not.toContain(zero);
    expect(ids).not.toContain(far);
  });
});

describe('AC4 見る', () => {
  it('6 マス 以内で 向いて 止まる・はなれると もどる', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    expect(s.one(id).lookingAtPlayer).toBe(true);
    expect(s.one(id).state).toBe('look');
    const p0 = { ...s.one(id) };
    s.step(60);
    expect(hd(s.one(id), p0)).toBeLessThan(0.05);
    s.player.position.x = 47.5;
    s.step(30);
    expect(s.one(id).lookingAtPlayer).toBe(false);
  });
});

describe('えさ は むし(AC11・AC12・AC14)', () => {
  it('むし 3 こ で なかま・30 ステップ 目 に friend 出来事(first)・follow まんたん', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    s.ev();
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id).hearts).toBe(1);
    expect(s.one(id).state).toBe('eat');
    expect(s.one(id).fullLeft).toBe(600);
    expect(s.m.feed(id, 'mushi')).toBeNull();
    s.step(30);
    expect(s.m.feed(id, 'mushi')).toBe('full');
    expect(s.one(id).hearts).toBe(1);
    s.step(570);
    expect(s.one(id).fullLeft).toBe(0);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(600);
    expect(s.one(id).hearts).toBe(2);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(29);
    expect(s.one(id).friend).toBe(false);
    s.step(1);
    expect(s.one(id).friend).toBe(true);
    expect(s.one(id).follow).toBe(18000);
    const ev = s.ev();
    expect(ev.filter((e) => e.type === 'feed')).toHaveLength(3);
    expect(ev.filter((e) => e.type === 'friend')).toEqual([{ type: 'friend', id, first: true, count: 1 }]);
    expect(ev.filter((e) => e.type === 'full')).toHaveLength(1);
  });

  it('やさい は あげられない: null。やせい を なでる と feedHint・ハート そのまま', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    expect(s.m.feed(id, 'tomato')).toBeNull();
    expect(s.m.preview(id, { item: 'tomato', count: 1 })).toBe('animalPet');
    expect(s.m.preview(id, { item: 'mushi', count: 1 })).toBe('feed');
    expect(s.m.preview(id, null)).toBe('animalPet');
    expect(s.m.pet(id)).toBe('wild');
    expect(s.one(id).hearts).toBe(0);
    expect(s.m.lastHint()).toBe('feedHint');
    expect(s.m.preview(id, { item: 'mushi', count: 1 })).toBeNull();
  });

  it('おなかいっぱい: isFull・full 出来事・20 ステップ の 動き', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    expect(s.m.isFull?.(id)).toBe(false);
    s.m.feed(id, 'mushi');
    s.step(30);
    expect(s.m.isFull?.(id)).toBe(true);
    s.ev();
    expect(s.m.feed(id, 'mushi')).toBe('full');
    expect(s.one(id).state).toBe('full');
    expect(s.ev().filter((e) => e.type === 'full')).toEqual([{ type: 'full', id }]);
    s.step(19);
    expect(s.one(id).state).toBe('full');
    s.step(1);
    expect(s.one(id).state).not.toBe('full');
    expect(s.one(id).fullLeft).toBeGreaterThan(0);
  });

  it('2 わ目は first false', () => {
    const s = setup();
    s.m.spawn(52.5, 9, 50.5, { friend: true });
    const id = s.m.spawn(55.5, 9, 50.5, { hearts: 2 })!;
    s.step(31);
    s.ev();
    s.m.feed(id, 'mushi');
    s.step(30);
    expect(s.ev().filter((e) => e.type === 'friend')).toEqual([{ type: 'friend', id, first: false, count: 2 }]);
  });

  it('なかま 8 わ: 3 つ目 は たべない(friendFull・fullLeft 0)・hearts 0 は ふつうに', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(48.5 + i * 0.7, 9, 50.5, { friend: true });
    expect(s.m.spawn(60.5, 9, 60.5, { friend: true })).toBeNull();
    const w2 = s.m.spawn(60.5, 9, 55.5, { hearts: 2 })!;
    const w0 = s.m.spawn(60.5, 9, 57.5, { hearts: 0 })!;
    s.step(31);
    s.ev();
    expect(s.m.feed(w2, 'mushi')).toBe('friendFull');
    expect(s.one(w2).hearts).toBe(2);
    expect(s.one(w2).fullLeft).toBe(0);
    expect(s.one(w2).friend).toBe(false);
    expect(s.m.lastHint()).toBe('friendFull');
    expect(s.m.feed(w0, 'mushi')).toBe('ate');
    expect(s.one(w0).hearts).toBe(1);
  });

  it('3 つ目 の あと ロック中 に 上限 に なる → 先に friendFull', () => {
    const s = setup();
    for (let i = 0; i < 7; i++) s.m.spawn(48.5 + i * 0.7, 9, 50.5, { friend: true });
    const a = s.m.spawn(60.5, 9, 55.5, { hearts: 2 })!;
    const b = s.m.spawn(60.5, 9, 58.5, { hearts: 2 })!;
    s.step(31);
    expect(s.m.feed(a, 'mushi')).toBe('ate');
    expect(s.m.feed(b, 'mushi')).toBe('friendFull');
    s.step(31);
    expect(s.one(a).friend).toBe(true);
    expect(s.one(b).friend).toBe(false);
  });

  it('なかま を なでる と pet(friend)。たまご は 出ない・eggLater も 出ない', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.ev();
    expect(s.m.pet(id)).toBe('friend');
    expect(s.ev()).toEqual([{ type: 'pet', id, friend: true }]);
    s.step(900);
    expect(s.eggs).toHaveLength(0);
    expect(s.m.lastHint()).toBeNull();
  });

  it('はじめて の お祝い が おわる と carryHint 出来事。だっこ ずみ なら 出ない', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5, { hearts: 2 })!;
    s.step(31);
    s.ev();
    s.m.feed(id, 'mushi');
    s.step(30 + 39);
    expect(s.ev().some((e) => e.type === 'carryHint')).toBe(false);
    s.step(1);
    expect(s.ev().filter((e) => e.type === 'carryHint')).toHaveLength(1);
    const t = setup();
    t.carried.before = true;
    const id2 = t.m.spawn(55.5, 9, 50.5, { hearts: 2 })!;
    t.step(31);
    t.m.feed(id2, 'mushi');
    t.step(100);
    expect(t.ev().some((e) => e.type === 'carryHint')).toBe(false);
  });
});

describe('ついてくる 時間(AC15・AC16)', () => {
  it('follow は 1 ステップ ごと に 1 へる。0 で followEnd・その場 に とまる・ワープ しない・6 マス 以内', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, follow: 600 })!;
    s.step(10);
    s.player.position.x = 60.5;
    s.step(290);
    expect(s.one(id).follow).toBeGreaterThanOrEqual(299);
    expect(s.one(id).follow).toBeLessThanOrEqual(301);
    s.ev();
    s.step(300);
    const ends = s.ev().filter((e) => e.type === 'followEnd');
    expect(ends).toEqual([{ type: 'followEnd', id }]);
    expect(s.one(id).follow).toBe(0);
    expect(s.one(id).state).not.toBe('follow');
    const stop = { x: s.one(id).x, z: s.one(id).z };
    s.player.position.x = 85.5;
    s.step(600);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
    expect(hd(s.one(id), stop)).toBeLessThanOrEqual(6 + 1e-6);
    expect(s.one(id).friend).toBe(true);
  });

  it('follow 0 の なかま は 近づく と 見る(look)・止まった 所 から 6 以内 を うろうろ', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, follow: 0 })!;
    s.player.position.x = 50.5;
    s.step(40);
    expect(s.one(id).state).toBe('look');
    expect(s.one(id).lookingAtPlayer).toBe(true);
    s.player.position.x = 20.5;
    let moved = 0;
    let prev = { ...s.one(id) };
    for (let i = 0; i < 6000; i++) {
      s.step(1);
      const a = s.one(id);
      expect(hd(a, { x: 52.5, z: 50.5 })).toBeLessThanOrEqual(6 + 1e-6);
      moved += hd(a, prev);
      prev = { ...a };
    }
    expect(moved).toBeGreaterThan(1);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('むし で follow まんたん・ついてくる。遠い(30 マス)なら 60 ステップ 以内 に warp', () => {
    const s = setup();
    const id = s.m.spawn(20.5, 9, 50.5, { friend: true, follow: 0 })!;
    s.player.position.x = 50.5;
    s.step(100);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
    s.player.position.x = 60.5;
    s.step(1);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id).follow).toBeGreaterThan(17990);
    expect(s.ev().filter((e) => e.type === 'feed')).toHaveLength(1);
    s.step(60);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(true);
  });

  it('近い とき は 歩いて くる(ワープ なし)', () => {
    const s = setup();
    const id = s.m.spawn(45.5, 9, 50.5, { friend: true, follow: 0 })!;
    s.player.position.x = 55.5;
    s.m.feed(id, 'mushi');
    s.step(400);
    expect(s.one(id).follow).toBeGreaterThan(17000);
    expect(hd(s.one(id), s.player.position)).toBeLessThanOrEqual(3.6);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('follow 0 の なかま も 上限 8 に 入る', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(48.5 + i * 0.7, 9, 50.5, { friend: true, follow: 0 });
    expect(s.m.friendCount()).toBe(8);
    expect(s.m.spawn(60.5, 9, 60.5, { friend: true })).toBeNull();
  });

  it('既定: friend で follow を 渡さない → まんたん。やせい は 0', () => {
    const s = setup();
    const a = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    const b = s.m.spawn(55.5, 9, 50.5)!;
    expect(s.one(a).follow).toBe(18000);
    expect(s.one(b).follow).toBe(0);
  });
});

describe('だっこ(AC17・AC19)', () => {
  it('40 ステップ で だっこ: 39 は wait・40 で lifted・carry 出来事・carrying・位置 は プレイヤー の 足もと', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.ev();
    expect(s.m.carryHold(id, 1)).toBe('wait');
    expect(s.m.carryHold(id, 39)).toBe('wait');
    expect(s.one(id).carried).toBe(false);
    expect(s.m.carryHold(id, 40)).toBe('lifted');
    expect(s.one(id).carried).toBe(true);
    expect(s.one(id).state).toBe('carried');
    expect(s.m.carrying()).toBe(id);
    expect(s.ev().filter((e) => e.type === 'carry')).toEqual([{ type: 'carry', id }]);
    expect(s.m.carryHold(id, 41)).toBeNull();
    s.step(1);
    expect(hd(s.one(id), s.player.position)).toBeLessThan(0.01);
    expect(s.m.rayHit({ x: 50.5, y: 10.6, z: 49 }, { x: 0, y: 0, z: 1 }, 5)).toBeNull();
    expect(s.m.preview(id, { item: 'mushi', count: 1 })).toBeNull();
    expect(s.m.feed(id, 'mushi')).toBeNull();
    expect(s.m.pet(id)).toBeNull();
  });

  it('1 わ だけ: だっこ 中 は ほか の なかま を だっこ しない', () => {
    const s = setup();
    const a = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    const b = s.m.spawn(54.5, 9, 50.5, { friend: true })!;
    s.step(35);
    expect(s.m.carryHold(a, 40)).toBe('lifted');
    expect(s.m.carryHold(b, 40)).toBeNull();
    expect(s.one(b).carried).toBe(false);
  });

  it('やせい は wild を 1 回 だけ 返す・だっこ しない。follow 0 の なかま は できる', () => {
    const s = setup();
    const w = s.m.spawn(55.5, 9, 50.5)!;
    s.step(35);
    expect(s.m.carryHold(w, 39)).toBe('wait');
    expect(s.m.carryHold(w, 40)).toBe('wild');
    expect(s.m.carryHold(w, 41)).toBeNull();
    expect(s.m.carryHold(w, 60)).toBeNull();
    expect(s.m.carryHold(w, 1)).toBe('wait');
    expect(s.m.carryHold(w, 40)).toBe('wild');
    expect(s.one(w).carried).toBe(false);
    const f = s.m.spawn(52.5, 9, 50.5, { friend: true, follow: 0 })!;
    s.step(35);
    expect(s.m.carryHold(f, 40)).toBe('lifted');
  });

  it('ついばむ・たまご の 動き の あいだ は wait。おわったら lifted', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    for (let i = 0; i < 59; i++) {
      s.step(1);
      expect(s.m.carryHold(id, 100)).toBe('wait');
    }
    s.step(1);
    expect(s.m.carryHold(id, 100)).toBe('lifted');
  });

  it('だっこ 中: follow は へらない・fullLeft は へる・プレイヤー と いっしょ・ワープ しない', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, follow: 5000, fullLeft: 500 })!;
    s.step(35);
    s.m.carryHold(id, 40);
    const f0 = s.one(id).follow;
    s.player.position.x = 90.5;
    s.step(300);
    expect(s.one(id).follow).toBe(f0);
    expect(s.one(id).fullLeft).toBeLessThanOrEqual(201);
    expect(hd(s.one(id), s.player.position)).toBeLessThan(0.01);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('おろす: 空いた マス に おろせる・putDown 出来事・20 ステップ putDown の 動き・位置 が spot', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.m.carryHold(id, 40);
    s.ev();
    expect(s.m.putDown({ x: 52.5, y: 9, z: 50.5 })).toBe(true);
    expect(s.m.carrying()).toBeNull();
    expect(s.one(id).carried).toBe(false);
    expect(s.one(id).state).toBe('putDown');
    expect(s.ev().filter((e) => e.type === 'putDown')).toEqual([{ type: 'putDown', id, x: 52.5, y: 9, z: 50.5 }]);
    expect(hd(s.one(id), { x: 52.5, z: 50.5 })).toBeLessThan(0.01);
    expect(s.m.putDown({ x: 53.5, y: 9, z: 50.5 })).toBe(false);
    s.step(19);
    expect(s.one(id).state).toBe('putDown');
    s.step(1);
    expect(s.one(id).state).not.toBe('putDown');
  });

  it('固い マス・世界 の 外 には おろせない(だっこ の まま)', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.m.carryHold(id, 40);
    s.world.setBlock(53, 9, 50, 'stone');
    expect(s.m.putDown({ x: 53.5, y: 9, z: 50.5 })).toBe(false);
    expect(s.m.putDown({ x: 500.5, y: 9, z: 50.5 })).toBe(false);
    expect(s.m.carrying()).toBe(id);
    expect(s.m.putDown({ x: 54.5, y: 9, z: 50.5 })).toBe(true);
    expect(s.m.putDown({ x: 54.5, y: 9, z: 50.5 })).toBe(false);
  });

  it('みず の マス にも おろせる', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.m.carryHold(id, 40);
    s.world.setBlock(53, 9, 50, 'water');
    expect(s.m.putDown({ x: 53.5, y: 9, z: 50.5 })).toBe(true);
  });

  it('保存: だっこ 中 は プレイヤー の 足もと の 位置 で 保存・読み直す と carried false', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.m.carryHold(id, 40);
    s.step(1);
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(Math.abs(data.friends[0].x - 50.5)).toBeLessThan(0.01);
    const t = setup();
    t.m.deserialize(data);
    expect(t.m.list()[0]!.carried).toBe(false);
    expect(t.m.carrying()).toBeNull();
  });
});

describe('パタパタ(AC20)', () => {
  it('10 マス の 上 から おとす → 下向き 2.0 以下・fluttering・285 ステップ 以上・着地 で false', () => {
    const s = setup();
    for (let x = 60; x <= 62; x++) for (let z = 60; z <= 62; z++) for (let y = 9; y <= 18; y++) s.world.setBlock(x, y, z, 'stone');
    const id = s.m.spawn(61.5, 19, 61.5, { friend: true, follow: 0 })!;
    s.player.position.x = 30.5;
    s.step(5);
    for (let y = 9; y <= 18; y++) for (let x = 60; x <= 62; x++) for (let z = 60; z <= 62; z++) s.world.setBlock(x, y, z, 'air');
    let fall = 0;
    let minVy = 0;
    let flutter = 0;
    for (let i = 0; i < 800; i++) {
      s.step(1);
      const a = s.one(id);
      if (a.y > 9.001) {
        fall++;
        minVy = Math.min(minVy, a.vy);
        if (a.fluttering) flutter++;
      } else break;
    }
    expect(minVy).toBeGreaterThanOrEqual(-2.0 - 1e-6);
    expect(fall).toBeGreaterThanOrEqual(285);
    expect(flutter).toBeGreaterThan(fall - 10);
    s.step(5);
    expect(s.one(id).fluttering).toBe(false);
    expect(s.one(id).vy).toBe(0);
    expect(s.one(id).y).toBeCloseTo(9, 3);
  });

  it('みず の 中 では fluttering false・ふつう の 地面 の 上 でも false', () => {
    const s = setup();
    for (let x = 60; x <= 62; x++) for (let z = 60; z <= 62; z++) for (let y = 9; y <= 11; y++) s.world.setBlock(x, y, z, 'water');
    const id = s.m.spawn(61.5, 12, 61.5, { friend: true, follow: 0 })!;
    s.player.position.x = 30.5;
    let flutterInWater = 0;
    let inWater = false;
    for (let i = 0; i < 60; i++) {
      s.step(1);
      const a = s.one(id);
      if (a.inWater) {
        inWater = true;
        if (a.fluttering) flutterInWater++;
      }
    }
    expect(inWater).toBe(true);
    expect(flutterInWater).toBe(0);
    const g = s.m.spawn(40.5, 9, 40.5, { friend: true, follow: 0 })!;
    s.step(10);
    expect(s.one(g).fluttering).toBe(false);
  });

  it('だっこ から 空中 に おろす と パタパタ', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.m.carryHold(id, 40);
    s.step(1);
    expect(s.m.putDown({ x: 53.5, y: 15, z: 50.5 })).toBe(true);
    s.step(10);
    expect(s.one(id).fluttering).toBe(true);
    expect(s.one(id).vy).toBeGreaterThanOrEqual(-2.0 - 1e-6);
  });
});

describe('たまご の くじ(AC21・AC22)', () => {
  it('設定 の 初期値: animalEggChance 0.25・animalEggPity 7', () => {
    const s = setup();
    expect(s.settings.animalEggChance).toBe(0.25);
    expect(s.settings.animalEggPity).toBe(7);
  });

  it('chance 1: むし を あげる と 60 ステップ 目 に egg・足もと に たまご・1 日 の 上限 なし', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    s.ev();
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(59);
    expect(s.eggs).toHaveLength(0);
    expect(s.one(id).state).toBe('lay');
    s.step(1);
    expect(s.eggs).toHaveLength(1);
    expect(hd(s.eggs[0]!, s.one(id))).toBeLessThanOrEqual(1.0);
    expect(s.ev().filter((e) => e.type === 'egg')).toHaveLength(1);
    s.step(540);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(60);
    expect(s.eggs).toHaveLength(2);
  });

  it('chance 0: 8 回目 だけ かならず・そのあと 9 回目 は なし(数 が 0 に もどる)', () => {
    const s = setup();
    s.settings.animalEggChance = 0;
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    const got: boolean[] = [];
    for (let i = 0; i < 9; i++) {
      const before = s.eggs.length;
      expect(s.m.feed(id, 'mushi')).toBe('ate');
      s.step(600);
      got.push(s.eggs.length > before);
    }
    expect(got).toEqual([false, false, false, false, false, false, false, true, false]);
  });

  it('1,000 回 たべさせて 0.24〜0.32・8 回 つづけて うまない が 0 回', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(35);
    let eggs = 0;
    let run = 0;
    let maxRun = 0;
    for (let i = 0; i < 1000; i++) {
      const before = s.eggs.length;
      s.m.feed(id, 'mushi');
      s.step(600);
      if (s.eggs.length > before) {
        eggs++;
        run = 0;
      } else {
        run++;
        maxRun = Math.max(maxRun, run);
      }
    }
    expect(eggs / 1000).toBeGreaterThanOrEqual(0.24);
    expect(eggs / 1000).toBeLessThanOrEqual(0.32);
    expect(maxRun).toBeLessThanOrEqual(7);
  });

  it('同じ シード・同じ 操作 → 同じ 結果。シード が ちがう と ちがう', () => {
    const run = (seed: number) => {
      const s = setup({ seed });
      const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
      s.step(35);
      const out: number[] = [];
      for (let i = 0; i < 40; i++) {
        const before = s.eggs.length;
        s.m.feed(id, 'mushi');
        s.step(600);
        out.push(s.eggs.length - before);
      }
      return out;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('やせい は うまない。数 は にわとり ごと', () => {
    const s = setup();
    s.settings.animalEggChance = 1;
    const w = s.m.spawn(55.5, 9, 50.5, { hearts: 0 })!;
    s.step(31);
    s.m.feed(w, 'mushi');
    s.step(700);
    expect(s.eggs).toHaveLength(0);
    s.settings.animalEggChance = 0;
    const a = s.m.spawn(52.5, 9, 52.5, { friend: true })!;
    const b = s.m.spawn(52.5, 9, 48.5, { friend: true })!;
    s.step(35);
    for (let i = 0; i < 7; i++) {
      s.m.feed(a, 'mushi');
      s.step(600);
    }
    expect(s.eggs).toHaveLength(0);
    s.m.feed(b, 'mushi');
    s.step(600);
    expect(s.eggs).toHaveLength(0);
    s.m.feed(a, 'mushi');
    s.step(600);
    expect(s.eggs).toHaveLength(1);
  });
});

describe('むしとりあみ の くじ・おやすみ(AC7〜AC10 の きまり)', () => {
  const spot = (i: number) => ({ x: 10 + i * 10, y: 12, z: 10 });

  it('bug 系 の 設定 の 初期値', () => {
    const s = setup();
    expect(s.settings.bugChance).toBeCloseTo(1 / 3, 6);
    expect(s.settings.bugPity).toBe(2);
    expect(s.settings.bugTreeCooldown).toBe(1800);
    expect(s.settings.bugTreeRadius).toBe(4);
  });

  it('1,000 回 ふって とれた 割合 0.40〜0.55・どの 3 回 つづき でも 1 回 以上', () => {
    const s = setup();
    let hit = 0;
    const seq: boolean[] = [];
    for (let i = 0; i < 1000; i++) {
      const r = s.m.swingNet({ x: 10 + (i % 8) * 10, y: 12, z: 10 + Math.floor(i / 8) * 5 });
      s.step(1800);
      seq.push(r.caught);
      if (r.caught) hit++;
    }
    expect(hit / 1000).toBeGreaterThanOrEqual(0.4);
    expect(hit / 1000).toBeLessThanOrEqual(0.55);
    for (let i = 0; i + 2 < seq.length; i++) expect(seq[i] || seq[i + 1] || seq[i + 2]).toBe(true);
  });

  it('bugChance 0 でも 3 回目 は かならず(pity)。reason が chance / pity / miss', () => {
    const s = setup();
    s.settings.bugChance = 0;
    const r = [0, 1, 2, 3, 4, 5].map((i) => {
      const x = s.m.swingNet(spot(i));
      s.step(1);
      return x;
    });
    expect(r.map((q) => q.caught)).toEqual([false, false, true, false, false, true]);
    expect(r.map((q) => q.reason)).toEqual(['miss', 'miss', 'pity', 'miss', 'miss', 'pity']);
    s.settings.bugChance = 1;
    expect(s.m.swingNet(spot(7))).toEqual({ caught: true, reason: 'chance' });
  });

  it('swing 出来事: 位置・caught・reason', () => {
    const s = setup();
    s.settings.bugChance = 1;
    s.ev();
    s.m.swingNet({ x: 12, y: 13, z: 7 });
    expect(s.ev()).toEqual([{ type: 'swing', x: 12, y: 13, z: 7, caught: true, reason: 'chance' }]);
  });

  it('とれた むし は ふって 30 ステップ 目 (押した ステップ を 1 と 数える) に 持ち物 ＋1・bugCatch toInventory true', () => {
    const s = setup();
    s.settings.bugChance = 1;
    s.m.swingNet(spot(0));
    s.ev();
    s.step(28);
    expect(s.items).toHaveLength(0);
    s.step(1);
    expect(s.items).toEqual(['mushi']);
    expect(s.ev().filter((e) => e.type === 'bugCatch')).toEqual([{ type: 'bugCatch', toInventory: true }]);
  });

  it('持ち物 いっぱい → toInventory false', () => {
    const s = setup();
    s.bag.full = true;
    s.settings.bugChance = 1;
    s.m.swingNet(spot(0));
    s.ev();
    s.step(40);
    expect(s.ev().filter((e) => e.type === 'bugCatch')).toEqual([{ type: 'bugCatch', toInventory: false }]);
  });

  it('おやすみ: 水平 4 以内 は とれない(empty)。6 はなれる と とれる。1,800 ステップ 後 また とれる。失敗 の 数 に 数えない', () => {
    const s = setup();
    s.settings.bugChance = 1;
    const a = { x: 30, y: 12, z: 30 };
    expect(s.m.swingNet(a).caught).toBe(true);
    s.step(5);
    expect(s.m.swingNet({ x: 33, y: 12, z: 30 })).toEqual({ caught: false, reason: 'empty' });
    expect(s.m.swingNet({ x: 34, y: 14, z: 30 })).toEqual({ caught: false, reason: 'empty' });
    expect(s.m.swingNet({ x: 36, y: 12, z: 30 })).toEqual({ caught: true, reason: 'chance' });
    s.step(30);
    expect(s.items).toHaveLength(2);
    s.step(1800);
    expect(s.m.swingNet(a).caught).toBe(true);
    const t = setup();
    t.settings.bugChance = 0;
    expect(t.m.swingNet({ x: 5, y: 12, z: 5 }).reason).toBe('miss');
    expect(t.m.swingNet({ x: 50, y: 12, z: 5 }).reason).toBe('miss');
    expect(t.m.swingNet({ x: 5, y: 12, z: 50 })).toEqual({ caught: true, reason: 'pity' });
    expect(t.m.swingNet({ x: 6, y: 12, z: 50 })).toEqual({ caught: false, reason: 'empty' });
    expect(t.m.swingNet({ x: 5, y: 12, z: 90 }).reason).toBe('miss');
  });

  it('同じ シード・同じ 操作 → 同じ 結果', () => {
    const run = (seed: number) => {
      const s = setup({ seed });
      const out: boolean[] = [];
      for (let i = 0; i < 60; i++) {
        out.push(s.m.swingNet({ x: 10 + (i % 8) * 10, y: 12, z: 10 + Math.floor(i / 8) * 5 }).caught);
        s.step(1800);
      }
      return out;
    };
    expect(run(9)).toEqual(run(9));
    expect(run(9)).not.toEqual(run(10));
  });

  it('clear() で 数 と おやすみ は もどる', () => {
    const s = setup();
    s.settings.bugChance = 1;
    s.m.swingNet(spot(0));
    s.m.clear();
    expect(s.m.swingNet(spot(0)).caught).toBe(true);
    s.step(60);
    expect(s.items).toHaveLength(1);
  });
});

describe('AC29 敵 に さわらない: あみ の 乱数 は べつ の 流れ', () => {
  it('あみ を はさんでも 出る 場所 は 同じ シード で 同じ', () => {
    const run = (touch: boolean) => {
      const s = setup({ seed: 21 });
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        if (touch) {
          s.settings.bugChance = 0.5;
          for (let k = 0; k < 4; k++) s.m.swingNet({ x: 5 + (i * 4 + k) * 10, y: 12, z: 5 });
        }
        s.m.clear();
        const id = s.m.trySpawn()!;
        out.push(s.one(id).x, s.one(id).z);
      }
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });
});


describe('AC10・AC11・AC12 ついてくる・ワープ・重ならない', () => {
  it('東へ 12 マス → 300 ステップ 以内に 2.5 以内で 止まる。3 マス 以内では 歩かない', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.step(10);
    s.player.position.x = 51.5;
    s.step(30);
    expect(s.one(id).state).toBe('idle');
    s.player.position.x = 62.5;
    s.step(300);
    expect(hd(s.one(id), s.player.position)).toBeLessThanOrEqual(2.5 + 1e-6);
    expect(s.one(id).state).not.toBe('follow');
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('止まる 距離 は なかま ごと: なかま に なった 順 で 2.5・3.0・3.5 を くり返す（PO 2026-10-18）', () => {
    const s = setup();
    const ids = [0, 1, 2, 3].map((i) => s.m.spawn(50.5 - i, 9, 50.5, { friend: true })!);
    s.step(10);
    s.player.position.x = 62.5;
    s.step(400);
    const stops = [2.5, 3.0, 3.5, 2.5];
    ids.forEach((id, i) => {
      const d = hd(s.one(id), s.player.position);
      expect(d).toBeLessThanOrEqual(stops[i]! + 0.1);
      expect(d).toBeGreaterThan(stops[i]! - 0.6);
    });
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('3 わ が ついて きても 中心 0.8 以上 はなれる', () => {
    const s = setup();
    for (let i = 0; i < 3; i++) s.m.spawn(50.5 - i * 0.2, 9, 50.5 + i * 0.1, { friend: true });
    s.player.position.x = 62.5;
    s.step(400);
    const l = s.m.list();
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) expect(hd(l[i]!, l[j]!)).toBeGreaterThanOrEqual(0.75);
  });

  it('1 段 の 上へ ついてくる(ワープなし)', () => {
    const s = setup();
    for (let x = 56; x <= 70; x++) for (let z = 40; z <= 60; z++) s.world.setBlock(x, 9, z, 'stone');
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true })!;
    s.player.position.x = 62.5;
    s.player.position.y = 10;
    s.step(300);
    expect(s.one(id).y).toBeCloseTo(10, 1);
    expect(hd(s.one(id), s.player.position)).toBeLessThanOrEqual(2.5 + 1e-6);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
  });

  it('30 マス 先へ → 60 ステップ 以内 に warp: 水平 2〜3・足の高さ ±1・下が 固い', () => {
    const s = setup();
    const id = s.m.spawn(20.5, 9, 50.5, { friend: true })!;
    s.player.position.x = 80.5;
    s.step(60);
    expect(s.ev().filter((e) => e.type === 'warp')).toHaveLength(1);
    const a = s.one(id);
    const d = hd(a, s.player.position);
    expect(d).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(d).toBeLessThanOrEqual(3 + 1e-6);
    expect(Math.abs(a.y - s.player.position.y)).toBeLessThanOrEqual(1);
    expect(s.world.isSolid(Math.floor(a.x), Math.floor(a.y) - 1, Math.floor(a.z))).toBe(true);
  });

  it('2 段 の かべ の むこう(近づけない)→ 120〜240 ステップ で warp', () => {
    const s = setup();
    for (let z = 0; z < SIZE; z++) {
      s.world.setBlock(56, 9, z, 'stone');
      s.world.setBlock(56, 10, z, 'stone');
    }
    s.m.spawn(52.5, 9, 50.5, { friend: true });
    s.player.position.x = 60.5;
    let t = 0;
    let warped = false;
    for (; t < 400 && !warped; ) {
      s.step(1);
      t++;
      warped = s.ev().some((e) => e.type === 'warp');
    }
    expect(warped).toBe(true);
    expect(t).toBeGreaterThanOrEqual(120);
    expect(t).toBeLessThanOrEqual(240);
  });

  it('まわり が ぜんぶ 固い 穴: warp なし・消えない。外に 出ると 60 ステップ 以内', () => {
    const s = setup();
    for (let x = 30; x <= 70; x++) for (let z = 30; z <= 70; z++) for (let y = 9; y <= 25; y++) s.world.setBlock(x, y, z, 'stone');
    for (let y = 9; y <= 25; y++) s.world.setBlock(50, y, 50, 'air');
    const id = s.m.spawn(20.5, 9, 50.5, { friend: true })!;
    s.step(300);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(false);
    expect(s.m.list().some((a) => a.id === id)).toBe(true);
    for (let x = 30; x <= 70; x++) for (let z = 30; z <= 70; z++) for (let y = 9; y <= 25; y++) s.world.setBlock(x, y, z, 'air');
    s.step(60);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(true);
  });

  it('8 わ: どの 2 わも 中心 0.5 以上・ぜんぶ 5 以内', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(52.5, 9, 50.5, { friend: true });
    s.step(600);
    const l = s.m.list();
    for (let i = 0; i < l.length; i++) {
      expect(hd(l[i]!, s.player.position)).toBeLessThanOrEqual(5);
      for (let j = i + 1; j < l.length; j++) expect(hd(l[i]!, l[j]!)).toBeGreaterThanOrEqual(0.75);
    }
  });
});

describe('AC24 保存 v 2', () => {
  it('なかま だけ 保存・x y z yaw follow が 同じ・fullLeft は 0・やせい は 消える', () => {
    const s = setup();
    s.m.spawn(52.5, 9, 50.5, { friend: true, follow: 18000 });
    s.m.spawn(54.5, 9, 50.5, { friend: true, follow: 500 });
    s.m.spawn(56.5, 9, 50.5, { friend: true, follow: 0, fullLeft: 300 });
    s.m.spawn(60.5, 9, 60.5, { hearts: 1 });
    s.m.spawn(62.5, 9, 60.5, { hearts: 2 });
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    expect(data.v).toBe(3); // LIVE-2: 保存 v 3
    expect(data.friends[0]).not.toHaveProperty('eggDay');
    const t = setup();
    t.m.spawn(70.5, 9, 70.5);
    t.m.deserialize(data);
    const l = t.m.list();
    expect(l).toHaveLength(3);
    expect(l.every((a) => a.friend && a.fullLeft === 0 && !a.carried)).toBe(true);
    for (const a of s.m.list().filter((q) => q.friend)) {
      const b = l.find((q) => Math.abs(q.x - a.x) < 0.01)!;
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.01);
      expect(Math.abs(b.z - a.z)).toBeLessThan(0.01);
      expect(Math.abs(b.yaw - a.yaw)).toBeLessThan(0.01);
      expect(b.follow).toBe(a.follow);
    }
  });

  it('v 1 を 読む → follow まんたん・eggDay は すてる', () => {
    const s = setup();
    s.m.deserialize({ v: 1, friends: [{ x: 52.5, y: 9, z: 50.5, yaw: 1, eggDay: 3 }, { x: 53.5, y: 9, z: 50.5, yaw: 1, eggDay: null }] });
    const l = s.m.list();
    expect(l).toHaveLength(2);
    expect(l.map((a) => a.follow)).toEqual([18000, 18000]);
    expect(l[0]).not.toHaveProperty('eggDay');
    expect(s.m.serialize().friends[0]).not.toHaveProperty('eggDay');
  });

  it('おかしい 行: follow が 数 で ない → まんたん・-5 → 0・上限 こえ → 上限・小数 は 整数', () => {
    const s = setup();
    const row = (follow: unknown, x: number) => ({ x, y: 9, z: 50.5, yaw: 0, follow });
    s.m.deserialize({
      v: 2,
      friends: [row('a', 40.5), row(-5, 41.5), row(99999, 42.5), row(12.7, 43.5), row(NaN, 44.5), row(null, 45.5), row(0, 46.5)],
    });
    expect(s.m.list().map((a) => a.follow)).toEqual([18000, 0, 18000, 13, 18000, 18000, 0]);
  });

  it('animals が 無い・おかしい行・10 わ', () => {
    const s = setup();
    s.m.deserialize(undefined);
    s.m.deserialize(null);
    s.m.deserialize('x');
    s.m.deserialize({ v: 2, friends: 'x' });
    expect(s.m.list()).toHaveLength(0);
    s.m.deserialize({
      v: 2,
      friends: ['x', { x: 'a' }, null, 3, { x: 52.5, y: 9, z: 50.5, yaw: 1, follow: 5 }, { x: 53.5, y: 'q', z: 1, yaw: 0, follow: 5 }],
    });
    expect(s.m.list()).toHaveLength(1);
    const rows = Array.from({ length: 10 }, (_, i) => ({ x: 40.5 + i, y: 9, z: 50.5, yaw: 0, follow: 100 }));
    s.m.deserialize({ v: 2, friends: rows });
    expect(s.m.list()).toHaveLength(8);
  });

  it('なかま 8 わ で 1,400 文字 以下（v 3 は 1 わ 行 が 増えた。いちばん 多い とき の 全体 は 4,000 以下: live2.test.ts）', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(-1234.56 + i, 123.45, -9876.54, { friend: true, follow: 17999 });
    expect(JSON.stringify(s.m.serialize()).length).toBeLessThanOrEqual(1400);
  });

  it('石で うまっている → 60 ステップ 以内 に warp', () => {
    const s = setup();
    s.m.deserialize({ v: 2, friends: [{ x: 70.5, y: 9, z: 50.5, yaw: 0, follow: 18000 }] });
    for (let y = 9; y <= 14; y++) s.world.setBlock(70, y, 50, 'stone');
    s.step(60);
    expect(s.ev().some((e) => e.type === 'warp')).toBe(true);
  });
});


describe('ねらう・見える', () => {
  it('rayHit: ねらう 箱 0.8×0.8×1.0。appear は ねらえない', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    expect(s.m.rayHit({ x: 50.0, y: 10, z: 50.5 }, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
    const near = s.m.rayHit({ x: 52.0, y: 10, z: 50.5 }, { x: 1, y: 0, z: 0 }, 5);
    expect(near?.id).toBe(id);
    expect(near!.distance).toBeCloseTo(3.1, 5);
    expect(s.m.rayHit({ x: 52.0, y: 10.6, z: 50.5 }, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
    const t = setup();
    const a = t.m.trySpawn()!;
    const a1 = t.one(a);
    expect(t.m.rayHit({ x: a1.x - 2, y: a1.y + 0.5, z: a1.z }, { x: 1, y: 0, z: 0 }, 5)).toBeNull();
  });

  it('forEachVisible: 1 わ ぶん の 表を わたす', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5, { friend: true })!;
    const got: number[] = [];
    s.m.forEachVisible((v) => got.push(v.id));
    expect(got).toEqual([id]);
  });
});
