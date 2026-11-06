import type { Inventory } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import type { P2Save } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** セーブから 読んだ 2P の 分が 正しい 形か（正しければ そのまま、おかしければ null） */
export function readP2Save(data: unknown): P2Save | null {
  if (!isObj(data) || data.inventory === undefined || data.inventory === null) return null;
  const lv = data.level;
  if (!isObj(lv) || !Number.isFinite(lv.level) || !Number.isFinite(lv.xp)) return null;
  return { inventory: data.inventory, level: { level: lv.level as number, xp: lv.xp as number } };
}

/** 2P の もちものと レベル（1P とは 別。§2.6・§6）。`inventory` は 差しかえず 中身だけ 入れかえる */
export class P2State {
  readonly inventory: Inventory = new InventoryImpl();
  level = { level: 1, xp: 0 };

  serialize(): P2Save {
    return { inventory: this.inventory.serialize(), level: { ...this.level } };
  }

  /** 形が おかしい・null は からっぽ（レベル 1・xp 0）に する */
  deserialize(data: unknown): void {
    const d = readP2Save(data);
    if (!d) {
      this.clear();
      return;
    }
    try {
      this.inventory.deserialize(d.inventory);
    } catch {
      this.inventory.clear();
    }
    this.level = { ...d.level };
  }

  clear(): void {
    this.inventory.clear();
    this.level = { level: 1, xp: 0 };
  }
}
