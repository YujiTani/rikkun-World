import { describe, expect, it } from 'vitest';
import { TECH_CURVES, TECH_PHASES } from '../char/techCurves';
import { techCell } from '../tools/blade/advance';
import { CHARGE_CELL, lightningPoseFrame } from './pose';

describe('落雷の 体の 絵（kesa の コマ列を 使い回す）', () => {
  it('F1〜6 は ふりおろし（当たりの 29〜34）、F45 は もどりの さいご（106）', () => {
    expect(lightningPoseFrame(1, 45)).toEqual({ frame: 29, phase: 'active' });
    expect(lightningPoseFrame(6, 45)).toEqual({ frame: 34, phase: 'active' });
    expect(lightningPoseFrame(7, 45)).toEqual({ frame: 35, phase: 'recovery' });
    expect(lightningPoseFrame(45, 45)).toEqual({ frame: 106, phase: 'recovery' });
  });
  it('コマは もどらず 進み、ぜんぶ 有効な コマ（0〜15）', () => {
    let last = -1;
    const k = TECH_PHASES.kesa;
    for (let F = 1; F <= 45; F++) {
      const p = lightningPoseFrame(F, 45);
      const cell = techCell(TECH_CURVES.kesa, k, k, p.frame);
      expect(cell).toBeGreaterThanOrEqual(last);
      expect(cell).toBeLessThan(TECH_CURVES.kesa.ticks.length);
      last = cell;
    }
    expect(last).toBe(TECH_CURVES.kesa.ticks.length - 1);
  });
  it('ためる 絵は コマ 5（ふりかぶり）。ふりおろしの 前', () => {
    const k = TECH_PHASES.kesa;
    expect(CHARGE_CELL).toBe(5);
    expect(techCell(TECH_CURVES.kesa, k, k, 28)).toBe(CHARGE_CELL);
    expect(techCell(TECH_CURVES.kesa, k, k, 29)).toBeGreaterThan(CHARGE_CELL);
  });
});
