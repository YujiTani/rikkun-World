// DECLARATION ONLY（tester・COOP-1 作業 1）: 実装は developer が この ファイルを 書きかえて 入れる。テストは session.test.ts。
import type { Inventory } from '../contracts';
import type { P2Save } from './types';

/** 2P の もちものと レベル（1P とは 別。§2.6・§6）。`inventory` は `InventoryImpl` と 同じ 物を 1 つ 持つ */
export declare class P2State {
  constructor();
  readonly inventory: Inventory;
  level: { level: number; xp: number };
  serialize(): P2Save;
  /** 形が おかしい・null は からっぽ（レベル 1・xp 0）に する */
  deserialize(data: unknown): void;
  clear(): void;
}
