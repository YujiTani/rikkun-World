import { describe, expect, it } from 'vitest';
import { CRAFT2_SETTING_DEFAULTS } from '../../contracts';
import { applyUiAlpha, computeUiAlpha, uiAlpha } from './uiAlpha';
import { materialDotSources } from '../craftModel';

describe('uiAlpha（AC22）', () => {
  it('はじめの値', () => {
    expect(computeUiAlpha(CRAFT2_SETTING_DEFAULTS)).toEqual({ panel: 0.8, hud: 0.6, scrim: 0.2, min: 0.6 });
  });
  it('下限より小さくならない・0〜1 の外は 0・1 に', () => {
    const a = computeUiAlpha({ ...CRAFT2_SETTING_DEFAULTS, uiPanelAlpha: 0.3, uiHudAlpha: 0.1, uiScrimAlpha: 2 });
    expect(a).toEqual({ panel: 0.6, hud: 0.6, scrim: 1, min: 0.6 });
    expect(computeUiAlpha({ ...CRAFT2_SETTING_DEFAULTS, uiScrimAlpha: -1 }).scrim).toBe(0);
    expect(computeUiAlpha({ ...CRAFT2_SETTING_DEFAULTS, uiAlphaMin: 0.4, uiHudAlpha: 0.5 }).hud).toBe(0.5);
  });
  it('applyUiAlpha は CSS 変数に入れ、uiAlpha() が読める', () => {
    const style = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => style.set(k, v) } } as unknown as HTMLElement;
    applyUiAlpha({ ...CRAFT2_SETTING_DEFAULTS, uiPanelAlpha: 0.3 }, root);
    expect(style.get('--rk-ui-panel-a')).toBe('0.6');
    expect(style.get('--rk-ui-hud-a')).toBe('0.6');
    expect(style.get('--rk-ui-scrim-a')).toBe('0.2');
    expect(uiAlpha().panel).toBe(0.6);
  });
});

describe('ざいりょうのまる（§3.2）', () => {
  it('き 3 要る・もちもの 1・たんす 5 → みどり 1・桐色 2', () => {
    expect(materialDotSources(3, 6, 5)).toEqual(['inv', 'tansu', 'tansu']);
  });
  it('足りないと 最後が none。たんす なしは みどり だけ', () => {
    expect(materialDotSources(3, 1, 0)).toEqual(['inv', 'none', 'none']);
    expect(materialDotSources(3, 2, 1)).toEqual(['inv', 'tansu', 'none']);
    expect(materialDotSources(2, 9, 0)).toEqual(['inv', 'inv']);
  });
});
