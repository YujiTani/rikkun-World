/**
 * ITEM-FX-1（#342）の 置き物 3 つ（ちょうちん・ふとん・はにわ）の 16×16 絵。
 * 形は 箱の 組み合わせ（meshChunk の pushProp）。ここは 箱の 面に はる 絵。試作（あとで yuzu に 見せて 直す）。
 * 乱数なし（場所の きまった 並びだけ）。
 */
export const GADGET_TILE_NAMES = ['lantern', 'lantern_frame', 'futon_top', 'futon_side', 'haniwa', 'haniwa_head'] as const;
export type GadgetTileName = (typeof GADGET_TILE_NAMES)[number];

type Rgba = readonly [number, number, number, number];
const N = 16;
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const solid = (c: string): Rgba[] => new Array<Rgba>(N * N).fill(hex(c));
function rect(t: Rgba[], x: number, y: number, w: number, h: number, c: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) t[yy * N + xx] = hex(c);
}

/** ちょうちんの 赤い 紙: 赤に、たての ほね（こい赤）と まんなかの ほんのり 明るい 帯 */
function lantern(): Rgba[] {
  const t = solid('#d8382d');
  for (const x of [0, 5, 10, 15]) rect(t, x, 0, 1, N, '#a82a22');
  rect(t, 0, 5, N, 6, '#ee5a3c'); // 明るい 帯
  rect(t, 6, 6, 4, 4, '#ffd966'); // 灯り
  return t;
}

/** 上下の 黒い 枠 */
function lanternFrame(): Rgba[] {
  const t = solid('#2b2b2b');
  rect(t, 0, 0, N, 1, '#4a3a2a');
  return t;
}

/** ふとんの 上: 白い 敷きぶとんに 赤い ふち */
function futonTop(): Rgba[] {
  const t = solid('#fdfaf0');
  rect(t, 0, 0, N, 2, '#d8382d');
  rect(t, 0, N - 2, N, 2, '#d8382d');
  rect(t, 0, 0, 2, N, '#d8382d');
  rect(t, N - 2, 0, 2, N, '#d8382d');
  rect(t, 5, 5, 6, 6, '#f1e6d0'); // ぬい目の 四角
  return t;
}

function futonSide(): Rgba[] {
  const t = solid('#f4efe2');
  rect(t, 0, N - 3, N, 3, '#d8382d');
  return t;
}

/** はにわの 体: 素焼き色に 帯 */
function haniwa(): Rgba[] {
  const t = solid('#c9783f');
  rect(t, 0, 0, N, 3, '#b3652f');
  rect(t, 0, 7, N, 2, '#e3a06a');
  return t;
}

/** はにわの 顔: まるい 穴の 目と 口 */
function haniwaHead(): Rgba[] {
  const t = solid('#c9783f');
  rect(t, 3, 4, 3, 4, '#3a1f10');
  rect(t, 10, 4, 3, 4, '#3a1f10');
  rect(t, 6, 10, 4, 3, '#3a1f10');
  rect(t, 0, 0, N, 2, '#e3a06a');
  return t;
}

const PAINT: Readonly<Record<GadgetTileName, () => Rgba[]>> = {
  lantern,
  lantern_frame: lanternFrame,
  futon_top: futonTop,
  futon_side: futonSide,
  haniwa,
  haniwa_head: haniwaHead,
};

export function isGadgetTile(name: string): name is GadgetTileName {
  return Object.prototype.hasOwnProperty.call(PAINT, name);
}

export function paintGadgetTile(name: GadgetTileName): Rgba[] {
  return PAINT[name]();
}
