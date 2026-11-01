/**
 * ROPE-1: ロープの 16×16 絵（十字の 板に はる）。ropeTile = たてに たれる なわ、coilTile = 下に たまった まき。乱数なし。
 */
export const ROPE_TILE_NAMES = ['rope', 'rope_coil'] as const;
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

const PAINT: Record<RopeTileName, () => Rgba[]> = { rope: ropeTile, rope_coil: coilTile };

export function paintRopeTile(name: RopeTileName): Rgba[] {
  return PAINT[name]();
}
