import type { TownItemId } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';

/**
 * 街の 物（TOWN-1 1E）の 16×16。かき方は ゲームの アイテムの 絵と 同じ: 1 点の こい ふちどり `#3A3442`・左上から 光・右下が かげ・真っ白 なし。
 * 仮の 絵【アートの 確認 まち】。
 */
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const CLEAR: Rgba = [0, 0, 0, 0];

/** かえりの おふだ: たての ながい 紙の ふだ（上に 赤い ひも）。まん中に 朱の まるい しるしと 墨の 線、ふんすいの しずく */
const KAERI_OFUDA = {
  pal: { K: '#3A3442', W: '#F4ECD6', H: '#FBF6E8', S: '#DDD0B0', R: '#D2452F', r: '#9E2F22', B: '#3B4A7A', A: '#6FB8E8', a: '#3E86C2' },
  rows: [
    '.......Rr.......',
    '......R..r......',
    '.....KKKKKK.....',
    '.....KHWWWSK....',
    '.....KHBBWSK....',
    '.....KWWWWSK....',
    '.....KWRRWSK....',
    '.....KRAaRSK....',
    '.....KRaaRSK....',
    '.....KWRRWSK....',
    '.....KWWWWSK....',
    '.....KWBBWSK....',
    '.....KWWBWSK....',
    '.....KWBWWSK....',
    '.....KSSSSSK....',
    '.....KKKKKKK....',
  ],
} as const;

/** 絵の 表（1 つの id に 1 つ。足し忘れは 型エラー） */
const ART = { kaeri_ofuda: KAERI_OFUDA } as const satisfies Record<TownItemId, { pal: object; rows: readonly string[] }>;

/** 街の 物か（絵を ここで 引く 物） */
export const isTownItem = (item: string): item is TownItemId => Object.hasOwn(ART, item);

/** 街の 物の 16×16（y = 0 が上） */
export function townItemPixels(item: TownItemId): Rgba[] {
  const art = ART[item];
  const pal: Readonly<Record<string, string>> = art.pal;
  const out: Rgba[] = [];
  for (const row of art.rows) for (const ch of row) out.push(pal[ch] === undefined ? CLEAR : hex(pal[ch]!));
  return out;
}
