import type { Craft2Settings, UiAlpha } from '../../contracts';

/** CRAFT-2 §2.8: 画面の不透明度。`uiPanelAlpha`・`uiHudAlpha` は `uiAlphaMin` より小さくならない。0〜1 の外は 0・1 に */
export function computeUiAlpha(s: Pick<Craft2Settings, 'uiPanelAlpha' | 'uiHudAlpha' | 'uiScrimAlpha' | 'uiAlphaMin'>): UiAlpha {
  const c01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  const min = c01(s.uiAlphaMin);
  return {
    panel: Math.max(min, c01(s.uiPanelAlpha)),
    hud: Math.max(min, c01(s.uiHudAlpha)),
    scrim: c01(s.uiScrimAlpha),
    min,
  };
}

let current: UiAlpha = computeUiAlpha({ uiPanelAlpha: 0.8, uiHudAlpha: 0.6, uiScrimAlpha: 0.2, uiAlphaMin: 0.6 });
let written = '';

/** 今の不透明度（`ui.alpha()` の元） */
export function uiAlpha(): UiAlpha {
  return { ...current };
}

/**
 * 設定を CSS 変数（`--rk-ui-panel-a` など）に入れる。毎ステップ呼んでよい（値が変わったときだけ書く）。
 * おめでとう画面・やられた画面の うしろ（`--rk-scrim-modal`）は 変えない。
 */
export function applyUiAlpha(s: Pick<Craft2Settings, 'uiPanelAlpha' | 'uiHudAlpha' | 'uiScrimAlpha' | 'uiAlphaMin'>, root?: HTMLElement): UiAlpha {
  current = computeUiAlpha(s);
  const key = `${current.panel}|${current.hud}|${current.scrim}`;
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  if (el && (key !== written || root)) {
    el.style.setProperty('--rk-ui-panel-a', String(current.panel));
    el.style.setProperty('--rk-ui-hud-a', String(current.hud));
    el.style.setProperty('--rk-ui-scrim-a', String(current.scrim));
    if (!root) written = key;
  }
  return { ...current };
}
