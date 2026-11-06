

/**
 * MINE-1C（#350）の 16×16 の 絵。元の 絵は art/MINE-1/kodo_waku/kodo_waku_rows.txt（坑道の わく。横の 面・上下の 面）と
 * art/MINE-1/chest_hint/chest_hint_rows.txt（ヒント「あける」の 絵）。宝箱の ブロックの 平らな 絵（遠くの 箱の 段・かけら用）は 段ごとの 色から 作る。
 * 乱数なし。
 */

type Rgba = readonly [number, number, number, number];
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

interface RowArt {
  rows: readonly string[];
  pal: Readonly<Record<string, string>>;
}

const ART = {
  kodo_waku_side: {
    rows: [
    'BBBBBBBBBBBBBBBB',
    'BAADAAAADFAADAAB',
    'BAAAFAAAAAAADAAB',
    'BAADAAAADAAAAAAB',
    'BAADAGAADAAADAAB',
    'BAADAAAADAAGDAAB',
    'BCCCCCCCCCCCCCCB',
    'BEHEEEEEEEEEEHEB',
    'BCCCCCCCCCCCCCCB',
    'BGADAAAADAAADGAB',
    'BAADAAAADAAADAAB',
    'BAGDAAAADAFFDAAB',
    'BAAAAAAAAAAADAAB',
    'BFADAAAADAAAAAAB',
    'BAFDAAAFDAAADAAB',
    'BBBBBBBBBBBBBBBB',
    ],
    pal: { A: '#B58650', B: '#6B4421', C: '#4A4650', D: '#A47544', E: '#5E5A66', F: '#A87A46', G: '#C79A62', H: '#2E2C34' },
  },
  kodo_waku_top: {
    rows: [
    'CCCCCCCCCCCCCCCC',
    'CBBBBBBBBBBBBBBC',
    'CBAAEAAAAAAAAABC',
    'CBAAAAAAAAAAAABC',
    'CBAEBBBBBBBBAABC',
    'CBAABAAAAAABAABC',
    'CBAABAAAAAABADBC',
    'CBAABAABBAABAABC',
    'CBAABAABBAABAABC',
    'CBAABAAAAAABADBC',
    'CBAABAAAAAABAABC',
    'CBDABBBBBBBBAABC',
    'CBAAAAAAAAAAAABC',
    'CBAAAAAAAAAAAABC',
    'CBBBBBBBBBBBBBBC',
    'CCCCCCCCCCCCCCCC',
    ],
    pal: { A: '#B58650', B: '#A47544', C: '#6B4421', D: '#C79A62', E: '#A87A46' },
  },
  chest_hint: {
    rows: [
    '................',
    '................',
    '................',
    '..ACAAAAAAAACA..',
    '.AACAAAAAAAACAA.',
    'AAACAAAAAAAACAAA',
    'AAACAAAEEAAACAAA',
    'AAACAAAEEAAACAAA',
    'DDDCDDDEEDDDCDDD',
    'BBBCBBBFFBBBCBBB',
    'BBBCBBBBBBBBCBBB',
    'BBBCBBBBBBBBCBBB',
    'BBBCBBBBBBBBCBBB',
    '................',
    '................',
    '................',
    ],
    pal: { A: '#A8693A', B: '#9A5E32', C: '#4A4650', D: '#5E3A1E', E: '#5E5A66', F: '#1E1C22' },
  },
} as const satisfies Record<string, RowArt>;

/** 宝箱 4 段階の 平らな 絵の 色（07-mine.md 20.7。からだ・おび・かけがね） */
const CHEST_FLAT: readonly (readonly [string, string, string])[] = [
  ['#9A5E32', '#4A4650', '#5E5A66'],
  ['#74482A', '#C8CCD6', '#8A8F9C'],
  ['#2A2238', '#EBB840', '#C98A1E'],
  ['#EBB840', '#C98A1E', '#C8442C'],
];

export const KODO_TILE_NAMES = ['kodo_waku_side', 'kodo_waku_top', 'chest_1', 'chest_2', 'chest_3', 'chest_4', 'chest_hint', 'kodo_pad'] as const;
// アトラスは 4 まいで 1 だん（マグマの 4 コマが 1 だんに ぴったり ならぶ ため）。8 まいに そろえる ための 1 まい（わくの 上の 絵と 同じ。どこにも つかわない）
export type KodoTileName = (typeof KODO_TILE_NAMES)[number];

const KODO_SET: ReadonlySet<string> = new Set(KODO_TILE_NAMES);
export const isKodoTile = (name: string): name is KodoTileName => KODO_SET.has(name);

function paintRows(a: RowArt): Rgba[] {
  const out: Rgba[] = [];
  for (const row of a.rows) for (const ch of row) out.push(a.pal[ch] === undefined ? CLEAR : hex(a.pal[ch]!));
  return out;
}

/** 宝箱の 平らな 絵: からだ 地 ＋ たての おび 2 本 ＋ まん中の かけがね */
function paintChest(tier: number): Rgba[] {
  const [body, band, lock] = CHEST_FLAT[tier - 1]!;
  const out: Rgba[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || x === 15 || y === 0 || y === 15;
      const isBand = x === 3 || x === 12;
      const isLock = (x === 7 || x === 8) && (y === 7 || y === 8);
      out.push(hex(isLock ? lock : edge || isBand ? band : body));
    }
  }
  return out;
}

export function paintKodoTile(name: KodoTileName): Rgba[] {
  if (name.startsWith('chest_') && name !== 'chest_hint') return paintChest(Number(name.charAt(6)));
  if (name === 'kodo_pad') return paintRows(ART.kodo_waku_top);
  return paintRows(ART[name as keyof typeof ART]);
}
