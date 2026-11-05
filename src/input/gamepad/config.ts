/** GAMEPAD-1: デッドゾーン・感度・保存キー（単位つき） */
export const GAMEPAD_CONFIG = {
  /** スティック遊び（0〜1）。安いパッド向けに広め */
  deadZone: 0.24,
  /** 右スティック → look の倍率（マウス感度と別） */
  lookSensitivity: 2.4,
  /** − 長押しで dropStack にする秒（ステップ換算は呼び出し側） */
  dropStackHoldMs: 400,
  /** localStorage キー */
  bindsKey: 'rikkun.gamepad.binds.v1',
  calibKey: 'rikkun.gamepad.calib.v1',
  settingsKey: 'rikkun.gamepad.settings.v1',
} as const;

export type GamepadSettings = {
  deadZone: number;
  lookSensitivity: number;
};

