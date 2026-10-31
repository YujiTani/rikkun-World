// HOUSE-1C PR-1（#340）家の ブロックの 見た目: 色の 表と 絵 12 まい。ゲームの 世界の 絵の 表（textures.ts）と エディターの 見本・画面の 絵が 同じ 表を 読む（#304 1 か所）。
// 案 C「ふとい いたの やまごや」しあげ（yuzu 2026-10-30 15:08 決定）＋ 窓と 戸の 見つけやすさ（yuzu 16:52「窓と扉がわかりにくい」の 直し）。
// 数と 色の 元: アートの docs/art/house-1/proto/houseLookC.ts.txt の PAL_C と tilesC を 写した（タイルの 名前だけ この 実装の 名前に かえた:
//   hl_floor_top → house_floor・hl_floor_side → house_floor_side・hl_wall → house_wall・hl_wall_top → house_wall_top・hl_roof_top → house_roof_top・
//   hl_roof_side → house_roof_side・hl_ceiling → house_ceiling・hl_shoji → house_shoji・hl_shoji_edge → house_shoji_edge・
//   hl_door_low → house_door_lo・hl_door_up → house_door_hi・hl_door_edge → house_door_edge）。
// しあげの 考え方: 人が 作った 物は 平らな 箱。かべ・ゆか・やねの みぞ・ふとさは 絵の 線と かげで 見せる。しょうじ ＝ 明るい 紙に こい わく、戸 ＝ こい 色の とびら。
// 別の 案に 入れかえる ときは、このファイルの 色の 表（HOUSE_PAL）と 絵の 描き方（paintHouseTiles）だけを かえる。
import type { Px as NumPx } from './houseTilePaint';

/** 16×16 の 絵（'#rrggbb'、'' = すける）。[y * 16 + x]、y = 0 が 上 */
type Px = string[];

export const HOUSE_TILE_NAMES = [
  'house_floor', 'house_floor_side', 'house_wall', 'house_wall_top', 'house_roof_top', 'house_roof_side', 'house_ceiling',
  'house_shoji', 'house_shoji_edge', 'house_door_lo', 'house_door_hi', 'house_door_edge',
] as const;
export type HouseTile = (typeof HOUSE_TILE_NAMES)[number];
const N = 16;
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const solid = (c: string): Px => new Array<string>(N * N).fill(c);
function put(t: Px, x: number, y: number, c: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) t[y * N + x] = c;
}
function rect(t: Px, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(t, i, j, c);
}
function speck(t: Px, cs: string[], seed: number, n: number, keep?: (x: number, y: number) => boolean): Px {
  const r = lcg(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    if (keep && !keep(x, y)) continue;
    t[y * N + x] = cs[i % cs.length];
  }
  return t;
}
/** みじかい 横の すじ（木目） */
function strokes(t: Px, c: string, seed: number, n: number, len: number, keep?: (x: number, y: number) => boolean, vertical = false): Px {
  const r = lcg(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    const l = len + Math.floor(r() * 3);
    for (let k = 0; k < l; k++) {
      const xx = vertical ? x : (x + k) % N;
      const yy = vertical ? (y + k) % N : y;
      if (!keep || keep(xx, yy)) t[yy * N + xx] = c;
    }
  }
  return t;
}
function circle(t: Px, cx: number, cy: number, r: number, c: string): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(t, x, y, c);
}

// ============================================================ 色の 表（案 C）
export const HOUSE_PAL = {
  // かべの 板: 地・光（板の 上の ふち）・かげ（板の 下の ふち）・みぞ（板の さかい）・ふし
  plank: '#BF8952', plankL: '#CE9A62', plankD: '#A77442', groove: '#7E5231', knot: '#77492A',
  // やね: 板・光・板の さかい・石・石の 光・石の かげ・石が 板に 落とす かげ
  roof: '#685040', roofL: '#776050', roofD: '#56402F', stone: '#9C968B', stoneL: '#B3ADA1', stoneD: '#7F796F', stoneS: '#4C392B',
  fascia: '#5A3E2A', fasciaL: '#6E4E36', fasciaD: '#462F1E',
  ceil: '#B98450', ceilL: '#C8935E', ceilD: '#A87443', beam: '#5E4230', beamL: '#70503A',
  mortar: '#867D71', st1: '#B5A994', st2: '#A99D87', st3: '#BFB4A0', stL: '#CCC2AE',
  // しょうじ: 明るい 紙（かべより ずっと 明るい）・こい わく（かべより ずっと 暗い）
  paper: '#FAF3E2', paperD: '#F1E8D3', paperS: '#E4D7BA', frame: '#3E2A1C', frameL: '#563B27', kumiko: '#4A3222',
  // 戸: かべより 暗い とびら・てつの おび・しんちゅうの 取っ手（さわれそう）
  door: '#6E4628', doorL: '#80542F', doorD: '#55341D', iron: '#34323A', ironL: '#55535D', ring: '#C9952E', ringL: '#E8BE5A',
} as const;

// ============================================================ 絵（16×16 の タイル 12 まい）
const COBBLES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [1, 1, 6, 5, 0], [8, 1, 4, 4, 1], [13, 1, 3, 6, 2], [8, 6, 4, 4, 2], [1, 7, 4, 4, 1], [6, 7, 1, 4, 0],
  [13, 8, 3, 3, 0], [1, 12, 5, 3, 2], [7, 11, 5, 4, 0], [13, 12, 3, 3, 1],
];
/** かべの 板 3 まい: [上の 行, 下の 行]。みぞは 5・10・15 行目（下の かべの 0 行目と つながる） */
const BOARDS: ReadonlyArray<readonly [number, number]> = [[0, 4], [6, 9], [11, 14]];
const GROOVES = [5, 10, 15] as const;

function paintHouseTiles(): Record<HouseTile, Px> {
  const P = HOUSE_PAL;
  // かべ: ふとい 横板 3 まい。でこぼこの かわりに 板の 上の ふち 1 行を 光、下の ふち 1 行を かげ、さかいを みぞ（いちばん 暗い）に して ふとさを 見せる
  const wall = solid(P.plank);
  const inBoard = (_x: number, y: number): boolean => BOARDS.some(([a, b]) => y > a && y < b);
  strokes(wall, P.plankD, 301, 5, 3, inBoard);
  strokes(wall, P.plankL, 302, 3, 3, inBoard);
  for (const [a, b] of BOARDS) {
    rect(wall, 0, a, N, 1, P.plankL);
    rect(wall, 0, b, N, 1, P.plankD);
  }
  for (const y of GROOVES) rect(wall, 0, y, N, 1, P.groove);
  // 板の つぎめ（上と 下の 板に 1 つずつ。まん中の 板は つぎめ なし = 長い 板）と ふし 1 つ
  for (const [x, a, b] of [[4, 0, 4], [11, 11, 14]] as const) {
    rect(wall, x, a, 1, b - a + 1, P.groove);
    rect(wall, x + 1, a + 1, 1, b - a - 1, P.plankL);
  }
  rect(wall, 8, 7, 2, 1, P.knot);
  const wallTop = solid(P.plankD);
  strokes(wallTop, P.groove, 303, 6, 5);
  strokes(wallTop, P.plank, 304, 4, 4);

  // やね: こい 木の 板（4 行 ごとに さかい）に 板を おさえる 石 2 こ。石の 右と 下に かげ（のって いる ように 見せる）
  const roofTop = solid(P.roof);
  for (const y of [0, 4, 8, 12]) rect(roofTop, 0, y, N, 1, P.roofD);
  strokes(roofTop, P.roofL, 305, 6, 4);
  const stone = (x: number, y: number, w: number, h: number): void => {
    rect(roofTop, x + 1, y + h, w - 1, 1, P.stoneS);
    rect(roofTop, x + w, y + 1, 1, h - 1, P.stoneS);
    rect(roofTop, x, y, w, h, P.stone);
    rect(roofTop, x, y + h - 1, w, 1, P.stoneD);
    rect(roofTop, x + w - 1, y, 1, h, P.stoneD);
    put(roofTop, x, y, P.roof);
    put(roofTop, x + w - 1, y + h - 1, P.stoneS);
    rect(roofTop, x + 1, y, w - 2, 1, P.stoneL);
    put(roofTop, x, y + 1, P.stoneL);
  };
  stone(2, 2, 5, 4);
  stone(9, 9, 5, 4);
  const roofSide = solid(P.fascia);
  strokes(roofSide, P.fasciaD, 306, 7, 5);
  strokes(roofSide, P.fasciaL, 307, 5, 4);
  rect(roofSide, 0, 0, N, 1, P.fasciaL);
  rect(roofSide, 0, 15, N, 1, P.fasciaD);

  const ceiling = solid(P.ceil);
  strokes(ceiling, P.ceilL, 308, 6, 4);
  strokes(ceiling, P.ceilD, 309, 6, 3);
  rect(ceiling, 0, 0, 3, N, P.beam); // はり（1 ブロック ごと）
  rect(ceiling, 2, 0, 1, N, P.beamL);

  const floorTop = solid(P.mortar);
  const stc = [P.st1, P.st2, P.st3];
  for (const [x, y, w, h, c] of COBBLES) {
    rect(floorTop, x, y, w, h, stc[c]);
    put(floorTop, x, y, P.stL);
  }
  const floorSide = solid(P.mortar);
  rect(floorSide, 1, 1, 6, 6, P.st2);
  rect(floorSide, 8, 2, 7, 5, P.st1);
  rect(floorSide, 2, 9, 5, 6, P.st3);
  rect(floorSide, 9, 9, 6, 5, P.st2);

  // しょうじ: 明るい 紙に こい わく（2 点）と「田」の さん（たて・よこ 2 点。だれでも 知って いる 窓の 形）。
  // 4 つの ます の 上・左に かげ 1 点（紙が わくの おくに ある ように）
  const shoji = speck(solid(P.paper), [P.paperD], 310, 6);
  for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9]] as const) {
    rect(shoji, x, y, 5, 1, P.paperS);
    rect(shoji, x, y, 1, 5, P.paperS);
  }
  rect(shoji, 7, 2, 2, 12, P.kumiko);
  rect(shoji, 2, 7, 12, 2, P.kumiko);
  rect(shoji, 0, 0, N, 2, P.frame);
  rect(shoji, 0, 14, N, 2, P.frame);
  rect(shoji, 0, 0, 2, N, P.frame);
  rect(shoji, 14, 0, 2, N, P.frame);
  rect(shoji, 1, 1, 14, 1, P.frameL);
  const shojiEdge = solid(P.frame);
  strokes(shojiEdge, P.fasciaD, 311, 4, 4);

  // 2 まい とびら（くらの 戸）: たての あつい 板 ＋ てつの おび ＋ わの 取っ手
  const doorBase = (seed: number): Px => {
    const t = solid(P.door);
    strokes(t, P.doorD, seed, 6, 3, undefined, true);
    for (const x of [2, 5, 10, 13]) rect(t, x, 0, 1, N, P.doorD);
    rect(t, 7, 0, 2, N, P.doorD); // まん中の あわせ目
    return t;
  };
  const band = (t: Px, y: number): void => {
    rect(t, 0, y, N, 2, P.iron);
    for (const x of [1, 5, 10, 14]) put(t, x, y, P.ironL);
  };
  const doorLow = doorBase(312);
  band(doorLow, 11);
  // わの 取っ手（左右の とびらに 1 つずつ。こしの 高さ）
  for (const cx of [5.5, 10.5]) {
    circle(doorLow, cx, 3, 2.2, P.ring);
    circle(doorLow, cx, 3, 1.2, P.door);
    put(doorLow, Math.floor(cx) - 1, 1, P.ringL);
  }
  rect(doorLow, 0, 15, N, 1, P.doorD);
  const doorUp = doorBase(313);
  band(doorUp, 3);
  rect(doorUp, 0, 0, N, 1, P.doorD);
  const doorEdge = solid(P.doorD);
  strokes(doorEdge, P.door, 314, 4, 3, undefined, true);
  return {
    house_floor: floorTop, house_floor_side: floorSide, house_wall: wall, house_wall_top: wallTop, house_roof_top: roofTop, house_roof_side: roofSide,
    house_ceiling: ceiling, house_shoji: shoji, house_shoji_edge: shojiEdge, house_door_lo: doorLow, house_door_hi: doorUp, house_door_edge: doorEdge,
  };
}
/** 画面の 色（エディターの 見本・画面が 使う）。パレットは 上の HOUSE_PAL */
export const HOUSE_LOOK = {
  name: 'C「ふとい いたの やまごや」しあげ（窓と 戸の 見つけやすさ つき）',
  pal: HOUSE_PAL,
  /** 見本の 空（案の 絵と 同じ） */
  sky: 0x8fd3ff,
  /** 画面の 地（いつもの UI の 地と 同じ --rk-bg-900） */
  screen: 0x10141f,
} as const;

const toPx = (t: Px): NumPx => t.map((c) => (c ? parseInt(c.slice(1), 16) : 0));

/** 絵 12 まい（0xRRGGBB の 列。上の 行から） */
export function houseTiles(): Record<HouseTile, NumPx> {
  const t = paintHouseTiles();
  return Object.fromEntries(HOUSE_TILE_NAMES.map((n) => [n, toPx(t[n])])) as Record<HouseTile, NumPx>;
}
