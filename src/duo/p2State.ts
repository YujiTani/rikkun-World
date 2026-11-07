import { ArmorSystemImpl, type ArmorWearOptions } from '../craft/ArmorSystem';
import { CRAFT_DEFAULTS, type CraftConfig } from '../craft/config';
import { InventoryImpl } from '../inventory/Inventory';
import { LevelSystem } from '../level/LevelSystem';
import type { P2Save } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** セーブから 読んだ 2P の 分が 正しい 形か（正しければ そのまま、おかしければ null） */
export function readP2Save(data: unknown): P2Save | null {
  if (!isObj(data) || data.inventory === undefined || data.inventory === null) return null;
  const lv = data.level;
  if (!isObj(lv) || !Number.isFinite(lv.level) || !Number.isFinite(lv.xp)) return null;
  // armor は 中身を 見ない（形の チェックは ArmorSystemImpl.deserialize。ない・おかしい ときは はだか）
  return { inventory: data.inventory, level: { level: lv.level as number, xp: lv.xp as number }, armor: data.armor };
}

/** 2P の もちもの・レベル・そうび（1P とは 別。§2.6・§3.5・§6）。`inventory` は 差しかえず 中身だけ 入れかえる */
export class P2State {
  readonly inventory: InventoryImpl = new InventoryImpl();
  /** 2P の レベルと けいけんち（1P の LevelSystem と 同じ 物） */
  readonly levels: LevelSystem;

  /** 2P の そうび（p2.inventory に つながる。1P と 同じ クラス・同じ 数の 表） */
  readonly armor: ArmorSystemImpl;

  constructor(opts: { onLevelUp?: (level: number) => void; armorConfig?: Pick<CraftConfig, 'armorValue'>; armorWear?: ArmorWearOptions } = {}) {
    this.levels = new LevelSystem({ onLevelUp: opts.onLevelUp });
    this.armor = new ArmorSystemImpl(this.inventory, opts.armorConfig ?? CRAFT_DEFAULTS, opts.armorWear);
  }

  get level(): { level: number; xp: number } {
    return { level: this.levels.level(), xp: this.levels.xp() };
  }
  set level(v: { level: number; xp: number }) {
    this.levels.set(v.level, v.xp);
  }

  serialize(): P2Save {
    return { inventory: this.inventory.serialize(), level: this.level, armor: this.armor.serialize() };
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
    this.level = d.level;
    this.armor.deserialize(d.armor); // ない・形が おかしい 保存は はだか
  }

  clear(): void {
    this.inventory.clear();
    this.levels.set(1, 0);
    this.armor.deserialize(null);
    this.armor.drainWearEvents(); // やめた あいだに 出来事を ためない
    this.inventory.drainWearEvents();
  }
}
