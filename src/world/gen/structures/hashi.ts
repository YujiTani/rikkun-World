import type { StructureShape } from './types';

/**
 * あかい はし（長さ 13・はば 5〔あるける 所は 3 + 両わきの らんかん 1 ずつ〕・高さ 8）。朱色の ゆか。
 * そり橋: 2 マスずつ 1 段 上がって（はし 0 → 1 → まん中 5 マス = 2）また 下がる（5 段階。はしと まん中の 差は 2）。
 * らんかんは かべに せず、2 マスおきに はしら（高さ 2）、はしらの 上を 横木 1 本で つなぎ、下は すける。
 * 両はしの はしらは 1 マス 高く（高さ 3）、頭に こけいし。段の 下は 外がわの はしらで ささえる。長い 向きは 図の 左右（東西）。
 */

const LEN = 13;
const DEPTH = 5;
/** ゆかの 高さ（x ごと。0 = 地面の すぐ 上）。5 段階: 0・1・2（まん中 5 マス）・1・0 */
const DECK = [0, 0, 1, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0] as const;

const deckAt = (x: number): number => DECK[x]!;
/** 同じ 高さの 続きの はしか（その 下に ささえの はしらを 立てる） */
const stageEdge = (x: number): boolean => deckAt(x) > 0 && (deckAt(x - 1) !== deckAt(x) || deckAt(x + 1) !== deckAt(x));

/** 段 y の 図（行 = z 0〜4、列 = x 0〜12）。手で 書くと 長い ので 式で ならべる（形の データの 一部） */
function layer(y: number): string[] {
  const rows: string[] = [];
  for (let z = 0; z < DEPTH; z++) {
    const side = z === 0 || z === DEPTH - 1;
    let r = '';
    for (let x = 0; x < LEN; x++) {
      const d = deckAt(x);
      const post = side && x % 2 === 0; // 2 マスおきの はしら
      const endPost = side && (x === 0 || x === LEN - 1);
      if (y === d) r += 'S'; // ゆか
      else if (y < d) r += side && stageEdge(x) ? 'S' : '.'; // ゆかの 下: 段の かわり目の ささえ
      else if (y === d + 1 || y === d + 2) r += post ? 'S' : '.'; // はしら（高さ 2）
      else if (y === d + 3) r += side ? 'S' : '.'; // 横木 1 本（はしの はしらも ここは 横木と 同じ 朱色）
      else if (y === d + 4) r += endPost ? 'M' : '.'; // 両はしの はしらの 頭（1 マス 高い）
      else r += '.';
    }
    rows.push(r);
  }
  return rows;
}

export const HASHI: StructureShape = {
  id: 'hashi',
  layers: [0, 1, 2, 3, 4, 5, 6].map(layer),
  legend: {
    S: 'shu_ita',
    M: 'koke_ishi',
  },
  anchor: { x: 6, z: 2 },
  base: { id: 'ishidatami', maxFill: 3 },
  maxSlope: 2,
};
