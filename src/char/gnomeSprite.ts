import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import type { SpriteStepInput } from './motion';

/**
 * LEGEND-4 ノームの斧: 手に 持って いる 間の キャラの 絵の 入力（SpriteStepInput.blade）。
 * 刀の 絵の 組に スキン `gnome` を かぶせる（かまえ = 中段・よこなぎ = katana_thrust の 場所に 斧の 14 コマ）。
 * sweep が なければ（BladeSystem が ない）null = ふつうの 絵のまま。
 */
const T = LEGEND4_TUNING.gnome;
const LENGTHS = { startup: T.startup, active: T.active, recovery: T.recovery } as const;

export function gnomeSpriteBlade(sweep: { phase: 'idle' | 'startup' | 'active' | 'recovery'; frame: number } | undefined): NonNullable<SpriteStepInput['blade']> | null {
  if (!sweep) return null;
  const swinging = sweep.phase !== 'idle';
  return { stance: 'chudan', tech: swinging ? 'thrust' : null, phase: swinging ? sweep.phase : 'idle', frame: sweep.frame, lengths: swinging ? { ...LENGTHS } : null };
}
