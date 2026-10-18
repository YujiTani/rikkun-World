import { describe, expect, it } from 'vitest';
import type { AnimalEvent, BlockId, DayPhase, Vec3 } from '../contracts';
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
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: opts.seed ?? 7,
      settings,
      dropEgg: (at) => eggs.push({ ...at }),
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
  return { world, st, player, eggs, settings, m, step, ev, one };
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

  it('水平 70 で 次のステップに 消える(far)・y < -10 で 消える(void)', () => {
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

describe('なかよし(AC6・AC9)', () => {
  it('やさい 3 こ で なかま・30 ステップ 目 に friend 出来事(first)', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    s.ev();
    expect(s.m.feed(id, 'tomato')).toBe('ate');
    expect(s.one(id).hearts).toBe(1);
    expect(s.one(id).state).toBe('eat');
    expect(s.m.feed(id, 'tomato')).toBeNull();
    s.step(30);
    expect(s.m.feed(id, 'tomato')).toBe('ate');
    s.step(30);
    expect(s.one(id).hearts).toBe(2);
    expect(s.m.feed(id, 'pumpkin')).toBe('ate');
    s.step(29);
    expect(s.one(id).friend).toBe(false);
    s.step(1);
    expect(s.one(id).friend).toBe(true);
    const ev = s.ev();
    expect(ev.filter((e) => e.type === 'feed')).toHaveLength(3);
    expect(ev.filter((e) => e.type === 'friend')).toEqual([{ type: 'friend', id, first: true, count: 1 }]);
    expect(s.m.feed(id, 'tomato')).toBeNull();
    expect(s.m.pet(id)).toBeNull();
  });

  it('2 わ目は first false', () => {
    const s = setup();
    s.m.spawn(52.5, 9, 50.5, { friend: true });
    const id = s.m.spawn(55.5, 9, 50.5, { hearts: 2 })!;
    s.step(31);
    s.ev();
    s.m.feed(id, 'onion');
    s.step(30);
    expect(s.ev().filter((e) => e.type === 'friend')).toEqual([{ type: 'friend', id, first: false, count: 2 }]);
  });

  it('なかま 8 わ: 3 つ目 は たべない(friendFull)・hearts 0 は ふつうに', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(48.5 + i * 0.7, 9, 50.5, { friend: true });
    expect(s.m.spawn(60.5, 9, 60.5, { friend: true })).toBeNull();
    const w2 = s.m.spawn(60.5, 9, 55.5, { hearts: 2 })!;
    const w0 = s.m.spawn(60.5, 9, 57.5, { hearts: 0 })!;
    s.step(31);
    s.ev();
    expect(s.m.feed(w2, 'tomato')).toBe('full');
    expect(s.one(w2).hearts).toBe(2);
    expect(s.one(w2).friend).toBe(false);
    expect(s.m.lastHint()).toBe('friendFull');
    expect(s.ev().some((e) => e.type === 'hint' && e.hint === 'friendFull')).toBe(true);
    expect(s.m.feed(w0, 'tomato')).toBe('ate');
    expect(s.one(w0).hearts).toBe(1);
  });

  it('3 つ目 の あと ロック中 に 上限 に なる → 先に full（やさい は へらない・ハート 2 の まま）', () => {
    const s = setup();
    for (let i = 0; i < 7; i++) s.m.spawn(48.5 + i * 0.7, 9, 50.5, { friend: true });
    const a = s.m.spawn(60.5, 9, 55.5, { hearts: 2 })!;
    const b = s.m.spawn(60.5, 9, 58.5, { hearts: 2 })!;
    s.step(31);
    expect(s.m.feed(a, 'tomato')).toBe('ate');
    expect(s.m.feed(b, 'tomato')).toBe('full');
    s.step(31);
    expect(s.one(a).friend).toBe(true);
    expect(s.one(b).hearts).toBe(2);
    expect(s.one(b).friend).toBe(false);
  });

  it('やせい を やさい 以外 で なでる → feedHint・ハート そのまま', () => {
    const s = setup();
    const id = s.m.spawn(55.5, 9, 50.5)!;
    s.step(31);
    expect(s.m.preview(id, { item: 'tomato', count: 1 })).toBe('feed');
    expect(s.m.preview(id, null)).toBe('animalPet');
    expect(s.m.feed(id, 'paper')).toBeNull();
    expect(s.m.pet(id)).toBe('wild');
    expect(s.one(id).hearts).toBe(0);
    expect(s.m.lastHint()).toBe('feedHint');
    expect(s.m.preview(id, { item: 'tomato', count: 1 })).toBeNull();
  });
});

describe('AC13・AC14 たまご の 日', () => {
  it('なでる → 60 ステップ 目 に たまご・その日 は もう 出ない・次の日 また', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, eggDay: null })!;
    s.ev();
    expect(s.m.pet(id)).toBe('friend');
    expect(s.ev().filter((e) => e.type === 'pet')).toEqual([{ type: 'pet', id, friend: true }]);
    s.step(30);
    expect(s.m.pet(id)).toBeNull();
    s.step(29);
    expect(s.eggs).toHaveLength(0);
    s.step(1);
    expect(s.eggs).toHaveLength(1);
    expect(hd(s.eggs[0]!, s.one(id))).toBeLessThanOrEqual(1.0);
    expect(s.one(id).eggDay).toBe(0);
    expect(s.ev().filter((e) => e.type === 'egg')).toHaveLength(1);
    s.m.pet(id);
    expect(s.m.lastHint()).toBe('eggLater');
    expect(s.ev().some((e) => e.type === 'pet')).toBe(true);
    s.step(600);
    expect(s.eggs).toHaveLength(1);
    s.st.day = 1;
    s.m.pet(id);
    s.step(60);
    expect(s.eggs).toHaveLength(2);
    expect(s.one(id).eggDay).toBe(1);
  });

  it('えさ: 今日 まだ → たべて たまご／もう 出た 日 → pet + eggLater', () => {
    const s = setup();
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, eggDay: null })!;
    expect(s.m.feed(id, 'tomato')).toBe('ate');
    s.step(60);
    expect(s.eggs).toHaveLength(1);
    expect(s.m.feed(id, 'tomato')).toBe('pet');
    expect(s.m.lastHint()).toBe('eggLater');
    s.step(600);
    expect(s.eggs).toHaveLength(1);
  });

  it('eggDay が 前の 日 なら くれる', () => {
    const s = setup();
    s.st.day = 5;
    const id = s.m.spawn(52.5, 9, 50.5, { friend: true, eggDay: 4 })!;
    s.m.pet(id);
    s.step(60);
    expect(s.eggs).toHaveLength(1);
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
      for (let j = i + 1; j < l.length; j++) expect(hd(l[i]!, l[j]!)).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('AC19 保存', () => {
  it('なかま だけ 保存・x y z yaw eggDay が 同じ・やせい は 消える', () => {
    const s = setup();
    s.m.spawn(52.5, 9, 50.5, { friend: true, eggDay: 3 });
    s.m.spawn(54.5, 9, 50.5, { friend: true, eggDay: 5 });
    s.m.spawn(56.5, 9, 50.5, { friend: true, eggDay: null });
    s.m.spawn(60.5, 9, 60.5, { hearts: 1 });
    s.m.spawn(62.5, 9, 60.5, { hearts: 2 });
    s.st.day = 10;
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    const t = setup();
    t.st.day = 10;
    t.m.spawn(70.5, 9, 70.5);
    t.m.deserialize(data);
    const l = t.m.list();
    expect(l).toHaveLength(3);
    expect(l.every((a) => a.friend)).toBe(true);
    for (const a of s.m.list().filter((q) => q.friend)) {
      const b = l.find((q) => Math.abs(q.x - a.x) < 0.01)!;
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.01);
      expect(Math.abs(b.z - a.z)).toBeLessThan(0.01);
      expect(Math.abs(b.yaw - a.yaw)).toBeLessThan(0.01);
      expect(b.eggDay).toBe(a.eggDay);
    }
  });

  it('animals が 無い・おかしい行・10 わ・先の eggDay', () => {
    const s = setup();
    s.m.deserialize(undefined);
    s.m.deserialize(null);
    s.m.deserialize('x');
    s.m.deserialize({ v: 1, friends: 'x' });
    expect(s.m.list()).toHaveLength(0);
    s.m.deserialize({
      v: 1,
      friends: ['x', { x: 'a' }, null, 3, { x: 52.5, y: 9, z: 50.5, yaw: 1, eggDay: 0 }, { x: 53.5, y: 'q', z: 1, yaw: 0, eggDay: null }],
    });
    expect(s.m.list()).toHaveLength(1);
    const rows = Array.from({ length: 10 }, (_, i) => ({ x: 40.5 + i, y: 9, z: 50.5, yaw: 0, eggDay: null }));
    s.m.deserialize({ v: 1, friends: rows });
    expect(s.m.list()).toHaveLength(8);
    s.st.day = 2;
    s.m.deserialize({ v: 1, friends: [{ x: 52.5, y: 9, z: 50.5, yaw: 0, eggDay: 99 }, { x: 54.5, y: 9, z: 50.5, yaw: 0, eggDay: 1.5 }] });
    expect(s.m.list()[0]!.eggDay).toBe(2);
    expect(s.m.list()[1]!.eggDay).toBeNull();
  });

  it('なかま 8 わ で 1,000 文字 以下', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.m.spawn(-1234.56 + i, 123.45, -9876.54, { friend: true, eggDay: 12345 });
    expect(JSON.stringify(s.m.serialize()).length).toBeLessThanOrEqual(1000);
  });

  it('石で うまっている → 60 ステップ 以内 に warp', () => {
    const s = setup();
    s.m.deserialize({ v: 1, friends: [{ x: 70.5, y: 9, z: 50.5, yaw: 0, eggDay: null }] });
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
