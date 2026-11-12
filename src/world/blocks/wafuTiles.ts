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

// WAFU-1 追加 3: 石の ブロック（あらいし・こけの あらいし・ひびの いし。今の こけいしより あらく・暗い）
const TILE_ARA_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#80808C', b: '#9A9AA6', c: '#666672', h: '#B4B4BE'},
  rows: [
    'aaadcccdhbbbbdaa',
    'addddcdhbbbbbdaa',
    'dhhhddhbbbbbbdad',
    'hbbbbdbbbbbbbddb',
    'bbbbdddddbbddcdd',
    'dbddhdchdddhhccd',
    'ddhadhcccddccccc',
    'dhaadcccccdccccc',
    'daaadcccccddcccc',
    'daaadccccdbddccc',
    'dddddddddbbbdddd',
    'ahadhhhddbbbbdad',
    'aaadccccdbbbdhad',
    'ddddccccdbdddaad',
    'aahdccccddhhdaaa',
    'aaadccccdhbbddaa',
  ],
};

const TILE_KOKE_ARA_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#80808C', b: '#9A9AA6', c: '#666672', h: '#B4B4BE', G: '#5A9A3C', g: '#78B84A', n: '#3A7230'},
  rows: [
    'GnGdcGcdGGggGdaa',
    'addddcdGngGgndaG',
    'dggGddgGgggngdad',
    'nGGgGdgnGngnGddn',
    'GGGGdddddGnddgdd',
    'dgddhdnGdddggGnd',
    'ddhhdGggGddgggGG',
    'daaadGGnGGdggnnG',
    'dGaadGGGnGddGngG',
    'dnaadGnngdhddnGG',
    'dddddddddbbbdddd',
    'ngGdhccddbbbbdad',
    'gngdccccdbbgdhad',
    'ddddccccdbdddaad',
    'hhhdccccddngdaaa',
    'aaadccccdgGGddaa',
  ],
};

const TILE_KIZAMI_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#80808C', b: '#9A9AA6', c: '#666672', h: '#B4B4BE'},
  rows: [
    'ahhahhhhahhhhhac',
    'hddddddddddddddc',
    'hbhhhhhhhhhhhhdh',
    'hbbbbbcbcbbbbbdh',
    'hdddddddddddbbdh',
    'hdhhhhhhhhhdhbdh',
    'hdhbbbbbbbbdhbdh',
    'hdhbdddddbbdhbdh',
    'hdhbdhhhhhbdhbdh',
    'hdhbdhbbbbbdhbdh',
    'hdhbdhbbbbbdhbdh',
    'hdhbddddddddhcdh',
    'hdhbbhhhhhhhhcdh',
    'hdhbbbbbccbbbbdh',
    'hddddddddddddddh',
    'cchhhhhhhhhhhhhh',
  ],
};

const TILE_MARU_MON_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#80808C', b: '#9A9AA6', c: '#666672', h: '#B4B4BE'},
  rows: [
    'hhhhhccccccchhhc',
    'hcbccbbddbbccbac',
    'hbccbbbddbbbccbc',
    'hccdddbddadddccc',
    'hcbdhdbddbdhdbcc',
    'cbbddhdhhdhddbbc',
    'cbbbbdhddhdbccbc',
    'cddddhddddhddddc',
    'cddddhddddhddddc',
    'cbbbadhddhdbbbbc',
    'cbbddhdhhdhddbcc',
    'hcbdhdbddbdhdbcc',
    'cccdddbddbdddccc',
    'hbccbbbddbcbccbc',
    'cbbccbbddbbccbbc',
    'cccccccccccccacc',
  ],
};

const TILE_RENGA_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#A0A0AC', b: '#AEAEBA', c: '#74747F', h: '#C8C8D2'},
  rows: [
    'hhhhhhhchhhhhhhc',
    'bbbbbbacbbbbbbbc',
    'bbabbbbcbbbbbabc',
    'cccccccccccccccc',
    'hhhchhhhhhhchhhh',
    'bbbcbbbbbbbcbbbb',
    'bbbcbbbabbbcbbbb',
    'cccccccccccccccc',
    'hhhhhhhchhhhhhhc',
    'bababbacbbbaabbc',
    'bbbbbbbcbbbbbabc',
    'cccccccccccccccc',
    'hhhchhhhhhhchhhh',
    'bbbcbbbbbbbcbbbb',
    'babcbbbbbbbcabab',
    'cccccccccccccccc',
  ],
};

const TILE_KOKE_RENGA_ISHI: GridTile = {
  pal: {d: '#34343E', a: '#A0A0AC', b: '#AEAEBA', c: '#74747F', h: '#C8C8D2', G: '#5A9A3C', g: '#78B84A', n: '#3A7230'},
  rows: [
    'hghhGhGchhhhhhhc',
    'bbGbbGacbbbbnbbc',
    'bbabbbbcbbbbbabc',
    'cccccccccccccccc',
    'hhhcGhhhhhhchhhh',
    'bbbcbgbbbbbcbbbb',
    'bbbcbbbabbbcbnbG',
    'cccccccccccccccc',
    'hghnGnnnGGhhnGhn',
    'gaGaGgncbngnabgn',
    'bbbbbgbcbGbbgagc',
    'cncnnncccnccnncc',
    'ghhcgggGhhGchGGn',
    'bnncbbgngbbcgbbG',
    'GaGcbbbbbGncabaG',
    'ccncnnnnnncccccc',
  ],
};

/** わふうの 10 ブロックの 絵（かわら・しっくいは 今ある 絵を 使うので ここには 無い。さいごの 2 つは あらい 石） */
export const WAFU_GRIDS = {
  shu_ita: TILE_SHU_ITA,
  ishidatami: TILE_ISHIDATAMI,
  koke_ishi: TILE_KOKE_ISHI,
  chouchin: TILE_CHOUCHIN,
  ara_ishi: TILE_ARA_ISHI,
  koke_ara_ishi: TILE_KOKE_ARA_ISHI,
  kizami_ishi: TILE_KIZAMI_ISHI,
  maru_mon_ishi: TILE_MARU_MON_ISHI,
  renga_ishi: TILE_RENGA_ISHI,
  koke_renga_ishi: TILE_KOKE_RENGA_ISHI,
} as const satisfies Record<string, GridTile>;
