import type { Rgba } from '../world/blocks/textures';

/**
 * LIVE-1 たまご の ドット絵 16x16（仕様 §3.2: たまご の 形 = たて長の まる）。
 * 白い やさい（たまねぎ）・かみ・いと と 影 で 分かれる ように、たて長 で、てっぺん が 細く 下 が ふくらむ。
 * まわり 1 ドット を こい色 #2A1E14 で ふちどる（M7 と 同じ）。
 */
const S = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const OUTLINE = 0x2a1e14;
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

const SHELL = 0xf5ecd8;
const SHADE = 0xd9c9a3;
const LIGHT = 0xffffff;

/** たて 12・よこ 9。上は 細く、下は ふくらむ */
function eggMask(x: number, y: number): boolean {
  const cy = 8.5;
  const dy = (y + 0.5 - cy) / 6.2;
  // 上 (dy<0) は よこ 3.4、下 (dy>0) は よこ 4.6
  const rx = dy < 0 ? 3.4 : 4.6;
  const dx = (x + 0.5 - 8) / rx;
  return dx * dx + dy * dy <= 1;
}

let cache: Rgba[] | null = null;

/** たまご の 16x16（y = 0 が上） */
export function eggPixels(): Rgba[] {
  if (cache) return cache;
  const px: Rgba[] = new Array<Rgba>(S * S).fill(CLEAR);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!eggMask(x, y)) continue;
      // 右下 を かげ に
      const shaded = (x - 8) * 0.8 + (y - 8.5) * 0.9 > 3.2;
      px[y * S + x] = hex(shaded ? SHADE : SHELL);
    }
  }
  // 左上 の つや
  for (const [x, y] of [[6, 5], [6, 6], [5, 7]] as const) if (px[y * S + x][3] !== 0) px[y * S + x] = hex(LIGHT);
  const src = px.slice();
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src[y * S + x][3] !== 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (src[y * S + x][3] !== 0) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) px[y * S + x] = hex(OUTLINE);
    }
  }
  cache = px;
  return px;
}
