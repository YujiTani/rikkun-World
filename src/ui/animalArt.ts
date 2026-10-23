import type { Rgba } from '../world/blocks/textures';
import { drawPixels } from './itemIcon';

/**
 * LIVE-1: 合図チップ・メダルに 使う 小さな 絵（16x16）。アイテムでは ない のでここに 置く。
 * にわとり = 白い おもち（赤い とさか・だいだい の くちばし）。`chickenRibbon` は 首 に 藍 の リボン（なかま の しるし）
 */
export type AnimalIcon = 'chicken' | 'chickenRibbon' | 'sun'
  // LIVE-2（§3.1）: 合図 の 絵。ひよこ・Z（ねてる）・すなどけい（まってね）・手（だっこ）
  | 'chick' | 'zzz' | 'hourglass' | 'hand';

const CHICKEN_ROWS = [
  '................',
  '........R.R.....',
  '........RRR.....',
  '.......KWWWK....',
  '......KWWKWWKOO.',
  '......KWWWWWKOK.',
  '.......KWWWK....',
  '......KWWBBWK...',
  '.....KWWWWWWWK..',
  'K...KWWWWWWWWWK.',
  'KK.KWWWWWWWWWWK.',
  '.KKKWWWWWWWWWWK.',
  '..KKWWWWWWWWWK..',
  '...KKWWWWWWWK...',
  '.....KK.OK.OK...',
  '................',
];

const COLORS: Record<string, number> = {
  W: 0xf5f1e6,
  K: 0x3a3330,
  R: 0xd8473f,
  O: 0xf0902a,
  B: 0x2f3f8f,
  Y: 0xffd54f,
  Z: 0x5a6fd8, // Z の 青
  S: 0xe9b94e, // すな
  H: 0xf2c9a0, // 手
  G: 0xcfe8f0, // ガラス
};

/** LIVE-2: ひよこ（きいろ の まるい 子） */
const CHICK_ROWS = [
  '................',
  '................',
  '......KKKK......',
  '.....KYYYYK.....',
  '....KYYYYYYK....',
  '....KYKYYKYK....',
  '....KYYYOYYYK...',
  '....KYYYYYYYK...',
  '...KYYYYYYYYYK..',
  '...KYYYYYYYYYK..',
  '...KYYYYYYYYYK..',
  '....KYYYYYYYK...',
  '.....KKYYYKK....',
  '......O..O......',
  '................',
  '................',
];

/** LIVE-2: ねてる しるし の Z（大きい Z と 小さい Z） */
const ZZZ_ROWS = [
  '................',
  '...ZZZZZZZ......',
  '...ZZZZZZZ......',
  '........ZZ......',
  '......ZZ........',
  '....ZZ..........',
  '...ZZZZZZZ......',
  '...ZZZZZZZ......',
  '..........ZZZZ..',
  '..........ZZZZ..',
  '............ZZ..',
  '..........ZZ....',
  '..........ZZZZ..',
  '..........ZZZZ..',
  '................',
  '................',
];

/** LIVE-2: すなどけい（あたため ちゅう。まってね） */
const HOURGLASS_ROWS = [
  '................',
  '...KKKKKKKKKK...',
  '...KGGGGGGGGK...',
  '....KGSSSSGK....',
  '.....KGSSGK.....',
  '......KSSK......',
  '.......KK.......',
  '......KSSK......',
  '.....KGGGGK.....',
  '....KGGSSGGK....',
  '...KGSSSSSSGK...',
  '...KSSSSSSSSK...',
  '...KKKKKKKKKK...',
  '................',
  '................',
  '................',
];

/** LIVE-2: 手（だっこ。ひらいた てのひら） */
const HAND_ROWS = [
  '................',
  '.......KK.......',
  '.....KKHHKK.....',
  '....KHHHHHHK....',
  '....KHKHHKHK.KK.',
  '....KHKHHKHKKHK.',
  '..KKKHKHHKHKHHK.',
  '.KHHKHHHHHHHHHK.',
  '.KHHHHHHHHHHHK..',
  '..KHHHHHHHHHHK..',
  '...KHHHHHHHHK...',
  '....KHHHHHHK....',
  '.....KHHHHK.....',
  '......KKKK......',
  '................',
  '................',
];

function fromRows(rows: readonly string[], map: (ch: string) => string): Rgba[] {
  const out: Rgba[] = [];
  for (const row of rows) {
    for (const raw of row) {
      const ch = map(raw);
      const c = COLORS[ch];
      out.push(c === undefined ? [0, 0, 0, 0] : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
}

function sunRows(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.hypot(dx, dy);
      const ray = (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.8) && d > 5.2 && d < 7.6;
      r += d <= 4.4 || ray ? 'Y' : '.';
    }
    rows.push(r);
  }
  return rows;
}

export function animalIconPixels(kind: AnimalIcon): Rgba[] {
  if (kind === 'sun') return fromRows(sunRows(), (c) => c);
  if (kind === 'chick') return fromRows(CHICK_ROWS, (c) => c);
  if (kind === 'zzz') return fromRows(ZZZ_ROWS, (c) => c);
  if (kind === 'hourglass') return fromRows(HOURGLASS_ROWS, (c) => c);
  if (kind === 'hand') return fromRows(HAND_ROWS, (c) => c);
  return fromRows(CHICKEN_ROWS, (c) => (c === 'B' && kind === 'chicken' ? 'W' : c));
}

const cache = new Map<AnimalIcon, string>();
/** data URL（使いまわす） */
export function animalIconUrl(kind: AnimalIcon): string {
  let url = cache.get(kind);
  if (!url) {
    const c = document.createElement('canvas');
    drawPixels(c, animalIconPixels(kind));
    url = c.toDataURL();
    cache.set(kind, url);
  }
  return url;
}
