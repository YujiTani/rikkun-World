import { parryShownFrame } from '../combat/parryShown';

// パリィの 絵の コマ（WEAPON-5 / art-final README）。tick（F）→ コマの 番号。
/** `parry`: F1 / F2 / F3-6 / F7-20 / F21-27 / F28-34 / F35-40 の 7 コマ */
export const PARRY_CELL_TICKS: readonly number[] = [1, 1, 4, 14, 7, 7, 6];
/** `parryKime`: 成功の 次から 8 ステップ。1 / 2 / 5 の 3 コマ */
export const PARRY_KIME_TICKS: readonly number[] = [1, 2, 5];

function cellOf(ticks: readonly number[], frame: number): number {
  let end = 0;
  for (let i = 0; i < ticks.length; i++) {
    end += ticks[i]!;
    if (frame <= end) return i;
  }
  return ticks.length - 1;
}

export interface ParryCell {
  motion: 'parry' | 'parryKime';
  frame: number;
}

/** パリィの 状態（phase・frame は `parry.state()`）→ 見せる 絵。出ていないときは null */
/** jingasa = 陣笠を 着て 始めた パリィ（SAMURAI-1。受けの 絵を のばして 見せる。きめは そのまま） */
export function parryCellOf(phase: 'idle' | 'ready' | 'guard' | 'recover' | 'kime', frame: number, jingasa = false): ParryCell | null {
  if (phase === 'idle') return null;
  if (phase === 'kime') return { motion: 'parryKime', frame: cellOf(PARRY_KIME_TICKS, Math.max(1, frame)) };
  return { motion: 'parry', frame: cellOf(PARRY_CELL_TICKS, Math.max(1, parryShownFrame(frame, jingasa))) };
}
