import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';

const N = 16;

/** ひびの線（だんかい順にふえる。各だんかいで足す線: [x0,y0,x1,y1]） */
const CRACK_LINES: ReadonlyArray<ReadonlyArray<readonly [number, number, number, number]>> = [
  [[7, 6, 9, 10], [7, 6, 5, 3]],
  [[9, 10, 12, 12], [5, 3, 2, 2], [9, 10, 8, 14], [7, 6, 11, 5]],
  [[11, 5, 14, 3], [8, 14, 4, 15], [7, 6, 3, 9], [3, 9, 1, 12], [12, 12, 15, 14], [2, 2, 0, 5], [14, 3, 15, 0], [9, 10, 13, 8], [3, 9, 5, 12], [8, 14, 11, 15]],
];

/** ひび 1 まい（1〜3）の 16x16 RGBA。黒い線だけ（ほかは透明）。y = 0 が上 */
export function crackPixels(stage: number): Uint8Array {
  const s = Math.max(1, Math.min(3, Math.floor(stage)));
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < s; k++) {
    for (const [x0, y0, x1, y1] of CRACK_LINES[k]) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const t = n === 0 ? 0 : i / n;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t);
        const o = (y * N + x) * 4;
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 230;
      }
    }
  }
  return data;
}

/** 数えるための: ひびで色のついたドットの数 */
export function crackDotCount(stage: number): number {
  const d = crackPixels(stage);
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
}

/** ひび 3 まいぶんのテクスチャ（index 0 = だんかい 1） */
export function createCrackTextures(): DataTexture[] {
  const out: DataTexture[] = [];
  for (let s = 1; s <= 3; s++) {
    const px = crackPixels(s);
    // DataTexture は 1 行目が下なので上下を入れ替える
    const flipped = new Uint8Array(px.length);
    for (let y = 0; y < N; y++) flipped.set(px.subarray(y * N * 4, (y + 1) * N * 4), (N - 1 - y) * N * 4);
    const t = new DataTexture(flipped, N, N, RGBAFormat, UnsignedByteType);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    out.push(t);
  }
  return out;
}
