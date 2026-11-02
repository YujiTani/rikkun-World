/**
 * WATERFALL-1（docs/design/WATERFALL-1.md §4）: マグマの 番号・量・判定の 1 ファイル。水（water.ts）と 同じ 8 この 並び。
 * 番号 M0〜M0 + 7 = 量 1〜8（下 3 ビット + 1 が 量）。M0 は 8 の 倍数（blockTypes が 起動時に 確かめる）。
 */

/** 量 1 の マグマの 番号（8 の 倍数）。量 n の 番号 = MAGMA_M0 + n − 1 */
export const MAGMA_M0 = 176;

/** 量 1〜7 の id と 量 8 の id（並びの 順 = 番号の 順） */
export const MAGMA_IDS = ['magma_1', 'magma_2', 'magma_3', 'magma_4', 'magma_5', 'magma_6', 'magma_7', 'magma'] as const;
type MagmaId = (typeof MAGMA_IDS)[number];

/** マグマの 前の 予約の 空き（M0 を 8 の 倍数に そろえる ため。固くない・こわれない・世界に 置かない） */
export const MAGMA_RESERVED_IDS = ['reserved_169', 'reserved_170', 'reserved_171', 'reserved_172', 'reserved_173', 'reserved_174', 'reserved_175'] as const;
type MagmaReservedId = (typeof MAGMA_RESERVED_IDS)[number];

/** アイテムに ならない マグマの 番号 ぜんぶ（量 1〜8 と 予約） */
export type MagmaExtraId = MagmaId | MagmaReservedId;
export const MAGMA_EXTRA_IDS: readonly MagmaExtraId[] = [...MAGMA_RESERVED_IDS, ...MAGMA_IDS];
export function forMagmaExtra<T>(value: T): Record<MagmaExtraId, T> {
  return Object.fromEntries(MAGMA_EXTRA_IDS.map((id) => [id, value])) as Record<MagmaExtraId, T>;
}

const M_GROUP = MAGMA_M0 >> 3;
const BY_ID: Readonly<Record<string, number>> = Object.fromEntries(MAGMA_IDS.map((id, i) => [id, i + 1]));

/** マグマの 量 0〜8。マグマで なければ 0。id でも 番号でも よい */
export function magmaAmount(idOrIndex: string | number): number {
  if (typeof idOrIndex === 'string') return BY_ID[idOrIndex] ?? 0;
  return idOrIndex >= 0 && idOrIndex >> 3 === M_GROUP ? (idOrIndex & 7) + 1 : 0;
}

/** 番号で 量 1〜8 の マグマか */
export function isMagmaIndex(index: number): boolean {
  return index >= 0 && index >> 3 === M_GROUP;
}

/** id で マグマか */
export function isMagma(id: string): boolean {
  return (BY_ID[id] ?? 0) > 0;
}

/** 量 n の id。0 は `air` */
export function magmaId(n: number): 'air' | MagmaId {
  if (n <= 0) return 'air';
  return MAGMA_IDS[Math.min(8, n) - 1];
}
