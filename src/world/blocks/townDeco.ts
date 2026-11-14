/**
 * TOWN-1 1B-2 試作: 街の 建物・ふんすいの かざり ブロック（箱の 組み合わせで 描く 小物）。何も import しない 葉（型だけ）。
 * 見本 `town/art/v5/proto/yorozuya.py`・`plaza.py` の 箱を、1 ブロック ＝ 16 点（1 点 ＝ 1/16 ブロック）の 箱に 直した 物。
 * 当たりは 1 ブロック。光は 通す。街の 中だけ（こわせない・アイテムに ならない）。数は 下の 表 1 か所。
 * 向きの ある 物（水の まく・ベンチ）は 4 向き（_n _e _s _w）／2 向き（_x _z）を 別ブロックに して あり、置く とき 街の 向きに あわせて えらぶ（townBuildings.ts）。
 */

import { GATE_ITEMS, type GateItemKey } from './townDecoGate';
import { SIGN_ITEMS, SIGN_TILES, STALL_ITEMS, STALL_TILES, slab } from './townDecoStall';

/** 箱 1 つ: [x0, y0, z0, x1, y1, z1, 横の 絵, 上の 絵（なければ 横と 同じ）]。点（0〜16） */
export type DecoBox = readonly [number, number, number, number, number, number, string, string?];

/** 絵の 色（名前 → 色）。1 色の 小さな 絵（town_c_<名前>）に なる */
export const DECO_COLORS = {
  aka: '#D8402E',
  ao: '#3D5A9E',
  ki: '#F6D04D',
  midori: '#5FB045',
  cha: '#B8603A',
  murasaki: '#8A4A6A',
  kuro: '#2A1E18',
  kinari: '#F1E6CC',
  hada: '#F6DCC0',
  shiro: '#F4F2EE',
  daidai: '#E87A2A',
  momo: '#F2A0B8',
  kin: '#E8BE5A',
  kigi: '#B8925A',
  ha: '#4CA332',
  koge: '#6A4A2C',
  asagi: '#5A8A96',
  tetsu: '#4A4E58',
  hagane: '#9AA4B0',
  ginpaku: '#D0D8E0',
  maki: '#C89A62',
  makiend: '#E8C890',
  fukamidori: '#2E6B4A',
  wara: '#D8B860',
  /** あかく やけた 鉄 */
  akanetsu: '#FF4A2A',
} as const;
export type DecoColor = keyof typeof DECO_COLORS;

/** 色の 絵の 名前 */
export const colorTile = (c: DecoColor): string => `town_c_${c}`;

/** かざり ブロックの ほか の 絵（名前・模様の 名前・地の 色・足す 色）。模様は townTextures.ts */
const BASE_EXTRA_TILES = [
  { id: 'town_mizu', pat: 'mottle', base: '#4FB0E8', acc: ['#6CC4F4', '#3C98D8', '#8ED4F8'] },
  { id: 'town_taki', pat: 'mottle', base: '#A8DCF4', acc: ['#C8ECFC', '#8CCCEC'] },
  { id: 'town_moji_yo', pat: 'glyph', base: '#2A1E18', acc: ['#E8BE5A', 'yo'] },
  { id: 'town_moji_ro', pat: 'glyph', base: '#2A1E18', acc: ['#E8BE5A', 'ro'] },
  { id: 'town_moji_zu', pat: 'glyph', base: '#2A1E18', acc: ['#E8BE5A', 'zu'] },
  { id: 'town_moji_ya', pat: 'glyph', base: '#2A1E18', acc: ['#E8BE5A', 'ya'] },
  { id: 'town_hi_tile', pat: 'fire', base: '#E03A18', acc: ['#FF9A30', '#FF6020', '#A82410'] },
  { id: 'town_noboru_tile', pat: 'banner', base: '#E8761E', acc: ['#2A2A30', '#F4F2EE'] },
  // かじや の かんばん（くろい 地に オレンジの 字）・だいく の かんばん（なまなりの 地に 青い 字）
  { id: 'town_moji_ka', pat: 'glyph', base: '#2A2A30', acc: ['#FFB060', 'ka', '#C86A2A'] },
  { id: 'town_moji_ji', pat: 'glyph', base: '#2A2A30', acc: ['#FFB060', 'ji', '#C86A2A'] },
  { id: 'town_moji_yak', pat: 'glyph', base: '#2A2A30', acc: ['#FFB060', 'ya', '#C86A2A'] },
  { id: 'town_moji_da', pat: 'glyph', base: '#E8D8B0', acc: ['#2F4780', 'da', '#6A4A2C'] },
  { id: 'town_moji_i', pat: 'glyph', base: '#E8D8B0', acc: ['#2F4780', 'i', '#6A4A2C'] },
  { id: 'town_moji_ku', pat: 'glyph', base: '#E8D8B0', acc: ['#2F4780', 'ku', '#6A4A2C'] },
  // だいくの 屋根の 板（色が 3 しゅるい）
  { id: 'town_itabuki_b', pat: 'plankH', base: '#A87850', acc: ['#8A5C3A', '#C29468'] },
  { id: 'town_itabuki_c', pat: 'plankH', base: '#6E4A30', acc: ['#553822', '#8A5C3A'] },
  // だいくの 明るい 屋根の 板（ひのきの うすい 色。3 しゅるい）
  { id: 'town_itaw', pat: 'plankH', base: '#DDBB82', acc: ['#C29E66', '#EBD0A0'] },
  { id: 'town_itaw_b', pat: 'plankH', base: '#CCA870', acc: ['#B38D58', '#DDBF8A'] },
  { id: 'town_itaw_c', pat: 'plankH', base: '#E6CA98', acc: ['#CDAE78', '#F2DDB4'] },
  // どうじょうの かんばん（深い 緑の 地に 白い 字）と かんばんの はしの ふた（かんばんの よこ顔に 字が 出ない ように）
  { id: 'town_moji_do', pat: 'glyph', base: '#2E6B4A', acc: ['#F4F2EE', 'do', '#CFE8D8'] },
  { id: 'town_moji_u', pat: 'glyph', base: '#2E6B4A', acc: ['#F4F2EE', 'u', '#CFE8D8'] },
  { id: 'town_moji_jig', pat: 'glyph', base: '#2E6B4A', acc: ['#F4F2EE', 'ji', '#CFE8D8'] },
  { id: 'town_moji_xyo', pat: 'glyph', base: '#2E6B4A', acc: ['#F4F2EE', 'xyo', '#CFE8D8'] },
  { id: 'town_moji_end_k', pat: 'glyph', base: '#2A2A30', acc: ['#FFB060', '', '#C86A2A'] },
  { id: 'town_moji_end_d', pat: 'glyph', base: '#E8D8B0', acc: ['#2F4780', '', '#6A4A2C'] },
  { id: 'town_moji_end_g', pat: 'glyph', base: '#2E6B4A', acc: ['#F4F2EE', '', '#CFE8D8'] },
  { id: 'town_noboru_g_tile', pat: 'banner', base: '#2E6B4A', acc: ['#F4F2EE', '#F4F2EE'] },
  { id: 'town_moji_end', pat: 'glyph', base: '#2A1E18', acc: ['#E8BE5A', ''] },
  // 門の のきの たるき（こげ茶の 地に 白い 木口が 4 点ごとに 並ぶ）
  { id: 'town_taruki', pat: 'taruki', base: '#4A2E1C', acc: ['#EDE3C8'] },
] as const;
/** かざり ブロックの ほか の 絵（本体 ＋ 屋台・門） */
export const DECO_EXTRA_TILES = [...BASE_EXTRA_TILES, ...SIGN_TILES, ...STALL_TILES] as const;

const c = colorTile;

/** 小さな 品（点 ＝ 1/16 ブロック）。1 マスに 2〜4 こ ならべて「寄せ集め」に する */
const mini = (x: number, z: number, w: number, h: number, col: DecoColor): DecoBox[] => [
  [x, 0, z, x + w, h, z + w, c(col)],
  [x + w * 0.25, h, z + w * 0.25, x + w * 0.75, h + 2, z + w * 0.75, c(col)],
];
const kok = (x: number, z: number, col: DecoColor): DecoBox[] => [
  [x, 0, z, x + 3, 4, z + 3, c(col)],
  [x - 0.5, 4, z - 0.5, x + 3.5, 7, z + 3.5, c('hada')],
  [x - 0.5, 6.5, z - 0.5, x + 3.5, 8, z + 3.5, c('kuro')],
];
const dar = (x: number, z: number): DecoBox[] => [
  [x, 0, z, x + 6, 6, z + 5, c('aka')],
  [x + 1.5, 2, z + 5, x + 4.5, 4.5, z + 5.4, c('hada')],
  [x + 1.5, 2, z - 0.4, x + 4.5, 4.5, z, c('hada')],
  [x + 6, 2, z + 1, x + 6.4, 4.5, z + 4, c('hada')],
  [x - 0.4, 2, z + 1, x, 4.5, z + 4, c('hada')],
];
const scroll = (x: number, z: number, w: number, l: number): DecoBox[] => [
  [x, 0, z, x + w, 2.5, z + l, c('kinari')],
  [x, 0, z, x + w, 2.5, z + 1, c('aka')],
  [x, 0, z + l - 1, x + w, 2.5, z + l, c('aka')],
];
const umb = (x: number, z: number, h: number, col: DecoColor): DecoBox[] => [[x, 0, z, x + 2, h, z + 2, c(col)], [x, h, z, x + 2, h + 1, z + 2, c('koge')]];
const potBig: DecoBox[] = [[2, 0, 2, 14, 11, 14, c('asagi')], [4, 11, 4, 12, 14, 12, c('asagi')], [3, 14, 3, 13, 16, 13, c('asagi')]];
/** 寄せ集め（1 マスに 小さな 品 2〜4 こ。高さ・形・色が ばらばら） */
const MIX = {
  tsubo_a: [...mini(1, 1, 6, 6, 'ao'), ...mini(9, 2, 5, 9, 'aka'), ...mini(5, 9, 4, 4, 'ki')],
  tsubo_b: [...mini(2, 2, 5, 4, 'midori'), ...mini(9, 1, 6, 7, 'cha'), ...mini(8, 10, 4, 5, 'murasaki')],
  ningyo_a: [...kok(2, 2, 'aka'), ...dar(8, 8), ...kok(10, 2, 'ao')],
  ningyo_b: [...kok(1, 9, 'ao'), ...kok(6, 2, 'aka'), ...dar(9, 9), ...kok(11, 3, 'midori')],
  hon_maki: [[1, 0, 1, 9, 2, 7, c('ao')], [1.5, 2, 1, 9.5, 4, 7, c('murasaki')], [1, 4, 1.5, 8, 5.5, 7, c('midori')], ...scroll(10, 2, 4, 11), ...scroll(3, 10, 6, 4)] as DecoBox[],
  kago: [[1, 0, 1, 9, 4, 9, c('kigi')], [2, 4, 2, 5, 6, 5, c('daidai')], [5, 4, 4, 8, 6, 7, c('aka')], ...mini(10, 9, 5, 5, 'cha')] as DecoBox[],
  kasa: [...umb(3, 3, 12, 'aka'), ...umb(8, 5, 9, 'ao'), ...umb(12, 2, 13, 'ki'), ...mini(4, 10, 5, 3, 'murasaki')],
} as const satisfies Record<string, readonly DecoBox[]>;
const takara: DecoBox[] = [[2, 0, 4, 14, 7, 12, c('aka')], [1, 7, 3, 15, 10, 13, c('kin')], [1, 3, 3, 15, 4, 13, c('kin')], [7, 3, 12, 9, 8, 13.2, c('ao')]];

/** 小物の 表（名前 → 名前・箱）。たなに のせる 物は SHELF_KEYS に も 書く */
const ITEMS = {
  tsubo_a: { name: 'つぼの よせあつめ A', boxes: MIX.tsubo_a },
  tsubo_b: { name: 'つぼの よせあつめ B', boxes: MIX.tsubo_b },
  ningyo_a: { name: 'にんぎょうの よせあつめ A', boxes: MIX.ningyo_a },
  ningyo_b: { name: 'にんぎょうの よせあつめ B', boxes: MIX.ningyo_b },
  hon_maki: { name: 'ほんと まきもの', boxes: MIX.hon_maki },
  kago: { name: 'かごと つぼ', boxes: MIX.kago },
  kasa: { name: 'かさの たば', boxes: MIX.kasa },
  pot_big: { name: 'おおつぼ', boxes: potBig },
  takara: { name: 'やねの おおばこ', boxes: takara },
  // 屋根・ひさしの 板（1/3 ブロックの うすさ。下・まん中・上）
  kawara_kuro_lo: { name: 'くろかわら（ひくい）', boxes: slab(0, 'town_kurokawara') },
  kawara_kuro_mid: { name: 'くろかわら（まん中）', boxes: slab(1, 'town_kurokawara') },
  kawara_kuro_hi: { name: 'くろかわら（たかい）', boxes: slab(2, 'town_kurokawara') },
  kawara_ao_lo: { name: 'あおかわら（ひくい）', boxes: slab(0, 'town_aokawara') },
  kawara_ao_mid: { name: 'あおかわら（まん中）', boxes: slab(1, 'town_aokawara') },
  kawara_ao_hi: { name: 'あおかわら（たかい）', boxes: slab(2, 'town_aokawara') },
  shima_lo: { name: 'しまひさし（ひくい）', boxes: slab(0, 'town_shimahisashi_shu') },
  shima_mid: { name: 'しまひさし（まん中）', boxes: slab(1, 'town_shimahisashi_shu') },
  shima_hi: { name: 'しまひさし（たかい）', boxes: slab(2, 'town_shimahisashi_shu') },
  // 屋根の 下の すきまを ふさぐ（かべの うえに のる かわら。しっくいが 下 3 分の 1・3 分の 2）
  kawara_fill_mid: { name: 'かわら（かべの うえ・まん中）', boxes: [[0, 0, 0, 16, 5.33, 16, 'town_kurokawara'], ...slab(1, 'town_kurokawara')] },
  kawara_fill_hi: { name: 'かわら（かべの うえ・たかい）', boxes: [[0, 0, 0, 16, 10.67, 16, 'town_kurokawara'], ...slab(2, 'town_kurokawara')] },
  // かじやの 小物（黒鉄と 火）
  hi: { name: 'ろの ひ', glow: 'light', boxes: [[0, 0, 0, 16, 16, 16, 'town_hi_tile']] },
  hi_k: { name: 'ろの ひ（わき）', boxes: [[0, 0, 0, 16, 16, 16, 'town_hi_tile']] },
  entotsu_kuchi: {
    name: 'えんとつの くち',
    boxes: [[0, 0, 0, 16, 3, 16, 'town_hashira'], [0, 3, 0, 16, 5, 2, 'town_hashira'], [0, 3, 14, 16, 5, 16, 'town_hashira'], [0, 3, 2, 2, 5, 14, 'town_hashira'], [14, 3, 2, 16, 5, 14, 'town_hashira'], [2, 3, 2, 14, 4, 14, c('kuro')]],
  },
  fuigo: { name: 'ふいご', boxes: [[2, 0, 3, 14, 6, 13, c('koge')], [3, 6, 4, 13, 10, 12, c('cha')], [3, 10, 4, 13, 12, 12, c('koge')], [6, 12, 6, 10, 15, 10, c('tetsu')]] },
  kanatoko: { name: 'かなとこ', boxes: [[4, 0, 4, 12, 5, 12, c('kuro')], [5, 5, 5, 11, 8, 11, c('tetsu')], [1, 8, 3, 15, 12, 13, c('hagane')], [3, 12, 5, 13, 12.6, 11, c('ginpaku')]] },
  mizuoke: { name: 'みずおけ', boxes: [[0, 0, 0, 16, 10, 16, 'town_koishizumi', 'town_mizu']] },
  buki_kabe: {
    name: 'かべの 刀と おの',
    boxes: [
      [0, 0, 0, 16, 16, 16, 'town_koitabari'],
      [16, 3, 6, 16.6, 14, 10, c('hagane')], [16, 2, 5, 16.6, 4, 11, c('koge')],
      [-0.6, 8, 3, 0, 13, 13, c('hagane')], [-0.6, 3, 7, 0, 13, 9, c('koge')],
      [3, 7, 16, 13, 10, 16.6, c('tetsu')], [7, 2, 16, 9, 10, 16.6, c('koge')],
      [6, 3, -0.6, 10, 14, 0, c('ginpaku')], [5, 2, -0.6, 11, 4, 0, c('koge')],
    ],
  },
  tetsu_hisashi: { name: 'てつの ひさし', boxes: [[0, 4, 0, 16, 9, 17, c('kuro')], [0, 9, 2, 16, 11, 17, c('tetsu')], [0, 0, 6, 16, 4, 16, c('tetsu')]] },
  kanatoko_aka: { name: 'かなとこ（やけた 鉄）', boxes: [[4, 0, 4, 12, 5, 12, c('kuro')], [5, 5, 5, 11, 8, 11, c('tetsu')], [1, 8, 3, 15, 12, 13, c('hagane')], [3, 12, 5, 13, 13, 11, c('akanetsu')], [11, 12, 6, 15, 13, 9, c('akanetsu')]] },
  noboru: { name: 'のぼり（かなとこ）', boxes: [[4, 0, 4, 12, 16, 12, 'town_noboru_tile']] },
  hako: { name: 'はこ', boxes: [[1, 0, 2, 15, 10, 14, c('cha')], [0.5, 10, 1.5, 15.5, 11.5, 14.5, c('kigi')], [6, 3, 14, 10, 7, 14.4, c('kuro')]] },
  // だいくの 小物（木と 道具）
  dougu_kabe: {
    name: 'かべの 大工どうぐ',
    boxes: [
      [0, 0, 0, 16, 16, 16, 'town_yukaita'],
      [16, 2, 3, 16.6, 4, 13, c('ginpaku')], [16, 3, 12, 16.6, 8, 14, c('koge')],
      [-0.6, 5, 4, 0, 14, 5, c('hagane')], [-0.6, 3, 6, 0, 8, 12, c('cha')],
      [2, 6, 16, 14, 8, 16.6, c('ginpaku')], [2, 4, 16, 5, 8, 16.6, c('koge')],
      [4, 3, -0.6, 12, 5, 0, c('tetsu')], [10, 5, -0.6, 12, 14, 0, c('cha')],
    ],
  },
  tsuta_kabe: {
    name: 'つたの かべ',
    boxes: [
      [0, 0, 0, 16, 16, 16, 'town_koitabari'],
      [16, 1, 2, 16.5, 9, 7, c('ha')], [16, 7, 8, 16.5, 15, 13, c('ha')],
      [-0.5, 4, 8, 0, 13, 14, c('ha')], [-0.5, 0, 2, 0, 6, 6, c('ha')],
      [2, 3, 16, 7, 12, 16.5, c('ha')], [9, 8, 16, 14, 15, 16.5, c('ha')],
      [8, 1, -0.5, 13, 9, 0, c('ha')],
    ],
  },
  ie_mokei: { name: 'いえの もけい', boxes: [[3, 0, 3, 13, 6, 13, 'town_shikkui'], [2, 6, 2, 14, 8, 14, 'town_kurokawara'], [4, 8, 4, 12, 10, 12, 'town_kurokawara'], [6, 10, 6, 10, 12, 10, 'town_munegawara']] },
  maki_yama: {
    name: 'まきの やま',
    boxes: [[1, 0, 1, 8, 5, 8, c('maki'), c('makiend')], [8, 0, 1, 15, 5, 8, c('maki'), c('makiend')], [1, 0, 8, 8, 5, 15, c('maki'), c('makiend')], [8, 0, 8, 15, 5, 15, c('maki'), c('makiend')], [3, 5, 3, 7, 10, 7, c('maki'), c('makiend')], [9, 5, 9, 13, 10, 13, c('maki'), c('makiend')], [4, 10, 9, 8, 13, 13, c('maki'), c('makiend')]],
  },
  maruta_yama: {
    name: 'まるたの やま',
    boxes: [[1, 0, 0, 15, 6, 7, 'log_side', 'log_top'], [1, 0, 9, 15, 6, 16, 'log_side', 'log_top'], [3, 6, 3, 13, 12, 12, 'log_side', 'log_top']],
  },
  warikodai: { name: 'まきわりだい', boxes: [[2, 0, 2, 14, 9, 14, 'log_side', 'log_top'], [7.5, 9, 7.5, 8.5, 16, 8.5, c('koge')], [5, 12, 6.5, 11, 15, 9.5, c('tetsu')]] },
  // いたぶきの うすい 板（だいくの 屋根。下・まん中・上）
  ita_lo: { name: 'いたぶき（ひくい）', boxes: slab(0, 'town_itabuki') },
  ita_mid: { name: 'いたぶき（まん中）', boxes: slab(1, 'town_itabuki') },
  ita_hi: { name: 'いたぶき（たかい）', boxes: slab(2, 'town_itabuki') },
  ita_b_lo: { name: 'いたぶき・うすい（ひくい）', boxes: slab(0, 'town_itabuki_b') },
  ita_b_mid: { name: 'いたぶき・うすい（まん中）', boxes: slab(1, 'town_itabuki_b') },
  ita_b_hi: { name: 'いたぶき・うすい（たかい）', boxes: slab(2, 'town_itabuki_b') },
  ita_c_lo: { name: 'いたぶき・こい（ひくい）', boxes: slab(0, 'town_itabuki_c') },
  ita_c_mid: { name: 'いたぶき・こい（まん中）', boxes: slab(1, 'town_itabuki_c') },
  ita_c_hi: { name: 'いたぶき・こい（たかい）', boxes: slab(2, 'town_itabuki_c') },
  // 板ぶき屋根の かべの うえ（すきまを ふさぐ。下は こい 板）
  itaw_lo: { name: 'しらきぶき（ひくい）', boxes: slab(0, 'town_itaw') },
  itaw_mid: { name: 'しらきぶき（まん中）', boxes: slab(1, 'town_itaw') },
  itaw_hi: { name: 'しらきぶき（たかい）', boxes: slab(2, 'town_itaw') },
  itaw_b_lo: { name: 'しらきぶき B（ひくい）', boxes: slab(0, 'town_itaw_b') },
  itaw_b_mid: { name: 'しらきぶき B（まん中）', boxes: slab(1, 'town_itaw_b') },
  itaw_b_hi: { name: 'しらきぶき B（たかい）', boxes: slab(2, 'town_itaw_b') },
  itaw_c_lo: { name: 'しらきぶき C（ひくい）', boxes: slab(0, 'town_itaw_c') },
  itaw_c_mid: { name: 'しらきぶき C（まん中）', boxes: slab(1, 'town_itaw_c') },
  itaw_c_hi: { name: 'しらきぶき C（たかい）', boxes: slab(2, 'town_itaw_c') },
  itaw_fill_mid: { name: 'しらき（かべの うえ・まん中）', boxes: [[0, 0, 0, 16, 5.33, 16, 'town_itaw_b'], ...slab(1, 'town_itaw')] },
  itaw_fill_hi: { name: 'しらき（かべの うえ・たかい）', boxes: [[0, 0, 0, 16, 10.67, 16, 'town_itaw_b'], ...slab(2, 'town_itaw')] },
  ita_fill_mid: { name: 'いた（かべの うえ・まん中）', boxes: [[0, 0, 0, 16, 5.33, 16, 'town_itabuki_c'], ...slab(1, 'town_itabuki')] },
  ita_fill_hi: { name: 'いた（かべの うえ・たかい）', boxes: [[0, 0, 0, 16, 10.67, 16, 'town_itabuki_c'], ...slab(2, 'town_itabuki')] },
  // 作りかけの 家の ほねぐみ（明るい 木の 細い 柱と はり。すけて 見える）
  waku_hashira: { name: 'ほねぐみの 柱', boxes: [[5, 0, 5, 11, 16, 11, c('maki'), c('makiend')]] },
  waku_hari_x: { name: 'ほねぐみの はり（よこ）', boxes: [[0, 5, 5, 16, 11, 11, c('maki'), c('makiend')]] },
  waku_hari_z: { name: 'ほねぐみの はり（たて）', boxes: [[5, 5, 0, 11, 11, 16, c('maki'), c('makiend')]] },
  // どうじょう・アスレチックの 小物
  kui: { name: 'くい', boxes: [[2, 0, 2, 14, 16, 14, 'log_side', 'log_top']] },
  maruta_dai: { name: 'まるた（わたり）', boxes: [[0, 0, 0, 16, 16, 16, 'log_side', 'log_top']] },
  wara_ningyo: { name: 'わらにんぎょう', boxes: [[6.5, 0, 6.5, 9.5, 16, 9.5, c('koge')], [3, 4, 3, 13, 13, 13, c('wara'), c('makiend')], [5, 13, 5, 11, 16, 11, c('wara')], [3, 8, 3, 13, 9, 13, c('kuro')]] },
  mato: { name: 'まと', boxes: [[3, 0, 3, 13, 5, 13, c('wara')], [2, 5, 2, 14, 15, 14, c('shiro'), c('aka')], [4, 7, 4, 12, 13, 12, c('aka'), c('shiro')], [6, 9, 6, 10, 11, 10, c('kuro'), c('kuro')]] },
  bokuto_kake: {
    name: 'ぼくとうかけ',
    boxes: [
      [0, 0, 0, 16, 16, 16, 'town_koitabari'],
      [3, 3, 16, 5, 13, 16.6, c('maki')], [7, 3, 16, 9, 13, 16.6, c('maki')], [11, 3, 16, 13, 13, 16.6, c('maki')],
      [3, 3, -0.6, 5, 13, 0, c('maki')], [7, 3, -0.6, 9, 13, 0, c('maki')], [11, 3, -0.6, 13, 13, 0, c('maki')],
      [16, 3, 3, 16.6, 13, 5, c('maki')], [16, 3, 7, 16.6, 13, 9, c('maki')], [16, 3, 11, 16.6, 13, 13, c('maki')],
      [-0.6, 3, 3, 0, 13, 5, c('maki')], [-0.6, 3, 7, 0, 13, 9, c('maki')], [-0.6, 3, 11, 0, 13, 13, c('maki')],
    ],
  },
  taiko: { name: 'たいこ', boxes: [[3, 0, 3, 13, 4, 13, c('koge')], [1, 4, 1, 15, 15, 15, c('aka'), c('hada')], [1, 8, 1, 15, 9.5, 15, c('kin')], [7, 15, 3, 8.5, 16, 8, c('maki')]] },
  // ふみ板（横は 朱・上は こい茶の 板）。橋の 上の 1 マス。当たりは 1 マスなので 半段には しない
  taiko_deck: { name: 'たいこ橋の ふみ板', boxes: [[0, 0, 0, 16, 16, 16, 'town_shubashira', 'town_koitabari']] },
  chizu: {
    name: 'ちず',
    boxes: [
      [0, 0, 0, 16, 16, 16, 'town_koitabari'],
      [2, 3, 16, 14, 14, 16.6, c('kinari')], [5, 6, 16.6, 8, 9, 16.8, c('aka')], [9, 8, 16.6, 12, 10, 16.8, c('ao')],
      [2, 3, -0.6, 14, 14, 0, c('kinari')], [-0.6, 3, 2, 0, 14, 14, c('kinari')], [16, 3, 2, 16.6, 14, 14, c('kinari')],
    ],
  },
  hata_ki: { name: 'きいろい こばた', boxes: [[7.5, 0, 7.5, 8.5, 16, 8.5, c('koge')], [8.5, 9, 7, 15, 15, 9, c('ki')]] },
  hata: { name: 'はた', boxes: [[7, 0, 7, 9, 16, 9, c('koge')], [9, 5, 7.5, 16, 16, 8.5, c('fukamidori')], [10, 9, 7.4, 14, 12, 8.6, c('shiro')]] },
  noboru_g: { name: 'のぼり（みどり）', boxes: [[4, 0, 4, 12, 16, 12, 'town_noboru_g_tile']] },
  sign_do: { name: 'かんばん「ど」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_do']] },
  sign_u: { name: 'かんばん「う」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_u']] },
  sign_jig: { name: 'かんばん「じ」（どうじょう）', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_jig']] },
  sign_xyo: { name: 'かんばん「ょ」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_xyo']] },
  sign_end_k: { name: 'かんばんの ふた（かじや）', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_end_k']] },
  sign_end_d: { name: 'かんばんの ふた（だいく）', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_end_d']] },
  sign_end_g: { name: 'かんばんの ふた（どうじょう）', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_end_g']] },
  // かんばんの 字（かじや・だいく）
  sign_ka: { name: 'かんばん「か」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_ka']] },
  sign_ji: { name: 'かんばん「じ」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_ji']] },
  sign_ya_k: { name: 'かんばん「や」（かじや）', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_yak']] },
  sign_da: { name: 'かんばん「だ」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_da']] },
  sign_i: { name: 'かんばん「い」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_i']] },
  sign_ku: { name: 'かんばん「く」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_ku']] },
  // かんばんの 字（「よろずや」。1 ブロックずつ。字の 絵は townTextures.ts の GLYPHS）
  sign_yo: { name: 'かんばん「よ」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_yo']] },
  sign_ro: { name: 'かんばん「ろ」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_ro']] },
  sign_zu: { name: 'かんばん「ず」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_zu']] },
  sign_ya: { name: 'かんばん「や」', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_ya']] },
  sign_end: { name: 'かんばんの はし', boxes: [[0, 0, 0, 16, 16, 16, 'town_moji_end']] },
  // つりさげる あんどん（店の 中・ひさしの 下）
  tsuri_andon: {
    name: 'つりさげる あんどん',
    glow: 'light',
    boxes: [[7.5, 12, 7.5, 8.5, 16, 8.5, c('kuro')], [3, 2, 3, 13, 12, 13, 'town_andon'], [2, 12, 2, 14, 13, 14, c('kuro')]],
  },
  // ふんすい: 池・ふち・段の 水・水の まく・ベンチ・花・あかり・てっぺん
  ike: { name: 'いけ', boxes: [[0, 0, 0, 16, 8, 16, 'town_shiroishi', 'town_mizu']] },
  ike_hasu: { name: 'いけ（はす）', boxes: [[0, 0, 0, 16, 8, 16, 'town_shiroishi', 'town_mizu'], [3, 8, 3, 13, 8.6, 13, c('ha')], [7, 8, 7, 9, 10, 9, c('momo')]] },
  ike_koi: { name: 'いけ（こい）', boxes: [[0, 0, 0, 16, 8, 16, 'town_shiroishi', 'town_mizu'], [3, 7, 6, 13, 8.5, 10, c('daidai')]] },
  fuchi: { name: 'いけの ふち', boxes: [[0, 0, 0, 16, 12, 16, 'town_shiroishi']] },
  tier_top: { name: 'ふんすいの だん', boxes: [[0, 0, 0, 16, 15, 16, 'town_shiroishi', 'town_mizu']] },
  fountain_top: {
    name: 'ふんすいの てっぺん',
    boxes: [[1, 0, 1, 15, 4, 15, 'town_shiroishi'], [5, 4, 5, 11, 12, 11, 'town_shiroishi'], [3, 12, 3, 13, 14, 13, 'town_shiroishi'], [6, 14, 6, 10, 16, 10, 'town_taki']],
  },
  toro_mini: {
    name: 'ふんすいの あかり',
    glow: 'light',
    boxes: [[5, 0, 5, 11, 4, 11, 'town_shiroishi'], [3, 4, 3, 13, 11, 13, 'town_andon'], [2, 11, 2, 14, 13, 14, 'town_shiroishi']],
  },
  hanabatake: {
    name: 'はなの うえこみ',
    boxes: [[1, 0, 1, 15, 6, 15, 'town_shiroishi'], [2, 6, 2, 14, 9, 14, c('ha')], [4, 9, 4, 7, 12, 7, c('aka')], [9, 9, 5, 12, 12, 8, c('aka')], [5, 9, 9, 8, 12, 12, c('aka')], [10, 9, 10, 13, 12, 13, c('aka')]],
  },
  bench_x: {
    name: 'ベンチ（よこ）',
    boxes: [[0, 0, 4, 2, 7, 12, 'town_hashira'], [14, 0, 4, 16, 7, 12, 'town_hashira'], [0, 7, 2, 16, 9, 14, 'town_yukaita']],
  },
  bench_z: {
    name: 'ベンチ（たて）',
    boxes: [[4, 0, 0, 12, 7, 2, 'town_hashira'], [4, 0, 14, 12, 7, 16, 'town_hashira'], [2, 7, 0, 14, 9, 16, 'town_yukaita']],
  },
} as const satisfies Record<string, { name: string; boxes: readonly DecoBox[]; glow?: 'light' }>;
type DecoItemKey = keyof typeof ITEMS;

/** 向きの ある 物: 水の まくの 4 向き（どちらの 辺に はりつくか。n ＝ 北） */
const TAKI_SIDE = {
  n: [4, 0, 0, 12, 16, 2],
  e: [14, 0, 4, 16, 16, 12],
  s: [4, 0, 14, 12, 16, 16],
  w: [0, 0, 4, 2, 16, 12],
} as const;
const IKE_TAKI_SIDE = {
  n: [4, 8, 0, 12, 15, 2],
  e: [14, 8, 4, 16, 15, 12],
  s: [4, 8, 14, 12, 15, 16],
  w: [0, 8, 4, 2, 15, 12],
} as const;
const DECO_DIRS = ['n', 'e', 's', 'w'] as const;
type DecoDir = (typeof DECO_DIRS)[number];
const sideBox = (r: readonly [number, number, number, number, number, number]): DecoBox => [r[0], r[1], r[2], r[3], r[4], r[5], 'town_taki'];

/** たな（下に 板）・むしろ（下に わらの 敷物）に のせる 寄せ集め */
const SHELF_KEYS = ['tsubo_a', 'tsubo_b', 'ningyo_a', 'hon_maki'] as const satisfies readonly DecoItemKey[];
const MAT_KEYS = ['tsubo_b', 'ningyo_b', 'kago', 'kasa'] as const satisfies readonly DecoItemKey[];
type ShelfKey = (typeof SHELF_KEYS)[number];
type MatKey = (typeof MAT_KEYS)[number];
const lift = (boxes: readonly DecoBox[], base: DecoBox, h: number): DecoBox[] => [base, ...boxes.map((b): DecoBox => [b[0], Math.min(16, b[1] + h), b[2], b[3], Math.min(16, b[4] + h), b[5], b[6], b[7]])];
const shelfBoxes = (boxes: readonly DecoBox[]): DecoBox[] => lift(boxes, [0, 0, 0, 16, 2, 16, 'town_hashira'], 2);
const matBoxes = (boxes: readonly DecoBox[]): DecoBox[] => lift(boxes, [0, 0, 0, 16, 1.5, 16, c('kigi')], 1.5);

type TownDecoId = `town_${DecoItemKey}` | `town_${keyof typeof STALL_ITEMS}` | `town_${GateItemKey}` | (typeof SIGN_ITEMS)[number]['id'] | `town_${ShelfKey}_t` | `town_${MatKey}_m` | `town_taki_${DecoDir}` | `town_ike_taki_${DecoDir}`;

export interface DecoDef {
  id: TownDecoId;
  name: string;
  see: true;
  glow: 'light' | null;
  art: { pat: 'solid'; base: string; acc: readonly string[] };
  boxes: readonly DecoBox[];
}

const swatch = (boxes: readonly DecoBox[]): string => {
  const t = boxes[boxes.length > 1 ? 1 : 0]![6];
  const m = /^town_c_(\w+)$/.exec(t);
  return m ? DECO_COLORS[m[1] as DecoColor] : '#C8B898';
};
const mk = (id: TownDecoId, name: string, boxes: readonly DecoBox[], glow: 'light' | null = null): DecoDef => ({ id, name, see: true, glow, art: { pat: 'solid', base: swatch(boxes), acc: [] }, boxes });

/** かざり ブロックの 一覧（BLOCK_TYPES の 並びは この じゅん） */
export const TOWN_DECO_DEFS: readonly DecoDef[] = [
  ...(Object.keys(STALL_ITEMS) as (keyof typeof STALL_ITEMS)[]).map((k) => mk(`town_${k}`, STALL_ITEMS[k].name, STALL_ITEMS[k].boxes)),
  ...SIGN_ITEMS.map((d) => mk(d.id, d.name, d.boxes)),
  ...(Object.keys(GATE_ITEMS) as GateItemKey[]).map((k) => mk(`town_${k}`, GATE_ITEMS[k].name, GATE_ITEMS[k].boxes)),
  ...(Object.keys(ITEMS) as DecoItemKey[]).map((k) => mk(`town_${k}`, ITEMS[k].name, ITEMS[k].boxes, 'glow' in ITEMS[k] ? 'light' : null)),
  ...SHELF_KEYS.map((k) => mk(`town_${k}_t`, `${ITEMS[k].name}（たな）`, shelfBoxes(ITEMS[k].boxes))),
  ...MAT_KEYS.map((k) => mk(`town_${k}_m`, `${ITEMS[k].name}（むしろ）`, matBoxes(ITEMS[k].boxes))),
  ...DECO_DIRS.map((d) => mk(`town_taki_${d}`, `みずの まく ${d}`, [sideBox(TAKI_SIDE[d])])),
  ...DECO_DIRS.map((d) => mk(`town_ike_taki_${d}`, `いけの みずの まく ${d}`, [[0, 0, 0, 16, 8, 16, 'town_shiroishi', 'town_mizu'], sideBox(IKE_TAKI_SIDE[d])])),
];
