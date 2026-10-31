/**
 * 戸としょうじの 箱の 形（HOUSE-1C PR-1 #340。案 C。数の 元は アートの docs/art/house-1/proto/houseLookC.ts.txt の doorBoxes・shojiBoxes）。
 * 点 ＝ 1/16 ブロック。前 ＝ +z ＝ 家の 外（南）。戸は いつも 南向き（PO 決め 2）。しょうじは 前後 対称（外からも 中からも 同じ）。
 * 絵の 名前は houseArt.ts の HouseTile。ゲームの 世界の 描き方は render/houseProp.ts。
 */
import type { HouseTile } from './houseArt';

// ============================================================ 箱の 形（戸・しょうじ。点 = 1/16 ブロック。前 = +z = 家の 外）
export type BoxFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export interface HouseBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** 面ごとの 絵（なければ side、さらに なければ house_door_edge） */
  tiles: Partial<Record<BoxFace | 'side', HouseTile>>;
  /** 絵を 箱の 位置で うつす ときの ずれ（点）。front/back の 絵の 左右の 位置 */
  uOff?: number;
  /** 描かない 面（かべに うまる 面） */
  skip?: readonly BoxFace[];
  /** いつも 明るい 面（しょうじの 紙。日の 影を うけず、よるは あかりの 色。まわりへ 光は 出さない。props.ts） */
  glow?: boolean;
}

/** x と z を 入れかえる（まえ・うしろの かべ 用の 形 → ひだり・みぎの かべ 用。前後 対称の 形 だけに 使う） */
const SWAP_FACE: Record<BoxFace, BoxFace> = { top: 'top', bottom: 'bottom', front: 'right', back: 'left', left: 'back', right: 'front' };
function swapXZ(b: HouseBox): HouseBox {
  const tiles: HouseBox['tiles'] = {};
  for (const [k, v] of Object.entries(b.tiles) as Array<[BoxFace | 'side', HouseTile]>) tiles[k === 'side' ? 'side' : SWAP_FACE[k]] = v;
  return {
    ...b,
    min: [b.min[2], b.min[1], b.min[0]],
    max: [b.max[2], b.max[1], b.max[0]],
    tiles,
    skip: b.skip?.map((f) => SWAP_FACE[f]),
  };
}

/**
 * 戸わく（下の マスに 持たせる。点 = 下の マスの 左前 下 から。外 = +z）: はしら 2 本（ゆかから かもいまで）・かもい（戸の 上）・ひさし（外 だけ）。
 * はしら・かもいは かべの あつみを つらぬいて 外と 中へ 1 点 出る（中から 見ても 戸わく）。かべに うまる 面は 描かない。
 */
const DOOR_FRAME: readonly HouseBox[] = [
  { min: [-2, 0, -1], max: [1, 32, 17], tiles: { side: 'house_shoji_edge' }, skip: ['left', 'top'] },
  { min: [15, 0, -1], max: [18, 32, 17], tiles: { side: 'house_shoji_edge' }, skip: ['right', 'top'] },
  { min: [-2, 30, -1], max: [18, 33, 17], tiles: { side: 'house_shoji_edge' }, skip: ['left', 'right', 'top'] },
  { min: [-4, 33, 16], max: [20, 35, 20], tiles: { top: 'house_roof_top', side: 'house_roof_side', bottom: 'house_roof_side' }, skip: ['back'] },
];

/** 戸の 箱（part: 下の マス / 上の マス）。open = あいた 形 */
export function doorBoxes(part: 'low' | 'up', open: boolean): HouseBox[] {
  const face: HouseTile = part === 'low' ? 'house_door_lo' : 'house_door_hi';
  const edge = { side: 'house_door_edge', top: 'house_door_edge', bottom: 'house_door_edge' } as const;
  const frame = part === 'low' ? DOOR_FRAME : [];
  // しめた 形: 外がわ よりに あつい 板 1 まい（2 まいの あわせ目は 絵）。上下の 面は 描かない（props.ts）
  if (!open) return [{ min: [0, 0, 12], max: [16, 16, 16], tiles: { front: face, back: face, ...edge } }, ...frame];
  // あけた 形: 外へ 90 度（左右に ひらく。とびらの あつみ 4 点）
  return [
    { min: [0, 0, 16], max: [4, 16, 24], tiles: { left: face, right: face, ...edge }, uOff: 0 },
    { min: [12, 0, 16], max: [16, 16, 24], tiles: { left: face, right: face, ...edge }, uOff: 8 },
    ...frame,
  ];
}

/**
 * しょうじの 箱（前後 対称。外からも 中からも 同じ）: 紙の 板（かべの 面から 1.5 点 へこむ。前・うしろの 面 だけ。glow = いつも 中から 明るい）と、
 * こい 木の 窓わく 2 本（上 = 上の 横木・下 = 窓台。かべを つらぬいて 外と 中へ 2 点 出る。6 面）。たての わくは 紙の 絵。
 * 横に ならべると 窓わくが 2 点 かさなる（同じ 色なので 目立たない。建築士さんの ならびは 2 マス あく ので おきない）。
 * face = 紙が 向く 軸（'z' = まえ・うしろの かべ〔紙は 東西に のびる〕、'x' = ひだり・みぎの かべ）。
 */
const SHOJI_Z: readonly HouseBox[] = [
  { min: [0, 0, 1.5], max: [16, 16, 14.5], tiles: { front: 'house_shoji', back: 'house_shoji', side: 'house_shoji_edge' }, skip: ['left', 'right'], glow: true },
  { min: [-1, -1, -2], max: [17, 1, 18], tiles: { side: 'house_shoji_edge' } }, // 窓台
  { min: [-1, 15, -2], max: [17, 17, 18], tiles: { side: 'house_shoji_edge' } }, // 上の 横木
];
export function shojiBoxes(face: 'x' | 'z'): HouseBox[] {
  return face === 'z' ? [...SHOJI_Z] : SHOJI_Z.map(swapXZ);
}
