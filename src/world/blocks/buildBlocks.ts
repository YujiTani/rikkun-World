/**
 * 家を 建てる ときの ブロック（HOUSE-1C PR-2 #340。仕様 docs/design/HOUSE-1.md §2.9・§2.10・§4.4・§4.5）。このファイルは 何も import しない 葉。
 *
 * ・かためた つち `katame_tsuchi` … どうづきで 地面を たたくと できる。ふつうに ほれる（ほると つち `dirt` 1 こ）。持ち物には 入らない
 * ・足場 5 つ … 建築中の 場所の 中だけに 立つ。アイテムに ならない 固い ブロック（ほれない・置けない）。完成で ぜんぶ 消える。
 *   しらきの はしご わく（案 B。決定 docs/decisions/2026-10-31-house-build-look.md）を 1 マスずつの 箱に 分けた もの:
 *   立ち柱 ＋ よこぎ（x 向き・z 向きの 2 つ）。足場板の 段（1・3 段目）は 板の よこぎ。藍の のぼりは 1 本だけ。
 */

/** かためた つち（ブロックの 番号は 今の いちばん 後ろ。古い セーブの 番号は かわらない） */
export const KATAME_TSUCHI = 'katame_tsuchi';

/** 足場 5 つ（ブロックの 並び順）。*_x ＝ よこぎが x 向き（北・南の 列）、*_z ＝ z 向き（西・東の 列）。deck ＝ 足場板の 段（1・3 段目） */
export const SCAFFOLD_IDS = ['ashiba_x', 'ashiba_z', 'ashiba_deck_x', 'ashiba_deck_z', 'ashiba_flag'] as const;
export type ScaffoldId = (typeof SCAFFOLD_IDS)[number];

const SCAFFOLD_SET: ReadonlySet<string> = new Set<string>(SCAFFOLD_IDS);

export function isScaffoldId(id: string): id is ScaffoldId {
  return SCAFFOLD_SET.has(id);
}

/** 足場の 絵（アトラスの 名前。数と 色は world/blocks/buildArt.ts） */
export type ScaffoldTile = 'h1_pole' | 'h1_pole_end' | 'h1_plank' | 'h1_plank_end' | 'h1_tie' | 'h1_flag';

type BoxFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

/** 足場の 箱 1 つ（点 ＝ 1/16 ブロック。マスの 左・下・北 から）。tiles ＝ 面ごとの 絵（なければ side） */
export interface ScaffoldBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  tiles: Partial<Record<BoxFace | 'side', ScaffoldTile>>;
  /** 描かない 面（となりの マスと つながる 面） */
  skip?: readonly BoxFace[];
}

/** 立ち柱の 太さ（点。3 点 ＝ 約 0.19 ブロック。案 B の 角材 0.16 に 近い 整数） */
const POST = { lo: 7, hi: 10 } as const;
/** 足場板の 段（1・3 段目）の 高さ（マスの 下から 点）と はば（北・南から 点） */
const DECK = { lo: 12, hi: 14, side: 1 } as const;
/** よこぎ（足場板の ない 段）の 高さ（点）と はば */
const RUNG = { lo: 7, hi: 9, side: 6 } as const;

/** 足場板の 段の 立ち柱の 高さ（点）。板の 上より 1 点だけ 出す（板の 上の 面と 同じ 高さに すると 絵が ちらつく。上の 段との すきまは 1 点） */
const DECK_POST_TOP = DECK.hi + 1;

const POLE = { top: 'h1_pole_end', bottom: 'h1_pole_end', side: 'h1_pole' } as const;
const PLANK = { top: 'h1_plank', bottom: 'h1_plank_end', side: 'h1_plank' } as const;

const post = (top: number): ScaffoldBox => ({ min: [POST.lo, 0, POST.lo], max: [POST.hi, top, POST.hi], tiles: POLE });

/** x 向きの よこぎ / 足場板（z 向きは x と z を 入れかえる）。両はしの 面は となりと つながる ので 描かない（三角形を へらす） */
function barX(deck: boolean): ScaffoldBox {
  return deck
    ? { min: [0, DECK.lo, DECK.side], max: [16, DECK.hi, 16 - DECK.side], tiles: PLANK, skip: ['left', 'right'] }
    : { min: [0, RUNG.lo, RUNG.side], max: [16, RUNG.hi, 16 - RUNG.side], tiles: PLANK, skip: ['left', 'right'] };
}
const swapFace: Record<BoxFace, BoxFace> = { top: 'top', bottom: 'bottom', front: 'right', back: 'left', left: 'back', right: 'front' };
function swapXZ(b: ScaffoldBox): ScaffoldBox {
  const tiles: ScaffoldBox['tiles'] = {};
  for (const [k, v] of Object.entries(b.tiles) as Array<[BoxFace | 'side', ScaffoldTile]>) tiles[k === 'side' ? 'side' : swapFace[k]] = v;
  return { min: [b.min[2], b.min[1], b.min[0]], max: [b.max[2], b.max[1], b.max[0]], tiles, ...(b.skip ? { skip: b.skip.map((f) => swapFace[f]) } : {}) };
}

/** 藍の のぼり（1 本）: 立ち柱 ＋ のぼりの 布（北・南向きの 面に 絵）。いちばん 上の 段の すみに 立つ */
const FLAG: readonly ScaffoldBox[] = [
  post(16),
  { min: [POST.hi, 3, 7], max: [15, 15, 8], tiles: { front: 'h1_flag', back: 'h1_flag', side: 'h1_tie' }, skip: ['left'] },
];

const BOXES: Readonly<Record<ScaffoldId, readonly ScaffoldBox[]>> = {
  ashiba_x: [post(16), barX(false)],
  ashiba_z: [post(16), swapXZ(barX(false))],
  ashiba_deck_x: [post(DECK_POST_TOP), barX(true)],
  ashiba_deck_z: [post(DECK_POST_TOP), swapXZ(barX(true))],
  ashiba_flag: FLAG,
};

/** 足場の 箱（ブロックの id ごと） */
export function scaffoldBoxes(id: ScaffoldId): readonly ScaffoldBox[] {
  return BOXES[id];
}

/** 足場の 段（高さ 1〜3。床の 上の 何段目か）ごとの ブロック。足場板の 段は 1・3 段目 */
export function scaffoldIdAt(level: number, axis: 'x' | 'z'): ScaffoldId {
  const deck = level === 1 || level === 3;
  return deck ? (axis === 'x' ? 'ashiba_deck_x' : 'ashiba_deck_z') : axis === 'x' ? 'ashiba_x' : 'ashiba_z';
}
