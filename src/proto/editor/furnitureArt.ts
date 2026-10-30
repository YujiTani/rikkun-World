// HOUSE-1B 試作: 新しい 家具 5 つ（テーブル・いす・あんどん・ほんだな・おふろ）の 形と 絵。案 A「ごつごつの くりの 木」（yuzu OK ずみ）。
// 数の 元は docs/art/house-1/proto/houseA.ts.txt（そのまま。形 ＝ 1/9 ブロック、0.5 きざみ。原点 ＝ 家具の 左前 下の かど、前 ＝ −z）。
// 今の 家具 4 つ（かまど・たんす・こたつ・ふとん）は ゲームの 形を そのまま 使う（previewMesh.ts）。
import { grain, rect, rng, solid, speck, type Px } from './tilePaint';

type V3 = readonly [number, number, number];

export type FurnTile =
  | 'wood_top' | 'wood_side' | 'wood_v' | 'wood_end' | 'zabuton' | 'shoji' | 'andon_top' | 'water' | 'bath_side'
  | 'book_r' | 'book_b' | 'book_g' | 'book_y';
export const FURN_TILE_NAMES: readonly FurnTile[] = [
  'wood_top', 'wood_side', 'wood_v', 'wood_end', 'zabuton', 'shoji', 'andon_top', 'water', 'bath_side', 'book_r', 'book_b', 'book_g', 'book_y',
];

/** 家具の 絵 13 まい（houseA.ts.txt の houseTiles） */
export function furnTiles(): Record<FurnTile, Px> {
  const shoji = speck('#F4EBD2', ['#EBDDBA'], 16, 0.15);
  rect(shoji, 0, 7, 16, 1, '#8A5A36');
  rect(shoji, 7, 0, 1, 16, '#8A5A36');
  const andonTop = solid('#5A3A22');
  rect(andonTop, 3, 3, 10, 10, '#FFE9A8');
  const bath = grain('#B98F5E', '#9C7040', '#D2B07E', 18, true);
  rect(bath, 0, 2, 16, 2, '#3A3A44');
  rect(bath, 0, 11, 16, 2, '#3A3A44');
  const book = (c: string): Px => {
    const t = solid(c);
    rect(t, 0, 3, 16, 1, '#F0E0B0'); // せの 帯
    return t;
  };
  return {
    wood_side: grain('#8A5A36', '#6A3E26', '#9C6A42', 11),
    wood_top: grain('#9C6A42', '#7A4C2E', '#AE7C50', 12),
    wood_v: grain('#8A5A36', '#6A3E26', '#9C6A42', 13, true),
    wood_end: speck('#7A4C2E', ['#6A3E26', '#8A5A36'], 14, 0.3),
    zabuton: speck('#3D5A9E', ['#2F4780', '#5B7BC4'], 15, 0.2),
    shoji,
    andon_top: andonTop,
    water: speck('#6FB8E0', ['#8FD0F0', '#5BA6D2'], 17, 0.2),
    bath_side: bath,
    book_r: book('#B8452E'),
    book_b: book('#3D5A9E'),
    book_g: book('#5E8A3A'),
    book_y: book('#D9A030'),
  };
}

export interface FurnBox {
  a: V3; // 1/9 ブロック
  b: V3;
  top: string; // 上（と 下）の 面の 絵の 名前
  side: string; // 横の 4 面
  glow?: boolean; // 面の 明るさを かけない
}
export type BoxKind = 'table' | 'chair' | 'andon' | 'shelf' | 'ofuro' | 'furnace' | 'tansu';

function legs4(x0: number, x1: number, z0: number, z1: number, t: number, h: number): FurnBox[] {
  return [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]].map(([x, z]) => ({ a: [x!, 0, z!] as V3, b: [x! + t, h, z! + t] as V3, top: 'wood_end', side: 'wood_v' }));
}

/** 箱の ならび（houseA.ts.txt の furnitureBoxes ＋ かまど・たんすの 1 ブロックの 箱） */
export function furnitureBoxes(): Record<BoxKind, FurnBox[]> {
  const shelf: FurnBox[] = [
    { a: [0, 0, 1], b: [1.5, 9, 9], top: 'wood_end', side: 'wood_v' },
    { a: [7.5, 0, 1], b: [9, 9, 9], top: 'wood_end', side: 'wood_v' },
    { a: [1.5, 0, 8], b: [7.5, 9, 9], top: 'wood_end', side: 'wood_v' },
    ...[0, 3, 6, 8].map((y) => ({ a: [1.5, y, 1] as V3, b: [7.5, y + 1, 8] as V3, top: 'wood_top', side: 'wood_side' })),
  ];
  // 本: シード 5（見本と 同じ 並び。r() を よぶ 順番を かえない）
  const books = ['book_r', 'book_b', 'book_g', 'book_y'];
  const r = rng(5);
  for (const y of [1, 4, 7]) {
    let x = 1.5;
    while (x < 7.4) {
      const w = Math.min(7.5 - x, 1 + Math.floor(r() * 2) * 0.5);
      const h = y === 7 ? 1 : 1.5 + Math.floor(r() * 2) * 0.5;
      const t = books[Math.floor(r() * 4)]!;
      shelf.push({ a: [x, y, 2], b: [x + w, y + h, 7.5], top: t, side: t });
      x += w;
    }
  }
  return {
    table: [{ a: [0, 5, 0], b: [18, 7, 9], top: 'wood_top', side: 'wood_side' }, ...legs4(0.5, 17.5, 0.5, 8.5, 3, 5)],
    chair: [
      ...legs4(1, 8, 1, 8, 2, 3),
      { a: [0.5, 3, 0.5], b: [8.5, 5, 8.5], top: 'zabuton', side: 'wood_side' },
      { a: [0.5, 5, 6.5], b: [2.5, 9, 8.5], top: 'wood_end', side: 'wood_v' },
      { a: [6.5, 5, 6.5], b: [8.5, 9, 8.5], top: 'wood_end', side: 'wood_v' },
      { a: [0.5, 9, 6.5], b: [8.5, 11, 8.5], top: 'wood_top', side: 'wood_side' }, // 上の 2/9 は 見た目 だけ
      { a: [2.5, 6.5, 7], b: [6.5, 7.5, 8], top: 'wood_top', side: 'wood_side' },
    ],
    andon: [
      ...legs4(1.5, 7.5, 1.5, 7.5, 1.5, 1.5),
      { a: [2, 1.5, 2], b: [7, 8, 7], top: 'andon_top', side: 'shoji', glow: true },
      { a: [1.5, 1, 1.5], b: [7.5, 2, 7.5], top: 'wood_top', side: 'wood_side' },
      { a: [1.5, 8, 1.5], b: [7.5, 9, 7.5], top: 'andon_top', side: 'wood_side' },
    ],
    shelf,
    ofuro: [
      { a: [0, 0, 0], b: [18, 6, 2], top: 'wood_top', side: 'bath_side' },
      { a: [0, 0, 7], b: [18, 6, 9], top: 'wood_top', side: 'bath_side' },
      { a: [0, 0, 2], b: [2, 6, 7], top: 'wood_top', side: 'bath_side' },
      { a: [16, 0, 2], b: [18, 6, 7], top: 'wood_top', side: 'bath_side' },
      { a: [2, 0, 2], b: [16, 5, 7], top: 'water', side: 'water' },
    ],
    // 今の ブロック（ふつうの 箱。絵は ブロックの 絵 [上, 下, 横] と 同じ）
    furnace: [{ a: [0, 0, 0], b: [9, 9, 9], top: 'furnace_top', side: 'furnace_side' }],
    tansu: [{ a: [0, 0, 0], b: [9, 9, 9], top: 'tansu_top', side: 'tansu_front' }],
  };
}
