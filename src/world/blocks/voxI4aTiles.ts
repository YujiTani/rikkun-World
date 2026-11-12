// vox-i-4a: 4 ブロックの 1 コマめ（16x16、y=0 が 上）。textures.ts の Tile (Rgba[]) を返す。
// 使い方: paintGrid(PAL, GRID)。letters は タイルごとの パレット。'.' は すきま（alpha 0）。
type Rgba = readonly [number, number, number, number];
export type GridTile = { readonly pal: Readonly<Record<string, string>>; readonly rows: readonly string[] };
export function paintGrid(t: GridTile): Rgba[] {
  const out: Rgba[] = [];
  for (const row of t.rows) for (const ch of row) {
    const c = t.pal[ch];
    if (c === undefined) { out.push([0, 0, 0, 0]); continue; }
    const n = parseInt(c.slice(1), 16);
    out.push([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]);
  }
  return out;
}

const TILE_KINOKO: GridTile = {
  pal: {R: '#D8643A', r: '#A8432A', H: '#F08A5A', W: '#FFF3D6', S: '#F3E3C0', s: '#D8C093', K: '#3A2A22', P: '#F2A0A0', M: '#8A3A2A'},
  rows: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....rHHHHrr....',
    '....rHHWWRRRr...',
    '...rHWWHRRWWRr..',
    '..rRWWRRRRWWRr..',
    '..rRRRRWWRRRRr..',
    '.rrrrrrrrrrrrrr.',
    '....sSSSSSSs....',
    '....SSKSSKSS....',
    '....SSKSSKSs....',
    '....SPSMMSPs....',
    '....ssSSSSss....',
  ],
};

const TILE_HIMAWARI_UE: GridTile = {
  pal: {Y: '#F5C830', y: '#E39A1E', B: '#6B4423', K: '#2E1F18', M: '#2E1F18', g: '#3E8B2F', G: '#4CA332'},
  rows: [
    '.......YY.......',
    '..YY..YYYY..YY..',
    '..YYYYYYYYYYYY..',
    '..YYYBBBBBBYYY..',
    '.YYYBBBBBBBBYYY.',
    'YYYBBKBBBBKBBYYY',
    'YYYBBKBBBBKBBYYY',
    'YYYBBMBBBBMBBYYY',
    'YYYBBBMMMMBBBYYY',
    '.YYYBBBBBBBByyy.',
    '..YYYYBBBByyyy..',
    '..YY..YYyy..yy..',
    '.......yy.......',
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
  ],
};

const TILE_HIMAWARI_SHITA: GridTile = {
  pal: {g: '#3E8B2F', G: '#4CA332', L: '#2E7D32', l: '#9BE060'},
  rows: [
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
    '..ll...gG.......',
    '..LLLLLgG.......',
    '...lLLLgG.......',
    '.......gG.......',
    '.......gG...ll..',
    '.......gGLLLLL..',
    '.......gGLLLl...',
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
    '.......gG.......',
  ],
};

const TILE_KAIGARA: GridTile = {
  pal: {W: '#FFF3E0', w: '#E8D2B8', R: '#B5502F', r: '#8F3A24', D: '#6E2E1E', C: '#F4A982', c: '#D9764F', K: '#2A1A24', E: '#FFFFFF', M: '#8A2E2E', P: '#F28A8A'},
  rows: [
    '................',
    '.....DDD........',
    '...DDRRWWDD.....',
    '..DWRRRWWRDD....',
    '.DWWWRWWWRRDD...',
    '.DWWWWWWWRRWD...',
    'DRRRWWDDDWCCCC..',
    'DRRWWDWWDWCECCE.',
    'DWWDWWWWWDCKCCK.',
    'DWWWWWWWDWCCCCCC',
    '.DRRDDDDDWPCMMCP',
    '.DRRRWWWRWCMCCM.',
    '..DRWWWRRwCCCC..',
    '...DDWWRRDc....c',
    '.....DDD...c.c..',
    '..........c.c.c.',
  ],
};

const TILE_TAKENOKO: GridTile = {
  pal: {t: '#E8D68A', L: '#C99660', B: '#A8723C', d: '#6E4524', F: '#F0D9A0', K: '#2E1F18', M: '#8A3A2A'},
  rows: [
    '................',
    '................',
    '................',
    '.......tt.......',
    '......tttt......',
    '.....LBBBBd.....',
    '....dddddddd....',
    '....LBBBBBBd....',
    '...LBBBBBBBBd...',
    '...dddddddddd...',
    '..LBFFFFFFFFBd..',
    '..LBFFKFFKFFBd..',
    '..LBFFKFFKFFBd..',
    '..LBFFFMMFFFBd..',
    '..LBBBBBBBBBBd..',
    '.LBBBBBBBBBBBBd.',
  ],
};

/** タイル名 → 1 コマめの 絵（textures.ts の VoxITileName と 同じ 名前。足し忘れは 型エラー） */
export const VOX_I4A_GRIDS = {
  kinoko: TILE_KINOKO,
  himawari_ue: TILE_HIMAWARI_UE,
  himawari_shita: TILE_HIMAWARI_SHITA,
  kaigara: TILE_KAIGARA,
  takenoko: TILE_TAKENOKO,
} as const satisfies Record<string, GridTile>;
