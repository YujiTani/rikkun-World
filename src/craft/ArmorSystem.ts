import type { ArmorSlot, ArmorSystem, Inventory, ItemId, ItemStack } from '../contracts';
import { ARMOR_SLOT_OF, type CraftConfig } from './config';

/** 防具が使う持ち物（カーソルを直接かえられるもの。InventoryImpl が合う） */
export type ArmorInventory = Inventory & { setCursor(stack: ItemStack | null): void };

export interface ArmorSnapshot {
  head: ItemId | null;
  body: ItemId | null;
  value: number;
  hitCount: number;
  hudIcons: ItemId[];
}

/** a（ふせぐ力）ごとの「k を 4 で わったあまり」で ダメージ 0 になる回（M4 §2.7） */
const BLOCK_REMAINDERS: Readonly<Record<number, readonly number[]>> = {
  1: [0],
  2: [0, 2],
  3: [0, 1, 2],
};

/** かぶと・よろい（M4 §2.7）。そうびのマス 2 つ・着る・ふせぐ */
export class ArmorSystemImpl implements ArmorSystem {
  private head: ItemId | null = null;
  private body: ItemId | null = null;
  private hits = 0;
  private listeners: Array<() => void> = [];

  constructor(
    private readonly inventory: ArmorInventory,
    private readonly config: Pick<CraftConfig, 'armorValue'>,
  ) {}

  equipped(slot: ArmorSlot): ItemId | null {
    return slot === 'head' ? this.head : this.body;
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

  /** ふせぐ力 a（かぶと 1・よろい 2。両方 3） */
  value(): number {
    const v = this.config.armorValue;
    return (this.head ? (v[this.head] ?? 0) : 0) + (this.body ? (v[this.body] ?? 0) : 0);
  }

  /** 妖怪の攻撃を受けた（むてきで受けなかった回は呼ばない）。true ならダメージ 0 */
  absorbHit(): boolean {
    const a = Math.min(3, this.value());
    const k = this.hits;
    this.hits++;
    if (a <= 0) return false;
    return (BLOCK_REMAINDERS[a] ?? []).includes(k % 4);
  }

  hitCount(): number {
    return this.hits;
  }

  /** 「受けた回数」k を 0 にもどす（復活したとき） */
  resetHits(): void {
    this.hits = 0;
  }

  /** そうびを変える（準備用。持ち物は変えない。k は 0 にもどる） */
  set(head: ItemId | null, body: ItemId | null): void {
    this.head = head && this.slotFor(head) === 'head' ? head : null;
    this.body = body && this.slotFor(body) === 'body' ? body : null;
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
    const hudIcons: ItemId[] = [];
    if (this.head) hudIcons.push(this.head);
    if (this.body) hudIcons.push(this.body);
    return { head: this.head, body: this.body, value: this.value(), hitCount: this.hits, hudIcons };
  }

  serialize(): unknown {
    return { head: this.head, body: this.body };
  }

  deserialize(data: unknown): void {
    const d = data as { head?: unknown; body?: unknown } | null;
    const ok = (v: unknown, slot: ArmorSlot): ItemId | null =>
      typeof v === 'string' && ARMOR_SLOT_OF[v] === slot ? (v as ItemId) : null;
    this.head = ok(d?.head, 'head');
    this.body = ok(d?.body, 'body');
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
    if (slot === 'head') this.head = item;
    else this.body = item;
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
