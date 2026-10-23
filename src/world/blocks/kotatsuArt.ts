// こたつ 2×2 の 絵（アート の 係 の `art/LIVE-2-kotatsu/kotatsu/*_1x.png` を 16×16 に 切って 文字 に した もの）。絵 を 差しかえる ときは この ファイル の 文字 を 作りなおす
// 文字 = 色（'.' は すきま）。1 まい の 絵 が 16 を こえる ところ（天板 20×20・ふとん 32×16）は 16×16 の タイル に 切って ある。
export const KOTATSU_PALETTE: Readonly<Record<string, string>> = {
  a: '#2F4780',
  b: '#3D5A9E',
  c: '#5B7BC4',
  d: '#EFE7D4',
  e: '#E2D6B8',
  f: '#7A5434',
  g: '#A87B4F',
  h: '#6E9A3A',
  i: '#F0902A',
  j: '#9C7040',
  k: '#C86E14',
};

export const KOTATSU_ART_ROWS: Readonly<Record<string, readonly string[]>> = {
  kotatsu_slope_a: [
    'aaaaaaaaaaaaaaaa',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbbbbcbbbbbcbbb',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbbbbcbbbbbcbbb',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbbbbcbbbbbcbbb',
    'bbbaabbbbbcaabbb',
    'aaaddaaaaaaddaaa',
    'dddddddddddddddd',
    'dddddddddddddddd',
    'deddeddeddeddedd',
    'dddddddddddddddd',
  ],
  kotatsu_slope_b: [
    'aaaaaaaaaaaaaaaa',
    'cbbbbbcbbbbbcbbb',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbbbbcbbbbbcbbb',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbbbbcbbbbbcbbb',
    'bbbbcbbbbbcbbbbb',
    'bbcbbbbbcbbbbbcb',
    'cbbaabcbbbbaabbb',
    'aaaddaaaaaaddaaa',
    'dddddddddddddddd',
    'dddddddddddddddd',
    'eddeddeddeddeddd',
    'dddddddddddddddd',
  ],
  kotatsu_corner: [
    'abbbdddd........',
    'abbddddd........',
    'abdddddd........',
    'cddddddd........',
    'dddddddd........',
    'dddddddd........',
    'dddddddd........',
    'dddddddd........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  kotatsu_top_a: [
    'ffffffffffffffff',
    'fggggggggggggggg',
    'fggggggggggggghh',
    'fggggggggggggiii',
    'fgggggggggggiiii',
    'fgjjjgjjjjgjiiii',
    'fgggggggggggiiik',
    'fggggggggggggikk',
    'fggggggggggggggg',
    'fggggggggggggggg',
    'fgjjjgjjjjgjjjjg',
    'fggggggggggggggg',
    'fggggggggggggggg',
    'fggggggggggggggg',
    'fggggggggggggggg',
    'fgjjjgjjjjgjjjjg',
  ],
  kotatsu_top_b: [
    'ffff............',
    'gggf............',
    'gggf............',
    'gggf............',
    'iggf............',
    'kjgf............',
    'kggf............',
    'gggf............',
    'gggf............',
    'gggf............',
    'jjgf............',
    'gggf............',
    'gggf............',
    'gggf............',
    'gggf............',
    'jjgf............',
  ],
  kotatsu_top_c: [
    'fggggggggggggggg',
    'fggggggggggggggg',
    'fggggggggggggggg',
    'ffffffffffffffff',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  kotatsu_top_d: [
    'gggf............',
    'gggf............',
    'gggf............',
    'ffff............',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
};

/** こたつ の 絵 の タイル の 名前（天板 20×20 は 4 まい・ふとん 32×16 は 2 まい・角 8×8 は 1 まい。あとは すきま の うめ草） */
export type KotatsuTileName =
  | 'kotatsu_slope_a' | 'kotatsu_slope_b' | 'kotatsu_corner'
  | 'kotatsu_top_a' | 'kotatsu_top_b' | 'kotatsu_top_c' | 'kotatsu_top_d'
  | `kotatsu_pad${number}`;

/**
 * 絵 の 並べ方。atlas は 4 れつ なので、行 の はじめ から 始めて、2 まい 以上 の 絵 が とぎれ ない よう に 置く
 * （右 に つづく 2 まい = 横 32、下 の 行 ほど 上 〈v が 大きい〉 なので 天板 の 下半分 〈c・d〉 を 先、上半分 〈a・b〉 を あと）。
 * `baseLen` = これ より 前 の タイル の 数
 */
export function kotatsuTileOrder(baseLen: number): KotatsuTileName[] {
  const padStart = (4 - (baseLen % 4)) % 4;
  let pad = 0;
  const out: KotatsuTileName[] = [];
  const addPad = (): void => void out.push(`kotatsu_pad${pad++}`);
  for (let i = 0; i < padStart; i++) addPad();
  // 行 1: ふとん 2 まい + 角 + すきま、行 2: 天板 の 下半分 + すきま、行 3: 天板 の 上半分 + すきま
  out.push('kotatsu_slope_a', 'kotatsu_slope_b', 'kotatsu_corner');
  addPad();
  out.push('kotatsu_top_c', 'kotatsu_top_d');
  addPad();
  addPad();
  out.push('kotatsu_top_a', 'kotatsu_top_b');
  addPad();
  addPad();
  return out;
}

/** その 名前 の 16×16 の 絵（RGBA）。すきま は 透明 */
export function paintKotatsuArt(name: KotatsuTileName): Array<readonly [number, number, number, number]> {
  const rows = KOTATSU_ART_ROWS[name];
  const out: Array<readonly [number, number, number, number]> = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = rows ? rows[y]![x] : '.';
      const hex = c === '.' || c === undefined ? null : KOTATSU_PALETTE[c];
      if (!hex) out.push([0, 0, 0, 0]);
      else {
        const n = parseInt(hex.slice(1), 16);
        out.push([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]);
      }
    }
  }
  return out;
}
