import { TECH_PHASES } from '../char/techCurves';

/**
 * WEAPON-7 §3.3: 落雷の 体の 絵。おおげさぎり（kesa）の コマ列を 使い回す。
 * F1〜6 = ふりおろし（kesa の 当たりの 29〜34）、F7〜 = もどり（kesa の もどり 35〜106 を 落雷の 長さに のばす）。
 * 戻りは 仮想の「おおげさぎりの F」。`techCell` に わたすと 絵の コマが 決まる。
 */
export function lightningPoseFrame(F: number, total: number): { frame: number; phase: 'active' | 'recovery' } {
  const k = TECH_PHASES.kesa;
  const startupEnd = k.startup;
  const activeEnd = k.startup + k.active; // 34
  const full = k.startup + k.active + k.recovery; // 106
  if (F <= activeEnd - startupEnd) return { frame: startupEnd + Math.max(1, F), phase: 'active' };
  const span = Math.max(1, total - (activeEnd - startupEnd) - 1);
  const f = activeEnd + 1 + Math.floor(((F - (activeEnd - startupEnd) - 1) * (full - activeEnd - 1)) / span);
  return { frame: Math.min(full, f), phase: 'recovery' };
}

/** ため中の 絵の コマ（おおげさぎり コマ 5。かまえに よらず） */
export const CHARGE_CELL = 5;
