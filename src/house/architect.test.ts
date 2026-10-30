import { describe, expect, it } from 'vitest';
import { Architect, NOD_STEPS, WANDER_RADIUS } from './architect';
import { makeFakeWorld } from './fakeWorld';
import { ARCHITECT_BODY, canStand, standY } from './ground';

/** HOUSE-1A AC4・AC40: 体力なし・自分の 場所から 横 3 マス以内を ぶらぶら・うなずき 22 ステップ */

const HOME = { x: 50.5, z: 50.5 };
const make = (world = makeFakeWorld(), seed = 1) => ({ world, a: new Architect({ id: 'first', first: true, x: HOME.x, y: 11, z: HOME.z, seed }) });
const far = (a: Architect): number => Math.hypot(a.x - HOME.x, a.z - HOME.z);

describe('ground: 立てる 地面', () => {
  it('草の 地面（高さ 10）の 上は y = 11。水・木の みき・頭の つかえる 所・読みこみ前は だめ', () => {
    const w = makeFakeWorld({ water: (x) => x === 5, loaded: (x) => x !== 6 });
    w.set(3, 11, 0, 'log'); // 木の みきが 立っている
    w.set(4, 11, 0, 'air');
    w.set(4, 12, 0, 'leaves'); // はっぱの 下（頭が つかえる）
    expect(standY(w, 0, 0)).toBe(11);
    expect(standY(w, 5, 0), '水の 中').toBeNull();
    expect(standY(w, 6, 0), '読みこみ前').toBeNull();
    expect(standY(w, 3, 0), 'みきの 中').toBeNull();
    expect(standY(w, 4, 0), 'はっぱの 下').toBeNull();
    w.set(7, 10, 0, 'log'); // みきの 上面
    expect(standY(w, 7, 0), 'みきの 上').toBeNull();
  });

  it('canStand: 1 段の 登り・2 段の おりは よい。2 段の 登り・3 段の おりは だめ', () => {
    const h = (x: number) => (x === 1 ? 11 : x === 2 ? 12 : x === 3 ? 7 : x === 4 ? 8 : 10);
    const w = makeFakeWorld({ height: h });
    expect(canStand(w, 1.5, 0.5, 11)).toBe(12); // 1 段 のぼる（y 11 → 12）
    expect(canStand(w, 2.5, 0.5, 11), '2 段').toBeNull();
    expect(canStand(w, 3.5, 0.5, 11), '3 段 おりる').toBeNull();
    expect(canStand(w, 4.5, 0.5, 11), '2 段 おりる').toBe(9);
    expect(canStand(w, 0.5, 0.5, 11)).toBe(11);
    expect(ARCHITECT_BODY.stepUp).toBe(1);
  });

  it('体の はしが 水・穴に かかる 所には 立てない（四すみを 見る）', () => {
    const w = makeFakeWorld({ water: (x) => x === 1 });
    expect(canStand(w, 0.5, 0.5, 11)).toBe(11);
    expect(canStand(w, 0.9, 0.5, 11), 'はしが 水に かかる').toBeNull();
  });
});

describe('AC40 ぶらぶら: 10,000 ステップの 間 いつも 自分の 場所から 横 3 マス以内', () => {
  it('ひらな 地面: いつも 3 マス以内・ちゃんと 歩く・止まって いる 時間も ある', () => {
    const { world, a } = make();
    expect(WANDER_RADIUS).toBeLessThanOrEqual(3);
    let max = 0;
    const states = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      a.update(world);
      max = Math.max(max, far(a));
      states.add(a.state);
      expect(far(a), `step ${i}`).toBeLessThanOrEqual(3);
    }
    expect(max, 'ちゃんと 歩く').toBeGreaterThan(1.2);
    expect([...states].sort()).toEqual(['idle', 'walk']);
  });

  it('でこぼこ・水・かべの ある 地面でも 3 マス以内。水・かべ・高い 段には 入らない', () => {
    const height = (x: number, z: number) => 10 + Math.floor(((((x * 7 + z * 13) % 5) + 5) % 5) / 2); // 10〜12 の でこぼこ
    const water = (x: number, z: number) => x >= 52 && x <= 53 && z >= 49 && z <= 52;
    const world = makeFakeWorld({ height, water });
    for (let z = 47; z <= 54; z++) {
      world.set(48, 11, z, 'stone');
      world.set(48, 12, z, 'stone');
    }
    const { a } = make(world, 7);
    for (let i = 0; i < 10_000; i++) {
      a.update(world);
      expect(far(a), `step ${i}`).toBeLessThanOrEqual(3);
      // 足もとの 四すみの どれも 水や かべの 列に かからない
      expect(canStand(world, a.x, a.z, a.y) !== null, `step ${i} (${a.x.toFixed(2)}, ${a.z.toFixed(2)}, y=${a.y.toFixed(2)})`).toBe(true);
    }
  });

  it('まわりが ぜんぶ かべで 歩けない 時は その場で 立って いる（にげ出さない）', () => {
    const world = makeFakeWorld();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        world.set(50 + dx, 11, 50 + dz, 'stone');
        world.set(50 + dx, 12, 50 + dz, 'stone');
      }
    }
    const { a } = make(world, 3);
    for (let i = 0; i < 3_000; i++) a.update(world);
    expect(far(a), '自分の 列から 出られない').toBeLessThanOrEqual(0.3);
  });

  it('同じ シード・同じ 世界なら 同じ 動き。シードが ちがえば ちがう', () => {
    const run = (seed: number) => {
      const { world, a } = make(makeFakeWorld(), seed);
      const out: string[] = [];
      for (let i = 0; i < 2_000; i++) {
        a.update(world);
        if (i % 50 === 0) out.push(`${a.x.toFixed(3)},${a.z.toFixed(3)},${a.state}`);
      }
      return out.join('|');
    };
    expect(run(1)).toBe(run(1));
    expect(run(1)).not.toBe(run(2));
  });

  it('歩く とき 向きは 進む 方へ。足は 20 コマで 1 歩（歩幅の 位相）', () => {
    const { world, a } = make();
    let walked = false;
    for (let i = 0; i < 3_000 && !walked; i++) {
      a.update(world);
      walked = a.state === 'walk' && a.gaitAmp > 0.9;
    }
    expect(walked).toBe(true);
    const g0 = a.gait;
    const x0 = a.x;
    const z0 = a.z;
    a.update(world);
    // 1 コマで 半周の 1/20（π/20）
    let d = a.gait - g0;
    if (d < 0) d += Math.PI * 2;
    expect(d).toBeCloseTo(Math.PI / 20, 5);
    const hx = a.x - x0;
    const hz = a.z - z0;
    if (Math.hypot(hx, hz) > 1e-6) {
      const want = Math.atan2(hx, -hz);
      const diff = Math.atan2(Math.sin(a.yaw - want), Math.cos(a.yaw - want));
      expect(Math.abs(diff)).toBeLessThan(0.7);
    }
  });
});

describe('AC4 体力なし: たたいても 消えない', () => {
  it('体力の 数が ない。10 回 たたいても 場所も 状態も そのまま（おっとっとだけ）', () => {
    const { world, a } = make();
    expect('hp' in a).toBe(false);
    expect('maxHp' in a).toBe(false);
    for (let i = 0; i < 10; i++) {
      a.hit(HOME.x + 1, HOME.z);
      expect(a.wobble).toBe(0);
      for (let k = 0; k < 40; k++) a.update(world);
      expect(a.wobble, 'おっとっとは 24 コマで おわる').toBe(-1);
    }
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    expect(far(a)).toBeLessThanOrEqual(3);
  });

  it('おっとっと: たたかれた 向きと 反対へ かたむく（向き wobbleDir）', () => {
    const { a } = make();
    a.hit(HOME.x + 2, HOME.z); // 東から たたかれた → 西へ
    expect(Math.sin(a.wobbleDir)).toBeLessThan(-0.9);
  });
});

describe('うなずき 22 ステップ', () => {
  it('話しかけると 22 ステップ うなずく: 21 ステップ目までは まだ、22 ステップ目で おわり', () => {
    const { world, a } = make();
    expect(NOD_STEPS).toBe(22);
    expect(a.nodDone()).toBe(false);
    a.beginTalk(HOME.x, HOME.z + 2);
    expect(a.state).toBe('talk');
    expect(a.nod).toBe(0);
    for (let i = 1; i <= 21; i++) {
      a.update(world, { x: HOME.x, z: HOME.z + 2 });
      expect(a.nodDone(), `step ${i}`).toBe(false);
      expect(a.nod).toBe(i);
    }
    a.update(world, { x: HOME.x, z: HOME.z + 2 });
    expect(a.nod).toBe(22);
    expect(a.nodDone()).toBe(true);
  });

  it('話している 間は 歩かない。こちらを 向く。おわると また ぶらぶら（すぐには 歩きださない）', () => {
    const { world, a } = make();
    const px = HOME.x + 2;
    const pz = HOME.z + 2; // 南東
    a.beginTalk(px, pz);
    const x0 = a.x;
    const z0 = a.z;
    for (let i = 0; i < 400; i++) a.update(world, { x: px, z: pz });
    expect(a.x).toBe(x0);
    expect(a.z).toBe(z0);
    const want = Math.atan2(px - a.x, -(pz - a.z));
    expect(Math.atan2(Math.sin(a.yaw - want), Math.cos(a.yaw - want))).toBeCloseTo(0, 1);
    a.endTalk();
    expect(a.state).toBe('idle');
    expect(a.nod).toBe(-1);
    let walkedAt = -1;
    for (let i = 0; i < 2_000 && walkedAt < 0; i++) {
      a.update(world);
      if (a.state === 'walk') walkedAt = i;
    }
    expect(walkedAt, 'おわって すぐは 歩かない').toBeGreaterThan(30);
  });

  it('話している 最中に もう一度 話しかけても うなずきは やりなおさない', () => {
    const { world, a } = make();
    a.beginTalk(HOME.x, HOME.z + 2);
    for (let i = 0; i < 5; i++) a.update(world, { x: HOME.x, z: HOME.z + 2 });
    a.beginTalk(HOME.x, HOME.z + 2);
    expect(a.nod).toBe(5);
  });
});

describe('地面に 合わせて 高さが かわる', () => {
  it('プレイヤーが 足もとを 1 段 高く すると なめらかに のぼる', () => {
    const { world, a } = make();
    expect(a.y).toBe(11);
    world.set(50, 10, 50, 'stone');
    world.set(50, 11, 50, 'stone'); // 高さ 11 に なった
    for (let i = 0; i < 20; i++) a.update(world);
    expect(a.y).toBeCloseTo(12, 2);
    expect(a.y).toBeLessThanOrEqual(12);
  });
});
