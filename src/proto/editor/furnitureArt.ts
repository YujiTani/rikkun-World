// HOUSE-1B 試作: 新しい 家具（テーブル・いす・あんどん・ほんだな・おふろ ＋ 第 3 版の まるいす・ながい テーブル・まるい テーブル・はにわ）の 形と 絵。
// 案 A「ごつごつの くりの 木」（yuzu OK ずみ）。数の 元は docs/art/house-1/proto/houseA.ts.txt（形 ＝ 1/9 ブロック、0.5 きざみ。
// 原点 ＝ 家具の 左前 下の かど、前 ＝ −z）と、第 3 版の furniture2.ts.txt。
// 今の 家具（かまど・たんす・こたつ・ふとん）は ゲームの 形を そのまま 使う（previewMesh.ts）。かまど・たんすは 面ごとに 絵を かえる（前・横・うしろ）。
import { tiles2, TILE2_NAMES, type Tile2 } from './furnitureTiles2';
import { grain, rect, rng, solid, speck, type Px } from './tilePaint';

type V3 = readonly [number, number, number];

export type FurnTile =
  | 'wood_top' | 'wood_side' | 'wood_v' | 'wood_end' | 'zabuton' | 'shoji' | 'andon_top' | 'water' | 'bath_side'
  | 'book_r' | 'book_b' | 'book_g' | 'book_y'
  | Tile2;
export const FURN_TILE_NAMES: readonly FurnTile[] = [
  'wood_top', 'wood_side', 'wood_v', 'wood_end', 'zabuton', 'shoji', 'andon_top', 'water', 'bath_side', 'book_r', 'book_b', 'book_g', 'book_y',
  ...TILE2_NAMES,
];

/** 家具の 絵 20 まい（houseA.ts.txt の houseTiles 13 まい ＋ furniture2.ts.txt の 7 まい） */
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
    ...tiles2(),
  };
}

export interface FurnBox {
  a: V3; // 1/9 ブロック
  b: V3;
  top: string; // 上（と 下）の 面の 絵の 名前
  side: string; // 横の 4 面
  glow?: boolean; // 面の 明るさを かけない
  /** 横の 面を 1 つずつ かえる とき（家具の 向きで。前 ＝ −z、うしろ ＝ +z、右 ＝ +x、左 ＝ −x）。書かない 面は side */
  faces?: Partial<Record<FaceSide, string>>;
}
export type FaceSide = 'front' | 'back' | 'left' | 'right';
export type BoxKind =
  | 'table' | 'chair' | 'andon' | 'shelf' | 'ofuro' | 'furnace' | 'tansu'
  | 'stool' | 'table_long' | 'table_round' | 'haniwa';

function leg(x: number, z: number, t: number, h: number): FurnBox {
  return { a: [x, 0, z], b: [x + t, h, z + t], top: 'wood_end', side: 'wood_v' };
}
function legs4(x0: number, x1: number, z0: number, z1: number, t: number, h: number): FurnBox[] {
  return [leg(x0, z0, t, h), leg(x1 - t, z0, t, h), leg(x0, z1 - t, t, h), leg(x1 - t, z1 - t, t, h)];
}

/**
 * まるく 見える 板（「ボクセルの まる」）。まん中 ＝ マスの まん中（4.5, 4.5）、半径 r（1/9）、高さ y0〜y1。
 * 1 ずつ の たての 帯ごとに、はば（左右 0.5 きざみ）を 円から 丸めて、同じ はばが つづく 帯は 1 つの 箱に まとめる。
 * 絵は 場所で うつす ので 上の 木目は 帯を またいで つながる。
 */
function disc(r: number, y0: number, y1: number, top: string, side: string): FurnBox[] {
  const rows: Array<{ z0: number; z1: number; hw: number }> = [];
  for (let z = 4.5 - r; z < 4.5 + r - 1e-6; z++) {
    const dz = z + 0.5 - 4.5;
    const hw = Math.round(Math.sqrt(r * r - dz * dz) * 2) / 2;
    const last = rows[rows.length - 1];
    if (last && last.hw === hw) last.z1 = z + 1;
    else rows.push({ z0: z, z1: z + 1, hw });
  }
  return rows.map((q) => ({ a: [4.5 - q.hw, y0, q.z0] as V3, b: [4.5 + q.hw, y1, q.z1] as V3, top, side }));
}

/** はにわの 土の 箱（上も 横も 同じ 土） */
const clay = (a: V3, b: V3, tile = 'haniwa_clay'): FurnBox => ({ a, b, top: tile, side: tile });

/** 箱の ならび（houseA.ts.txt の furnitureBoxes ＋ かまど・たんすの 1 ブロックの 箱 ＋ 第 3 版の 4 つ） */
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
    // 前（−z）は ゲームの ブロックの 絵の まま。横と うしろは 第 3 版の 新しい 絵
    furnace: [{ a: [0, 0, 0], b: [9, 9, 9], top: 'furnace_top', side: 'furnace_flank', faces: { front: 'furnace_side', back: 'furnace_rear' } }],
    tansu: [{ a: [0, 0, 0], b: [9, 9, 9], top: 'tansu_top', side: 'tansu_flank', faces: { front: 'tansu_front', back: 'tansu_rear' } }],
    // ---- 第 3 版（yuzu 2026-10-30 22:11）: 木の まるいす・ながい テーブル（1×3）・まるい テーブル・はにわ
    stool: [
      ...legs4(2, 7, 2, 7, 1.5, 3),
      ...disc(3.5, 3, 5, 'zabuton', 'wood_side'), // まるい 座面（いすと 同じ 藍の ざぶとん）
    ],
    table_long: [
      { a: [0, 5, 0], b: [27, 7, 9], top: 'wood_top', side: 'wood_side' },
      ...legs4(0.5, 26.5, 0.5, 8.5, 3, 5),
      leg(12, 0.5, 3, 5), // まん中の あし 2 本（長いので 6 本）
      leg(12, 5.5, 3, 5),
    ],
    table_round: [
      ...disc(4.5, 5, 7, 'wood_top', 'wood_side'), // 丸い 天板
      { a: [3, 1, 3], b: [6, 5, 6], top: 'wood_end', side: 'wood_v' }, // まん中の 太い あし
      { a: [2, 0, 3], b: [7, 1, 6], top: 'wood_top', side: 'wood_side' }, // 足もと（十字）
      { a: [3, 0, 2], b: [6, 1, 7], top: 'wood_top', side: 'wood_side' },
    ],
    haniwa: [
      clay([1, 0, 1], [8, 1, 8]), // 台
      clay([1.5, 1, 1.5], [7.5, 3, 7.5]), // 下の 体（太い）
      clay([2, 3, 2], [7, 4.5, 7]), // むね
      clay([1, 2.5, 1], [8, 3, 8], 'haniwa_band'), // おび（ぐるっと 出っぱる）
      clay([0.5, 3, 3.5], [2, 4.5, 5.5]), // 左うで
      clay([0.5, 4.5, 3.5], [1.5, 6, 5.5]), // 左手（上へ）
      clay([7, 3, 3.5], [8.5, 4.5, 5.5]), // 右うで
      clay([7.5, 4.5, 3.5], [8.5, 6, 5.5]), // 右手（上へ）
      { ...clay([2, 4.5, 2], [7, 9, 7]), faces: { front: 'haniwa_face' } }, // 顔（前だけ 丸い 目と 口の あな）
      clay([1.5, 8, 1.5], [7.5, 8.5, 7.5], 'haniwa_band'), // はちまき
      clay([3, 9, 3], [6, 10, 6]), // まげ
    ],
  };
}
