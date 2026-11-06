import { GAMEPAD_CONFIG, type GamepadSettings } from './config';

function clampDead(v: number): number {
  if (!Number.isFinite(v)) return GAMEPAD_CONFIG.deadZone;
  return Math.min(0.5, Math.max(0.05, v));
}

/** みる はやさ。デッドゾーンとは別の範囲 */
export function clampLook(v: number): number {
  if (!Number.isFinite(v)) return GAMEPAD_CONFIG.lookSensitivity;
  const stepped = Math.round(v * 10) / 10;
  return Math.min(GAMEPAD_CONFIG.lookMax, Math.max(GAMEPAD_CONFIG.lookMin, stepped));
}

export function loadGamepadSettings(storage: Storage | null): GamepadSettings {
  const base: GamepadSettings = {
    deadZone: GAMEPAD_CONFIG.deadZone,
    lookSensitivity: GAMEPAD_CONFIG.lookSensitivity,
  };
  if (!storage) return base;
  try {
    const raw = storage.getItem(GAMEPAD_CONFIG.settingsKey);
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<GamepadSettings>;
    return {
      deadZone: clampDead(typeof o.deadZone === 'number' ? o.deadZone : base.deadZone),
      lookSensitivity: clampLook(typeof o.lookSensitivity === 'number' ? o.lookSensitivity : base.lookSensitivity),
    };
  } catch {
    return base;
  }
}

export function saveGamepadSettings(storage: Storage | null, s: GamepadSettings): void {
  if (!storage) return;
  try {
    storage.setItem(
      GAMEPAD_CONFIG.settingsKey,
      JSON.stringify({ deadZone: clampDead(s.deadZone), lookSensitivity: clampLook(s.lookSensitivity) }),
    );
  } catch {
    /* quota */
  }
}
