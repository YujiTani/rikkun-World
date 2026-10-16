import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS, createW2Settings } from './contracts';
import { ACTIONS, actionForKey } from './input/actions';

describe('WEAPON-2 contracts', () => {
  it('R キーは stanceNext', () => {
    expect(ACTIONS).toContain('stanceNext');
    expect(actionForKey('KeyR', false)).toBe('stanceNext');
  });
  it('設定の 初期値は 仕様書 §4.2〜§4.6 の とおり', () => {
    const s = createW2Settings();
    expect(s.bladeTech.kesa).toEqual({ startup: 28, active: 6, recovery: 72 });
    expect(s.bladeTech.thrust).toEqual({ startup: 4, active: 2, recovery: 35 });
    expect(s.bladeTech.thrust.startup + s.bladeTech.thrust.active + s.bladeTech.thrust.recovery).toBe(41);
    expect(s.bladeTech.kiriage).toEqual({ startup: 38, active: 5, recovery: 61 });
    expect(s.bladeTech.kiriage.startup + s.bladeTech.kiriage.active + s.bladeTech.kiriage.recovery).toBe(104);
    expect(s.bladeTech.kesa.startup + s.bladeTech.kesa.active + s.bladeTech.kesa.recovery).toBe(106);
    expect(s.bowStageTicks).toEqual([10, 25, 40]);
    // CHAR-2 AC13: ふみこみ中は 歩けない（4 つとも 0）。thrustLunge は なくなる。bladeAdvance は 絵（atlas.json）と 同じ
    expect(s.bladeMoveMul).toEqual({ thrust: 0, kesaStartupActive: 0, kesaRecovery: 0, kiriage: 0 });
    expect('thrustLunge' in s).toBe(false);
    const adv = (s as unknown as { bladeAdvance: Record<string, { ticks: number[]; advance: number[]; step: number }> }).bladeAdvance;
    const atlas = JSON.parse(readFileSync('public/models/char/atlas.json', 'utf8'));
    const motionOf = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' } as const;
    for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
      const m = atlas.motions[motionOf[t]];
      expect(adv[t]).toEqual({ ticks: m.ticks, advance: m.advance, step: m.step });
      expect(adv[t]!.ticks.reduce((x, y) => x + y, 0)).toBe(s.bladeTech[t].startup + s.bladeTech[t].active + s.bladeTech[t].recovery);
    }
    expect(s.bowSpeed).toEqual([12, 20, 28]);
    expect(s.toolDurability.crystal_katana).toBe(500);
    expect(s.toolDurability.kabuto).toBe(165);
    expect(s.wearLowRatio).toBe(0.1);
  });
  it('createW2Settings は 毎回 ふかい コピー', () => {
    const a = createW2Settings();
    a.bladeKnock.kesa[0] = 99;
    a.toolDurability.katana = 1;
    a.bowBend.pull[0] = 0;
    expect(W2_SETTING_DEFAULTS.bladeKnock.kesa[0]).toBe(2.5);
    expect(W2_SETTING_DEFAULTS.toolDurability.katana).toBe(250);
    expect(createW2Settings().bowBend.pull[0]).toBe(0.4);
  });
});
