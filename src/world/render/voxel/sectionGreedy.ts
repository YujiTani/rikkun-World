import * as K from './sectionConsts';
import type { QuadBuilder } from './sectionQuads';

// vitest の import は 読むたびに getter を通って 遅い。内側のループが読む定数は このファイルの const に写す（本番のビルドでは同じ）
const { MK_GRAIN, MK_LIGHT, MK_ROW } = K;

/** 四角の 角（lo・hi）の 作業用。毎回 新しい 配列を 作らない */
const LO = [0, 0, 0];
const HI = [0, 0, 0];

/**
 * 面 f・平面 `plane` の mask〔種類 | 行の符号 | 光 | つぶの 印。sectionConsts の MK_〕を、同じ 値が 続く 長方形に まとめて builder に 足す。
 * mask は 使い切って 0 に 戻る（平面どうしは 独立）。範囲は u: [uLo, uHi)・v: [vLo, vHi)、1 行の 長さは widthU。
 * ax = 面の 法線の 軸、uAx・vAx = 面の 中の 2 つの 軸。
 */
export function emitGreedy(
  b: QuadBuilder,
  mask: Int32Array,
  f: number,
  ax: number,
  uAx: number,
  vAx: number,
  widthU: number,
  uLo: number,
  uHi: number,
  vLo: number,
  vHi: number,
  plane: number,
): void {
  for (let v = vLo; v < vHi; v++) {
    for (let u = uLo; u < uHi; u++) {
      const k = mask[v * widthU + u];
      if (k === 0) continue;
      let w = 1;
      while (u + w < uHi && mask[v * widthU + u + w] === k) w++;
      let h = 1;
      outer: while (v + h < vHi) {
        const row = (v + h) * widthU + u;
        for (let i = 0; i < w; i++) if (mask[row + i] !== k) break outer;
        h++;
      }
      for (let dv = 0; dv < h; dv++) mask.fill(0, (v + dv) * widthU + u, (v + dv) * widthU + u + w);
      LO[ax] = plane;
      HI[ax] = plane;
      LO[uAx] = u;
      HI[uAx] = u + w;
      LO[vAx] = v;
      HI[vAx] = v + h;
      const lbyte = (k >> MK_LIGHT) & 255;
      // aData.z の 下の 3 ビットは 角の 印〔quad が 足す〕。つぶの 印は その 上〔8 倍〕
      b.quad(f, LO[0], HI[0], LO[1], HI[1], LO[2], HI[2], k & 255, (k >> MK_ROW) & 255, ((k >> MK_GRAIN) & 31) << 3, 0, (lbyte >> 4) * 17, (lbyte & 15) * 17, null);
    }
  }
}
