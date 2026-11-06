/**
 * MINE-1D（#351）: つららの 16×16 の 絵（十字の 板に はる）。元の 絵の きまりは docs/art/design/07-mine.md 20.6。
 * 天井から さがる 細い 3 本（はば 4→2・3→2・4→2、長さ 12・8・10 行）。先の 2 行は 白く まるい（1 点の とがった 先に しない。仕様 §3.2・D13）。乱数なし。
 */
export const TSURARA_TILE = 'tsurara' as const;
export const isTsuraraTile = (name: string): name is typeof TSURARA_TILE => name === TSURARA_TILE;

type Rgba = readonly [number, number, number, number];
const N = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** 色（07-mine.md 20.6）: 根もと・からだ・左はし（明るい）・右はし（かげ）・先の 2 行（白） */
const COLOR = { root: '#C9C1B2', body: '#D9E3E6', left: '#E9EEEE', right: '#AEBFC8', tip: '#F4F9FA' } as const;
/** 根もとの 行の 数（行） */
const ROOT_ROWS = 2;
/** 先の 白い 行の 数（行） */
const TIP_ROWS = 2;
/** 先の はば（ドット。1 には しない = まるい） */
const TIP_WIDTH = 2;
/** 1 本ごと: 左はしの 列（ドット）・上の はば（ドット）・長さ（行） */
const STICKS: ReadonlyArray<{ x: number; width: number; length: number }> = [
  { x: 1, width: 4, length: 12 },
  { x: 6, width: 3, length: 8 },
  { x: 11, width: 4, length: 10 },
];

export function paintTsuraraTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (const s of STICKS) {
    for (let y = 0; y < s.length; y++) {
      // 上から 先へ、はばが 1 ドットずつ 細くなる（先の はばまで）
      const w = Math.max(TIP_WIDTH, s.width - Math.floor((y * (s.width - TIP_WIDTH + 1)) / s.length));
      const x0 = s.x + Math.floor((s.width - w) / 2);
      for (let i = 0; i < w; i++) {
        const c = y >= s.length - TIP_ROWS ? COLOR.tip : y < ROOT_ROWS ? COLOR.root : i === 0 ? COLOR.left : i === w - 1 ? COLOR.right : COLOR.body;
        t[y * N + x0 + i] = hex(c);
      }
    }
  }
  return t;
}
