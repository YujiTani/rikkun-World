// わふうの ブロック 4 しゅ（しゅいろの き・いしだたみ・こけいし・ちょうちん。WAFU-1 試作）（16x16、y=0 が 上、1 コマめ）。voxI4aTiles.ts の GridTile / paintGrid を そのまま 使う。'.' は とうめい（chouchin だけ）。
import type { GridTile } from './voxI4aTiles';

const TILE_SHU_ITA: GridTile = {
  pal: {R: '#C8402A', L: '#D9573A', D: '#A3301F', g: '#B73823', k: '#7E2418'},
  rows: [
    'LLLLLLLDLLLLLLLD',
    'LRRgRRRDLRRgRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRRRRRDLRRRRgRD',
    'LRRRRRRDLRRRRgRD',
    'LRRRRgRDLRRRRRRD',
    'LRRRRgRDLRRRRRRD',
    'LRRRRRRDLRRRRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRgRRRDLRRgRRRD',
    'LRRRRRRDLRRRRgRD',
    'LRgRRRRDLRRRRRRD',
    'DDDDDDDDDDDDDDDD',
  ],
};

const TILE_ISHIDATAMI: GridTile = {
  pal: {L: '#DADADF', M: '#C6C6CE', j: '#8E8E9C', h: '#EEEEF2', s: '#B0B0BC'},
  rows: [
    'jjjjjjjjjjjjjjjj',
    'hhhhjhhhhhhhjhhh',
    'LLLLjLLLLLLLjLLL',
    'LLMMjLLLLLLLjLLL',
    'LLLLjLLLLMLLjLLL',
    'LLLLjLLLLLLLjLLL',
    'ssssjsssssssjsss',
    'LLLLLLLLLLLLLLLL',
    'jjjjjjjjjjjjjjjj',
    'hhhhjhhhhhhhjhhh',
    'LLLLjLLLLLLLjLLL',
    'LLLLjLLLLLLLjLLL',
    'LLLLjLLLMLLLjLLL',
    'LMLLjLLLLLLLjMML',
    'ssssjsssssssjsss',
    'LLLLLLLLLLLLLLLL',
  ],
};

const TILE_CHOUCHIN: GridTile = {
  pal: {r: '#D8352A', R: '#EE5A44', d: '#9C1F22', k: '#2A2430', y: '#F6C850', Y: '#FFE79A', o: '#7A5A3A'},
  rows: [
    '................',
    '.......oo.......',
    '.......oo.......',
    '.....kkkkkk.....',
    '....kkkkkkkk....',
    '....RRRrrrdd....',
    '...RRRrrrrrdd...',
    '..RRRrYYYYrrdd..',
    '..RRrYyyyyYrdd..',
    '..RRrYyyyyYrdd..',
    '..RRRrYYYYrrdd..',
    '...RRRrrrrrdd...',
    '....rRrrrrdd....',
    '....kkkkkkkk....',
    '.....kkkkkk.....',
    '......rrrr......',
  ],
};

const TILE_KOKE_ISHI: GridTile = {
  pal: {S: '#9A9AA6', l: '#B4B4BE', d: '#74748A', G: '#5E9E3E', g: '#7DBF4E', n: '#3E7A30'},
  rows: [
    'llllllllllllllll',
    'SSGSSSSSSSSSSGGS',
    'SSSllSSSSSSSSSGS',
    'SSSSSSddSlllSSSS',
    'SSdSSSSSSSSSSSSS',
    'SSSSSSlSSSSSSSdS',
    'SlSSSSSSSSSSSSSS',
    'SSSSgdSSSgSSllSg',
    'SgSgGSSSgGgSSSgG',
    'gGSGGgSSGGGSSgGG',
    'GGgGGGSgGGngSGGG',
    'GnGGgGgGGGGGgGGG',
    'GGGGGGGgGGGGnGGG',
    'GGnGGGGGGGGgGGGG',
    'gGGGGGGGnGGGGGGG',
    'GGGGGnGGGGGGGGnG',
  ],
};

/** わふうの 4 ブロックの 絵（かわら・しっくいは 今ある 絵を 使うので ここには 無い） */
export const WAFU_GRIDS = {
  shu_ita: TILE_SHU_ITA,
  ishidatami: TILE_ISHIDATAMI,
  koke_ishi: TILE_KOKE_ISHI,
  chouchin: TILE_CHOUCHIN,
} as const satisfies Record<string, GridTile>;
