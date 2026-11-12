/**
 * 形つきブロック（WAFU-2）: 当たりは 1 ブロックの ままで、見た目だけ 細い・うすい 箱で 描く ブロック（はしら・うすいた・かきね・かさ）。
 * もとの ブロック（いし・あらいし・しゅいろの き …）の 絵を はって、小物（ちょうちん・足場）と 同じ 道〔meshChunk の pushProp〕で 描く。
 * 光は 通す・となりの 面は かくさない。持ち物には ならない（ほれない・置けない。石段・床の 人が 歩く 所には 使わない）。
 * このファイルは 何も import しない 葉。形は 下の 1 つの 表（SHAPES）、ブロックは「もとの ブロック × 形」（SHAPE_BASES）を 並べるだけ。
 */

/** 形 1 つの 箱（点 ＝ 1/16 ブロック。マスの 左・下・北 から） */
export interface ShapeBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** 3 小ブロックぶん（9 分の 3）＝ 点で 16/3。まんなかの はしらの 太さ・うすいたの あつさ */
const T3 = 16 / 3;
/** 9 分の 6 */
const T6 = 32 / 3;

/** 形の 表（名前 → 箱）。数は 点（1/16 ブロック） */
const SHAPES = {
  /** はしら: まんなか 3×3 の 柱（高さ いっぱい） */
  hashira: { label: 'はしら', boxes: [{ min: [T3, 0, T3], max: [T6, 16, T6] }] },
  /** うすいた（下）: 下 3 だんだけ の 板 */
  usuita_shita: { label: 'うすいた した', boxes: [{ min: [0, 0, 0], max: [16, T3, 16] }] },
  /** うすいた（上）: 上 3 だんだけ の 板 */
  usuita_ue: { label: 'うすいた うえ', boxes: [{ min: [0, T6, 0], max: [16, 16, 16] }] },
  /** かきね（x 向き）: まんなか 3 はばの かべ（高さ 6 だん）。長い 方が x */
  kakine_x: { label: 'かきね', boxes: [{ min: [0, 0, T3], max: [16, T6, T6] }] },
  /** かきね（z 向き） */
  kakine_z: { label: 'かきね', boxes: [{ min: [T3, 0, 0], max: [T6, T6, 16] }] },
  /** かさ: 下が 9×9、上へ 3 だんずつ（9 → 6 → 3）しぼる 四角すい台 */
  kasa: {
    label: 'かさ',
    boxes: [
      { min: [0, 0, 0], max: [16, T3, 16] },
      { min: [T3 / 2, T3, T3 / 2], max: [16 - T3 / 2, T6, 16 - T3 / 2] },
      { min: [T3, T6, T3], max: [T6, 16, T6] },
    ],
  },
} as const satisfies Record<string, { label: string; boxes: readonly ShapeBox[] }>;

export type ShapeName = keyof typeof SHAPES;

/** ブロック（もとの ブロック × 形）。ここに 足すだけで ブロックが ふえる（足し方は 末尾に） */
export const SHAPE_BASES = {
  hashira: ['stone', 'ara_ishi', 'koke_ara_ishi', 'shu_ita', 'log'],
  usuita_shita: ['stone', 'ara_ishi', 'kawara', 'shu_ita'],
  usuita_ue: ['stone', 'ara_ishi', 'kawara', 'shu_ita'],
  kakine_x: ['shu_ita', 'log'],
  kakine_z: ['shu_ita', 'log'],
  kasa: ['kawara', 'ara_ishi', 'koke_ara_ishi'],
} as const satisfies Record<ShapeName, readonly string[]>;

type Join<S extends ShapeName> = `${(typeof SHAPE_BASES)[S][number]}_${S}`;
/** 形つきブロックの id（例 'ara_ishi_hashira'） */
export type ShapeBlockId = { [S in ShapeName]: Join<S> }[ShapeName];

export interface ShapeBlockInfo {
  id: ShapeBlockId;
  shape: ShapeName;
  /** もとの ブロックの id（絵を 借りる） */
  base: string;
}

const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

/** ぜんぶの 形つきブロック（並び順 ＝ BLOCK_TYPES の 並び） */
export const SHAPE_BLOCKS: readonly ShapeBlockInfo[] = SHAPE_NAMES.flatMap((shape) =>
  (SHAPE_BASES[shape] as readonly string[]).map((base) => ({ id: `${base}_${shape}` as ShapeBlockId, shape, base })),
);

export const SHAPE_IDS: readonly ShapeBlockId[] = SHAPE_BLOCKS.map((b) => b.id);

export function shapeBoxes(shape: ShapeName): readonly ShapeBox[] {
  return SHAPES[shape].boxes;
}

export function shapeLabel(shape: ShapeName): string {
  return SHAPES[shape].label;
}
