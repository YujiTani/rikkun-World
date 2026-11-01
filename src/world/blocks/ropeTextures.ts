/**
 * ROPE-1: ロープの 16×16 絵（十字の 板に はる）。ropeTile = たてに たれる なわ、coilTile = 下に たまった まき。乱数なし。
 */
export const ROPE_TILE_NAMES = ['rope', 'rope_coil', 'rope_stake', 'rope_fence'] as const;
export type RopeTileName = (typeof ROPE_TILE_NAMES)[number];

type Rgba = readonly [number, number, number, number];
const N = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const LIGHT = '#C9A46A';
const DARK = '#8A6A3A';

/** たての なわ: まん中に 2 ドット はばの よった なわ（ななめの しま） */
function ropeTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (let y = 0; y < N; y++) {
    t[y * N + 7] = hex(y % 4 < 2 ? LIGHT : DARK);
    t[y * N + 8] = hex(y % 4 < 2 ? DARK : LIGHT);
  }
  return t;
}

/** ロープだまり: 上から なわが おりて、下で ぐるぐる まいた かたまり（3 だんの わ） */
function coilTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (let y = 0; y < 8; y++) {
    t[y * N + 7] = hex(y % 4 < 2 ? LIGHT : DARK);
    t[y * N + 8] = hex(y % 4 < 2 ? DARK : LIGHT);
  }
  const rings: Array<[number, number, number]> = [[8, 5, 11], [11, 3, 13], [14, 2, 14]]; // [y, 左, 右]
  for (const [y, x0, x1] of rings) {
    for (let x = x0; x < x1; x++) {
      t[y * N + x] = hex((x + y) % 3 === 0 ? DARK : LIGHT);
      t[(y + 1) * N + x] = hex(DARK);
    }
  }
  return t;
}

export function isRopeTile(name: string): name is RopeTileName {
  return (ROPE_TILE_NAMES as readonly string[]).includes(name);
}

/** 版 3: くい（A 案の なわと 同じ 2 色）。木の くいが 地面に ささり、まん中に なわが 2 まき。なわの はしは 右へ のびる（となりの マスで たれる） */
function stakeTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  const WOOD = '#9A6B3C';
  const WOOD_D = '#6B4523';
  const EDGE = '#4A3218';
  for (let y = 3; y < N; y++) {
    for (let x = 6; x < 10; x++) t[y * N + x] = hex(x === 6 || x === 9 ? EDGE : x === 7 ? WOOD : WOOD_D);
  }
  for (const x of [6, 7, 8, 9]) t[2 * N + x] = hex(EDGE); // くいの あたま
  t[2 * N + 7] = hex(WOOD);
  for (const y of [7, 8, 10, 11]) for (let x = 5; x < 11; x++) t[y * N + x] = hex((x + y) % 2 ? LIGHT : DARK); // まいた なわ 2 まき
  for (let x = 11; x < N; x++) t[9 * N + x] = hex(x % 2 ? LIGHT : DARK); // はし（がけの ほうへ）
  return t;
}

/** 版 3: ロープの さく。りょうはしの 木の くい 2 本に、なわが 3 だん わたる（A 案の 2 色） */
function fenceTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (const x0 of [1, 12]) {
    for (let y = 1; y < N; y++) for (let x = x0; x < x0 + 3; x++) t[y * N + x] = hex(x === x0 + 1 ? '#9A6B3C' : '#6B4523');
    for (let x = x0; x < x0 + 3; x++) t[x0 === 1 ? N + x : N + x] = hex('#4A3218'); // くいの あたま
  }
  for (const y of [3, 4, 8, 9, 13]) for (let x = 4; x < 12; x++) t[y * N + x] = hex((x + y) % 2 ? LIGHT : DARK); // なわ 3 だん
  return t;
}

const PAINT: Record<RopeTileName, () => Rgba[]> = { rope: ropeTile, rope_coil: coilTile, rope_stake: stakeTile, rope_fence: fenceTile };

export function paintRopeTile(name: RopeTileName): Rgba[] {
  return PAINT[name]();
}
