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
  it('CHAR-4 AC1: 軌跡の 色の 表（§4.5）・書く時間（§4.2）・形（§4.4）の 初期値。width は ない', () => {
    const s = createW2Settings() as unknown as Record<string, any>;
    const rows = {
      bokuto: { color: 0x9c6b3a, glow: 0xe8c08a, blade: 0xb98b54, bladeShine: 0xe0bc86, style: 'plain' },
      katana: { color: 0xe8f1fa, glow: 0xffffff, blade: 0xc8cdd8, bladeShine: 0xffffff, style: 'plain' },
      crystal_katana: { color: 0x7fdcff, glow: 0xe6faff, blade: 0x6fcdf5, bladeShine: 0xe6faff, style: 'star' },
      naginata: { color: 0xcfe8ff, glow: 0xffffff, blade: 0xb8cce0, bladeShine: 0xeef6ff, style: 'long' },
    };
    expect(s.bladeTrail).toEqual(rows);
    for (const r of Object.values(s.bladeTrail as Record<string, object>)) expect('width' in r).toBe(false);
    expect(s.bladeTrailWindow).toEqual({ thrust: [2, 6], kesa: [28, 34], kiriage: [38, 43] });
    expect(s.bladeTrailShape).toEqual({
      widthRatio: 0.45,
      minWidth: 0.1,
      lifeSteps: 9,
      segPerStep: 6,
      maxSegs: 36,
      bandEdges: [1 / 6, 1 / 2, 5 / 6],
      bandAlpha: [1, 0.85, 0.5, 0.22],
      fadeAges: [2.25, 4.5, 6.75],
      starAt: [0.25, 0.55, 0.85],
      starMaxAge: 8.55,
    });
    // 毎回 ふかい コピー（新しい 設定も）
    s.bladeTrail.katana.color = 1;
    s.bladeTrailWindow.kesa[0] = 0;
    s.bladeTrailShape.bandAlpha[0] = 0;
    const d = W2_SETTING_DEFAULTS as unknown as Record<string, any>;
    expect(d.bladeTrail.katana.color).toBe(0xe8f1fa);
    expect(d.bladeTrailWindow.kesa[0]).toBe(28);
    expect(d.bladeTrailShape.bandAlpha[0]).toBe(1);
  });
  it('CHAR-4 AC1: 刃先の データ（art/char-sheets/blade_path.json）は 3 わざ・perTick の 数 = ticks の 合計 + 1（42・107・105）・各点に base・tip の 3 つの 数', () => {
    const data = JSON.parse(readFileSync('art/char-sheets/blade_path.json', 'utf8')) as Record<string, { perTick: { base: number[]; tip: number[] }[] }>;
    const s = createW2Settings();
    const want = { katana_thrust: 42, katana_kesa: 107, katana_kiriage: 105 };
    expect(Object.keys(data).sort()).toEqual(Object.keys(want).sort());
    const techOf = { katana_thrust: 'thrust', katana_kesa: 'kesa', katana_kiriage: 'kiriage' } as const;
    for (const [name, n] of Object.entries(want)) {
      const t = s.bladeTech[techOf[name as keyof typeof techOf]];
      expect(t.startup + t.active + t.recovery + 1).toBe(n);
      const rows = data[name]!.perTick;
      expect(rows).toHaveLength(n);
      for (const r of rows) {
        for (const v of [r.base, r.tip]) {
          expect(v).toHaveLength(3);
          for (const x of v) expect(Number.isFinite(x)).toBe(true);
        }
      }
    }
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
