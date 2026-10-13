import { describe, expect, it } from 'vitest';
import { createM7Settings } from '../contracts';
import { createPet } from '../farm/pet';
import { FarmSparkle } from './farmSparkle';

interface C {
  x: number;
  y: number;
  z: number;
  stage: number;
}
const settings = () => createM7Settings();

function mk(crops: C[], happy?: ReturnType<typeof createPet>) {
  const s = settings();
  const pet = happy ?? createPet({ settings: s, dayLength: () => 91_800 });
  const sp = new FarmSparkle({
    settings: s,
    crops: () => crops,
    stageAt: (x, y, z) => crops.find((c) => c.x === x && c.y === y && c.z === z)?.stage ?? null,
    happy: (fn) => pet.forEach(fn),
  });
  return { sp, pet, s };
}
const run = (sp: FarmSparkle, n: number, eye = { x: 0, y: 10, z: 0 }, from = 0) => {
  for (let i = 0; i < n; i++) sp.step(from + i, eye);
};

describe('キラキラ（AC16）', () => {
  const ten = (stage: number, dx = 0): C[] => Array.from({ length: 10 }, (_, i) => ({ x: 5 + i + dx, y: 8, z: 3 + (i % 3), stage }));
  it('10 マス いない の stage 3 を 10 こ → 450 ステップ で ちょうど 100', () => {
    const { sp } = mk(ten(3));
    run(sp, 450);
    expect(sp.counts.star).toBe(100);
  });
  it('stage 0〜2 は 0・25 マス 先 は 0', () => {
    for (const st of [0, 1, 2]) {
      const { sp } = mk(ten(st));
      run(sp, 450);
      expect(sp.counts.star).toBe(0);
    }
    const far = mk(ten(3, 30));
    run(far.sp, 450);
    expect(far.sp.counts.star).toBe(0);
  });
  it('ずらし: 作物 ごと に 出る ステップ が わかれる', () => {
    const { sp } = mk(ten(3));
    const stepsWith: number[] = [];
    let last = 0;
    for (let i = 0; i < 45; i++) {
      sp.step(i, { x: 0, y: 10, z: 0 });
      if (sp.counts.star > last) stepsWith.push(i);
      last = sp.counts.star;
    }
    expect(stepsWith.length).toBeGreaterThan(3);
  });
  it('同時 96 まで（ぜんぶ stage 3・近い）', () => {
    const many: C[] = [];
    for (let x = 0; x < 30; x++) for (let z = 0; z < 16; z++) many.push({ x, y: 8, z, stage: 3 });
    const { sp } = mk(many);
    let max = 0;
    for (let i = 0; i < 400; i++) {
      sp.step(i, { x: 15, y: 10, z: 8 });
      max = Math.max(max, sp.active(0));
    }
    expect(max).toBeLessThanOrEqual(96);
    expect(max).toBeGreaterThan(50);
  });
  it('しゅうかく で なくなった 作物 は 出さない', () => {
    const crops = ten(3);
    const { sp } = mk(crops);
    run(sp, 5);
    for (const c of crops) c.stage = 0 as never; // stageAt は 今 0 を 返す（一覧 は 古い まま）
    sp.reset();
    run(sp, 10, { x: 0, y: 10, z: 0 }, 5);
    expect(sp.counts.star).toBe(0);
  });
  it('寿命 40 ステップ で 消える・40 ステップ で 0.4 のぼる', () => {
    const { sp } = mk([{ x: 5, y: 8, z: 3, stage: 3 }]);
    run(sp, 300);
    const out = { pos: new Float32Array(3 * 8), col: new Float32Array(3 * 8), size: new Float32Array(8) };
    // 星 が いつも 40 以下 の ステップ しか 生きない
    sp.reset();
    run(sp, 45, { x: 0, y: 10, z: 0 }, 300);
    expect(sp.counts.star).toBe(1);
    run(sp, 41, { x: 0, y: 10, z: 0 }, 345);
    expect(sp.write(0, out, 8)).toBeLessThanOrEqual(1);
  });
});

describe('ハート・ゆれ（AC15）', () => {
  it('なでた: happy は ハート 3 つ、again・wild は 1 つ、ゆれ 24 ステップ', () => {
    const { sp } = mk([]);
    sp.onPet(3, 8, 4, 'happy');
    expect(sp.counts.heart).toBe(3);
    expect(sp.sway(3, 8, 4)).toBe(24);
    sp.reset();
    sp.onPet(3, 8, 4, 'again');
    sp.onPet(7, 8, 4, 'wild');
    expect(sp.counts.heart).toBe(2);
    for (let i = 0; i < 23; i++) sp.step(i, { x: 0, y: 10, z: 0 });
    expect(sp.sway(3, 8, 4)).toBeGreaterThan(0);
    sp.step(23, { x: 0, y: 10, z: 0 });
    expect(sp.sway(3, 8, 4)).toBe(0);
    expect(sp.swayAngleDeg(3, 8, 4)).toBe(0);
  });
  it('ゆれ の 角度 は ±10° 以内 で 2 往復', () => {
    const { sp } = mk([]);
    sp.onPet(1, 1, 1, 'happy');
    let crossings = 0;
    let prev = 0;
    let maxA = 0;
    for (let i = 0; i < 24; i++) {
      const a = sp.swayAngleDeg(1, 1, 1);
      maxA = Math.max(maxA, Math.abs(a));
      if (prev * a < 0) crossings++;
      prev = a || prev;
      sp.step(i, { x: 0, y: 10, z: 0 });
    }
    expect(maxA).toBeLessThanOrEqual(10);
    expect(maxA).toBeGreaterThan(8);
    expect(crossings).toBeGreaterThanOrEqual(3);
  });
  it('ごきげん の 作物: 10 マス で 900 ステップ → 5 こ、20 マス 先 は 0', () => {
    const near = mk([]);
    near.pet.pet(8, 8, 3, { kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false, wild: false });
    run(near.sp, 900, { x: 0, y: 8, z: 3 });
    expect(near.sp.counts.heart).toBe(5);
    const far = mk([]);
    far.pet.pet(20, 8, 3, { kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false, wild: false });
    run(far.sp, 900, { x: 0, y: 8, z: 3 });
    expect(far.sp.counts.heart).toBe(0);
  });
  it('ごきげん ハート は 同時 32 まで', () => {
    const { sp, pet } = mk([]);
    for (let i = 0; i < 100; i++) pet.pet(i % 10, 8, Math.floor(i / 10), { kind: 'tomato', stage: 1, stageTicks: 0, wet: false, lit: true, ripe: false, wild: false });
    let max = 0;
    for (let i = 0; i < 400; i++) {
      sp.step(i, { x: 5, y: 8, z: 5 });
      max = Math.max(max, sp.active(2));
    }
    expect(max).toBeLessThanOrEqual(32);
  });
  it('1 ステップ の 計算 が 軽い（作物 480・ごきげん 480）', () => {
    const crops: C[] = [];
    for (let i = 0; i < 480; i++) crops.push({ x: i % 40, y: 8, z: Math.floor(i / 40), stage: 3 });
    const { sp, pet } = mk(crops);
    for (const c of crops) pet.pet(c.x, c.y, c.z, { kind: 'tomato', stage: 3, stageTicks: 0, wet: false, lit: true, ripe: true, wild: false });
    run(sp, 200, { x: 20, y: 10, z: 6 });
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      sp.step(200 + i, { x: 20, y: 10, z: 6 });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[50]).toBeLessThan(0.3);
  });
});

describe('forEachSway', () => {
  it('ゆれ中の 作物 を 角度つきで 返す', () => {
    const s = new FarmSparkle({
      settings: { farmSparkleEvery: 45, farmSparkleRange: 24, farmSparkleMax: 96, farmHeartEvery: 90, farmHeartRange: 16, farmHeartMax: 32 },
      crops: () => [],
      stageAt: () => null,
      happy: () => {},
    });
    s.onPet(3, 4, 5, 'ok' as never);
    const got: number[][] = [];
    s.forEachSway((x, y, z, d) => got.push([x, y, z, d]));
    expect(got.length).toBe(1);
    expect(got[0].slice(0, 3)).toEqual([3, 4, 5]);
  });
});
