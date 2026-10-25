import * as THREE from 'three';
import { TILE, TILE_COUNT } from '../../fx/animalFxConfig';

// ハート 7×6 点（DESIGN 16.6）。うまった = あか、ふち だけ = うすい 白
const HEART_ROWS = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
/** とりの 足あと 7×7（3 本 の 指 ＋ かかと） */
const FOOT_ROWS = ['.X.X.X.', '.X.X.X.', '..XXX..', '...X...', '...X...', '..XXX..', '.......'];
const STAR_ROWS = [
  '...XX...',
  '...XX...',
  '..XXXX..',
  'XXXXXXXX',
  'XXXXXXXX',
  '..XXXX..',
  '...XX...',
  '...XX...',
];

/** Z（ねて いる）5×6 点・いえ の しるし 6×6 点（屋根 ＋ 家） */
const Z_ROWS = ['XXXXXX', '...XX.', '..XX..', '.XX...', 'XXXXXX'];
const HOUSE_ROWS = ['..XX..', '.XXXX.', 'XXXXXX', '.XXXX.', '.XXXX.', '.XXXX.'];

/** つぶの 絵の 並び（左から: 赤ハート・白ハート・星・四角）。1 まい 16×16 × 4 */
export function atlasTexture(): THREE.DataTexture {
  const T = 16;
  const W = T * TILE_COUNT;
  const data = new Uint8Array(W * T * 4);
  const put = (tile: number, x: number, y: number, rgb: number): void => {
    const o = (y * W + tile * T + x) * 4;
    data[o] = (rgb >> 16) & 255;
    data[o + 1] = (rgb >> 8) & 255;
    data[o + 2] = rgb & 255;
    data[o + 3] = 255;
  };
  const footprint = (tile: number, fill: number, edge: number): void => {
    const ox = 1;
    const oy = 1;
    const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < FOOT_ROWS.length && cx >= 0 && cx < 7 && FOOT_ROWS[cy][cx] === 'X';
    for (let cy = -1; cy <= FOOT_ROWS.length; cy++) {
      for (let cx = -1; cx <= 7; cx++) {
        const edgeCell = !cell(cx, cy) && (cell(cx - 1, cy) || cell(cx + 1, cy) || cell(cx, cy - 1) || cell(cx, cy + 1));
        if (!cell(cx, cy) && !edgeCell) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const px = ox + cx * 2 + dx;
          const py = oy + cy * 2 + dy;
          if (px >= 0 && px < T && py >= 0 && py < T) put(tile, px, py, cell(cx, cy) ? fill : edge);
        }
      }
    }
  };
  const heart = (tile: number, fill: number): void => {
    // 1 点 = 2×2。まわり 1 点 の ふちを こい色で
    const ox = 1;
    const oy = 2;
    const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < 6 && cx >= 0 && cx < 7 && HEART_ROWS[cy][cx] === 'X';
    for (let cy = -1; cy <= 6; cy++) {
      for (let cx = -1; cx <= 7; cx++) {
        const edge = !cell(cx, cy) && (cell(cx - 1, cy) || cell(cx + 1, cy) || cell(cx, cy - 1) || cell(cx, cy + 1));
        if (!cell(cx, cy) && !edge) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const px = ox + cx * 2 + dx;
          const py = oy + cy * 2 + dy;
          if (px >= 0 && px < T && py >= 0 && py < T) put(tile, px, py, cell(cx, cy) ? fill : 0x5a2430);
        }
      }
    }
  };
  heart(TILE.heartFull, 0xf0503c);
  heart(TILE.heartEmpty, 0xfff4e6);
  // あしあと（とりの 足あと = 3 本 の 指）: うまった = 藍（なかま の 色）、から の わく = うすい 白（ハート と 形が ちがう）
  footprint(TILE.footFull, 0x5b7bc4, 0x23325a);
  footprint(TILE.footEmpty, 0xe9e3d3, 0x7a7f94);
  // おなかいっぱい = まるい おなか（クリーム色。おこった 赤・× は 使わない）
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8.5);
      if (d > 6.4) continue;
      let c = d > 5.2 ? 0x8a6a3a : 0xfff0cf;
      if (c === 0xfff0cf && d > 3.2 && x + y > 17) c = 0xf0d9a8; // 右下 の かげ
      if (c === 0xfff0cf && Math.hypot(x + 0.5 - 6, y + 0.5 - 6.5) < 1.6) c = 0xffffff; // つや
      if (x >= 9 && x <= 11 && y === 10 && d < 5) c = 0xe3c690; // おへそ の せん
      put(TILE.belly, x, y, c);
    }
  }
  // 1 点 = 2×2。まわり 1 点 の ふち。`fillAt(cy)` = その 行 の 中 の 色
  const glyph = (tile: number, rows: readonly string[], ox: number, oy: number, fillAt: (cy: number) => number, edge: number): void => {
    const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < rows.length && cx >= 0 && cx < rows[cy].length && rows[cy][cx] === 'X';
    for (let cy = -1; cy <= rows.length; cy++) {
      for (let cx = -1; cx <= 6; cx++) {
        const isCell = cell(cx, cy);
        if (!isCell && !(cell(cx - 1, cy) || cell(cx + 1, cy) || cell(cx, cy - 1) || cell(cx, cy + 1))) continue;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const px = ox + cx * 2 + dx;
          const py = oy + cy * 2 + dy;
          if (px >= 0 && px < T && py >= 0 && py < T) put(tile, px, py, isCell ? fillAt(cy) : edge);
        }
      }
    }
  };
  glyph(TILE.zzz, Z_ROWS, 2, 3, () => 0xeaf2ff, 0x3b4a7a);
  // いえ の しるし: 下から 1/3・2/3・ぜんぶ うまる（おび の 色 = 木）。うまって いない ぶん は 白
  const houseFill = (rowsFilled: number) => (cy: number): number => (cy >= HOUSE_ROWS.length - rowsFilled ? 0xe0a050 : 0xfff4e6);
  glyph(TILE.houseEmpty, HOUSE_ROWS, 2, 2, houseFill(0), 0x5a3a24);
  glyph(TILE.house1, HOUSE_ROWS, 2, 2, houseFill(2), 0x5a3a24);
  glyph(TILE.house2, HOUSE_ROWS, 2, 2, houseFill(4), 0x5a3a24);
  glyph(TILE.house3, HOUSE_ROWS, 2, 2, houseFill(6), 0x5a3a24);
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) if (STAR_ROWS[cy][cx] === 'X') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(TILE.star, cx * 2 + dx, cy * 2 + dy, 0xffffff);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) put(TILE.dot, x, y, 0xffffff);
  const t = new THREE.DataTexture(data, W, T, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
