import type { Inventory, ItemId, ItemStack, ItemType } from '../contracts';
import { HOTBAR_SIZE, INVENTORY_SIZE, ITEM_TYPES, itemType } from './items';

type Slot = ItemStack | null;

/** 配列に §4.2 の入れ方で入れる（from〜to 未満のマスだけ）。入らなかった数を返す */
export function addInto(slots: Slot[], item: ItemId, count: number, from = 0, to = slots.length): number {
  const max = itemType(item)?.maxStack;
  if (!max || count <= 0) return Math.max(0, count);
  let left = count;
  for (let i = from; i < to && left > 0; i++) {
    const s = slots[i];
    if (s && s.item === item && s.count < max) {
      const n = Math.min(max - s.count, left);
      slots[i] = { item, count: s.count + n };
      left -= n;
    }
  }
  for (let i = from; i < to && left > 0; i++) {
    if (!slots[i]) {
      const n = Math.min(max, left);
      slots[i] = { item, count: n };
      left -= n;
    }
  }
  return left;
}

export class InventoryImpl implements Inventory {
  readonly size = INVENTORY_SIZE;
  private readonly arr: Slot[] = new Array<Slot>(INVENTORY_SIZE).fill(null);
  private sel = 0;
  private cur: Slot = null;
  /** 持ち上げたマス（なければ -1） */
  private lifted = -1;
  private listeners: Array<() => void> = [];

  slots(): ReadonlyArray<ItemStack | null> {
    return this.arr;
  }
  selected(): number {
    return this.sel;
  }
  select(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE || index === this.sel) return;
    this.sel = index;
    this.notify();
  }
  selectNext(dir: 1 | -1): void {
    this.select((this.sel + dir + HOTBAR_SIZE) % HOTBAR_SIZE);
  }
  setSlot(index: number, stack: ItemStack | null): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) throw new Error(`マス番号がおかしい: ${index}`);
    if (!stack || !(stack.count > 0)) {
      this.arr[index] = null;
    } else {
      const t = itemType(stack.item);
      if (!t) throw new Error(`知らないアイテム: ${stack.item}`);
      this.arr[index] = { item: t.id, count: Math.min(Math.floor(stack.count), t.maxStack) };
    }
    this.notify();
  }
  clear(): void {
    this.arr.fill(null);
    this.sel = 0;
    this.cur = null;
    this.lifted = -1;
    this.notify();
  }
  add(item: ItemId, count: number): number {
    const n = Math.floor(count);
    const left = addInto(this.arr, item, n);
    if (left !== n) this.notify();
    return left;
  }
  count(item: ItemId): number {
    let n = 0;
    for (const s of this.arr) if (s && s.item === item) n += s.count;
    return n;
  }
  remove(item: ItemId, count: number): number {
    const want = Math.floor(count);
    let left = want;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.arr[i];
      if (s && s.item === item) {
        const n = Math.min(s.count, left);
        left -= n;
        this.arr[i] = n === s.count ? null : { item, count: s.count - n };
      }
    }
    const taken = want - left;
    if (taken > 0) this.notify();
    return taken;
  }
  canAdd(item: ItemId): boolean {
    const max = itemType(item)?.maxStack;
    if (!max) return false;
    return this.arr.some((s) => !s || (s.item === item && s.count < max));
  }
  held(): ItemStack | null {
    return this.arr[this.sel];
  }
  consumeHeld(): boolean {
    const s = this.arr[this.sel];
    if (!s) return false;
    this.arr[this.sel] = s.count <= 1 ? null : { item: s.item, count: s.count - 1 };
    this.notify();
    return true;
  }

  /**
   * シフトクリック（M6 §2.9 (3)）: ホットバー（0〜8）⇄ ふくろ（9〜35）のあいだで、そのマスのぜんぶを うつす。
   * 入りきらない分は 元のマスにのこる。うつした数を返す
   */
  shiftMove(index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return 0;
    const s = this.arr[index];
    if (!s) return 0;
    const [from, to] = index < HOTBAR_SIZE ? [HOTBAR_SIZE, this.size] : [0, HOTBAR_SIZE];
    this.arr[index] = null;
    const left = addInto(this.arr, s.item, s.count, from, to);
    if (left > 0) this.arr[index] = { item: s.item, count: left };
    const moved = s.count - left;
    if (moved > 0) this.notify();
    return moved;
  }

  /** そのマスから count こ（all ならぜんぶ）取り出す（すてる用）。取り出したものを返す。空なら null */
  takeFromSlot(index: number, all: boolean): ItemStack | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return null;
    const s = this.arr[index];
    if (!s) return null;
    const n = all ? s.count : 1;
    this.arr[index] = n >= s.count ? null : { item: s.item, count: s.count - n };
    this.notify();
    return { item: s.item, count: n };
  }

  click(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) return;
    const slot = this.arr[index];
    const cur = this.cur;
    if (!cur) {
      if (!slot) return;
      this.cur = slot;
      this.arr[index] = null;
      this.lifted = index;
    } else if (!slot) {
      this.arr[index] = cur;
      this.cur = null;
      this.lifted = -1;
    } else if (slot.item === cur.item) {
      const max = itemType(slot.item)!.maxStack;
      const n = Math.min(max - slot.count, cur.count);
      if (n <= 0) return;
      this.arr[index] = { item: slot.item, count: slot.count + n };
      this.cur = cur.count - n > 0 ? { item: cur.item, count: cur.count - n } : null;
      if (!this.cur) this.lifted = -1;
    } else {
      this.arr[index] = cur;
      this.cur = slot;
    }
    this.notify();
  }
  cursor(): ItemStack | null {
    return this.cur;
  }
  /** カーソルのものを直接かえる（そうびのマスとのやりとり用。M4） */
  setCursor(stack: ItemStack | null): void {
    this.cur = stack && stack.count > 0 ? { item: stack.item, count: stack.count } : null;
    this.lifted = -1;
    this.notify();
  }
  /**
   * カーソルのものを返すとき、持ち上げたマスが 持ち物の外（たんす）なら そこへ返す口（M6）。
   * true を返したら 返しおわったことにする
   */
  setReturnHandler(fn: ((stack: ItemStack) => boolean) | null): void {
    this.returnHandler = fn;
  }
  private returnHandler: ((stack: ItemStack) => boolean) | null = null;

  returnCursor(): void {
    if (!this.cur) return;
    const cur = this.cur;
    if (this.returnHandler?.(cur)) {
      this.cur = null;
      this.lifted = -1;
      this.notify();
      return;
    }
    let left: number;
    if (this.lifted >= 0 && !this.arr[this.lifted]) {
      this.arr[this.lifted] = cur;
      left = 0;
    } else {
      left = addInto(this.arr, cur.item, cur.count);
    }
    this.cur = left > 0 ? { item: cur.item, count: left } : null;
    this.lifted = -1;
    this.notify();
  }
  itemTypes(): ItemType[] {
    return ITEM_TYPES.map((t) => ({ ...t }));
  }

  /** カーソルのものは「持ち上げたマス」に戻したものとして書き出す（M2 §4.4） */
  serialize(): unknown {
    const copy = this.arr.map((s) => (s ? { ...s } : null));
    if (this.cur) {
      if (this.lifted >= 0 && !copy[this.lifted]) copy[this.lifted] = { ...this.cur };
      else addInto(copy, this.cur.item, this.cur.count);
    }
    return { slots: copy, selected: this.sel };
  }
  deserialize(data: unknown): void {
    const d = data as { slots?: unknown; selected?: unknown } | null;
    if (!d || !Array.isArray(d.slots) || d.slots.length !== this.size) throw new Error('持ち物の保存がおかしい');
    const next: Slot[] = d.slots.map((raw: unknown) => {
      if (raw === null) return null;
      const r = raw as { item?: unknown; count?: unknown };
      const t = typeof r?.item === 'string' ? itemType(r.item) : undefined;
      if (!t || typeof r.count !== 'number' || !Number.isInteger(r.count) || r.count < 1 || r.count > t.maxStack) {
        throw new Error('持ち物のマスがおかしい');
      }
      return { item: t.id, count: r.count };
    });
    const sel = d.selected;
    if (typeof sel !== 'number' || !Number.isInteger(sel) || sel < 0 || sel >= HOTBAR_SIZE) {
      throw new Error('えらんだマスがおかしい');
    }
    for (let i = 0; i < this.size; i++) this.arr[i] = next[i];
    this.sel = sel;
    this.cur = null;
    this.lifted = -1;
    this.notify();
  }
  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
