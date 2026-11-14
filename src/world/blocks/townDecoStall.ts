/**
 * TOWN-1 1B-2 試作: 屋台（だんごや・ごはんや・買いとりの やたい）と 街の 門の かざり ブロック。何も import しない 葉。
 * かんばんの 字は 1 ブロックずつ（地の 色・字の 色が 組ごとに ちがう）。両はしの「ふた」は 字の ない ブロック（よこから 見ても 字が かさならない）。
 * 字の 絵は townTextures.ts の GLYPHS。点 ＝ 1/16 ブロック。
 */
export type StallBox = readonly [number, number, number, number, number, number, string, string?];

/** かんばんの 組: 地の 色・字の 色・ふちの 色・字の 名前（左から） */
const SIGN_SETS = {
  dango: { bg: '#8A2A22', fg: '#F4F2EE', edge: '#E8BE5A', chars: ['da', 'n', 'go'] },
  gohan: { bg: '#2F4780', fg: '#F4F2EE', edge: '#CFD8F0', chars: ['go', 'ha', 'n'] },
  yatai: { bg: '#E8D060', fg: '#2E6B4A', edge: '#B89A30', chars: ['ya', 'ta', 'i'] },
} as const;
type SignSet = keyof typeof SIGN_SETS;
const SET_KEYS = Object.keys(SIGN_SETS) as SignSet[];
/** 組ごとの 字 ＋ ふた の 名前（ぜんぶ 書き出した 型。string に ゆるめない） */
type SignPart = { [K in SignSet]: `${K}_${(typeof SIGN_SETS)[K]['chars'][number] | 'end'}` }[SignSet];

/** かんばんの 絵（字 ＋ ふた）。id ＝ town_moji_<組>_<字>、ふたは _end */
export const SIGN_TILES: readonly { id: `town_moji_${SignPart}`; pat: 'glyph'; base: string; acc: readonly string[] }[] = SET_KEYS.flatMap((k) => {
  const s = SIGN_SETS[k];
  return [...s.chars, 'end'].map((ch) => ({ id: `town_moji_${k}_${ch}` as `town_moji_${SignPart}`, pat: 'glyph' as const, base: s.bg, acc: [s.fg, ch === 'end' ? '' : ch, s.edge] }));
});
/** かんばんの ブロック（id ＝ town_sign_<組>_<字>） */
export const SIGN_ITEMS: readonly { id: `town_sign_${SignPart}`; name: string; boxes: readonly StallBox[] }[] = SIGN_TILES.map((t) => ({
  id: `town_sign_${t.id.slice('town_moji_'.length)}` as `town_sign_${SignPart}`,
  name: `かんばん（${t.id.slice('town_moji_'.length)}）`,
  boxes: [[0, 0, 0, 16, 16, 16, t.id]],
}));

/** 屋台の 絵（のぼり） */
export const STALL_TILES = [{ id: 'town_noboru_aka_tile', pat: 'banner', base: '#C8402E', acc: ['#F4F2EE', '#F4F2EE'] }] as const;

/** うすい 板の 高さ: 1 ブロックを 3 つに 切った 下・まん中・上（かわら・いたぶき・ひさしの 屋根の 板） */
const SLAB_Y = [
  [0.01, 5.33],
  [5.33, 10.67],
  [10.67, 16],
] as const;
export const slab = (k: 0 | 1 | 2, tile: string): StallBox[] => [[0, SLAB_Y[k][0], 0, 16, SLAB_Y[k][1], 16, tile]];

const c = (n: string): string => `town_c_${n}`;
/** 屋台の 小物（名前 → 名前・箱） */
export const STALL_ITEMS = {
  dango_gushi: {
    name: 'だんごの くし',
    boxes: [
      [1, 0, 5, 15, 1.5, 11, c('kinari')],
      [3, 1.5, 7.5, 4, 12, 8.5, c('koge')], [7.5, 1.5, 7.5, 8.5, 12, 8.5, c('koge')], [12, 1.5, 7.5, 13, 12, 8.5, c('koge')],
      [2, 3, 6.5, 5, 6, 9.5, c('momo')], [2, 6.5, 6.5, 5, 9.5, 9.5, c('shiro')], [2, 10, 6.5, 5, 13, 9.5, c('midori')],
      [6.5, 3, 6.5, 9.5, 6, 9.5, c('shiro')], [6.5, 6.5, 6.5, 9.5, 9.5, 9.5, c('momo')], [6.5, 10, 6.5, 9.5, 13, 9.5, c('shiro')],
      [11, 3, 6.5, 14, 6, 9.5, c('midori')], [11, 6.5, 6.5, 14, 9.5, 9.5, c('shiro')], [11, 10, 6.5, 14, 13, 9.5, c('momo')],
    ],
  },
  ohitsu: {
    name: 'おひつ',
    boxes: [[3, 0, 3, 13, 8, 13, c('kigi')], [2.7, 2.5, 2.7, 13.3, 3.5, 13.3, c('koge')], [2.7, 5.5, 2.7, 13.3, 6.5, 13.3, c('koge')], [4, 8, 4, 12, 10, 12, c('kinari')], [11, 8, 6, 12.2, 14, 7.2, c('maki')], [10, 12.5, 5.6, 14, 14.5, 7.6, c('maki')]],
  },
  nabe_yuge: {
    name: 'ゆげの でる なべ',
    boxes: [[3, 0, 3, 13, 7, 13, c('kuro')], [2, 7, 2, 14, 8, 14, c('tetsu')], [4, 8, 4, 12, 8.5, 12, c('kinari')], [5, 9, 5, 7, 12, 7, c('shiro')], [8, 11, 8, 10.5, 14, 10.5, c('shiro')], [6, 13, 6, 8, 16, 8, c('shiro')]],
  },
  omen: {
    name: 'おめん',
    boxes: [
      [1, 0, 1, 15, 3, 15, c('cha')],
      [2, 3, 5, 7, 9, 11, c('shiro')], [2, 6, 6.5, 7, 7.5, 9.5, c('aka')],
      [9, 3, 5, 14, 9, 11, c('aka')], [9, 6, 6.5, 14, 7.5, 9.5, c('kuro')],
      [5, 9, 4, 11, 15, 12, c('ki')], [5.5, 11, 5, 10.5, 12.5, 11, c('kuro')],
    ],
  },
  furin: {
    name: 'ふうりん',
    boxes: [[7, 14, 7, 9, 16, 9, c('tetsu')], [4, 7, 4, 12, 14, 12, c('asagi')], [3.5, 6, 3.5, 12.5, 7, 12.5, c('ao')], [7.5, 0, 7.5, 8.5, 7, 8.5, c('shiro')], [6, 0, 7, 10, 3, 9, c('ki')]],
  },
  shimaki_lo: { name: 'しまひさし 黄（ひくい）', boxes: slab(0, 'town_shimahisashi_ki') },
  shimaki_mid: { name: 'しまひさし 黄（まん中）', boxes: slab(1, 'town_shimahisashi_ki') },
  shimaki_hi: { name: 'しまひさし 黄（たかい）', boxes: slab(2, 'town_shimahisashi_ki') },
  noboru_aka: { name: 'のぼり（あか）', boxes: [[4, 0, 4, 12, 16, 12, 'town_noboru_aka_tile']] },
} as const satisfies Record<string, { name: string; boxes: readonly StallBox[] }>;
