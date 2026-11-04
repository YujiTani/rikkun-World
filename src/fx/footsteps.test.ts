import { describe, expect, it } from 'vitest';
import { createFootsteps, footKindOf, FOOTSTEP_TUNING } from './footsteps';
import { GetaStepper } from '../craft/geta';
import { SAMURAI_GEAR } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import type { Tone } from './sound';

const walk = (o: Partial<{ running: boolean; onGround: boolean; inWater: boolean; v: number }> = {}) => ({
  running: o.running ?? false,
  onGround: o.onGround ?? true,
  inWater: o.inWater ?? false,
  velocity: { x: o.v ?? 4, z: 0 },
});

function rig() {
  const played: (readonly Tone[])[] = [];
  return { played, f: createFootsteps({ playTones: (t) => void played.push(t) }) };
}

describe('FOOTSTEPS（#50 ①）', () => {
  it('地面の ブロック → 種類（表に ない id は stone）', () => {
    expect(['grass', 'dirt', 'sand', 'log', 'snow', 'stone', 'brick'].map(footKindOf)).toEqual(['grass', 'dirt', 'sand', 'wood', 'snow', 'stone', 'stone']);
  });

  it('歩く: walkTicks ごとに 1 歩、走る: runTicks ごと（走る ほうが 間かくが みじかい）', () => {
    const r = rig();
    const n = (o: Parameters<typeof walk>[0], ticks: number) => {
      let k = 0;
      for (let i = 0; i < ticks; i++) if (r.f.step(walk(o), () => 'grass')) k++;
      return k;
    };
    expect(n({}, FOOTSTEP_TUNING.walkTicks * 3)).toBe(3);
    expect(n({ running: true }, FOOTSTEP_TUNING.runTicks * 4)).toBe(4);
    expect(FOOTSTEP_TUNING.runTicks).toBeLessThan(FOOTSTEP_TUNING.walkTicks);
  });

  it('空中・止まって いる・水の 中 では 鳴らない', () => {
    const r = rig();
    for (const o of [{ onGround: false }, { v: 0 }, { inWater: true }]) for (let i = 0; i < 100; i++) expect(r.f.step(walk(o), () => 'stone')).toBeNull();
    expect(r.played.length).toBe(0);
  });

  it('音は ほる音より 小さい（どの 部品も gain 0.07 以下）', () => {
    const r = rig();
    for (const id of ['grass', 'dirt', 'sand', 'log', 'snow', 'stone']) for (let i = 0; i < FOOTSTEP_TUNING.walkTicks; i++) r.f.step(walk(), () => id);
    expect(r.played.length).toBe(6);
    for (const t of r.played.flat()) expect(t.gain).toBeLessThanOrEqual(0.07);
  });

  it('下駄で 走る ステップは GetaStepper.step が true（足音は 鳴らさない 側）。歩く ときは false', () => {
    const g = new GetaStepper({ equipped: () => SAMURAI_GEAR.legs }, () => {});
    expect(g.step(walk({ running: true }))).toBe(true);
    expect(g.step(walk())).toBe(false);
    expect(NINJA_TUNING.getaStepTicks).toBe(30);
  });
});
