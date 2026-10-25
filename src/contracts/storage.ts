/**
 * たんす（しまう・取り出す）の型。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ItemId } from './items';

/** D → C: すてた・しまった の出来事（記録 `drop:*`・`store:*`・`storeFull`） */
export type StorageEvent =
  | { type: 'drop'; tick: number; item: ItemId; count: number }
  | { type: 'store'; tick: number; item: ItemId; count: number }
  | { type: 'storeFull'; tick: number };

// ================================================================ CRAFT-2（たんす の 素材・ログ・半透明）
// 担当の割り振り: docs/tickets/CRAFT-2-dev.md。仕様: docs/design/CRAFT-2.md

export interface TansuPos {
  x: number;
  y: number;
  z: number;
}

/** つくる・やく で 使った（使う予定の）素材。持ち物と たんす ごと */
export interface MaterialUse {
  inv: { item: ItemId; count: number }[];
  tansu: (TansuPos & { item: ItemId; count: number })[];
}

/** `CraftSystem.sources` の返り値（§6.1 `craft.sources`） */
export interface MaterialSources extends MaterialUse {
  ok: boolean;
  missing: { item: ItemId; count: number }[];
}

/** たんす の 中身を 数える・取り出す口（A が `StorageSystem` に実装。B・C は使わない） */
export interface TansuMaterialStore {
  /** そこの たんす に item が 全部で何こ あるか（たんす でなければ 0） */
  countItem(x: number, y: number, z: number, item: ItemId): number;
  /** そこの たんす から item を 最大 count こ 取り出して 取れた数を返す（うしろのマス 53 → 0 の順に。仕様 §2.3） */
  takeItem(x: number, y: number, z: number, item: ItemId, count: number): number;
}
