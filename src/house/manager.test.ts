import { describe, expect, it } from 'vitest';
import { ARCHITECT_HIT } from './architect';
import { makeFakeWorld, type FakeWorld } from './fakeWorld';
import { ArchitectManager, type ArchitectManagerDeps } from './manager';
import { placeFirst, placeInRegion, regionHasArchitect, regionIndex } from './placement';
import type { HouseRecord } from './talk';

/** HOUSE-1A AC1・AC2・AC4: 一覧に 載る 建築士さん（最初の 1 人・区画ごとの 人）。どれも 立てる 地面。同じ シードなら 同じ 場所 */

const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };

function make(over: Omit<Partial<ArchitectManagerDeps>, 'player' | 'world'> & { world?: FakeWorld; player?: { x: number; y: number; z: number } } = {}) {
  const world = over.world ?? makeFakeWorld();
  const record: HouseRecord = over.record ?? { toolsGiven: false, first: null };
  const player = over.player ?? { x: SPAWN.x, y: 11, z: SPAWN.z };
  const m = new ArchitectManager({
    seed: over.seed ?? 4242,
    world,
    spawn: () => SPAWN,
    record,
    player: () => player,
    isLand: over.isLand ?? (() => true),
  });
  return { m, world, record, player };
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('AC1 最初の 1 人', () => {
  it('はじまりの 世界で ちょうど 1 人（first: true）。スタートから 横 6〜10 マス。足もとは 草の 上（y = 11）', () => {
    const { m, record } = make();
    m.update();
    const firsts = m.list().filter((a) => a.first);
    expect(firsts).toHaveLength(1);
    const f = firsts[0]!;
    expect(f.id).toBe('first');
    expect(f.busy).toBe(false);
    expect(dist(f, SPAWN)).toBeGreaterThanOrEqual(6);
    expect(dist(f, SPAWN)).toBeLessThanOrEqual(10);
    expect(f.y).toBe(11);
    // マスの まん中
    expect(f.x - Math.floor(f.x)).toBeCloseTo(0.5, 5);
    expect(f.z - Math.floor(f.z)).toBeCloseTo(0.5, 5);
    // 決まった 場所は セーブの 記録に 書く
    expect(record.first).toEqual({ x: Math.floor(f.x), z: Math.floor(f.z) });
  });

  it('同じ シードで 2 回 作ると 同じ 座標。置き方の 関数と 同じ。シードが ちがえば ちがう', () => {
    const a = make({ seed: 7 });
    const b = make({ seed: 7 });
    const c = make({ seed: 8 });
    a.m.update();
    b.m.update();
    c.m.update();
    expect(a.m.list()).toEqual(b.m.list());
    expect(a.m.list()[0]).not.toEqual(c.m.list()[0]);
    const want = placeFirst(7, { x: 64, z: 64 }, () => true, 0)!;
    expect(a.m.list()[0]).toMatchObject({ x: want.x + 0.5, z: want.z + 0.5 });
  });

  it('スタートの 画面（向き 北）から 見える 側に 出る（北 ± 60 度）', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { m } = make({ seed });
      m.update();
      const f = m.list()[0]!;
      const deg = (Math.atan2(f.x - SPAWN.x, -(f.z - SPAWN.z)) * 180) / Math.PI;
      expect(Math.abs(deg), `seed ${seed}`).toBeLessThanOrEqual(60);
    }
  });

  it('水・立てない 列は さける: 北側が ぜんぶ 水でも 立てる 列に 出る', () => {
    const water = (_x: number, z: number) => z < 64;
    const { m } = make({ world: makeFakeWorld({ water }), isLand: (_x, z) => z >= 64 });
    m.update();
    const f = m.list()[0]!;
    expect(f.z).toBeGreaterThan(64);
    expect(dist(f, SPAWN)).toBeGreaterThanOrEqual(6);
  });

  it('候補の 列が まだ 読みこまれて いない うちは 出さない（そろったら 決める）。決まった あとは 動かない', () => {
    let ready = false;
    const world = makeFakeWorld({ loaded: () => ready });
    const { m, record } = make({ world });
    m.update();
    expect(m.list()).toEqual([]);
    expect(record.first).toBeNull();
    ready = true;
    m.refresh();
    const first = m.list()[0]!;
    expect(first).toBeTruthy();
    // 世界が かわっても 記録した 場所に 出る
    const again = make({ world: makeFakeWorld(), record: { ...record } });
    again.m.update();
    expect(again.m.list()[0]).toMatchObject({ x: first.x, z: first.z });
  });

  it('セーブに のこった 場所が あれば それを 使う（置き方の 関数の 答えと ちがっても）', () => {
    const { m } = make({ record: { toolsGiven: true, first: { x: 70, z: 60 } } });
    m.update();
    expect(m.list()[0]).toMatchObject({ first: true, x: 70.5, z: 60.5, y: 11 });
  });

  it('古い セーブ（記録なし）でも 最初の 1 人は 出る', () => {
    const { m, record } = make({ record: { toolsGiven: false, first: null } });
    m.update();
    expect(m.list()).toHaveLength(1);
    expect(record.first).not.toBeNull();
  });

  it('木の みきで 立てない 列に 記録が あっても、近くの 立てる 列に 出る', () => {
    const world = makeFakeWorld();
    world.set(70, 11, 60, 'log');
    world.set(70, 12, 60, 'log');
    const { m } = make({ world, record: { toolsGiven: false, first: { x: 70, z: 60 } } });
    m.update();
    const f = m.list()[0]!;
    expect(dist(f, { x: 70.5, z: 60.5 })).toBeLessThanOrEqual(3);
    expect(f.y).toBe(11);
  });
});

describe('AC2 区画ごとの 建築士さん', () => {
  const START = { x: 64, z: 64 };
  /** スタートの 区画の 外で、建築士さんが 出る 区画を スタートに 近い 順に 1 つ（シードごとに 決まる） */
  function regionWith(seed: number): { rx: number; rz: number; spot: { x: number; z: number } } {
    for (let r = 1; r < 8; r++) {
      for (let rz = -r; rz <= r; rz++) {
        for (let rx = -r; rx <= r; rx++) {
          if (Math.max(Math.abs(rx), Math.abs(rz)) !== r || !regionHasArchitect(seed, rx, rz, START)) continue;
          return { rx, rz, spot: placeInRegion(seed, rx, rz, () => true)! };
        }
      }
    }
    throw new Error('当たりの 区画が ない');
  }
  const near = (spot: { x: number; z: number }) => ({ x: spot.x + 0.5 + 5, y: 11, z: spot.z + 0.5 + 5 });

  it('プレイヤーの まわりの 当たりの 区画に だけ 出る。id は 区画の 番号。場所は 置き方の 関数と 同じ（区画の 中）', () => {
    for (const seed of [99, 31, 12, 5]) {
      const target = regionWith(seed);
      const player = near(target.spot);
      const { m } = make({ seed, player });
      m.refresh();
      const others = m.list().filter((a) => !a.first);
      expect(others.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      for (const a of others) {
        const rx = regionIndex(a.x);
        const rz = regionIndex(a.z);
        expect(a.id).toBe(`r${rx}_${rz}`);
        expect(regionHasArchitect(seed, rx, rz, START)).toBe(true);
        const want = placeInRegion(seed, rx, rz, () => true)!;
        expect(a).toMatchObject({ x: want.x + 0.5, z: want.z + 0.5, first: false });
      }
      // まわり 128 マスに ある 当たりの 区画の 数だけ（brute force）
      let expected = 0;
      for (let rz = regionIndex(player.z - 200); rz <= regionIndex(player.z + 200); rz++) {
        for (let rx = regionIndex(player.x - 200); rx <= regionIndex(player.x + 200); rx++) {
          if (!regionHasArchitect(seed, rx, rz, START)) continue;
          const w = placeInRegion(seed, rx, rz, () => true)!;
          if (Math.hypot(w.x + 0.5 - player.x, w.z + 0.5 - player.z) <= 128) expected++;
        }
      }
      expect(others, `seed ${seed}`).toHaveLength(expected);
    }
  });

  it('スタートの 区画には 最初の 1 人 だけ（ふえない）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { m } = make({ seed });
      m.refresh();
      const inStart = m.list().filter((a) => regionIndex(a.x) === regionIndex(SPAWN.x) && regionIndex(a.z) === regionIndex(SPAWN.z));
      expect(inStart.length, `seed ${seed}`).toBe(1);
      expect(inStart[0]!.first, `seed ${seed}`).toBe(true);
    }
  });

  it('遠く はなれると 一覧から きえ、もどると 同じ 場所に 出る（来た 順に よらない）', () => {
    const seed = 31;
    const target = regionWith(seed);
    const player = near(target.spot);
    const { m } = make({ seed, player });
    m.refresh();
    const before = m.list().filter((a) => !a.first);
    expect(before.length).toBeGreaterThanOrEqual(1);
    player.x += 3000;
    player.z += 3000;
    m.refresh();
    expect(m.list()).toEqual([]);
    player.x -= 3000;
    player.z -= 3000;
    m.refresh();
    expect(m.list().filter((a) => !a.first)).toEqual(before);
  });

  it('水の 上には 出ない: 地形で 候補が ぜんぶ 水なら その 区画は 0 人。一部 だけ 水なら 水でない 列に 出る', () => {
    const seed = 5;
    const target = regionWith(seed);
    const player = near(target.spot);
    const withLand = make({ seed, player });
    withLand.m.refresh();
    expect(withLand.m.list().some((a) => a.id === `r${target.rx}_${target.rz}`)).toBe(true);
    const sea = make({ seed, world: makeFakeWorld({ water: () => true }), isLand: () => false, player });
    sea.m.refresh();
    expect(sea.m.list().filter((a) => !a.first)).toEqual([]);
    // 先頭の 候補の 列だけ 水: その 列は さけて 次の 候補に 出る（次の 候補の そばに 立つ）
    const land = (x: number, z: number): boolean => !(x === target.spot.x && z === target.spot.z);
    const second = placeInRegion(seed, target.rx, target.rz, land)!;
    const some = make({ seed, world: makeFakeWorld({ water: (x, z) => !land(x, z) }), isLand: land, player: near(second) });
    some.m.refresh();
    const got = some.m.list().find((a) => a.id === `r${target.rx}_${target.rz}`);
    expect(got).toBeTruthy();
    expect(got).toMatchObject({ x: second.x + 0.5, z: second.z + 0.5 });
    expect(dist(got!, { x: target.spot.x + 0.5, z: target.spot.z + 0.5 })).toBeGreaterThan(0);
  });

  it('先の 候補の 列が まだ 読みこまれて いない うちは 後ろの 候補に 出さない（読みこみの 順で 場所が かわらない）', () => {
    const seed = 12;
    const target = regionWith(seed);
    const isFirstSpot = (x: number, z: number): boolean => x === target.spot.x && z === target.spot.z;
    const second = placeInRegion(seed, target.rx, target.rz, (x, z) => !isFirstSpot(x, z))!;
    const player = near(second);
    let go = false;
    // 先頭の 候補の 列は あとから 読みこまれる。読みこまれたら そこは 水（立てない）と 分かる
    const world = makeFakeWorld({ water: isFirstSpot, loaded: (x, z) => go || !isFirstSpot(x, z) });
    const { m } = make({ seed, world, player });
    m.refresh();
    expect(m.list().some((a) => a.id === `r${target.rx}_${target.rz}`), '先頭の 候補が 読みこまれる 前').toBe(false);
    go = true;
    m.refresh();
    const got = m.list().find((a) => a.id === `r${target.rx}_${target.rz}`);
    expect(got, '先頭の 候補が 水だと 分かった あと').toMatchObject({ x: second.x + 0.5, z: second.z + 0.5 });
    // 最初から 全部 読みこまれて いた 世界でも 同じ 場所
    const all = make({ seed, world: makeFakeWorld({ water: isFirstSpot }), player });
    all.m.refresh();
    expect(all.m.list().find((a) => a.id === `r${target.rx}_${target.rz}`)).toEqual(got);
  });
});

describe('当たり判定（右クリックで 話す 相手）', () => {
  const eye = (a: { x: number; y: number; z: number }) => ({ x: a.x, y: a.y + 1.6, z: a.z + 2 });
  const dirTo = (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const l = Math.hypot(dx, dy, dz);
    return { x: dx / l, y: dy / l, z: dz / l };
  };

  it('2 マス 南から 体の まん中を ねらうと 当たる。distance は 目から の きょり。ねらえる きょり（reach）の 外は 当たらない', () => {
    const { m } = make();
    m.update();
    const a = m.list()[0]!;
    const o = eye(a);
    const mid = { x: a.x, y: a.y + 0.5, z: a.z };
    const d = dirTo(o, mid);
    const h = m.rayHit(o, d, 5.5);
    expect(h?.id).toBe('first');
    expect(h!.distance).toBeGreaterThan(1.5);
    expect(h!.distance).toBeLessThan(2.6);
    expect(m.rayHit(o, d, 1)).toBeNull();
  });

  it('頭の 上・足もとの 下・よこに それた 線は 当たらない。高さは ARCHITECT_HIT.h まで', () => {
    const { m } = make();
    m.update();
    const a = m.list()[0]!;
    const o = { x: a.x, y: a.y + 0.5, z: a.z + 3 };
    expect(m.rayHit(o, { x: 0, y: 0, z: -1 }, 5)?.id).toBe('first');
    expect(m.rayHit({ ...o, y: a.y + ARCHITECT_HIT.h + 0.1 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
    expect(m.rayHit({ ...o, y: a.y - 0.2 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
    expect(m.rayHit({ ...o, x: a.x + 1 }, { x: 0, y: 0, z: -1 }, 5)).toBeNull();
  });
});

describe('話す・たたく（一覧の 窓口）', () => {
  it('話しはじめると その場で 止まって うなずく。2 回目の 話しかけは 受けつけない。おわると ぶらぶらに もどる', () => {
    const { m, player } = make();
    m.update();
    const a = m.get('first')!;
    expect(m.beginTalk('first', player)).toBe(true);
    expect(a.state).toBe('talk');
    expect(m.beginTalk('first', player)).toBe(false);
    expect(m.beginTalk('nobody', player)).toBe(false);
    const x0 = a.x;
    for (let i = 0; i < 100; i++) m.update();
    expect(a.x).toBe(x0);
    expect(a.nodDone()).toBe(true);
    m.endTalk('first');
    expect(a.state).toBe('idle');
  });

  it('たたいても 消えない: 10 回 たたいても 一覧に 1 人 のこり、体力の 数は ない', () => {
    const { m, player } = make();
    m.update();
    for (let i = 0; i < 10; i++) {
      m.hit('first', { x: player.x + 1, y: 11, z: player.z });
      for (let k = 0; k < 30; k++) m.update();
    }
    expect(m.list()).toHaveLength(1);
    expect('hp' in m.get('first')!).toBe(false);
  });
});

describe('AC40 10,000 ステップ: 一覧に 載った まま 自分の 場所から 横 3 マス以内', () => {
  it('ずっと ぶらぶらしても 3 マス以内（一覧の 更新も 同じ 時間 回す）', () => {
    const { m } = make();
    m.update();
    const home = { x: m.list()[0]!.x, z: m.list()[0]!.z };
    for (let i = 0; i < 10_000; i++) {
      m.update();
      const a = m.list()[0]!;
      expect(dist(a, home), `step ${i}`).toBeLessThanOrEqual(3);
    }
  });
});
