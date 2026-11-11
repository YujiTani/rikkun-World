import { describe, expect, it } from 'vitest';
import type { BowEvent } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { BURST_FRAMES, createYataModel } from './yatagarasuFxModel';

const Y = LEGEND4_TUNING.yatagarasu;
const arrow = (id: number, burst = true) => ({ id, position: { x: id, y: 1, z: 0 }, velocity: { x: 10, y: 0, z: 0 }, burst });
const burstEv = (x: number): BowEvent => ({ type: 'yataBurst', tick: 0, position: { x, y: 1, z: 0 }, damage: 4, hits: [] });

describe('八咫烏の 見た目の 決まり', () => {
  it('金の 光は 八咫烏の 矢だけ・同時に boltMax 本まで', () => {
    const m = createYataModel();
    m.step([arrow(1), arrow(2, false), arrow(3), arrow(4), arrow(5), arrow(6)], [], false);
    expect(m.bolts().length).toBe(Y.boltMax);
    expect(m.bolts().every((b) => b.id !== 2)).toBe(true);
    m.step([], [], false);
    expect(m.bolts()).toHaveLength(0);
  });
  it('ほのおは yataBurst の 点に burstSteps ステップ・コマは 順に すすむ・おわると 消える', () => {
    const m = createYataModel();
    m.step([], [burstEv(5)], false);
    expect(m.flames()).toHaveLength(1);
    expect(m.flames()[0]!.position.x).toBe(5);
    let last = -1;
    for (let i = 1; i < Y.burstSteps; i++) {
      m.step([], [], false);
      const f = m.flames()[0]!;
      expect(f.frame).toBeGreaterThanOrEqual(last);
      expect(f.frame).toBeLessThan(BURST_FRAMES);
      last = f.frame;
    }
    m.step([], [], false);
    expect(m.flames()).toHaveLength(0);
  });
  it('同時に burstMax こ まで（古い 物から 消える）', () => {
    const m = createYataModel();
    for (let i = 0; i < Y.burstMax + 2; i++) m.step([], [burstEv(i)], false);
    expect(m.flames()).toHaveLength(Y.burstMax);
    expect(m.flames()[0]!.position.x).toBe(2);
  });
  it('「動きを へらす」: 1 コマだけ（すすまない）', () => {
    const m = createYataModel();
    m.step([], [burstEv(0)], true);
    const f0 = m.flames()[0]!.frame;
    m.step([], [], true);
    expect(m.flames()[0]!.frame).toBe(f0);
  });
});
