/**
 * MINE-1C（#350）の 16×16 の 絵。元の 絵は art/MINE-1/kodo_waku/kodo_waku_rows.txt（坑道の わく。横の 面・上下の 面）と
 * art/MINE-1/chest_hint/chest_hint_rows.txt（ヒント「あける」の 絵）。宝箱の ブロックの 平らな 絵（遠くの 箱の 段・かけら用）は 段ごとの 色から 作る。
 * 乱数なし。
 */
import { CHEST_FLAT_LOCK, CHEST_PAL, KODO_WAKU_COLORS as W, type ChestArtTier } from './chestArt';

/** ヒント「あける」の 絵は 1 段目の 色 */
const C1 = CHEST_PAL[1];

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
    pal: { A: W.wood, B: W.dark, C: W.iron, D: W.mid, E: W.rivet, F: W.edge, G: W.light, H: W.black },
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
    pal: { A: W.wood, B: W.mid, C: W.dark, D: W.light, E: W.edge },
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
    pal: { A: C1.L!, B: C1.W!, C: C1.S!, D: C1.I!, E: C1.P!, F: C1.K! },
  },
} as const satisfies Record<string, RowArt>;

// アトラスは 4 まいで 1 だん（マグマの 4 コマが 1 だんに ぴったり ならぶ ため）。kodo_pad は 8 まいに そろえる ための 1 まい（わくの 上の 絵と 同じ。どこにも つかわない）
export const KODO_TILE_NAMES = ['kodo_waku_side', 'kodo_waku_top', 'chest_1', 'chest_2', 'chest_3', 'chest_4', 'chest_hint', 'kodo_pad'] as const;
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
  const pal = CHEST_PAL[tier as ChestArtTier];
  const [body, band, lock] = [pal.W!, pal.S!, pal[CHEST_FLAT_LOCK[tier as ChestArtTier]]!];
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

const PAINT: Readonly<Record<KodoTileName, () => Rgba[]>> = {
  kodo_waku_side: () => paintRows(ART.kodo_waku_side),
  kodo_waku_top: () => paintRows(ART.kodo_waku_top),
  chest_1: () => paintChest(1),
  chest_2: () => paintChest(2),
  chest_3: () => paintChest(3),
  chest_4: () => paintChest(4),
  chest_hint: () => paintRows(ART.chest_hint),
  kodo_pad: () => paintRows(ART.kodo_waku_top), // 8 まいに そろえる ための 1 まい
};

export function paintKodoTile(name: KodoTileName): Rgba[] {
  return PAINT[name]();
}
