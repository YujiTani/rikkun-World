import { describe, expect, it } from 'vitest';
import { SPRAY_CONFIG, SprinklerFx, sprayOffset, sprayPhase, spraysAt } from './sprinklerFx';

describe('しぶき（AC9）', () => {
  it('120 ステップ ごと に 16 こ。場所 から 決まる ずらし（乱数 なし）', () => {
    const fx = new SprinklerFx();
    const at = { x: 10, y: 13, z: 10 };
    for (let t = 0; t < 480; t++) fx.update(t, [at], null);
    expect(fx.total).toBe(16 * 4);
    expect(fx.log.map((l) => l.tick).every((t, i, a) => i === 0 || t - a[i - 1] === 120)).toBe(true);
    expect(sprayPhase(10, 13, 10, 120)).toBe(sprayPhase(10, 13, 10, 120));
  });
  it('20 こ ならべて 120 ステップ: 出る ステップ が 2 つ 以上 に わかれる', () => {
    const fx = new SprinklerFx();
    const list = Array.from({ length: 20 }, (_, i) => ({ x: 20 + i, y: 13, z: 20 }));
    for (let t = 0; t < 120; t++) fx.update(t, list, null);
    expect(fx.log).toHaveLength(20);
    expect(new Set(fx.log.map((l) => l.tick)).size).toBeGreaterThanOrEqual(2);
  });
  it('つぶ は 30 ステップ で 消え、横 2 マス まで。同時 160 以下', () => {
    const fx = new SprinklerFx();
    const list = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 13, z: 0 }));
    let peak = 0;
    for (let t = 0; t < 240; t++) {
      fx.update(t, list, null);
      peak = Math.max(peak, fx.active);
      for (const p of fx.particles(t)) {
        const s = list.find((q) => Math.abs(q.x + 0.5 - p.x) <= 2.001 && Math.abs(q.z + 0.5 - p.z) <= 2.001);
        expect(s).toBeTruthy();
      }
    }
    expect(peak).toBeLessThanOrEqual(SPRAY_CONFIG.max);
    fx.update(1000, [], null);
    expect(fx.active).toBe(0);
  });
  it('32 マス より 遠い スプリンクラー は 出さない', () => {
    const fx = new SprinklerFx();
    const at = { x: 100, y: 13, z: 100 };
    for (let t = 0; t < 240; t++) fx.update(t, [at], { x: 0, y: 14, z: 0 });
    expect(fx.total).toBe(0);
  });
  it('弓なり: 出た ときと おなじ 高さ ちかく から はじまり、まん中で 高い', () => {
    const o = { x: 0, y: 0, z: 0 };
    const c = { ...SPRAY_CONFIG };
    expect(sprayOffset(0, 0, c, o).y).toBeCloseTo(0);
    expect(sprayOffset(0, 15, c, o).y).toBeGreaterThan(0.5);
    expect(Math.hypot(sprayOffset(3, 30, c, o).x, o.z)).toBeCloseTo(2);
    expect(spraysAt(0, 1, 2, 3, 1)).toBe(true);
  });
});
