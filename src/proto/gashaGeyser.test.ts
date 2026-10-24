import { describe, expect, it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { apexOf, crackStage, funnelRadius, inColumn, liftStep, planShoulders, worldOf, type GeyserPlaceArgs, type GeyserSpec } from './gashaGeyserField';

const A: GeyserPlaceArgs = { x: 100, y: 5, z: 200, yaw: 0.7, scale: 0.465 };
const SHOULDER_CLOUD_TOP = 17; // 肩の 雲の 上の 面（地面から。ブロック）
const spec = (o: Partial<GeyserSpec> = {}): GeyserSpec => ({ x0: 10, z0: 20, w: 2, d: 2, ground: 5, top: 5 + T.geyser.height, born: 0, ...o });

describe('gashaGeyser（#293 間欠泉）の 計算', () => {
  const R = T.geyser;

  it('肩の 下の 2 本: 左右に 1 本ずつ、cells × cells で マスの 線に ぴったり、上は 身長の 基準', () => {
    const p = planShoulders(A);
    expect(p.length).toBe(2);
    for (const [i, s] of [1, -1].entries()) {
      const w = worldOf(A, s * R.shoulderX * A.scale, R.shoulderZ * A.scale);
      expect(Math.hypot(p[i]!.x0 + R.cells / 2 - w.x, p[i]!.z0 + R.cells / 2 - w.z)).toBeLessThanOrEqual(1);
      expect(p[i]!.cells).toBe(R.cells);
      expect(Number.isInteger(p[i]!.x0) && Number.isInteger(p[i]!.z0)).toBe(true);
      expect(p[i]!.top).toBe(A.y + R.height);
    }
    expect(planShoulders(A)).toEqual(p); // 同じ 引数なら 同じ
    expect(planShoulders(A, { ...R, cells: 3 }).every((q) => q.cells === 3)).toBe(true);
  });

  it('inColumn: 柱の マスの 中 だけ。根元の すこし 下から 上の はしまで', () => {
    const g = spec();
    const cx = g.x0 + g.w / 2, cz = g.z0 + g.d / 2;
    expect(inColumn(g, cx, g.ground, cz)).toBe(true);
    expect(inColumn(g, cx, g.top - 0.01, cz)).toBe(true);
    expect(inColumn(g, cx, g.top + 0.5, cz)).toBe(false);
    expect(inColumn(g, g.x0 - 0.01, g.ground + 1, cz)).toBe(false);
    expect(inColumn(g, g.x0 + g.w + 0.01, g.ground + 1, cz)).toBe(false);
    expect(inColumn(g, cx, g.ground + 1, g.z0 + g.d + 0.01)).toBe(false);
    expect(inColumn(spec({ w: 1, d: 1 }), 10.5, 6, 20.5)).toBe(true); // 1 マスの 柱
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
    const g = spec();
    expect(apexOf(g) - (g.ground - 1)).toBeGreaterThanOrEqual(SHOULDER_CLOUD_TOP + 2 - 1);
  });

  it('funnelRadius: 打ち上げの 上から 一定の 高さの 間だけ、上ほど ひろい（柱の ふちから funnelMax まで）', () => {
    const g = spec();
    expect(funnelRadius(g, g.top - 1)).toBeNull();
    expect(funnelRadius(g, g.top + R.funnelFrom - 0.1)).toBeNull();
    expect(funnelRadius(g, g.top + R.funnelHeight + 0.1)).toBeNull();
    const lo = funnelRadius(g, g.top + R.funnelFrom)!, hi = funnelRadius(g, g.top + R.funnelHeight - 0.1)!;
    expect(lo).toBeGreaterThan(g.w / 2);
    expect(hi).toBeGreaterThanOrEqual(lo);
    expect(hi).toBeLessThanOrEqual(g.w / 2 + R.funnelMax + 1e-9);
  });

  it('crackStage: 1 〜 crackStages の とびとびの 段で ふえる', () => {
    const n = R.spawn.crackStages;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
    expect(crackStage(0, n)).toBe(1);
    expect(crackStage(0.999, n)).toBe(n);
    expect(crackStage(1, n)).toBe(n);
    const seen = new Set<number>();
    for (let i = 0; i <= 100; i++) seen.add(crackStage(i / 100, n));
    expect([...seen].sort()).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });
});
