import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { apexOf, funnelRadius, inColumn, liftStep, planGeysers, worldOf, type GeyserPlaceArgs } from './gashaGeyser';

const A: GeyserPlaceArgs = { x: 100, y: 5, z: 200, yaw: 0.7, scale: 0.465 };
const flat = () => 4; // 地面の いちばん 上の ブロック（立つ 面は 5）
const SHOULDER_CLOUD_TOP = 17; // 肩の 雲の 上の 面（地面から。ブロック）

describe('gashaGeyser（#293 間欠泉）', () => {
  const R = T.geyser;
  const specs = planGeysers(A, flat);

  it('おなじ 引数なら 場所も おなじ（置いた とき きまる）', () => {
    expect(planGeysers(A, flat)).toEqual(specs);
  });

  it('本数は 調整表どおり。1 本は cells × cells マスで、マスの 線に ぴったり', () => {
    expect(specs.length).toBe(R.count);
    for (const g of specs) {
      expect(g.cells).toBe(R.cells);
      expect(Number.isInteger(g.x0) && Number.isInteger(g.z0)).toBe(true);
    }
    const three = planGeysers(A, flat, { ...R, cells: 3 });
    expect(three.every((g) => g.cells === 3)).toBe(true);
  });

  it('左右の 肩の 下に 1 本ずつ（からだの 左右 = 肩の 外がわ）', () => {
    const ctr = (g: (typeof specs)[number]) => ({ x: g.x0 + g.cells / 2, z: g.z0 + g.cells / 2 });
    for (const s of [1, -1]) {
      const w = worldOf(A, s * R.shoulderX * A.scale, R.shoulderZ * A.scale);
      const near = specs.filter((g) => Math.hypot(ctr(g).x - w.x, ctr(g).z - w.z) <= 1.5);
      expect(near.length).toBe(1);
    }
  });

  it('からだの 前（両うでの あいだ）に 1 本（頭の 上から とびおりる 先）', () => {
    const w = worldOf(A, 0, R.frontRadius);
    const near = specs.filter((g) => Math.hypot(g.x0 + g.cells / 2 - w.x, g.z0 + g.cells / 2 - w.z) <= 1.5);
    expect(near.length).toBe(1);
  });

  it('からだの 中心から 10〜18 ブロック ほどの ところに あり、おたがい 離れて いる', () => {
    for (const g of specs) {
      const d = Math.hypot(g.x0 + g.cells / 2 - A.x, g.z0 + g.cells / 2 - A.z);
      expect(d).toBeGreaterThanOrEqual(R.ringMin - 1.5);
      expect(d).toBeLessThanOrEqual(R.ringMax + 1.5);
    }
    for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
      const a = specs[i]!, b = specs[j]!;
      expect(Math.hypot(a.x0 - b.x0, a.z0 - b.z0)).toBeGreaterThanOrEqual(R.minGap - 1);
    }
  });

  it('柱の 根元は 立つ 面（その マスの いちばん 高い 地面 + 1）で、高い 地面では 柱が 短く なるだけ', () => {
    expect(specs.every((g) => g.ground === 5 && g.top === A.y + R.height)).toBe(true);
    const bumpy = planGeysers(A, (x, z) => (x + z) % 3 === 0 ? 7 : 4);
    for (const g of bumpy) expect(g.ground).toBeGreaterThanOrEqual(5);
  });

  it('出る 時間は 調整表の はんいで ばらばら', () => {
    for (const g of specs) { expect(g.delay).toBeGreaterThanOrEqual(R.delaySec[0]); expect(g.delay).toBeLessThanOrEqual(R.delaySec[1]); }
    expect(new Set(specs.map((g) => g.delay.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('inColumn: 柱の マスの 中 だけ。根元の すこし 下から 上の はしまで', () => {
    const g = specs[0]!;
    const cx = g.x0 + g.cells / 2, cz = g.z0 + g.cells / 2;
    expect(inColumn(g, cx, g.ground, cz)).toBe(true);
    expect(inColumn(g, cx, g.top - 0.01, cz)).toBe(true);
    expect(inColumn(g, cx, g.top + 0.5, cz)).toBe(false);
    expect(inColumn(g, g.x0 - 0.01, g.ground + 1, cz)).toBe(false);
    expect(inColumn(g, g.x0 + g.cells + 0.01, g.ground + 1, cz)).toBe(false);
    expect(inColumn(g, cx, g.ground + 1, g.z0 + g.cells + 0.01)).toBe(false);
  });

  it('liftStep: 落ちて いても まず ゆるめ、上へ 加速して launchSpeed で 止まる', () => {
    const dt = 1 / 60;
    expect(liftStep(-30, dt)).toBeGreaterThan(-R.slowFall);
    let v = -30;
    for (let i = 0; i < 120; i++) v = liftStep(v, dt);
    expect(v).toBeCloseTo(R.launchSpeed, 6);
    expect(liftStep(R.launchSpeed + 5, dt)).toBe(R.launchSpeed);
  });

  it('ろうとは 打ち上げの いちばん 高い ところより 上から（のぼりの じゃまを しない）', () => {
    expect(R.funnelFrom).toBeGreaterThan((R.launchSpeed * R.launchSpeed) / (2 * 28));
  });

  it('打ち上げの いちばん 高い ところは 肩の 雲の 上 + 2 ブロック いじょう', () => {
    for (const g of specs) expect(apexOf(g) - g.ground).toBeGreaterThanOrEqual(SHOULDER_CLOUD_TOP + 2);
  });

  it('funnelRadius: 打ち上げの 上から 一定の 高さの 間だけ、上ほど ひろい（柱の ふちから funnelMax まで）', () => {
    const g = specs[0]!;
    expect(funnelRadius(g, g.top - 1)).toBeNull();
    expect(funnelRadius(g, g.top + R.funnelFrom - 0.1)).toBeNull(); // 打ち上げの 高さ（apex）では じゃましない
    expect(funnelRadius(g, g.top + R.funnelHeight + 0.1)).toBeNull();
    const lo = funnelRadius(g, g.top + R.funnelFrom)!, hi = funnelRadius(g, g.top + R.funnelHeight - 0.1)!;
    expect(lo).toBeGreaterThan(g.cells / 2);
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi).toBeLessThanOrEqual(g.cells / 2 + R.funnelMax + 1e-9);
  });
});
