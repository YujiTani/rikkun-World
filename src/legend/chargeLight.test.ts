import { describe, expect, it } from 'vitest';
import { createChargeLight, type ChargeLightView } from './chargeLight';

/** WEAPON-8 AC22・AC23: 手もとの 光（T1）の 区間・消え方。雷神剣・風神剣 とも 同じ（色の しゅるいだけ ちがう） */
const run = (kind: 'spiral' | 'lightning', ticks: number, reduced = false) => {
  const c = createChargeLight();
  const out: ChargeLightView[] = [];
  for (let t = 1; t <= ticks; t++) out.push({ ...c.step({ ticks: t, kind, reduced }) });
  return { c, out };
};

describe.each([
  ['spiral', 'fujin'],
  ['lightning', 'raijin'],
] as const)('AC22: 区間（%s）', (kind, palette) => {
  const { out } = run(kind, 140);
  const at = (F: number) => out[F - 1]!;
  it('phase: 1〜59 gather・60〜71 burst・72〜 full。palette', () => {
    for (let F = 1; F <= 140; F++) {
      expect(at(F).phase).toBe(F <= 59 ? 'gather' : F <= 71 ? 'burst' : 'full');
      expect(at(F).palette).toBe(palette);
      expect(at(F).alpha).toBe(1);
    }
  });
  it('core = round(5 × min(F,60) ÷ 60)・へらない', () => {
    expect([5, 6, 17, 18, 29, 30, 41, 42, 53, 54, 60, 90].map((F) => at(F).core)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
    for (let F = 2; F <= 140; F++) expect(at(F).core).toBeGreaterThanOrEqual(at(F - 1).core);
  });
  it('ring・sweep・sparkles・orbit', () => {
    for (let F = 1; F <= 59; F++) expect([at(F).ring, at(F).sweep, at(F).sparkles, at(F).orbit]).toEqual([0, 0, 0, 0]);
    for (let F = 60; F <= 71; F++) {
      expect(at(F).ring).toBeGreaterThan(0);
      if (F > 60) expect(at(F).ring).toBeGreaterThan(at(F - 1).ring);
    }
    for (let F = 72; F <= 140; F++) expect(at(F).ring).toBe(0);
    for (let F = 60; F <= 65; F++) {
      expect(at(F).sweep).toBeGreaterThan(0);
      if (F > 60) expect(at(F).sweep).toBeGreaterThan(at(F - 1).sweep);
      expect(at(F).sparkles).toBe(0);
      expect(at(F).orbit).toBe(0);
    }
    expect(at(65).sweep).toBeCloseTo(1, 5);
    for (let F = 66; F <= 140; F++) {
      expect(at(F).sweep).toBe(0);
      expect(at(F).sparkles).toBe(1);
      expect(at(F).orbit).toBe(2);
    }
  });
  it('full の 間 orbitAngle は 1 ステップ 3 度', () => {
    for (let F = 73; F <= 140; F++) expect(at(F).orbitAngle - at(F - 1).orbitAngle).toBeCloseTo(3, 1);
  });
  it('gather・full の 間 particles 1 以上（ためF 2 から）', () => {
    for (let F = 2; F <= 140; F++) expect(at(F).particles).toBeGreaterThanOrEqual(1);
  });
});

describe('AC23: 消え方', () => {
  it.each([30, 60, 100])('ためF %i で はなす → fade alpha 0.75・0.5・0.25・0、5 つ目から off', (n) => {
    const { c } = run('spiral', n);
    const a: ChargeLightView[] = [];
    for (let i = 0; i < 6; i++) a.push({ ...c.step({ ticks: null, kind: 'spiral', reduced: false }) });
    expect(a.slice(0, 4).map((v) => v.phase)).toEqual(['fade', 'fade', 'fade', 'fade']);
    expect(a.slice(0, 4).map((v) => v.alpha)).toEqual([0.75, 0.5, 0.25, 0]);
    expect(a[4]!.phase).toBe('off');
    expect(a[5]!.phase).toBe('off');
    expect(a[4]!.alpha).toBe(0);
    expect(a[0]!.palette).toBe('fujin');
  });
  it('kind が null（持ちかえ）でも 同じ 4 ステップ', () => {
    const { c } = run('lightning', 40);
    const a = [1, 2, 3, 4, 5].map(() => ({ ...c.step({ ticks: null, kind: null, reduced: false }) }));
    expect(a.map((v) => v.phase)).toEqual(['fade', 'fade', 'fade', 'fade', 'off']);
    expect(a[0]!.palette).toBe('raijin');
  });
  it('ためて いない とき off・palette null', () => {
    const c = createChargeLight();
    const v = c.step({ ticks: null, kind: 'spiral', reduced: false });
    expect(v).toMatchObject({ phase: 'off', palette: null, core: 0, particles: 0, ring: 0, sweep: 0, sparkles: 0, orbit: 0 });
  });
  it('「動きを減らす」: particles・ring・sweep・orbit は 0・ためF 66 から sparkles 1。core・phase は ふつうと 同じ', () => {
    const a = run('spiral', 100).out;
    const b = run('spiral', 100, true).out;
    for (let F = 1; F <= 100; F++) {
      const v = b[F - 1]!;
      expect([v.particles, v.ring, v.sweep, v.orbit]).toEqual([0, 0, 0, 0]);
      expect(v.sparkles).toBe(F >= 66 ? 1 : 0);
      expect(v.core).toBe(a[F - 1]!.core);
      expect(v.phase).toBe(a[F - 1]!.phase);
    }
  });
  it('また ためると はじめから', () => {
    const { c } = run('spiral', 80);
    c.step({ ticks: null, kind: 'spiral', reduced: false });
    const v = c.step({ ticks: 1, kind: 'spiral', reduced: false });
    expect(v.phase).toBe('gather');
    expect(v.alpha).toBe(1);
    expect(v.core).toBe(0);
  });
});
