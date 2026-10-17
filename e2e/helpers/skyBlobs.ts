/**
 * 絵の中の「空の色（水色）のかたまり」を数える共通の式（ページの中で動く文字列）。
 * seethru.spec.ts の IS_SKY_SRC・BLOBS_SRC と同じ判定式。上から y0 まで・左から x0 までは見ない。
 * 使い方: page.addInitScript(`window.__isSky = ${IS_SKY_SRC}; window.__blobs = ${blobsSrc(300)};`)
 *   → page.evaluate(`(window.__blobs)("${png.toString('base64')}")`) が { largest, big, total } を返す
 */
export const IS_SKY_SRC = `(r, g, b) => b >= 170 && b > r + 30 && b > g - 10`;

export function blobsSrc(y0: number, x0 = 0): string {
  return `async (b64) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const Y0 = ${y0}, X0 = ${x0};
  const sky = new Uint8Array(W * H);
  let total = 0;
  for (let y = Y0; y < H; y++) for (let x = X0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (window.__isSky(d[i], d[i + 1], d[i + 2])) { sky[y * W + x] = 1; total++; }
  }
  let largest = 0, big = 0;
  const stack = [];
  for (let p = Y0 * W; p < W * H; p++) {
    if (sky[p] !== 1) continue;
    let size = 0; sky[p] = 2; stack.push(p);
    while (stack.length) {
      const q = stack.pop(); size++;
      const qx = q % W, qy = (q - qx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < X0 || ny < Y0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (sky[n] === 1) { sky[n] = 2; stack.push(n); }
      }
    }
    if (size > largest) largest = size;
    if (size >= 25) big++;
  }
  return { largest, big, total };
}`;
}
