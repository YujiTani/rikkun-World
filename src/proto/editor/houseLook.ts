// HOUSE-1B 試作: 家の 見た目（かべ・ゆか・やね・しょうじ・戸）の 色と 絵。
// yuzu が えらんだ 案 C「ふとい いたの やまごや」の しあげ版（2026-10-30 15:08 決定）に そろえて ある。
// 数と 色の 元: アートの docs/art/house-1/proto/houseLookC.ts.txt の PAL_C と tilesC を 写した（タイルの 名前だけ この 試作の 名前に かえた:
//   hl_floor_top → house_floor・hl_wall → house_wall・hl_wall_top → house_wall_top・hl_roof_top → house_roof_top・
//   hl_roof_side → house_roof_side・hl_shoji → house_shoji・hl_door_low → house_door_lo・hl_door_up → house_door_hi）。
// しあげの 考え方: 人が 作った 物は 平らな 箱。かべ・ゆか・やねの みぞ・ふとさは 絵の 線と かげで 見せる（でこぼこの 面は 作らない）。
//   しょうじ ＝ かべの あつみの まん中に 紙の 板 1 まい（わくと さんは 絵。へこみは となりの かべの 面で 見える）、戸 ＝ 外がわよりの あつい 板 1 まい。
//   ふとんは 今の まま。天井（hl_ceiling）は 屋根なしの 見本に 出ない ので 写して いない。
// 別の 案に 入れかえる ときは、この ファイルの HOUSE_LOOK（色の 表）と houseTiles（絵の 描き方）だけを かえる。
import type { Px } from './tilePaint';

/** 色の 表（案 C しあげ）。'#rrggbb' */
export const HOUSE_LOOK = {
  name: 'C「ふとい いたの やまごや」しあげ',
  pal: {
    // かべの 板: 地・光（板の 上の ふち）・かげ（板の 下の ふち）・みぞ（板の さかい）・ふし
    plank: '#BF8952', plankL: '#CE9A62', plankD: '#A77442', groove: '#7E5231', knot: '#77492A',
    // やね: 板・光・板の さかい・石・石の 光・石の かげ・石が 板に 落とす かげ
    roof: '#685040', roofL: '#776050', roofD: '#56402F', stone: '#9C968B', stoneL: '#B3ADA1', stoneD: '#7F796F', stoneS: '#4C392B',
    fascia: '#5A3E2A', fasciaL: '#6E4E36', fasciaD: '#462F1E',
    // ゆか（石だたみ）
    mortar: '#867D71', st1: '#B5A994', st2: '#A99D87', st3: '#BFB4A0', stL: '#CCC2AE',
    // しょうじ
    paper: '#EFE4CA', paperD: '#E5D8BC', paperS: '#D8C9A8', frame: '#5A3E2A', frameL: '#6E4E36', kumiko: '#6E4E36',
    // 戸（2 まい とびら）
    door: '#8D5E36', doorL: '#9E6C40', doorD: '#6E4626', iron: '#3E3C44', ironL: '#5C5A64', ring: '#2C2A32',
  },
  /** 見本の 空（案の 絵と 同じ） */
  sky: 0x8fd3ff,
  /** 画面の 地（いつもの UI の 地と 同じ --rk-bg-900） */
  screen: 0x10141f,
} as const;

export type HouseTile = 'house_wall' | 'house_wall_top' | 'house_floor' | 'house_roof_top' | 'house_roof_side' | 'house_shoji' | 'house_door_lo' | 'house_door_hi';
export const HOUSE_TILE_NAMES: readonly HouseTile[] = [
  'house_wall', 'house_wall_top', 'house_floor', 'house_roof_top', 'house_roof_side', 'house_shoji', 'house_door_lo', 'house_door_hi',
];

// ------------------------------------------------------------ 描く 道具（16×16。'#rrggbb' の 列。上の 行から）
type Hx = string[];
type Keep = (x: number, y: number) => boolean;
const N = 16;
const solid = (c: string): Hx => new Array<string>(N * N).fill(c);
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function put(t: Hx, x: number, y: number, c: string): void {
  if (x >= 0 && y >= 0 && x < N && y < N) t[y * N + x] = c;
}
function rect(t: Hx, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(t, i, j, c);
}
function speck(t: Hx, cs: string[], seed: number, n: number, keep?: Keep): Hx {
  const r = lcg(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    if (keep && !keep(x, y)) continue;
    t[y * N + x] = cs[i % cs.length]!;
  }
  return t;
}
/** みじかい すじ（木目。vertical ＝ たて） */
function strokes(t: Hx, c: string, seed: number, n: number, len: number, keep?: Keep, vertical = false): Hx {
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
function circle(t: Hx, cx: number, cy: number, r: number, c: string): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(t, x, y, c);
}
const toPx = (t: Hx): Px => t.map((c) => parseInt(c.slice(1), 16));

/** 石だたみの 石（16×16 で つながる。x, y, w, h, 色の 番号） */
const COBBLES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [1, 1, 6, 5, 0], [8, 1, 4, 4, 1], [13, 1, 3, 6, 2], [8, 6, 4, 4, 2], [1, 7, 4, 4, 1], [6, 7, 1, 4, 0],
  [13, 8, 3, 3, 0], [1, 12, 5, 3, 2], [7, 11, 5, 4, 0], [13, 12, 3, 3, 1],
];
/** かべの 板 3 まい: [上の 行, 下の 行]。みぞは 5・10・15 行目（下の かべの 0 行目と つながる） */
const BOARDS: ReadonlyArray<readonly [number, number]> = [[0, 4], [6, 9], [11, 14]];
const GROOVES = [5, 10, 15] as const;

/** 絵 8 まい（案 C しあげ） */
export function houseTiles(): Record<HouseTile, Px> {
  const P = HOUSE_LOOK.pal;
  // かべ: ふとい 横板 3 まい。でこぼこの かわりに 板の 上の ふち 1 行を 光、下の ふち 1 行を かげ、さかいを みぞ（いちばん 暗い）に して ふとさを 見せる
  const wall = solid(P.plank);
  const inBoard: Keep = (_x, y) => BOARDS.some(([a, b]) => y > a && y < b);
  strokes(wall, P.plankD, 301, 5, 3, inBoard);
  strokes(wall, P.plankL, 302, 3, 3, inBoard);
  for (const [a, b] of BOARDS) {
    rect(wall, 0, a, N, 1, P.plankL);
    rect(wall, 0, b, N, 1, P.plankD);
  }
  for (const y of GROOVES) rect(wall, 0, y, N, 1, P.groove);
  // 板の つぎめ（上と 下の 板に 1 つずつ。まん中の 板は つぎめ なし ＝ 長い 板）と ふし 1 つ
  for (const [x, a, b] of [[4, 0, 4], [11, 11, 14]] as const) {
    rect(wall, x, a, 1, b - a + 1, P.groove);
    rect(wall, x + 1, a + 1, 1, b - a - 1, P.plankL);
  }
  rect(wall, 8, 7, 2, 1, P.knot);
  // かべの 上の 面（屋根を はずした へり）: こい 板
  const wallTop = solid(P.plankD);
  strokes(wallTop, P.groove, 303, 6, 5);
  strokes(wallTop, P.plank, 304, 4, 4);

  // やね（上）: こい 木の 板（4 行 ごとに さかい）に 板を おさえる 石 2 こ。石の 右と 下に かげ（のって いる ように 見せる）
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
  // やね（よこ）: こい 木の 板の ふち
  const roofSide = solid(P.fascia);
  strokes(roofSide, P.fasciaD, 306, 7, 5);
  strokes(roofSide, P.fasciaL, 307, 5, 4);
  rect(roofSide, 0, 0, N, 1, P.fasciaL);
  rect(roofSide, 0, 15, N, 1, P.fasciaD);

  // ゆか: 石だたみ
  const floor = solid(P.mortar);
  const stc = [P.st1, P.st2, P.st3];
  for (const [x, y, w, h, c] of COBBLES) {
    rect(floor, x, y, w, h, stc[c]!);
    put(floor, x, y, P.stL);
  }

  // しょうじ: 紙の 板 1 まいに わく（2 点）・さん（たて 1・よこ 2）を 絵で。わくの 内がわ 上・左に かげ 1 点（紙が おくに ある ように）
  const shoji = speck(solid(P.paper), [P.paperD], 310, 8);
  rect(shoji, 2, 2, 12, 1, P.paperS);
  rect(shoji, 2, 2, 1, 12, P.paperS);
  rect(shoji, 7, 2, 2, 12, P.kumiko);
  rect(shoji, 2, 6, 12, 1, P.kumiko);
  rect(shoji, 2, 10, 12, 1, P.kumiko);
  rect(shoji, 0, 0, N, 2, P.frame);
  rect(shoji, 0, 14, N, 2, P.frame);
  rect(shoji, 0, 0, 2, N, P.frame);
  rect(shoji, 14, 0, 2, N, P.frame);
  rect(shoji, 1, 1, 14, 1, P.frameL);

  // 2 まい とびら: たての あつい 板 ＋ てつの おび ＋ わの 取っ手
  const doorBase = (seed: number): Hx => {
    const t = solid(P.door);
    strokes(t, P.doorD, seed, 6, 3, undefined, true);
    for (const x of [2, 5, 10, 13]) rect(t, x, 0, 1, N, P.doorD);
    rect(t, 7, 0, 2, N, P.doorD); // まん中の あわせ目
    return t;
  };
  const band = (t: Hx, y: number): void => {
    rect(t, 0, y, N, 2, P.iron);
    for (const x of [1, 5, 10, 14]) put(t, x, y, P.ironL);
  };
  const doorLow = doorBase(312);
  band(doorLow, 11);
  // わの 取っ手（左右の とびらに 1 つずつ。こしの 高さ）
  for (const cx of [5.5, 10.5]) {
    circle(doorLow, cx, 3, 2.2, P.ring);
    circle(doorLow, cx, 3, 1.2, P.door);
  }
  rect(doorLow, 0, 15, N, 1, P.doorD);
  const doorUp = doorBase(313);
  band(doorUp, 3);
  rect(doorUp, 0, 0, N, 1, P.doorD);
  return {
    house_wall: toPx(wall),
    house_wall_top: toPx(wallTop),
    house_floor: toPx(floor),
    house_roof_top: toPx(roofTop),
    house_roof_side: toPx(roofSide),
    house_shoji: toPx(shoji),
    house_door_lo: toPx(doorLow),
    house_door_hi: toPx(doorUp),
  };
}
