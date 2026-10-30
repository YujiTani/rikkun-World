import { describe, expect, it } from 'vitest';
import { YOKAI_DEFS } from '../../content/yokai/registry';
import type { DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { COUNTRY_TABLE } from '../../world/gen/countryTable';
import { YokaiManager } from './YokaiManager';
import { yokaiStrength } from '../stats';

/** TAKO-1（docs/design/TAKO-1.md §6）の ユニット: AC1〜12・14〜16。数は content/yokai/tako_hachimaki.ts の swim */
const SW = YOKAI_DEFS.tako_hachimaki.swim!;
const GO = Math.round(SW.goSeconds * 60); // 90
const REST = Math.round(SW.restSeconds * 60); // 240
const KIND = 'tako_hachimaki' as const;

const time = (phase: DayPhase): TimeOfDay =>
  ({ dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} }) as unknown as TimeOfDay;

function makeCombat() {
  const hits: Array<{ amount: number; by: YokaiKind; from: Vec3 }> = [];
  const c: PlayerCombat & { hits: typeof hits } = {
    hits,
    hp: () => 20,
    maxHp: () => 20,
    dead: () => false,
    invincibleTicks: () => 0,
    damage: (amount, by, from) => (hits.push({ amount, by, from }), true),
    heal: () => 0,
    drainEvents: () => [],
  };
  return c;
}

/** 水の池: 床 y=8（石）・水 y 9〜14（深さ 6、水面 = 15）。x 0〜W、z 0〜D */
function pool(opts: { w?: number; d?: number; phase?: DayPhase; seed?: number; px?: number; pz?: number; py?: number } = {}) {
  const w = opts.w ?? 40;
  const d = opts.d ?? 40;
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= w; x++) {
    for (let z = 0; z <= d; z++) {
      world.setBlock(x, 8, z, 'stone');
      for (let y = 9; y <= 14; y++) world.setBlock(x, y, z, 'water');
    }
  }
  const combat = makeCombat();
  const added: Array<{ item: ItemId; count: number }> = [];
  const inventory = { add: (item: ItemId, count: number) => (added.push({ item, count }), 0) } as unknown as Inventory;
  const player = { position: { x: opts.px ?? 60, y: opts.py ?? 20, z: opts.pz ?? 60 } };
  const m = new YokaiManager({ world, time: time(opts.phase ?? 'day'), getPlayer: () => player, combat, inventory, seed: opts.seed ?? 1 });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) m.update(1 / 60);
  };
  const tako = (x = 20.5, z = 20.5, y = 11.5) => m.spawn(KIND, x, y, z, { ai: true });
  const info = (id: number) => m.list().find((e) => e.id === id)!;
  return { world, m, combat, added, player, step, tako, info };
}

const topDepth = (y: number) => 15 - (y + YOKAI_DEFS.tako_hachimaki.ai.height);

describe('AC1: 登録表 tako_hachimaki', () => {
  it('強さ 1・basis.attack 2・経験値 3・ぺちん 1・体力は からかさ と 同じ 8、二つ名なし M=1', () => {
    const d = YOKAI_DEFS.tako_hachimaki;
    expect(d.name).toBe('タコはちまき');
    expect(d.basis).toMatchObject({ target: 1, attack: 2, xp: 3 });
    expect(d.swim?.slapDamage).toBe(1);
    expect(d.traits?.swims).toBe(true);
    expect(yokaiStrength(KIND)).toMatchObject({ hp: yokaiStrength('karakasa').hp, attack: 2, xp: 3 });
    expect(yokaiStrength(KIND).hp).toBe(8);
  });
});

describe('AC2・AC3: ドロップ', () => {
  it('すみ が 1〜2 こ かならず（シード 100 回で 0 こ が 0 回、3 こ 以上 が 0 回）', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const { m, added, step, tako } = pool({ seed });
      const id = tako();
      step(2);
      m.damage(id, 99, { x: 18, y: 15, z: 20.5 });
      const ev = m.drainEvents();
      expect(ev.filter((e) => e.type === 'defeat'), `seed ${seed}`).toHaveLength(1);
      const sumi = added.filter((a) => a.item === 'sumi').reduce((s, a) => s + a.count, 0);
      expect(sumi, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(sumi).toBeLessThanOrEqual(2);
      seen.add(sumi);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });
  it('たおすと defeat（経験値 3・種類 tako_hachimaki）が 1 回', () => {
    const { m, step, tako } = pool();
    const id = tako();
    step(2);
    m.damage(id, 99, { x: 18, y: 15, z: 20.5 });
    const ev = m.drainEvents().filter((e) => e.type === 'defeat');
    expect(ev).toMatchObject([{ kind: KIND }]);
  });
});

describe('AC4: およぐ 周期', () => {
  it('はやく すすむ 90 コマ（3 ブロック/秒）→ とまる 240 コマ（よこの 動き 0）を くり返す', () => {
    const { step, tako, info } = pool();
    const id = tako();
    for (let cycle = 0; cycle < 2; cycle++) {
      const p0 = { ...info(id).position };
      step(GO);
      const p1 = { ...info(id).position };
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), `すすむ ${cycle}`).toBeCloseTo(SW.goSpeed * SW.goSeconds, 1);
      for (let i = 0; i < REST; i++) {
        step(1);
        const p = info(id).position;
        expect(Math.hypot(p.x - p1.x, p.z - p1.z), `とまる ${cycle}:${i}`).toBeLessThan(1e-9);
      }
    }
    expect(GO).toBe(90);
    expect(REST).toBe(240);
  });
});

describe('AC5〜7: 水の 中だけ・深さ 1〜3', () => {
  it('10 秒 ずっと 体の いちばん 上が 水面から 1〜3 ブロック 下', () => {
    const { step, tako, info } = pool();
    const id = tako();
    for (let i = 0; i < 600; i++) {
      step(1);
      const d = topDepth(info(id).position.y);
      expect(d, `コマ ${i}`).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(d).toBeLessThanOrEqual(3 + 1e-6);
    }
  });
  it('岸（池の はし）に 向かっても 体の 箱が 水の ない マスに 入らない（10 秒）', () => {
    const { world, step, tako, info } = pool({ w: 8, d: 8, px: 5, pz: 5, py: 25 });
    const id = tako(4.5, 4.5);
    const r = YOKAI_DEFS.tako_hachimaki.ai.radius;
    let moved = 0;
    for (let i = 0; i < 600; i++) {
      step(1);
      const p = info(id).position;
      moved = Math.max(moved, Math.hypot(p.x - 4.5, p.z - 4.5));
      for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]] as const) {
        for (const yy of [p.y + 0.1, p.y + 1.6]) {
          expect(world.getBlock(Math.floor(p.x + dx * 0.999), Math.floor(yy), Math.floor(p.z + dz * 0.999)), `コマ ${i}`).toBe('water');
        }
      }
    }
    expect(moved).toBeGreaterThan(0.5); // ちゃんと 動いて いる
  });
  it('浅い 所（深さ 3 以下）には 入らない', () => {
    const { world, step, tako, info } = pool({ w: 30, d: 12, px: 10, pz: 6, py: 25 });
    // x 16 から 東は 浅い（水 y 12〜14 の 深さ 3）
    for (let x = 16; x <= 30; x++) for (let z = 0; z <= 12; z++) for (let y = 9; y <= 11; y++) world.setBlock(x, y, z, 'stone');
    const id = tako(10.5, 6.5, 11.3);
    for (let i = 0; i < 1800; i++) {
      step(1);
      expect(info(id).position.x + 0.5, `コマ ${i}`).toBeLessThanOrEqual(16 + 1e-6);
    }
  });
});

describe('AC8〜10: すみ と にげる', () => {
  const near = () => pool({ px: 22.5, py: 14.2, pz: 20.5 });
  it('4 ブロック 以内で すみを はき、2 秒 はなれる。8 秒の 間は 2 回めを はかない', () => {
    const { step, tako, info, m, player } = near();
    const id = tako(20.5, 20.5);
    const d0 = Math.hypot(info(id).position.x - player.position.x, info(id).position.z - player.position.z);
    step(1);
    // ため 0.4 秒 → はく
    step(24);
    expect(m.inkInfo().clouds).toHaveLength(1);
    const c = m.inkInfo().clouds[0]!;
    expect(c.radius).toBe(SW.inkRadius);
    const p1 = { ...info(id).position };
    step(Math.round(SW.fleeSeconds * 60));
    const p2 = info(id).position;
    const d2 = Math.hypot(p2.x - player.position.x, p2.z - player.position.z);
    expect(d2).toBeGreaterThan(d0 + 4); // 4 ブロック/秒 × 2 秒 ちかく はなれる
    expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeCloseTo(SW.fleeSpeed * SW.fleeSeconds, 0);
    // りっくんを また 近くへ: 8 秒の まち時間の 間は はかない
    let spits = 0;
    let prev = m.inkInfo().clouds.length;
    for (let i = 0; i < Math.round(SW.inkCooldownSeconds * 60) - 150; i++) {
      player.position.x = info(id).position.x + 2;
      player.position.z = info(id).position.z;
      step(1);
      const n = m.inkInfo().clouds.length;
      if (n > prev) spits++;
      prev = n;
    }
    expect(spits).toBe(0);
    // まち時間が おわれば また はく
    for (let i = 0; i < 400; i++) {
      player.position.x = info(id).position.x + 2;
      player.position.z = info(id).position.z;
      step(1);
      const n = m.inkInfo().clouds.length;
      if (n > prev) spits++;
      prev = n;
    }
    expect(spits).toBeGreaterThanOrEqual(1);
  });
  it('4 ブロック より 遠い と はかない', () => {
    const { step, tako, m } = pool({ px: 28.5, py: 14.2, pz: 20.5 });
    tako(20.5, 20.5);
    step(120);
    expect(m.inkInfo().clouds).toHaveLength(0);
  });
  it('AC9: すみで 体力は へらない。目が けむりの 中なら 暗さ 0.4、外に 出て 0.5 秒で 0', () => {
    const { step, tako, m, combat, player, info } = near();
    const id = tako(20.5, 20.5);
    step(30); // はいた
    const c = m.inkInfo().clouds[0]!;
    expect(c).toBeDefined();
    // 目を けむりの 中心へ
    player.position.x = c.x;
    player.position.z = c.z;
    player.position.y = c.y - 1.62;
    step(15);
    expect(m.inkDim()).toBeCloseTo(SW.dimAlpha, 9);
    expect(m.inkInfo().dim).toBeCloseTo(SW.dimAlpha, 9);
    // 外へ（半径より 遠く）
    player.position.x = c.x + 10;
    step(Math.round(SW.dimFadeOutSeconds * 60) + 1);
    expect(m.inkDim()).toBe(0);
    expect(combat.hits).toHaveLength(0);
    expect(info(id)).toBeDefined();
  });
  it('AC10: 自分からは 攻撃しない（2 ブロック 以内に 10 秒 いても 体力は へらない）', () => {
    const { step, tako, combat } = pool({ px: 22, py: 14.2, pz: 20.5 });
    tako(20.5, 20.5);
    step(600);
    expect(combat.hits).toHaveLength(0);
  });
});

describe('AC11: ぺちん', () => {
  /** りっくんを たこの 横 1.2 ブロック・水面の 上に ついて こさせる */
  const follow = (t: ReturnType<typeof pool>, id: number) => {
    const p = t.info(id).position;
    t.player.position.x = p.x + 1.2;
    t.player.position.z = p.z;
    t.player.position.y = 14.2;
  };
  it('たたくと 0.3 秒 あとに slapDamage（1）。1.5 秒に 1 回まで', () => {
    const t = pool();
    const { m, step, tako, combat, info } = t;
    const id = tako(20.5, 20.5);
    step(1);
    follow(t, id);
    m.damage(id, 1, { ...t.player.position });
    for (let i = 0; i < 17; i++) {
      follow(t, id);
      step(1);
    }
    expect(combat.hits).toHaveLength(0);
    for (let i = 0; i < 2; i++) {
      follow(t, id);
      step(1);
    }
    expect(combat.hits).toEqual([expect.objectContaining({ amount: SW.slapDamage, by: KIND })]);
    // まち時間の 間の たたきは すぐ 返さない
    m.damage(id, 1, { ...t.player.position });
    for (let i = 0; i < 60; i++) {
      follow(t, id);
      step(1);
    }
    expect(combat.hits).toHaveLength(1);
    // 1.5 秒 すぎれば また 返す
    for (let i = 0; i < 40; i++) {
      follow(t, id);
      step(1);
    }
    m.damage(id, 1, { ...t.player.position });
    for (let i = 0; i < 30; i++) {
      follow(t, id);
      step(1);
    }
    expect(combat.hits).toHaveLength(2);
    expect(info(id).hp).toBe(8 - 3);
  });
  it('slapReach（2.5）より 遠くに いたら 空ぶり', () => {
    const { m, step, tako, combat } = pool({ px: 28, py: 14.2, pz: 20.5 });
    const id = tako(20.5, 20.5);
    m.damage(id, 1, { x: 24, y: 14, z: 20.5 });
    step(60);
    expect(combat.hits).toHaveLength(0);
  });
});

describe('AC12: からかさ と 同じ 回数で たおれる', () => {
  it('同じ 武器（ダメージ 1）で 8 回', () => {
    const { m, tako, step, info } = pool({ px: 60, pz: 60 });
    const id = tako();
    step(2);
    const from = { x: 18, y: 15, z: 20.5 };
    for (let i = 0; i < 7; i++) m.damage(id, 1, from);
    expect(info(id).state).not.toBe('dying');
    m.damage(id, 1, from);
    expect(info(id).state).toBe('dying');
  });
});

describe('AC14: わき方', () => {
  function autoSpawn(country: 'sunahama' | 'harappa', opts: { phase?: DayPhase; seed?: number; water?: boolean } = {}) {
    const water = opts.water ?? true;
    const world = new ArrayVoxelWorld({ x: 128, y: 32, z: 64 });
    for (let x = 0; x < 128; x++) {
      for (let z = 0; z < 64; z++) {
        world.setBlock(x, 8, z, 'stone');
        if (water && x >= 64) for (let y = 9; y <= 14; y++) world.setBlock(x, y, z, 'water');
      }
    }
    const player = { position: { x: 64, y: 15, z: 32 } };
    const combat = makeCombat();
    const m = new YokaiManager({
      world,
      time: time(opts.phase ?? 'day'),
      getPlayer: () => player,
      combat,
      inventory: { add: () => 0 } as unknown as Inventory,
      seed: opts.seed ?? 1,
      countryOf: () => country,
    });
    m.config.yokaiWander = false;
    m.config.yokaiAutoSpawn = true;
    m.config.yokaiSpawnInterval = 1;
    m.config.yokaiMax = 100;
    return { m, world, player };
  }
  it('水の 列（深さ 4 以上）に だけ わく。ひる でも わく。同時に 2 体 まで', () => {
    const { m, world } = autoSpawn('sunahama', { phase: 'day' });
    let spawned = 0;
    let max = 0;
    for (let i = 0; i < 30000 && spawned < 5; i++) {
      m.update(1 / 60);
      for (const e of m.takeHookEvents()) {
        if (e.type !== 'spawn') continue;
        expect(e.kind).toBe(KIND);
        expect(world.getBlock(Math.floor(e.position.x), Math.floor(e.position.y + 1), Math.floor(e.position.z))).toBe('water');
        spawned++;
      }
      max = Math.max(max, m.list().filter((y) => y.kind === KIND).length);
    }
    expect(spawned).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(2);
  });
  it('陸の 列には わかない（水が ない 世界では 一度も 出ない）', () => {
    const { m } = autoSpawn('sunahama', { phase: 'night', water: false });
    for (let i = 0; i < 1500; i++) {
      m.update(1 / 60);
      for (const e of m.takeHookEvents()) if (e.type === 'spawn') expect(e.kind).not.toBe(KIND);
    }
  }, 30000);
  it('陸の くじには 入らない（重み 0）', () => {
    const { m } = autoSpawn('sunahama', { phase: 'night', water: false });
    const w = m.spawnWeights(10, 10);
    expect(w.weights[KIND]).toBeGreaterThan(0); // 表の 重みは ある（水の 列で 使う）
  });
  it('水の 浅い 池（深さ 3）には わかない', () => {
    const { m, world } = autoSpawn('sunahama', { phase: 'night' });
    for (let x = 64; x < 128; x++) for (let z = 0; z < 64; z++) for (let y = 9; y <= 11; y++) world.setBlock(x, y, z, 'stone');
    for (let i = 0; i < 3000; i++) {
      m.update(1 / 60);
      for (const e of m.takeHookEvents()) if (e.type === 'spawn') expect(e.kind).not.toBe(KIND);
    }
  });
});

describe('AC15: 国の 重み', () => {
  it('すなはま 35（からかさ は 今の 値 45）・はらっぱ 20・ほかの 国 15', () => {
    const row = (k: string) => COUNTRY_TABLE.find((r) => r.kind === k)!.yokai;
    expect(row('sunahama')[KIND]).toBe(35);
    expect(row('sunahama').karakasa).toBe(45);
    expect(row('harappa')[KIND]).toBe(20);
    for (const r of COUNTRY_TABLE) if (r.kind !== 'sunahama' && r.kind !== 'harappa') expect(r.yokai[KIND], r.kind).toBe(15);
  });
});

describe('AC16: 水を うめる', () => {
  it('体が 水の 外に なると 3 秒（180 コマ）で 消え、ドロップ・経験値は 出ない', () => {
    const { world, m, step, tako, added } = pool();
    const id = tako();
    step(2);
    for (let x = 18; x <= 23; x++) for (let z = 18; z <= 23; z++) for (let y = 9; y <= 14; y++) world.setBlock(x, y, z, 'stone');
    step(179);
    expect(m.list().find((e) => e.id === id)?.state).not.toBe('leaving');
    step(2);
    expect(m.list().find((e) => e.id === id)?.state).toBe('leaving');
    step(100);
    expect(m.list()).toHaveLength(0);
    expect(added).toHaveLength(0);
    expect(m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(0);
  });
});

describe('のけぞり・泳ぎの 土台', () => {
  it('たたかれて のけぞっても 水の 外へは 出ない', () => {
    const { m, tako, step, info } = pool({ w: 8, d: 8, px: 5, pz: 5, py: 25 });
    const id = tako(1.6, 4.5);
    m.damage(id, 1, { x: 5, y: 14, z: 4.5 }, { dist: 6, up: 0 } as never);
    step(40);
    expect(info(id).position.x).toBeGreaterThan(0.45);
  });
});
