/**
 * HOUSE-2A（#364）まきものの 16×16 の 絵（十字の 板に はる）。仮の 絵（HOUSE-2B で かえる）: 床に 置いた ひろげかけの まきもの
 * （白い かみの 巻きと、赤い ひも）。乱数なし。
 */
export const MAKIMONO_TILE = 'makimono' as const;

type Rgba = readonly [number, number, number, number];
const N = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** 色: かみ・かみの かげ・ふち（木の じく）・ひも */
const COLOR = { paper: '#EFE4CA', shade: '#CDBF9C', rod: '#8A5A33', cord: '#B8452E' } as const;
/** 巻きの 上下の 行（ドット。じくの 行）と、かみの 行 */
const ROD_TOP = 5;
const ROD_BOTTOM = 14;

/** まきもの 1 本: 下の ほうに よこに ねかせた 巻き（じく 2 本の あいだに かみ）。上の 半分は すきま（十字の 板なので 空） */
export function paintMakimonoTile(): Rgba[] {
  const t = new Array<Rgba>(N * N).fill(CLEAR);
  for (let y = ROD_TOP; y <= ROD_BOTTOM; y++) {
    for (let x = 2; x <= 13; x++) {
      const rod = y === ROD_TOP || y === ROD_BOTTOM;
      const cord = x === 7 || x === 8;
      t[y * N + x] = hex(rod ? COLOR.rod : cord ? COLOR.cord : y === ROD_TOP + 1 || y === ROD_BOTTOM - 1 ? COLOR.shade : COLOR.paper);
    }
  }
  return t;
}
