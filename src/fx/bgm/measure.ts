/**
 * 書き出した音を数で見る（ピーク・いちばん大きい 50ms・平均・ループのつなぎ目の差）。DOM も WebAudio も使わない。
 * preview.html の「数で見る」と同じ式（dBFS。0 がいちばん大きい）。
 */
export interface LevelStats {
  peakDb: number;
  rmsDb: number;
  loud50Db: number;
}

const db = (v: number): number => (v > 0 ? 20 * Math.log10(v) : -Infinity);

export function levelStats(x: Float32Array, sr: number): LevelStats {
  let peak = 0;
  let sum = 0;
  let maxWin = 0;
  let wsum = 0;
  const win = Math.round(sr * 0.05);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v;
    wsum += v * v;
    if (i >= win) wsum -= x[i - win] * x[i - win];
    if (i >= win - 1 && wsum > maxWin) maxWin = wsum;
  }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / x.length)), loud50Db: db(Math.sqrt(Math.max(0, maxWin) / win)) };
}

export interface SeamStats {
  /** つなぎ目の前後 1 秒の平均の大きさの差（dB。絶対値） */
  levelDiffDb: number;
  /** つなぎ目の前後 ±2ms の 1 サンプルあたりの最大の変化 */
  seamStep: number;
  /** つなぎ目いがいの所の、1 サンプルあたりの最大の変化 */
  maxStep: number;
  /** seamStep / maxStep（1 以下なら、つなぎ目が曲の中のどこよりも急ではない = ぷつっと鳴らない） */
  stepRatio: number;
}

export function seamStats(x: Float32Array, sr: number, seamSec: number): SeamStats {
  const at = Math.round(seamSec * sr);
  const w = Math.round(1 * sr);
  const rms = (a: number, b: number): number => {
    let s = 0;
    const lo = Math.max(0, a);
    const hi = Math.min(x.length, b);
    for (let i = lo; i < hi; i++) s += x[i] * x[i];
    return Math.sqrt(s / Math.max(1, hi - lo));
  };
  const before = db(rms(at - w, at));
  const after = db(rms(at, at + w));
  const levelDiffDb = Number.isFinite(before) && Number.isFinite(after) ? Math.abs(before - after) : before === after ? 0 : Infinity;
  const near = Math.round(0.002 * sr);
  let seamStep = 0;
  for (let i = Math.max(1, at - near); i < Math.min(x.length, at + near); i++) seamStep = Math.max(seamStep, Math.abs(x[i] - x[i - 1]));
  let maxStep = 0;
  for (let i = 1; i < x.length; i++) {
    if (Math.abs(i - at) <= near) continue;
    maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
  }
  return { levelDiffDb, seamStep, maxStep, stepRatio: maxStep > 0 ? seamStep / maxStep : 0 };
}
