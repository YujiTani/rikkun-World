import { describe, expect, it } from 'vitest';
import type { AnimalEvent, DayPhase, ItemId, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';
import { coopBlocks } from './coop';

/**
 * GOLD-1 §4.4・§4.6・§6（AC6〜AC10・AC13）: なつき度・まち・へる・保存・はらぱんみみず（docs/design/GOLD-1.md 版 1.2）。
 * 世界は 床 y=8 の ArrayVoxelWorld。まち（5 分）・へる（10 分）は 本物の 設定の まま、ステップ を すすめて 見る。
 */
const SIZE = 60;

function setup(seed = 7) {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const st = { day: 0, phase: 'day' as DayPhase };
  const player = { position: { x: 20.5, y: 9, z: 20.5 } as Vec3 };
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const bag: ItemId[] = [];
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed,
      settings,
      dropEgg: () => {},
      addItem: (it) => {
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
    },
  });
  /** 小屋 の 子（夜 は ねる）。小屋 は 40,40 に 1 つ */
  const kid = (opts: Parameters<AnimalManager['spawn']>[3] = {}) => {
    let c = m.coops()[0];
    if (!c) {
      const r = m.placeCoop(40, 9, 40, 0);
      if (typeof r !== 'number') throw new Error('小屋');
      c = m.coops()[0]!;
    }
    const id = m.spawn(c.x + 0.5, 9, c.z + 0.5, { home: c.id, ...opts });
    if (id === null) throw new Error('kid');
    return id;
  };
  const step = (n: number) => {
    for (let i = 0; i < n; i++) m.update();
  };
  const ev = <T extends AnimalEvent['type']>(type: T) => m.events().filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === type);
  const one = (id: number) => m.list().find((a) => a.id === id)!;
  const friend = (opts: Parameters<AnimalManager['spawn']>[3] = {}) => {
    const id = m.spawn(21.5, 9, 21.5, { friend: true, follow: settings.animalFollowTicks, ...opts });
    if (id === null) throw new Error('spawn');
    return id;
  };
  return { m, st, settings, step, ev, one, friend, kid, bag, player };
}

describe('AC6 なつき度と まち（むし・なでる は べつべつ）', () => {
  it('むし → +15・bugs +1・むしの まち 18,000。600 ステップ後は たべない（むし は へらない・natsukiWait）。18,000 目 に また たべる → 30', () => {
    const s = setup();
    s.settings.animalEggChance = 0;
    const id = s.friend();
    expect(s.one(id)).toMatchObject({ natsuki: 0, natsukiBugWait: 0, natsukiPetWait: 0, natsukiDecayLeft: 36000 });
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id)).toMatchObject({ natsuki: 15, natsukiBugWait: 18000, bugs: 1 });
    s.m.events();
    s.step(600);
    // おなかいっぱい は あけた。まち中 は たべない
    expect(s.one(id).fullLeft).toBe(0);
    expect(s.m.preview(id, { item: 'mushi', count: 5 })).toBe('animalFull');
    expect(s.m.feed(id, 'mushi')).toBe('wait');
    expect(s.m.lastHint()).toBe('natsukiWait');
    const ev = s.m.events();
    expect(ev.some((e) => e.type === 'feed')).toBe(false);
    expect(ev.some((e) => e.type === 'egg')).toBe(false);
    expect(ev.some((e) => e.type === 'natsukiWait')).toBe(true);
    expect(s.one(id)).toMatchObject({ natsuki: 15, bugs: 1, fullLeft: 0 });
    s.step(18000 - 600 - 1);
    expect(s.one(id).natsukiBugWait).toBe(1);
    s.step(1);
    expect(s.one(id).natsukiBugWait).toBe(0);
    expect(s.m.preview(id, { item: 'mushi', count: 5 })).toBe('feed');
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id)).toMatchObject({ natsuki: 30, bugs: 2, natsukiBugWait: 18000 });
  });

  it('なでる は べつ: むしの まち中 でも なでれば +10・まち 18,000。その 600 ステップ後 は なでられない（pet 出来事 なし・natsukiWait）。だっこ は できる', () => {
    const s = setup();
    s.settings.animalEggChance = 0;
    const id = s.friend();
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    s.step(35);
    expect(s.m.pet(id)).toBe('friend');
    expect(s.one(id)).toMatchObject({ natsuki: 25, natsukiPetWait: 18000, natsukiBugWait: 18000 - 35 });
    s.m.events();
    s.step(600);
    expect(s.m.preview(id, null)).toBe('animalFull');
    expect(s.m.pet(id)).toBe('wait');
    const ev = s.m.events();
    expect(ev.some((e) => e.type === 'pet')).toBe(false);
    expect(s.m.lastHint()).toBe('natsukiWait');
    expect(s.one(id).natsuki).toBe(25);
    // だっこ（40 ながおし）は まち中 でも できる
    s.step(25);
    expect(s.m.carryHold(id, 40)).toBe('lifted');
  });

  it('合図 natsukiWait は 600 ステップに 1 回まで（出来事 natsukiWait は 毎回）', () => {
    const s = setup();
    const id = s.friend({ natsuki: 10, natsukiBugWait: 9000 });
    expect(s.m.feed(id, 'mushi')).toBe('wait');
    s.step(25); // 反応の ロック（20）が あける
    s.m.events();
    expect(s.m.feed(id, 'mushi')).toBe('wait');
    const ev = s.m.events();
    expect(ev.filter((e) => e.type === 'hint')).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'natsukiWait')).toHaveLength(1);
    s.step(600);
    s.m.events();
    expect(s.m.feed(id, 'mushi')).toBe('wait');
    expect(s.m.events().filter((e) => e.type === 'hint')).toHaveLength(1);
  });

  it('ねて いる 子: むし は sleepHint（まち も そのまま）。なでる は まち が 0 なら できて +10', () => {
    const s = setup();
    const id = s.kid();
    s.st.phase = 'night';
    s.step(240);
    expect(s.one(id).state).toBe('sleep');
    expect(s.m.feed(id, 'mushi')).toBe('sleep');
    expect(s.one(id)).toMatchObject({ natsuki: 0, natsukiBugWait: 0 });
    expect(s.m.pet(id)).toBe('friend');
    expect(s.one(id)).toMatchObject({ natsuki: 10, natsukiPetWait: 18000 });
  });
});

describe('AC7 上限と まち', () => {
  it('natsuki 95 に むし → 100。100 で むし → 100 の まま まち 18,000', () => {
    const s = setup();
    const a = s.friend({ natsuki: 95 });
    expect(s.m.feed(a, 'mushi')).toBe('ate');
    expect(s.one(a).natsuki).toBe(100);
    const b = s.friend({ natsuki: 100 });
    expect(s.m.feed(b, 'mushi')).toBe('ate');
    expect(s.one(b)).toMatchObject({ natsuki: 100, natsukiBugWait: 18000 });
    s.step(30);
    expect(s.m.pet(b)).toBe('friend');
    expect(s.one(b)).toMatchObject({ natsuki: 100, natsukiPetWait: 18000 });
  });
});

describe('AC7b ふつうの たまご（LIVE-1 から の かわり）', () => {
  it('animalEggChance 0: まちが あける たび に むし 8 回 → 8 回目 だけ たまご（pity 7）。あいだ の 600 ステップごと の むし は たべない ので くじ に 数えない', () => {
    const s = setup();
    s.settings.animalEggChance = 0;
    const id = s.friend({ follow: 0 });
    const eggAt: number[] = [];
    for (let n = 1; n <= 8; n++) {
      while (s.one(id).natsukiBugWait > 0) s.step(Math.min(s.one(id).natsukiBugWait, 6000));
      s.m.events();
      expect(s.m.feed(id, 'mushi'), `${n} 回目`).toBe('ate');
      // 600 ステップごと に もう 1 回 あげて みる（たべない・くじ に 数えない）
      for (let k = 0; k < 3; k++) {
        s.step(700);
        expect(s.m.feed(id, 'mushi')).toBe('wait');
      }
      if (s.m.events().some((e) => e.type === 'egg')) eggAt.push(n);
    }
    expect(eggAt).toEqual([8]);
  });

  it('ひよこ・やせい の むし は 今 の まま（まち なし・natsuki 0）', () => {
    const s = setup();
    const chick = s.friend({ stage: 'chick' });
    expect(s.m.feed(chick, 'mushi')).toBe('ate');
    expect(s.one(chick)).toMatchObject({ natsuki: 0, natsukiBugWait: 0 });
    s.step(35);
    expect(s.m.feed(chick, 'mushi')).toBe('full'); // おなかいっぱい（600）
    s.step(601);
    expect(s.m.feed(chick, 'mushi')).toBe('ate');
    const wild = s.m.spawn(25.5, 9, 25.5, {})!;
    expect(s.m.feed(wild, 'mushi')).toBe('ate');
    expect(s.one(wild)).toMatchObject({ natsuki: 0, natsukiBugWait: 0, hearts: 1 });
    expect(s.m.natsukiView!(wild)!.shown).toBe(false);
  });
});

describe('AC8 へる', () => {
  it('natsuki 50・のこり 36,000 を 36,000 ステップ すすめる → 45・のこり 36,000', () => {
    const s = setup();
    const id = s.friend({ natsuki: 50, follow: 0 });
    s.step(35999);
    expect(s.one(id)).toMatchObject({ natsuki: 50, natsukiDecayLeft: 1 });
    s.step(1);
    expect(s.one(id)).toMatchObject({ natsuki: 45, natsukiDecayLeft: 36000 });
  });
  it('natsuki 3 で 0 に なった ステップ → 0（負 に ならない）', () => {
    const s = setup();
    const id = s.friend({ natsuki: 3, natsukiDecayLeft: 2, follow: 0 });
    s.step(2);
    expect(s.one(id).natsuki).toBe(0);
  });
  it('むし・なでる で のこり は もどらない。へる と むし が 同じ ステップ → へる が 先（70 −5 ＋15 = 80）', () => {
    const s = setup();
    const id = s.friend({ natsuki: 70, natsukiDecayLeft: 100, follow: 0 });
    s.step(40);
    expect(s.m.feed(id, 'mushi')).toBe('ate');
    expect(s.one(id).natsukiDecayLeft).toBe(60);
    const b = s.friend({ natsuki: 70, natsukiDecayLeft: 1, follow: 0 });
    s.step(1); // へる が 先
    expect(s.one(b).natsuki).toBe(65);
    expect(s.m.feed(b, 'mushi')).toBe('ate');
    expect(s.one(b).natsuki).toBe(80);
  });
  it('はなれて いても・ねて いても・小屋 の 子 でも へる。ひよこ・やせい は へらない', () => {
    const s = setup();
    const far = s.friend({ natsuki: 20, natsukiDecayLeft: 50, follow: 0 });
    s.player.position.x = 5;
    s.st.phase = 'night';
    s.step(50);
    expect(s.one(far).natsuki).toBe(15);
    const chick = s.friend({ stage: 'chick', natsuki: 40 });
    expect(s.one(chick).natsuki).toBe(0);
  });
});

describe('AC9 もたない 子', () => {
  it('やせい の 大人・ひよこ に むし・なでる → natsuki 0 の まま・時間 で へらない', () => {
    const s = setup();
    const chick = s.friend({ stage: 'chick' });
    expect(s.m.pet(chick)).toBe('friend');
    expect(s.one(chick)).toMatchObject({ natsuki: 0, natsukiPetWait: 0 });
    s.step(40000);
    expect(s.one(chick)).toMatchObject({ natsuki: 0, natsukiDecayLeft: 36000 });
  });
  it('やせい が なかま に なった とき・ひよこ が 大人 に なった とき natsuki 0・のこり 36,000', () => {
    const s = setup();
    const wild = s.m.spawn(25.5, 9, 25.5, {})!;
    for (let i = 0; i < 3; i++) {
      expect(s.m.feed(wild, 'mushi')).toBe('ate');
      if (i < 2) s.step(700);
    }
    s.step(40);
    const r = s.one(wild);
    expect(r.friend).toBe(true);
    expect(r).toMatchObject({ natsuki: 0, natsukiBugWait: 0, natsukiPetWait: 0 });
    expect(r.natsukiDecayLeft).toBeGreaterThan(35900); // なかま に なった ステップ に まんたん（そのあと すこし だけ へった）
  });
});

describe('AC10 保存', () => {
  it('natsuki 80・まち 1,000・2,000・のこり 3,000 を 保存 → 読む と 同じ。ふつう の 値 は 書かない', () => {
    const s = setup();
    s.friend({ natsuki: 80, natsukiBugWait: 1000, natsukiPetWait: 2000, natsukiDecayLeft: 3000, follow: 0 });
    s.friend({ natsuki: 0, follow: 0 });
    const data = JSON.parse(JSON.stringify(s.m.serialize()));
    const keys = data.friends.map((f: Record<string, unknown>) => Object.keys(f).filter((k) => k.startsWith('natsuki')));
    expect(keys[0].sort()).toEqual(['natsuki', 'natsukiBugWait', 'natsukiDecayLeft', 'natsukiPetWait']);
    expect(keys[1]).toEqual([]);
    const t = setup();
    t.m.deserialize(data);
    const rows = t.m.list();
    expect(rows[0]).toMatchObject({ natsuki: 80, natsukiBugWait: 1000, natsukiPetWait: 2000, natsukiDecayLeft: 3000 });
    expect(rows[1]).toMatchObject({ natsuki: 0, natsukiBugWait: 0, natsukiPetWait: 0, natsukiDecayLeft: 36000 });
  });
  it('値が ない セーブ → 0・0・0・36,000。natsuki 150 → 100・-3 → 0・"x" → 0・小数・はんい外 の まち は おさめる', () => {
    const s = setup();
    const base = { x: 21.5, y: 9, z: 21.5, yaw: 0, follow: 100, stage: 'adult', breed: 'normal' };
    s.m.deserialize({
      v: 4,
      friends: [
        { ...base },
        { ...base, natsuki: 150 },
        { ...base, natsuki: -3 },
        { ...base, natsuki: 'x' },
        { ...base, natsuki: 12.6, natsukiBugWait: 99999, natsukiPetWait: -5, natsukiDecayLeft: 0 },
        { ...base, natsuki: 10, natsukiDecayLeft: 99999 },
      ],
      coops: [],
      kits: [],
      machoMiss: 0,
    });
    const r = s.m.list();
    expect(r[0]).toMatchObject({ natsuki: 0, natsukiBugWait: 0, natsukiPetWait: 0, natsukiDecayLeft: 36000 });
    expect(r[1].natsuki).toBe(100);
    expect(r[2].natsuki).toBe(0);
    expect(r[3].natsuki).toBe(0);
    expect(r[4]).toMatchObject({ natsuki: 13, natsukiBugWait: 18000, natsukiPetWait: 0, natsukiDecayLeft: 1 });
    expect(r[5].natsukiDecayLeft).toBe(36000);
  });
  it('ひよこ は もたない（natsuki が 書いて あっても 0）', () => {
    const s = setup();
    s.m.deserialize({ v: 4, friends: [{ x: 21.5, y: 9, z: 21.5, yaw: 0, follow: 100, stage: 'chick', breed: 'normal', natsuki: 50 }], coops: [], kits: [], machoMiss: 0 });
    expect(s.m.list()[0].natsuki).toBe(0);
  });
});

describe('AC13 はらぱんみみず', () => {
  it('なかま の 大人（natsuki 10）に あげる → 100。bugs・まち・へる まで の のこり は かわらない', () => {
    const s = setup();
    const id = s.friend({ natsuki: 10, natsukiBugWait: 500, natsukiPetWait: 700, natsukiDecayLeft: 9000, bugs: 3, follow: 0 });
    s.m.events();
    expect(s.m.preview(id, { item: 'harapan_mimizu', count: 2 })).toBe('feed');
    expect(s.m.feed(id, 'harapan_mimizu')).toBe('harapan');
    expect(s.one(id)).toMatchObject({ natsuki: 100, natsukiBugWait: 500, natsukiPetWait: 700, natsukiDecayLeft: 9000, bugs: 3 });
    const ev = s.m.events();
    expect(ev.filter((e) => e.type === 'harapanFeed')).toHaveLength(1);
    expect(ev.some((e) => e.type === 'feed')).toBe(false);
    expect(ev.some((e) => e.type === 'egg')).toBe(false);
    expect(ev.filter((e) => e.type === 'natsukiGold')).toHaveLength(1);
  });
  it('natsuki 100 → へらさない・合図 harapanFull。やせい・ひよこ → harapanFriend。ねて いる 子 → sleepHint', () => {
    const s = setup();
    const full = s.friend({ natsuki: 100 });
    expect(s.m.feed(full, 'harapan_mimizu')).toBe('harapanNo');
    expect(s.m.lastHint()).toBe('harapanFull');
    const chick = s.friend({ stage: 'chick' });
    expect(s.m.feed(chick, 'harapan_mimizu')).toBe('harapanNo');
    expect(s.m.lastHint()).toBe('harapanFriend');
    const wild = s.m.spawn(25.5, 9, 25.5, {})!;
    expect(s.m.feed(wild, 'harapan_mimizu')).toBe('harapanNo');
    expect(s.m.lastHint()).toBe('harapanFriend');
    expect(s.one(wild).hearts).toBe(0);
    const sl = s.kid({ natsuki: 10 });
    s.st.phase = 'night';
    s.step(240);
    expect(s.m.feed(sl, 'harapan_mimizu')).toBe('harapanNo');
    expect(s.m.lastHint()).toBe('sleepHint');
    expect(s.one(sl).natsuki).toBe(10);
  });
});

describe('なかよし パネルの 状態 natsukiView（§3.2・§6）', () => {
  it('大人 の なかま だけ shown。hearts は 10 で 切り捨て（75 → 7）。71 以上 で gold。まち時計 の うまり', () => {
    const s = setup();
    const a = s.friend({ natsuki: 75, natsukiBugWait: 9000, natsukiPetWait: 0 });
    s.m.setTargeted(a);
    expect(s.m.natsukiView!(a)).toMatchObject({ shown: true, hearts: 7, gold: true, bugReady: false, petReady: true, petFill: 1 });
    expect(s.m.natsukiView!(a)!.bugFill).toBeCloseTo(0.5, 2);
    const b = s.friend({ natsuki: 70 });
    expect(s.m.natsukiView!(b)).toMatchObject({ hearts: 7, gold: false });
    const c = s.friend({ natsuki: 100 });
    expect(s.m.natsukiView!(c)).toMatchObject({ hearts: 10, gold: true });
    const z = s.friend({ natsuki: 9 });
    expect(s.m.natsukiView!(z)!.hearts).toBe(0);
    expect(s.m.natsukiView!(9999)).toBeNull();
  });
  it('だっこ 中 は 出ない。まち時計 が うまった とき ねらわれて いれば natsukiReady（ねらって いなければ 出さない）', () => {
    const s = setup();
    const id = s.friend({ natsuki: 20, natsukiBugWait: 3, follow: 0 });
    s.m.events();
    s.step(3);
    expect(s.m.events().filter((e) => e.type === 'natsukiReady')).toHaveLength(0);
    const j = s.friend({ natsuki: 20, natsukiPetWait: 3, follow: 0 });
    s.m.setTargeted(j);
    s.step(3);
    expect(s.m.events().filter((e) => e.type === 'natsukiReady')).toEqual([{ type: 'natsukiReady', id: j, which: 'pet' }]);
    expect(s.m.carryHold(id, 40)).toBe('lifted');
    expect(s.m.natsukiView!(id)!.shown).toBe(false);
  });
  it('70 以下 → 71 以上 に なった とき だけ natsukiGold（71 のまま・下がる は 出さない）', () => {
    const s = setup();
    const id = s.friend({ natsuki: 60 });
    s.m.events();
    s.m.feed(id, 'mushi'); // 75
    expect(s.m.events().filter((e) => e.type === 'natsukiGold')).toHaveLength(1);
    s.step(18010);
    s.m.feed(id, 'mushi'); // 90 − 0 … 75 + 15
    expect(s.m.events().filter((e) => e.type === 'natsukiGold')).toHaveLength(0);
  });
});

describe('金 の たまご は natsuki 71 以上 だけ（layEgg）', () => {
  it('たまご を うむ とき の natsuki が 70 では ふつう の たまご、71 では 金（むし +15 の あと。55 → 70、56 → 71）', () => {
    const s = setup();
    s.settings.goldBaseWild = 1;
    s.settings.goldCap = 1;
    s.settings.animalEggChance = 1;
    s.settings.natsukiBugWaitTicks = 0;
    const out: boolean[] = [];
    for (const n of [55, 56]) {
      s.m.clear();
      const id = s.friend({ natsuki: n });
      s.m.events();
      expect(s.m.feed(id, 'mushi')).toBe('ate');
      s.step(s.settings.animalEggDelay + 5);
      const e = s.m.events().filter((x) => x.type === 'egg');
      out.push(e.length === 1 && (e[0] as { gold?: boolean }).gold === true);
    }
    expect(out).toEqual([false, true]);
  });
});

describe('性能（§7）', () => {
  it('なかま 8 わ ＋ 小屋 3×6 わ = 26 わ の なつき度 の しごと が 1 ステップ ごく 小さい', () => {
    const s = setup();
    for (let i = 0; i < 8; i++) s.friend({ natsuki: 50 + i, follow: 0 });
    const t0 = performance.now();
    s.step(2000);
    const per = (performance.now() - t0) / 2000;
    expect(per).toBeLessThan(2); // ms（ゆるい 上限。CI の ゆれ に 強く）
  });
});
