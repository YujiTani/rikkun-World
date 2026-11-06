/**
 * 坑道の 宝箱の ブロック（MINE-1C #350。仕様 docs/design/MINE-1.md §4.6・§4.8）。
 *
 * 宝箱は 2 マス（よこ 2・おく 1）で 1 つ。段（1〜4）・あいた か・本体か のこりか・前の 向き を ブロックの id で もつ
 * （ふとん futon.ts・チョーク chalkMark.ts と 同じ 考え。列の 保存だけで のこる）。
 *   ・前 ＝ へやの ほう。本体 ＝ 前から 見て 左、のこり ＝ 右（のこり ＝ 本体の 右がわ）
 *   ・id: `takarabako_<段>[_open][_r][_e|_s|_w]`（`_open` ＝ あいた・`_r` ＝ のこり・向き 北 n は 何も つけない）
 *   ・4 段 ×（あいてない／あいた）×（本体／のこり）× 4 向き ＝ 64 こ。ブロックの 番号は 1 マス 1 バイト（256 まで）なので これ いじょうは ふやさない
 *   ・本体の 4 段 ×（あいてない／あいた）の 8 こ（向き 北）の 名前を テストが 見る（takarabako_1 … takarabako_4_open）
 * このファイルは 何も import しない 葉（contracts/world.ts の BlockId が 型だけ 読む）。
 */

export type ChestCompass = 'n' | 'e' | 's' | 'w';
export type ChestTier = 1 | 2 | 3 | 4;
export type ChestBlockId = `takarabako_${ChestTier}${'' | '_open'}${'' | '_r'}${'' | '_e' | '_s' | '_w'}`;

const CHEST_TIERS: readonly ChestTier[] = [1, 2, 3, 4];
const CHEST_FRONTS: readonly ChestCompass[] = ['n', 'e', 's', 'w'];

/** 段ごとの 名前（2 マス とも 同じ。あいた ほうは「あいた 〜」） */
const CHEST_NAMES: Readonly<Record<ChestTier, string>> = {
  1: 'きの たからばこ',
  2: 'てつの たからばこ',
  3: 'うるしの たからばこ',
  4: 'ミラクルの たからばこ',
};

export interface ChestBlockInfo {
  tier: ChestTier;
  open: boolean;
  /** のこりの マス（本体の 右がわ）か */
  rest: boolean;
  /** 前（へやの ほう）の 向き */
  front: ChestCompass;
}

const suffix = (f: ChestCompass): string => (f === 'n' ? '' : `_${f}`);

/** (段, あいた, のこり, 前) の id */
export function chestBlockId(tier: ChestTier, open: boolean, rest: boolean, front: ChestCompass): ChestBlockId {
  return `takarabako_${tier}${open ? '_open' : ''}${rest ? '_r' : ''}${suffix(front)}` as ChestBlockId;
}

/** 64 この id（段 → あいた → のこり → 向き の 順。先頭 8 つは 本体・向き 北の 4 段 × 2 ではなく 段ごとの まとまり） */
export const CHEST_BLOCK_IDS: readonly ChestBlockId[] = CHEST_TIERS.flatMap((t) =>
  [false, true].flatMap((open) => [false, true].flatMap((rest) => CHEST_FRONTS.map((f) => chestBlockId(t, open, rest, f)))),
);

const INFO = new Map<string, ChestBlockInfo>();
for (const t of CHEST_TIERS) for (const open of [false, true]) for (const rest of [false, true]) for (const front of CHEST_FRONTS) INFO.set(chestBlockId(t, open, rest, front), { tier: t, open, rest, front });

/** 宝箱の ブロックなら その 中身（段・あいた・のこりか・前）。ちがえば null。返す 物は 共有の 定数なので 書きかえない */
export function chestBlockInfo(id: string): Readonly<ChestBlockInfo> | null {
  return INFO.get(id) ?? null;
}

/** 名前（ブロックの 名前。あいた ほうは「あいた 〜」） */
export function chestBlockName(tier: ChestTier, open: boolean): string {
  return open ? `あいた ${CHEST_NAMES[tier]}` : CHEST_NAMES[tier];
}

/** 本体から のこりの マスへの ずれ（x, z）。前に 立って 宝箱を 見る ひとの 右がわ（n=−z 向きなら 西〔−x〕） */
export const CHEST_RIGHT: Readonly<Record<ChestCompass, readonly [number, number]>> = { n: [-1, 0], e: [0, -1], s: [1, 0], w: [0, 1] };

/** もう 1 マス（のこり ↔ 本体）の 場所 */
export function chestPartner(x: number, z: number, info: ChestBlockInfo): { x: number; z: number } {
  const [rx, rz] = CHEST_RIGHT[info.front];
  return info.rest ? { x: x - rx, z: z - rz } : { x: x + rx, z: z + rz };
}
