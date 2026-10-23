import { describe, expect, it } from 'vitest';
import { IMPACT, ImpactBus, SHAKE, impactOf, shakeAngles, type ImpactLevel } from './impact';

const D = Math.PI / 180;
const out = () => ({ yaw: 0, pitch: 0, roll: 0 });

describe('HIT-1 impactOf（段の 判定表）', () => {
  it('刀の 1・2 段目は 中、3 段目は 大', () => {
    expect(impactOf({ kind: 'tech', tech: 'thrust', step: 1 })).toBe('mid');
    expect(impactOf({ kind: 'tech', tech: 'kiriage', step: 2 })).toBe('mid');
    expect(impactOf({ kind: 'tech', tech: 'thrust', step: 3 })).toBe('large');
  });
  it('けさぎりは 大', () => {
    expect(impactOf({ kind: 'tech', tech: 'kesa' })).toBe('large');
  });
  it('矢・パンチは 中。二つ名つきなら 大', () => {
    expect(impactOf({ kind: 'arrow' })).toBe('mid');
    expect(impactOf({ kind: 'punch' })).toBe('mid');
    expect(impactOf({ kind: 'arrow', title: 'none' })).toBe('mid');
    for (const t of ['oyabun', 'taisho', 'nushi'] as const) {
      expect(impactOf({ kind: 'arrow', title: t })).toBe('large');
      expect(impactOf({ kind: 'punch', title: t })).toBe('large');
      expect(impactOf({ kind: 'tech', tech: 'thrust', step: 1, title: t })).toBe('large');
    }
  });
  it('ためわざの 最初の 当たり・たおした は 大', () => {
    expect(impactOf({ kind: 'charged' })).toBe('large');
    expect(impactOf({ kind: 'defeat' })).toBe('large');
  });
  it('ためわざの くり返し（2 回目から・真空波・らせん）は 止めなしの echo', () => {
    expect(impactOf({ kind: 'repeat' })).toBe('echo');
    expect(IMPACT.echo.stop).toBe(0);
    expect(IMPACT.echo.trauma).toBe(IMPACT.mid.trauma);
  });
  it('止める 数・ゆれの 量（AC1）', () => {
    expect(IMPACT.small.stop).toBe(0);
    expect(IMPACT.mid.stop).toBe(3);
    expect(IMPACT.large.stop).toBe(7);
    expect(IMPACT.mid.trauma).toBe(0.3);
    expect(IMPACT.large.trauma).toBe(0.75);
  });
});

describe('HIT-1 shakeAngles（AC5 2 乗・AC6 なめらか）', () => {
  it('ずれは trauma² に 比例（どの 時間でも）', () => {
    for (let t = 0; t < 3; t += 0.037) {
      const a = out();
      const b = out();
      shakeAngles(0.25, t, a);
      shakeAngles(0.5, t, b);
      expect(b.yaw).toBeCloseTo(a.yaw * 4, 12);
      expect(b.pitch).toBeCloseTo(a.pitch * 4, 12);
      expect(b.roll).toBeCloseTo(a.roll * 4, 12);
    }
  });
  it('中 1 回の ずれの 最大は 大 1 回の 2 割 以下', () => {
    const peak = (tr: number) => {
      let m = 0;
      const o = out();
      for (let i = 0; i < 600; i++) {
        shakeAngles(tr, i / 60, o);
        m = Math.max(m, Math.abs(o.yaw), Math.abs(o.pitch), Math.abs(o.roll));
      }
      return m;
    };
    expect(peak(IMPACT.mid.trauma) / peak(IMPACT.large.trauma)).toBeLessThanOrEqual(0.2);
  });
  it('trauma 0 なら ずれは 0', () => {
    const o = out();
    shakeAngles(0, 1.23, o);
    expect(o).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });
  it('最大の ずれは yaw 1.2°・pitch 0.8°・roll 0.4° を こえない', () => {
    const o = out();
    let y = 0;
    let p = 0;
    let r = 0;
    for (let i = 0; i < 6000; i++) {
      shakeAngles(1, i / 60, o);
      y = Math.max(y, Math.abs(o.yaw));
      p = Math.max(p, Math.abs(o.pitch));
      r = Math.max(r, Math.abs(o.roll));
    }
    expect(y).toBeLessThanOrEqual(1.2 * D + 1e-12);
    expect(p).toBeLessThanOrEqual(0.8 * D + 1e-12);
    expect(r).toBeLessThanOrEqual(0.4 * D + 1e-12);
    expect(y, 'ほぼ 最大まで 振れる').toBeGreaterThan(1.0 * D);
    expect(SHAKE.maxYawDeg).toBe(1.2);
    expect(SHAKE.maxPitchDeg).toBe(0.8);
    expect(SHAKE.maxRollDeg).toBe(0.4);
  });
  it('1 ステップの 変わり方は 小さい（最大の ずれの 半分 以下）。同じ 時間なら いつも 同じ 値', () => {
    const a = out();
    const b = out();
    const c = out();
    let dy = 0;
    let dp = 0;
    let dr = 0;
    for (let i = 0; i < 6000; i++) {
      shakeAngles(1, i / 60, a);
      shakeAngles(1, (i + 1) / 60, b);
      shakeAngles(1, i / 60, c);
      expect(c).toEqual(a);
      dy = Math.max(dy, Math.abs(b.yaw - a.yaw));
      dp = Math.max(dp, Math.abs(b.pitch - a.pitch));
      dr = Math.max(dr, Math.abs(b.roll - a.roll));
    }
    expect(dy).toBeLessThanOrEqual(SHAKE.maxYawDeg * D * 0.5);
    expect(dp).toBeLessThanOrEqual(SHAKE.maxPitchDeg * D * 0.5);
    expect(dr).toBeLessThanOrEqual(SHAKE.maxRollDeg * D * 0.5);
  });
});

describe('HIT-1 ImpactBus（AC2 同じ ステップは 長い ほう 1 回）', () => {
  const make = () => {
    const calls: { stop: number[]; shake: number[] } = { stop: [], shake: [] };
    let tick = 5;
    const bus = new ImpactBus({ stop: (n) => calls.stop.push(n), shake: (a) => calls.shake.push(a), tick: () => tick });
    return { bus, calls, setTick: (t: number) => (tick = t) };
  };
  it('当たりが なければ flush は 何も しない', () => {
    const { bus, calls } = make();
    bus.flush();
    expect(calls).toEqual({ stop: [], shake: [] });
    expect(bus.log).toEqual([]);
  });
  it('中 を 3 回 → 3 コマ・0.3 を 1 回', () => {
    const { bus, calls } = make();
    bus.hit('mid');
    bus.hit('mid');
    bus.hit('mid');
    bus.flush();
    expect(calls).toEqual({ stop: [3], shake: [0.3] });
    expect(bus.log).toEqual([{ tick: 5, level: 'mid' }]);
  });
  it('中と 大が 同じ ステップ → 大 1 回（順番に よらない）', () => {
    for (const order of [['mid', 'large'], ['large', 'mid'], ['mid', 'large', 'echo']] as ImpactLevel[][]) {
      const { bus, calls } = make();
      for (const l of order) bus.hit(l);
      bus.flush();
      expect(calls).toEqual({ stop: [7], shake: [0.75] });
      expect(bus.log).toHaveLength(1);
      expect(bus.log[0]!.level).toBe('large');
    }
  });
  it('小は 無視（止めも ゆれも 記録も なし）', () => {
    const { bus, calls } = make();
    bus.hit('small');
    bus.flush();
    expect(calls).toEqual({ stop: [], shake: [] });
    expect(bus.log).toEqual([]);
  });
  it('echo だけ → 止めなし（0 コマ）・ゆれは 中の 量', () => {
    const { bus, calls } = make();
    bus.hit('echo');
    bus.flush();
    expect(calls).toEqual({ stop: [0], shake: [0.3] });
  });
  it('flush の あとは 空に もどり、つぎの ステップは 別の 当たり', () => {
    const { bus, calls, setTick } = make();
    bus.hit('large');
    bus.flush();
    bus.flush();
    setTick(6);
    bus.hit('mid');
    bus.flush();
    expect(calls).toEqual({ stop: [7, 3], shake: [0.75, 0.3] });
    expect(bus.log.map((l) => l.tick)).toEqual([5, 6]);
  });
  it('記録は 最新 64 こ まで', () => {
    const { bus } = make();
    for (let i = 0; i < 80; i++) {
      bus.hit('mid');
      bus.flush();
    }
    expect(bus.log).toHaveLength(64);
  });
});
