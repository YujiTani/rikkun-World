import type { ItemId } from '../contracts';
import type { BowPalette, Part } from './heldGold';

/**
 * LEGEND-4: 新しい レジェンダリー武器の 手に持つ形（箱の 組み合わせ。もとは 共有フォルダ legendary4/art/heldL4.ts）。
 * 書き方は heldGold.ts と 同じ（原点 = にぎった手、のびる向き = -Z、X = 横）。PR ごとに 1 つずつ 足す。
 * ゆみ（黒龍）は 金の ゆみと 同じ 骨組み 10 箱（BowPalette で 色）＋ かざりの 箱。かざりは しなりに ついて いかない（createBendableBow の decor）。
 */
const P = (size: Part['size'], pos: Part['pos'], color: number): Part => ({ size, pos, color });

/** ゆみの かざりの 箱（骨組みの 10 箱は 含まない）。HELD_MODELS には この 箱が 入る（手に 持つ 模型が ある 目印も かねる） */
export const L4_BOW_DECOR: Partial<Record<ItemId, readonly Part[]>> = {
  // 黒龍: 水色の 光る すじが 両はしへ のびる（8 箱）
  kokuryu: [
    P([0.016, 0.016, 0.2], [0, -0.15, 0.19], 0x7ae8ff),
    P([0.016, 0.016, 0.18], [0, -0.075, 0.38], 0x7ae8ff),
    P([0.02, 0.04, 0.16], [0, -0.04, 0.57], 0xc8e4f4),
    P([0.02, 0.03, 0.1], [0, -0.04, 0.7], 0xffffff),
    P([0.016, 0.016, 0.2], [0, -0.15, -0.19], 0x7ae8ff),
    P([0.016, 0.016, 0.18], [0, -0.075, -0.38], 0x7ae8ff),
    P([0.02, 0.04, 0.16], [0, -0.04, -0.57], 0xc8e4f4),
    P([0.02, 0.03, 0.1], [0, -0.04, -0.7], 0xffffff),
  ],
  // 八咫烏: 金の かざり（両はしの 先に 金の つばさ・まん中に むらさきの 宝石。8 箱）
  yatagarasu: [
    P([0.04, 0.05, 0.05], [0, 0.02, 0], 0xa85cf0),
    P([0.02, 0.03, 0.03], [0, 0.02, 0], 0xf0e6ff),
    P([0.018, 0.018, 0.2], [0, -0.15, 0.19], 0xe8b82a),
    P([0.018, 0.018, 0.18], [0, -0.075, 0.38], 0xe8b82a),
    P([0.03, 0.06, 0.14], [0, -0.04, 0.58], 0xffe88a),
    P([0.018, 0.018, 0.2], [0, -0.15, -0.19], 0xe8b82a),
    P([0.018, 0.018, 0.18], [0, -0.075, -0.38], 0xe8b82a),
    P([0.03, 0.06, 0.14], [0, -0.04, -0.58], 0xffe88a),
  ],
};

/** ゆみの 色（形は 金と 同じ） */
export const L4_BOW: Partial<Record<ItemId, BowPalette>> = {
  kokuryu: { grip: 0x2c3a5c, limb: 0x1c2238, band: 0x7ae8ff, tip: 0xc8e4f4 },
  yatagarasu: { grip: 0x3c2c70, limb: 0x241a44, band: 0xe8b82a, tip: 0xffe88a },
};

/** HELD_MODELS に 入れる 箱（ゆみは かざりの 箱）。手に 持つ 模型が ある 目印 */
export const L4_HELD_PARTS: Partial<Record<ItemId, Part[]>> = Object.fromEntries(Object.entries(L4_BOW_DECOR).map(([k, v]) => [k, [...v!]]));
