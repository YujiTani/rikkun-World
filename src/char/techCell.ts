// わざのコマ（仕様 §4.2）。A の src/tools/blade/advance.ts の techCell と 同じ形の 仮の関数。
// S がつなぐときに advance.ts のものと 差しかえる（名前・引数・答えは 同じ）。
import type { BladeTechFrames } from '../contracts';
import type { TechCurve } from './techCurves';

/**
 * 刀の `frame` が f（わざを始めたステップ = 1）のときの コマ k。
 * 設定の長さ lengths が 絵の長さ phases とちがうときは 段階ごとに 長さの比で のばす・ちぢめる。
 * 段階 p の j ステップめ（1〜S_p）は 絵の時 τ = P_p + (j − 1) × L_p ÷ S_p の コマ（c_k ≤ τ < c_(k+1)）。
 */
export function techCell(curve: TechCurve, phases: BladeTechFrames, lengths: BladeTechFrames, f: number): number {
  const stages: [number, number, number][] = [
    [0, phases.startup, lengths.startup],
    [phases.startup, phases.active, lengths.active],
    [phases.startup + phases.active, phases.recovery, lengths.recovery],
  ];
  let rest = Math.max(1, Math.floor(f));
  let tau = 0;
  let found = false;
  for (const [P, L, S] of stages) {
    if (rest <= S) {
      tau = P + ((rest - 1) * L) / S;
      found = true;
      break;
    }
    rest -= S;
  }
  if (!found) return curve.ticks.length - 1;
  let c = 0;
  for (let k = 0; k < curve.ticks.length; k++) {
    c += curve.ticks[k]!;
    if (tau < c) return k;
  }
  return curve.ticks.length - 1;
}
