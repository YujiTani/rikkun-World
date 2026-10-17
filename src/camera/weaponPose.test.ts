import { describe, expect, it } from 'vitest';
import type { BladeState, BladeStance, BladeTech } from '../contracts';
import { bladePoseAt, bowDollAt, bowHandAt, newBladePose } from './weaponPose';

const st = (stance: BladeStance, tech: BladeTech | null = null, frame = 0): BladeState => ({
  item: 'katana', stance, tech, phase: tech ? 'active' : 'idle', frame, buffered: null, switchFrom: null, move: null,
});
const at = (s: BladeState) => bladePoseAt(s, newBladePose())!;

describe('刀のかまえ (AC19/AC20)', () => {
  it('中段・上段・下段', () => {
    const c = at(st('chudan')), j = at(st('jodan')), g = at(st('gedan'));
    expect([c.rx, j.rx, g.rx]).toEqual([50, 165, 25]);
    expect([c.swordPitch, j.swordPitch, g.swordPitch]).toEqual([15, 135, -30]);
    expect(c.legFront).toEqual({ right: 15, left: -15 });
    expect(j.legFront).toEqual({ right: -15, left: 15 });
    expect(g.legFront.right).toBe(15);
    expect(c.tip.x).toBeCloseTo(0.54);
    expect(g.tip.y).toBeCloseTo(0.84);
    expect(j.tip.y).toBeLessThan(0);
  });
  it('刀がなければ null', () => {
    expect(bladePoseAt({ ...st('chudan'), item: null }, newBladePose())).toBeNull();
  });
  it('突き F5〜6 は照準', () => {
    for (const f of [5, 6]) {
      const p = at(st('chudan', 'thrust', f));
      expect(Math.abs(p.tip.x - 0.5)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(p.tip.y - 0.5)).toBeLessThanOrEqual(0.05);
    }
    const p6 = at(st('chudan', 'thrust', 6));
    expect(p6.rx).toBeGreaterThanOrEqual(85);
    expect(Math.abs(p6.swordPitch)).toBeLessThanOrEqual(5);
  });
  it('大げさ斬り', () => {
    expect(at(st('jodan', 'kesa', 24)).rx).toBeLessThanOrEqual(45);
    expect(at(st('jodan', 'kesa', 24)).rz).toBeLessThanOrEqual(-30);
    const a = at(st('jodan', 'kesa', 26)), b = at(st('jodan', 'kesa', 56));
    expect(Math.abs(a.rx - b.rx)).toBeLessThanOrEqual(1);
    const t10 = at(st('jodan', 'kesa', 19)).tip, t12 = at(st('jodan', 'kesa', 24)).tip;
    expect(t10.x).toBeGreaterThan(0.7); expect(t10.y).toBeLessThan(0.15);
    expect(t12.x).toBeLessThan(0.3); expect(t12.y).toBeGreaterThan(0.85);
    expect(at(st('jodan', 'kesa', 72)).rx).toBeCloseTo(165, 0);
  });
  it('切り上げ', () => {
    expect(at(st('gedan', 'kiriage', 20)).rx).toBeGreaterThanOrEqual(145);
    const t6 = at(st('gedan', 'kiriage', 15)).tip, t8 = at(st('gedan', 'kiriage', 20)).tip;
    expect(t6.x).toBeLessThan(0.3); expect(t6.y).toBeGreaterThan(0.85);
    expect(t8.x).toBeGreaterThan(0.7); expect(t8.y).toBeLessThan(0.15);
  });
  it('かまえ変えはなめらか', () => {
    const s: BladeState = { ...st('jodan'), phase: 'switch', switchFrom: 'chudan', frame: 4 };
    const p = at(s);
    expect(p.rx).toBeGreaterThan(50);
    expect(p.rx).toBeLessThan(165);
  });
});

describe('弓のしなり', () => {
  it('引き手の位置 (AC17)', () => {
    const h = { x: 0, y: 0 };
    bowHandAt({ stage: 1, pull: 0.4, bendDeg: 12 }, h);
    expect(h.x).toBeCloseTo(0.62);
    bowHandAt({ stage: 2, pull: 0.7, bendDeg: 22 }, h);
    expect(h.x).toBeCloseTo(0.8);
    bowHandAt({ stage: 3, pull: 1, bendDeg: 32 }, h);
    expect(h.x).toBeGreaterThan(1);
  });
  it('三人称のうで', () => {
    const o = { rx: 0, rz: 0, lx: 0, lz: 0, twist: 0 };
    expect(bowDollAt({ stage: 3, pull: 1, bendDeg: 32 }, o).rz).toBe(35);
    expect(o.twist).toBeCloseTo(-10);
    expect(bowDollAt({ stage: 1, pull: 0.4, bendDeg: 12 }, o).rz).toBeCloseTo(15);
  });
});
