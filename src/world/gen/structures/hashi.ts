import type { StructureShape } from './types';

/**
 * あかい はし（長さ 13・はば 5〔あるける 所は 3 + 両わきの らんかん〕・高さ 5）。朱色の ゆか。まん中の 7 マスが 1 段 高い そり橋（両はしは 1 段 ひくい）。
 * らんかんは 1 マスおきの はしら ＋ 上の 横木。はしらの てっぺん（両はし・段の かわり目）に しろい ぎぼし。
 * 長い 向きは 図の 左右（東西）。足もとの 地面を ゆかの 下で うける はしらは 段の かわり目だけ。
 */

const LEN = 13;
const DEPTH = 5;
/** 高い 段の はんい（x。両はし ふくむ）。ほかは ひくい 段 */
const HIGH_FROM = 3;
const HIGH_TO = 9;

const lowAt = (x: number): boolean => x < HIGH_FROM || x > HIGH_TO;
/** ゆかの 高さ（段の 番号。ひくい = 0、高い = 1） */
const deckY = (x: number): number => (lowAt(x) ? 0 : 1);
/** 段の かわり目（ぎぼしを のせる はしら）か、両はしか */
const edgePost = (x: number): boolean => x === 0 || x === LEN - 1 || x === HIGH_FROM || x === HIGH_TO;

/** 段 y の 図を つくる（行 = z 0〜4、列 = x 0〜12）。手で 書くと 長い ので 式で ならべる（形の データの 一部） */
function layer(y: number): string[] {
  const rows: string[] = [];
  for (let z = 0; z < DEPTH; z++) {
    const side = z === 0 || z === DEPTH - 1;
    let r = '';
    for (let x = 0; x < LEN; x++) {
      const d = deckY(x);
      if (y === 0) {
        // ゆか（ひくい 所）と、高い 所を ささえる 外がわの はしら（段の かわり目）
        r += d === 0 ? 'S' : side && (x === HIGH_FROM || x === HIGH_TO) ? 'S' : '.';
      } else if (y === d) {
        r += 'S'; // 高い 所の ゆか
      } else if (y === d + 1) {
        r += side ? (x % 2 === 0 ? 'S' : '.') : '.'; // らんかんの はしら（1 マスおき）
      } else if (y === d + 2) {
        r += side ? 'S' : '.'; // らんかんの 横木
      } else if (y === d + 3) {
        r += side && edgePost(x) ? 'W' : '.'; // ぎぼし
      } else {
        r += '.';
      }
    }
    rows.push(r);
  }
  return rows;
}

export const HASHI: StructureShape = {
  id: 'hashi',
  layers: [0, 1, 2, 3, 4].map(layer),
  legend: {
    S: 'shu_ita',
    W: 'shikkui',
  },
  anchor: { x: 6, z: 2 },
  base: { id: 'ishidatami', maxFill: 3 },
  maxSlope: 2,
};
