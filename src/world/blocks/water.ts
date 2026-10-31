/**
 * WATER-1（docs/design/WATER-1.md §4.6）: 水の 番号・量・判定の 1 ファイル。
 * 水の 判定は ここの 関数を 使う（`=== 'water'` などの 直書きは AC2 の テストが 見張る）。
 * 量 8 は 今の `water`（番号 9）。量 1〜7 は `water_1`〜`water_7`（番号 W0 + 量 − 1）。
 */

/** 量 8 の 水（生成・前の 保存の 水）の 番号。`BLOCK_TYPES` の 並びで 9（blockTypes が 起動時に 確かめる） */
export const WATER_FULL_INDEX = 9;
/** 量 1 の 水の 番号 W0 = 足す ときの 種類の 数（147）以上で いちばん 小さい 8 の 倍数 */
export const WATER_W0 = 152;
/** WATER-1 の まえの ブロックの 種類の 数（番号は かえない。うしろに 足す だけ） */
export const BLOCKS_BEFORE_WATER = 147;

/** 量 1〜7 の id（番号 = WATER_W0 + 量 − 1） */
export const WATER_PARTIAL_IDS = ['water_1', 'water_2', 'water_3', 'water_4', 'water_5', 'water_6', 'water_7'] as const;
export type WaterPartialId = (typeof WATER_PARTIAL_IDS)[number];

/** 予約の 番号の 空き（147〜151 と W0 + 7）。固くない・こわれない・世界に 置かない */
export const RESERVED_BEFORE_IDS = ['reserved_147', 'reserved_148', 'reserved_149', 'reserved_150', 'reserved_151'] as const;
export const RESERVED_AFTER_ID = 'reserved_159' as const;
export type ReservedId = (typeof RESERVED_BEFORE_IDS)[number] | typeof RESERVED_AFTER_ID;

/** 量 1〜7 の 水と 予約の id（`Record<BlockId, …>` の 表に 同じ 値を 入れる ための 型と 一覧） */
export type WaterExtraId = WaterPartialId | ReservedId;
export const WATER_EXTRA_IDS: readonly WaterExtraId[] = [...WATER_PARTIAL_IDS, ...RESERVED_BEFORE_IDS, RESERVED_AFTER_ID];
export function forWaterExtra<T>(value: T): Record<WaterExtraId, T> {
  return Object.fromEntries(WATER_EXTRA_IDS.map((id) => [id, value])) as Record<WaterExtraId, T>;
}

/** 1 マスに 入る 量の 上限（つぶ） */
export const WATER_MAX = 8;
/** 泳ぐ・深い 水と 数える 量（つぶ。4〜8） */
export const WATER_DEEP = 4;

// ---- ゆらめき（§4.1。目安の 値は PR を 見て ここだけ 直す） ----
/** 水面の ゆれの はば（マス。0.125 未満） */
export const WAVE_AMP = 0.06;
/** ゆれ 1 回の 時間（秒） */
export const WAVE_PERIOD = 3;
/** ゆれの 波の 長さ（世界の マス） */
export const WAVE_LENGTH = 6;
/** 流れる 水の テクスチャの 速さ（マス/秒） */
export const FLOW_SCROLL = 1.0;
/** 止まった 水の テクスチャの ゆらめき（マス/秒） */
export const IDLE_SCROLL = 0.1;

const BY_ID: Readonly<Record<string, number>> = {
  water: 8,
  water_1: 1,
  water_2: 2,
  water_3: 3,
  water_4: 4,
  water_5: 5,
  water_6: 6,
  water_7: 7,
};
const W_GROUP = WATER_W0 >> 3;

/** 水の 量 0〜8。水で なければ 0。id でも 番号でも よい */
export function waterAmount(idOrIndex: string | number): number {
  if (typeof idOrIndex === 'string') return BY_ID[idOrIndex] ?? 0;
  const n = idOrIndex;
  if (n === WATER_FULL_INDEX) return 8;
  if (n >> 3 === W_GROUP && (n & 7) !== 7) return (n & 7) + 1;
  return 0;
}

/** 量 n の id。0 は `air`、1〜7 は `water_n`、8 は `water` */
export function waterId(n: number): 'air' | 'water' | WaterPartialId {
  if (n <= 0) return 'air';
  if (n >= WATER_MAX) return 'water';
  return WATER_PARTIAL_IDS[n - 1];
}

/** 量 n の 番号（0 は null） */
export function waterIndexOf(n: number): number {
  if (n >= WATER_MAX) return WATER_FULL_INDEX;
  return WATER_W0 + n - 1;
}

/** 量 1〜8 の 水か */
export function isWater(idOrIndex: string): boolean {
  return (BY_ID[idOrIndex] ?? 0) > 0;
}
/** 量 4〜8 の 水（泳ぐ・深い 水）か */
export function isDeepWater(idOrIndex: string): boolean {
  return (BY_ID[idOrIndex] ?? 0) >= WATER_DEEP;
}
/** 番号で 量 1〜8 の 水か（世界の 外 −1 は false） */
export function isWaterIndex(index: number): boolean {
  return index === WATER_FULL_INDEX || (index >> 3 === W_GROUP && (index & 7) !== 7 && index >= 0);
}

/**
 * 水面の ゆれの ずれ（マス。0 〜 WAVE_AMP の 下向き）。世界の 座標 (wx, wz) と 時間 t（秒）だけで 決まる 純関数。
 * shader も 同じ 定数から 同じ 式を 作る（`rendererMaterials.ts`）。
 */
export function waveOffset(wx: number, wz: number, t: number): number {
  const k = (Math.PI * 2) / WAVE_LENGTH;
  const w = (Math.PI * 2) / WAVE_PERIOD;
  return (WAVE_AMP * (1 + Math.sin((wx + wz * 0.7) * k + t * w))) / 2;
}
