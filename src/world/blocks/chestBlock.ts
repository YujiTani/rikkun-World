/**
 * 坑道の 宝箱の ブロック（MINE-1C #350。仕様 docs/design/MINE-1.md §4.6・§4.8）。
 *
 * 宝箱は 2 マス（よこ 2・おく 1）で 1 つ。段（1〜4）・あいた か・本体か のこりか を ブロックの id で もつ
 * （ふとん futon.ts・チョーク chalkMark.ts と 同じ 考え。列の 保存だけで のこる）。
 *   ・前 ＝ へやの ほう。本体 ＝ 前から 見て 左、のこり ＝ 右（のこり ＝ 本体の 右がわ）
 *   ・前の 向きは id に 持たない。本体と のこりの 並び（のこりが 本体の どの となりに あるか）で 1 つに きまる（chestFrontAt）
 *   ・id: `takarabako_<段>[_open][_r]`（`_open` ＝ あいた・`_r` ＝ のこり）
 *   ・4 段 ×（あいてない／あいた）×（本体／のこり）＝ 16 こ。ブロックの 番号は 1 マス 1 バイト（256 まで）なので これ いじょうは ふやさない
 *   ・本体の 4 段 ×（あいてない／あいた）の 8 こ の 名前を テストが 見る（takarabako_1 … takarabako_4_open）
 * このファイルは 何も import しない 葉（contracts/world.ts の BlockId が 型だけ 読む）。
 */

export type ChestCompass = 'n' | 'e' | 's' | 'w';
export type ChestTier = 1 | 2 | 3 | 4;
export type ChestBlockId = `takarabako_${ChestTier}${'' | '_open'}${'' | '_r'}`;

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
}

/** (段, あいた, のこり) の id */
export function chestBlockId(tier: ChestTier, open: boolean, rest: boolean): ChestBlockId {
  return `takarabako_${tier}${open ? '_open' : ''}${rest ? '_r' : ''}` as ChestBlockId;
}

/** 16 この id（段 → あいた → のこり の 順） */
export const CHEST_BLOCK_IDS: readonly ChestBlockId[] = CHEST_TIERS.flatMap((t) =>
  [false, true].flatMap((open) => [false, true].map((rest) => chestBlockId(t, open, rest))),
);

const INFO = new Map<string, ChestBlockInfo>();
for (const t of CHEST_TIERS) for (const open of [false, true]) for (const rest of [false, true]) INFO.set(chestBlockId(t, open, rest), { tier: t, open, rest });

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

/**
 * 前（へやの ほう）の 向きを、もう 1 マスの 場所から きめる。
 * 本体なら 「のこり」が 右どなりに ある 向き、のこりなら 「本体」が 左どなりに ある 向き。見つからなければ null。
 * getId は (x, y, z) の ブロック id を 返す 関数。
 */
export function chestFrontAt(getId: (x: number, y: number, z: number) => string, x: number, y: number, z: number): ChestCompass | null {
  const me = INFO.get(getId(x, y, z));
  if (!me) return null;
  for (const f of CHEST_FRONTS) {
    const [rx, rz] = CHEST_RIGHT[f];
    const o = INFO.get(me.rest ? getId(x - rx, y, z - rz) : getId(x + rx, y, z + rz));
    if (o && o.tier === me.tier && o.open === me.open && o.rest !== me.rest) return f;
  }
  return null;
}

/** もう 1 マス（のこり ↔ 本体）の 場所 */
export function chestPartner(x: number, z: number, info: ChestBlockInfo, front: ChestCompass): { x: number; z: number } {
  const [rx, rz] = CHEST_RIGHT[front];
  return info.rest ? { x: x - rx, z: z - rz } : { x: x + rx, z: z + rz };
}
