import type { BladeAdvanceCurve, BladeTechFrames } from '../../contracts';

/**
 * 刀の わざの 絵の 時間（CHAR-2 §4.2・§4.5）。純粋な 関数。
 * 設定の 長さ（lengths）が 絵の 長さ（phases）と ちがうときは、出だし・当たり・もどりの 段階ごとに 長さの比で のばす・ちぢめる。
 */

/** 設定の F（1 から）→ 絵の 時 τ。`end` が true なら その ステップの おわり（j）、false なら はじまり（j − 1） */
function pictureTime(phases: BladeTechFrames, lengths: BladeTechFrames, f: number, end: boolean): number {
  const total = lengths.startup + lengths.active + lengths.recovery;
  const ff = Math.max(1, Math.min(total, f));
  const segs: Array<[number, number, number]> = [
    [phases.startup, lengths.startup, 0],
    [phases.active, lengths.active, phases.startup],
    [phases.recovery, lengths.recovery, phases.startup + phases.active],
  ];
  let base = 0; // 設定の中で その段階が 始まる F − 1
  for (const [L, S, P] of segs) {
    if (ff <= base + S) {
      const j = ff - base;
      return P + ((end ? j : j - 1) * L) / S;
    }
    base += S;
  }
  return phases.startup + phases.active + phases.recovery;
}

/** §4.2 の コマ k: 刀の frame が f のとき。c_k ≤ τ < c_(k+1) の k */
export function techCell(curve: BladeAdvanceCurve, phases: BladeTechFrames, lengths: BladeTechFrames, f: number): number {
  const tau = pictureTime(phases, lengths, f, false) + 1e-9;
  let c = 0;
  let k = 0;
  for (let i = 0; i < curve.ticks.length; i++) {
    if (tau >= c) k = i;
    c += curve.ticks[i];
  }
  return k;
}

/** §4.5 の ふみこみの線 A: F = f の ステップの おわりの めあて（O から u へ） */
export function techAdvance(curve: BladeAdvanceCurve, phases: BladeTechFrames, lengths: BladeTechFrames, f: number): number {
  const tau = pictureTime(phases, lengths, f, true);
  // 点 (0, 0)、各コマの まん中の 時 m_k に advance_k、さいご（全部の長さ）に step
  let px = 0;
  let py = 0;
  let c = 0;
  for (let k = 0; k < curve.ticks.length; k++) {
    const mx = c + curve.ticks[k] / 2;
    const my = curve.advance[k];
    if (tau <= mx) return mx === px ? my : py + ((my - py) * (tau - px)) / (mx - px);
    px = mx;
    py = my;
    c += curve.ticks[k];
  }
  if (tau >= c || c === px) return curve.step;
  return py + ((curve.step - py) * (tau - px)) / (c - px);
}
