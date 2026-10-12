import type { ArmorSlot, ArmorSystem, DamageKind, Inventory, ItemId, ItemStack } from '../contracts';
import { ARMOR_SLOTS, ARMOR_SLOT_OF, type CraftConfig } from './config';

/** 防具が使う持ち物（カーソルを直接かえられるもの。InventoryImpl が合う） */
export type ArmorInventory = Inventory & { setCursor(stack: ItemStack | null): void };

export interface ArmorSnapshot {
  head: ItemId | null;
  body: ItemId | null;
  arms: ItemId | null;
  legs: ItemId | null;
  value: number;
  hitCount: number;
  hudIcons: ItemId[];
}

/** かぶと・よろい・こて・すねあて（M4 §2.7）。そうびのマス 4 つ・着る・ふせぐ */
export class ArmorSystemImpl implements ArmorSystem {
  private worn: Record<ArmorSlot, ItemId | null> = { head: null, body: null, arms: null, legs: null };
  private hits = 0;
  private listeners: Array<() => void> = [];
  private snap: ArmorSnapshot | null = null;

  constructor(
    private readonly inventory: ArmorInventory,
    private readonly config: Pick<CraftConfig, 'armorValue'>,
  ) {}

  equipped(slot: ArmorSlot): ItemId | null {
    return this.worn[slot];
  }

  /** そのアイテムが入るそうびのマス（入らないなら null） */
  slotFor(item: ItemId): ArmorSlot | null {
    return ARMOR_SLOT_OF[item] ?? null;
  }

  /** 手に持っている item を着る（もう着ていれば入れかえて、前のものが手のマスへ） */
  tryEquip(item: ItemId): boolean {
    const slot = this.slotFor(item);
    const held = this.inventory.held();
    if (!slot || !held || held.item !== item) return false;
    const prev = this.equipped(slot);
    this.put(slot, item);
    const sel = this.inventory.selected();
    if (held.count > 1) {
      // 防具は上限 1 なので通常は通らない
      this.inventory.setSlot(sel, { item, count: held.count - 1 });
      if (prev) this.inventory.add(prev, 1);
    } else {
      this.inventory.setSlot(sel, prev ? { item: prev, count: 1 } : null);
    }
    return true;
  }

  /** もちもの画面でそうびのマスをクリック（M2 §2.5 のクリックと同じやり方） */
  click(slot: ArmorSlot): void {
    const cur = this.inventory.cursor();
    const eq = this.equipped(slot);
    if (!cur) {
      if (!eq) return;
      this.inventory.setCursor({ item: eq, count: 1 });
      this.put(slot, null);
      return;
    }
    if (this.slotFor(cur.item) !== slot) return; // 合わないものは入らない
    const rest = cur.count - 1;
    this.put(slot, cur.item);
    if (rest > 0) {
      this.inventory.setCursor({ item: cur.item, count: rest });
      if (eq) this.inventory.add(eq, 1);
    } else {
      this.inventory.setCursor(eq ? { item: eq, count: 1 } : null);
    }
  }

  /** 種類 kind のダメージをへらす量（着ている防具の合計） */
  valueOf(kind: DamageKind): number {
    const v = this.config.armorValue;
    let sum = 0;
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      if (it) sum += v[it]?.[kind] ?? 0;
    }
    return sum;
  }

  /** 着ている防具の強さの目安（それぞれの いちばん大きい値の合計。HUD・テスト用） */
  value(): number {
    const v = this.config.armorValue;
    let sum = 0;
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      const t = it ? v[it] : undefined;
      if (t) sum += Math.max(t.normal, t.ball, t.fall);
    }
    return sum;
  }

  /**
   * 妖怪の攻撃を受けた（むてきで受けなかった回は呼ばない）。カットする量（体力の単位）を返す。
   * 受けるダメージは max(1, 元のダメージ − カット)（落下は max(0, …)）で、PlayerCombat が計算する（オーナー決定）
   */
  cut(kind: DamageKind = 'normal'): number {
    this.hits++;
    return this.valueOf(kind);
  }

  hitCount(): number {
    return this.hits;
  }

  /** 「受けた回数」k を 0 にもどす（復活したとき） */
  resetHits(): void {
    this.hits = 0;
  }

  /** そうびを変える（準備用。持ち物は変えない。k は 0 にもどる） */
  set(head: ItemId | null, body: ItemId | null, arms: ItemId | null = null, legs: ItemId | null = null): void {
    const want: Record<ArmorSlot, ItemId | null> = { head, body, arms, legs };
    for (const slot of ARMOR_SLOTS) {
      const it = want[slot];
      this.worn[slot] = it && this.slotFor(it) === slot ? it : null;
    }
    this.hits = 0;
    this.notify();
  }

  /** そうびのマスを空にして中身を返す（やられたとき落とす用） */
  take(slot: ArmorSlot): ItemId | null {
    const it = this.equipped(slot);
    if (it) this.put(slot, null);
    return it;
  }

  snapshot(): ArmorSnapshot {
    // 毎ステップ呼ばれる。変わったときだけ作る
    const s = this.snap;
    if (s && s.value === this.value() && s.hitCount === this.hits && ARMOR_SLOTS.every((k) => s[k] === this.worn[k])) return s;
    const hudIcons: ItemId[] = [];
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      if (it) hudIcons.push(it);
    }
    this.snap = { head: this.worn.head, body: this.worn.body, arms: this.worn.arms, legs: this.worn.legs, value: this.value(), hitCount: this.hits, hudIcons };
    return this.snap;
  }

  serialize(): unknown {
    return { head: this.worn.head, body: this.worn.body, arms: this.worn.arms, legs: this.worn.legs };
  }

  /** 古い保存（あたま・からだ の 2 部位）もそのまま開ける */
  deserialize(data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    for (const slot of ARMOR_SLOTS) {
      const v = d[slot];
      this.worn[slot] = typeof v === 'string' && ARMOR_SLOT_OF[v] === slot ? (v as ItemId) : null;
    }
    this.hits = 0;
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private put(slot: ArmorSlot, item: ItemId | null): void {
    this.worn[slot] = item;
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
