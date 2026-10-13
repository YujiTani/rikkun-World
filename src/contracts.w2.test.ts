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
    expect(s.bladeTech.kesa).toEqual({ startup: 14, active: 3, recovery: 24 });
    expect(s.bladeTech.thrust.startup + s.bladeTech.thrust.active + s.bladeTech.thrust.recovery).toBe(14);
    expect(s.bladeTech.kiriage.startup + s.bladeTech.kiriage.active + s.bladeTech.kiriage.recovery).toBe(18);
    expect(s.bowStageTicks).toEqual([10, 25, 40]);
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
