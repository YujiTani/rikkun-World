import { EMISSION, OPACITY } from './opacity';

/**
 * 光の 計算の 部品（WorldLight から 分けた。ふるまいは かえない）: ブロックの 番号ごとの 表と、1 マスずつ 弱めて 広げる 計算。
 * 計算の 置き場（blk・sky・block）は WorldLight が 持ち、ここへは 配列と 箱の 大きさを わたすだけ。
 */

/** 光を弱める量（番号の外は 15）と、出す光 */
export const OPAQ = new Uint8Array(256).fill(15);
OPAQ.set(OPACITY);
export const EMIT = new Uint8Array(256);
EMIT.set(EMISSION);
/** 光を通し、光も出さない（このブロックの上は空の光 15） */
export const TRIV = new Uint8Array(256);
for (let i = 0; i < OPACITY.length; i++) TRIV[i] = OPACITY[i] === 0 && EMISSION[i] === 0 ? 1 : 0;

/**
 * q に 入れた マスから、1 マスずつ 弱めながら 6 方向に 広げる（arr は 光の 値、blk は ブロックの 番号。箱は 横 rx × 縦 ry × 奥 rz）。
 * 光を 通さない ブロック〔OPAQ 15〕には 広げない。q は 使いおわったら 空に する。広げて 書いた マスの 数を 返す。
 */
export function spreadLight(arr: Uint8Array, q: number[], blk: Uint8Array, rx: number, rz: number, ry: number): number {
  let written = 0;
  const RL = rx * rz;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const v = arr[i];
    if (v <= 1) continue;
    const x = i % rx;
    const z = Math.floor(i / rx) % rz;
    const y = Math.floor(i / RL);
    for (let d = 0; d < 6; d++) {
      let j: number;
      if (d === 0) {
        if (x >= rx - 1) continue;
        j = i + 1;
      } else if (d === 1) {
        if (x <= 0) continue;
        j = i - 1;
      } else if (d === 2) {
        if (y >= ry - 1) continue;
        j = i + RL;
      } else if (d === 3) {
        if (y <= 0) continue;
        j = i - RL;
      } else if (d === 4) {
        if (z >= rz - 1) continue;
        j = i + rx;
      } else {
        if (z <= 0) continue;
        j = i - rx;
      }
      const op = OPAQ[blk[j]];
      if (op >= 15) continue;
      const nv = v - (op > 1 ? op : 1);
      if (nv > arr[j]) {
        arr[j] = nv;
        written++;
        q.push(j);
      }
    }
  }
  q.length = 0;
  return written;
}
