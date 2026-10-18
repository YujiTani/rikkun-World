import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS, createW2Settings } from './contracts';

/**
 * WEAPON-5 AC1（docs/design/WEAPON-5.md §4.7）: パリィの 設定の 初期値。
 * 実装の 前は 設定に 名前が ないので 赤になる。
 */
describe('WEAPON-5 AC1: 設定の初期値', () => {
  it('§4.7 の 表どおり', () => {
    const s = createW2Settings() as unknown as Record<string, unknown>;
    expect(s.parryTicks).toEqual({ ready: 2, guard: 18, recover: 20 });
    expect(s.parryEarlyTicks).toBe(12);
    expect(s.parryKimeTicks).toBe(8);
    expect(s.parryEarlyMul).toBe(0.5);
    expect(s.parryArcDeg).toBe(90);
    expect(s.parrySlow).toEqual({ ticks: 6, scale: 0.25 });
    expect(s.parryGlowTicks).toBe(20);
    expect(s.staggerTicks).toBe(90);
    expect(s.staggerDamageMul).toBe(2);
    expect(s.reflectFireball).toEqual({ speed: 10, range: 8, damageMul: 1 });
  });
  it('毎回 ふかい コピー', () => {
    const a = createW2Settings() as unknown as { parryTicks: { ready: number }; reflectFireball: { speed: number } };
    a.parryTicks.ready = 9;
    a.reflectFireball.speed = 99;
    const d = W2_SETTING_DEFAULTS as unknown as { parryTicks: { ready: number }; reflectFireball: { speed: number } };
    expect(d.parryTicks.ready).toBe(2);
    expect(d.reflectFireball.speed).toBe(10);
    const b = createW2Settings() as unknown as { parryTicks: { ready: number } };
    expect(b.parryTicks.ready).toBe(2);
  });
});
