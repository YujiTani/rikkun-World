// vox-i-4b: すいしょう・とうろう・おちば の 1 コマめ（16x16、y=0 が 上）。voxI4aTiles.ts の GridTile / paintGrid を そのまま 使う（import して ね）。
import type { GridTile } from './voxI4aTiles';

const TILE_SUISHO_TOP: GridTile = {
  pal: {W: '#F4FBFF', l: '#B8E4FA', b: '#86BDEB', p: '#B49CEA', d: '#5E7FC8'},
  rows: [
    'dddddddddddddddd',
    'dpWppppWdpppppbd',
    'dlWpppppdppppWWd',
    'dllWppppppppWbbd',
    'dlllWppppppWbbbd',
    'dllllWbbllWbbbbd',
    'dlllllWWWWbbbbbd',
    'dddlllWWWWbbbbWd',
    'dWbbbbWWWWlllddd',
    'dbbbbbWWWWllllld',
    'dbbbbWllbbWlllld',
    'dbbbWlllbbbWllld',
    'dbbWllllbbbbWlld',
    'dWWlllldbbbbbWld',
    'dbllllldWbbbbWbd',
    'dddddddddddddddd',
  ],
};

const TILE_SUISHO_SIDE: GridTile = {
  pal: {W: '#F4FBFF', l: '#B8E4FA', b: '#86BDEB', p: '#B49CEA', d: '#5E7FC8'},
  rows: [
    'dddddddddddddddd',
    'ddpppppdpppppddd',
    'dWWppppdpppppWdd',
    'dlWWpppdppppWWbd',
    'dllWpppdpppWbbbd',
    'dlllWppdppWbbbbd',
    'dllllWbWlWbbbbbd',
    'dlllllWWWbbbbbbd',
    'dddddWWWWWdddddd',
    'dbbbbbWWWlllllld',
    'dbbbbWlWbWllllld',
    'dbbbWlldbbWlllld',
    'dbbWllldbbbWWlld',
    'dWWlllldbbbbWlld',
    'dWllllldbbbbWWdd',
    'dddddddddddddddd',
  ],
};

const TILE_TOURO_TOP: GridTile = {
  pal: {s: '#9A9AA6', t: '#B8B8C4', u: '#6E6E80', o: '#F0A838', O: '#F7C860', e: '#FFFFFF', k: '#2A1A24', n: '#E8607A', m: '#8A3A2A', q: '#C8801E'},
  rows: [
    'tttttttttttttttt',
    'tssssssssssssssu',
    'tssssssssssssssu',
    'tssuuuuuuuuuussu',
    'tssuttttttttsssu',
    'tssutOOOOOqtsssu',
    'tssutOooooqtsssu',
    'tssutOooooqtsssu',
    'tssutOooooqtsssu',
    'tssutOooooqtsssu',
    'tssutqqqqqqtsssu',
    'tssuttttttttsssu',
    'tssusssssssssssu',
    'tssssssssssssssu',
    'tssssssssssssssu',
    'tuuuuuuuuuuuuuuu',
  ],
};

const TILE_TOURO_SIDE: GridTile = {
  pal: {s: '#9A9AA6', t: '#B8B8C4', u: '#6E6E80', o: '#F0A838', O: '#F7C860', e: '#FFFFFF', k: '#2A1A24', n: '#E8607A', m: '#8A3A2A', q: '#C8801E'},
  rows: [
    'tttttttttttttttt',
    'tssssssssssssssu',
    'tsqqqqqqqqqqqqsu',
    'tsqOOoeeeeoOOqsu',
    'tsqooeeekeeooqsu',
    'tsqooeekkeeooqsu',
    'tsqooeekkeeooqsu',
    'tsqooeekkeeooqsu',
    'tsqoooeeeeoooqsu',
    'tsqooooooooooqsu',
    'tsqommmmmmmmoqsu',
    'tsqooonnnnoooqsu',
    'tsqoooonnooooqsu',
    'tsqqqqqqqqqqqqsu',
    'tssssssssssssssu',
    'uuuuuuuuuuuuuuuu',
  ],
};

const TILE_OCHIBA_TOP: GridTile = {
  pal: {R: '#B8422A', r: '#8E2E22', O: '#D8782A', Y: '#E8B83A', y: '#F2D46A', D: '#8B5A2B', d: '#6F4520', L: '#A06A38'},
  rows: [
    'OOOOOYYOOOOOOOOO',
    'ORROOYOYYOOOOOrO',
    'ORrOOOOYOrrOOOOO',
    'OOOOOOOOOrOOOOOO',
    'OOOyyOOOOOOOOOrr',
    'OOOyOOORROOYYOrO',
    'OrrOOOORrOOYOOOO',
    'OrOOOOOOOOOOOOOO',
    'OOOOOOOORROOOOOO',
    'OrOOyyOORrOOYYOO',
    'OOOOyOOOOOOOYOOO',
    'OOOOOOOOOOOOOOOO',
    'OOrrOOOOOOyyOOOO',
    'OOrOOOOOOOyOOORR',
    'OOOOOOOrOOOOOORr',
    'OOOOOOOOOOOOOOOO',
  ],
};

const TILE_OCHIBA_SIDE: GridTile = {
  pal: {R: '#B8422A', r: '#8E2E22', O: '#D8782A', Y: '#E8B83A', y: '#F2D46A', D: '#8B5A2B', d: '#6F4520', L: '#A06A38'},
  rows: [
    'RrRYOOOYRrRYOOOY',
    'YOORYRrRYROOYRRR',
    'rYrDRYrrODrrRrDO',
    'DrDDrODDrDDOrDDr',
    'DDDDDrDDDDDrDDDD',
    'DDDDDDDDDDDDDDDD',
    'DDDDdDDDDDDDDDDD',
    'dDDDDdDDDDDDDDDD',
    'LdDDDDDDDDDDDDDD',
    'DDDDdDLDDDDDDDDD',
    'DLDDDDDDDDDDDDdD',
    'DLLdDdDDLDDDDDDL',
    'DDDDDDDDDDDdDdDD',
    'DDdDDDDDDDDDDDDD',
    'DDdDDDDDDDDDDDDD',
    'DDDDDDDLDDDDDDDD',
  ],
};

/** タイル名 → 1 コマめの 絵（textures.ts の VoxITileName と 同じ 名前。足し忘れは 型エラー）。まばたき・いき・つぶは #186 */
export const VOX_I4B_GRIDS = {
  suisho_top: TILE_SUISHO_TOP,
  suisho_side: TILE_SUISHO_SIDE,
  touro_top: TILE_TOURO_TOP,
  touro_side: TILE_TOURO_SIDE,
  ochiba_top: TILE_OCHIBA_TOP,
  ochiba_side: TILE_OCHIBA_SIDE,
} as const satisfies Record<string, GridTile>;
