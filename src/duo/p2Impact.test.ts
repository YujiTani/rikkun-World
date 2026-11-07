import { describe, expect, it } from 'vitest';
import type { BladeEvent, BowEvent, CombatEvent } from '../contracts';
import type { ImpactLevel } from '../fx/impact';
import { feedP2Impact } from './p2Impact';

/** COOP-1 4d-0（AC97）: 2P の 当たりに 1P と 同じ 段を 出す */
function run(opts: { combat?: CombatEvent[]; blade?: BladeEvent[]; arrows?: BowEvent[]; title?: 'none' | 'nushi' }): ImpactLevel[] {
  const out: ImpactLevel[] = [];
  feedP2Impact({ hit: (l) => out.push(l) }, () => opts.title ?? 'none', opts.combat ?? [], opts.blade ?? [], opts.arrows ?? []);
  return out;
}
const pos = { x: 0, y: 0, z: 0 };

describe('feedP2Impact', () => {
  it('何も 当たらなければ 何も 出さない', () => {
    expect(run({})).toEqual([]);
    expect(run({ blade: [{ type: 'techMiss', tick: 1, tech: 'thrust' }], arrows: [{ type: 'arrowShot', tick: 1, stage: 1, speed: 1, position: pos, velocity: pos }] })).toEqual([]);
  });
  it('刀の 1 段目は mid、3 段目と けさは large', () => {
    const hit = (tech: 'thrust' | 'kesa', step: 1 | 2 | 3): BladeEvent => ({ type: 'techHit', tick: 1, tech, yokaiId: 1, damage: 1, knock: 0, up: 0, position: pos, step });
    expect(run({ blade: [hit('thrust', 1)] })).toEqual(['mid']);
    expect(run({ blade: [hit('thrust', 3)] })).toEqual(['large']);
    expect(run({ blade: [hit('kesa', 1)] })).toEqual(['large']);
  });
  it('パンチ・弓は mid。二つ名は large', () => {
    expect(run({ combat: [{ type: 'punchHit', tick: 1, yokaiId: 1 }] })).toEqual(['mid']);
    expect(run({ arrows: [{ type: 'arrowHit', tick: 1, yokaiId: 1, damage: 1, position: pos }] })).toEqual(['mid']);
    expect(run({ combat: [{ type: 'punchHit', tick: 1, yokaiId: 1 }], title: 'nushi' })).toEqual(['large']);
  });
});
