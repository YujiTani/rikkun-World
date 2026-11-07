// たんすの 中身と もちものの あいだで 物を うつす 決まり（クリック・シフトクリック・ぜんぶ しまう・おなじ もの を しまう・ぜんぶ とりだす）。
// 1P の `StorageSystem` と 2P の `TansuView`（COOP-1 4c）が **同じ これを 使う**（1P と 2P で 決まりが ずれない ように）。
import type { Inventory, ItemId, ItemStack } from '../contracts';
import { addInto } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { addStack } from '../tools/durability';

export type TansuSlot = ItemStack | null;
export type ShiftReason = null | 'full' | 'closed';
type Moved = { moved: number; reason: ShiftReason };

/** もちもの 9×3 の 先頭（ホットバー 0〜8 は「ぜんぶ しまう」で うごかさない） */
const BAG_START = 9;

/** マスのクリック 2 回の決まり（M2 §2.5）を 1 回ぶん。変わらないなら null */
export function clickRule(slot: TansuSlot, cur: ItemStack | null): { slot: TansuSlot; cur: ItemStack | null } | null {
  if (!cur) {
    if (!slot) return null;
    return { slot: null, cur: slot };
  }
  if (!slot) return { slot: cur, cur: null };
  if (slot.item === cur.item) {
    const max = itemType(slot.item)!.maxStack;
    const n = Math.min(max - slot.count, cur.count);
    if (n <= 0) return null;
    return {
      slot: { item: slot.item, count: slot.count + n },
      cur: cur.count - n > 0 ? { item: cur.item, count: cur.count - n } : null,
    };
  }
  return { slot: cur, cur: slot };
}

/**
 * たんすを 開いている 人を いつ とじるか（1P の `StorageSystem.update` と 2P の `TansuView.update` で 同じ 決まり）。
 * こわれた/消えた → 'gone'（遠くても）、closeDist より 遠い → 'far'（ちょうど 同じは とじない）、それ以外 null
 */
export function tansuCloseReason(i: { exists: boolean; dist: number; closeDist: number }): 'gone' | 'far' | null {
  if (!i.exists) return 'gone';
  return i.dist > i.closeDist ? 'far' : null;
}

/** 足もとと たんすの 中心（x+0.5, y, z+0.5）の 3D の きょり */
export function tansuDistance(p: { x: number; y: number; z: number }, t: { x: number; y: number; z: number }): number {
  return Math.hypot(p.x - (t.x + 0.5), p.z - (t.z + 0.5), p.y - t.y);
}

/** `StorageScreen` が たんすに 頼む こと（`StorageSystem`〔1P〕と `TansuView`〔2P〕の どちらでも 合う） */
export interface TansuApi {
  ui(): { open: boolean };
  openSlots(): readonly TansuSlot[] | null;
  click(i: number): boolean;
  shiftClick(from: 'tansu' | 'inv', i: number): Moved;
  storeAll(): Moved;
  storeSame(): Moved;
  takeAll(): Moved;
  mark(i: number): boolean;
  marks(): number[];
  storeMarked(): Moved;
}

/** うつし方が 使う 持ち主の 口 */
export interface TansuMoveHost {
  /** 動かす もちもの（カーソルも ここ） */
  inventory: Inventory & { setCursor(stack: ItemStack | null): void };
  /** 動かす たんすの マス（コピーしない）。開いていなければ null */
  slots(): TansuSlot[] | null;
  /** 中身を かえた 合図（いっぱいの 印・保存・つくる の 数えなおし） */
  changed(): void;
  onFull?(which: 'inv' | 'tansu'): void;
  /** もちものから たんすへ しまった 数（出来事 `store` 用） */
  onStore?(item: ItemId, count: number): void;
  /** マスを クリックして 手と マスが かわった（持ち上げ元の 目印用）。changed の 前に 呼ぶ */
  onClick?(c: { index: number; curBefore: ItemStack | null; before: TansuSlot; slot: TansuSlot; cur: ItemStack | null }): void;
}

export class TansuMover {
  constructor(private readonly h: TansuMoveHost) {}

  /** マス i をクリック（カーソルで運ぶ。M2 §2.5） */
  click(i: number): boolean {
    const slots = this.h.slots();
    if (!slots || !Number.isInteger(i) || i < 0 || i >= slots.length) return false;
    const inv = this.h.inventory;
    const curBefore = inv.cursor();
    const before = slots[i] ?? null;
    const res = clickRule(before, curBefore);
    if (!res) return false;
    slots[i] = res.slot;
    inv.setCursor(res.cur);
    this.h.onClick?.({ index: i, curBefore, before, slot: res.slot, cur: res.cur });
    this.h.changed();
    return true;
  }

  /** シフトクリック（そのマスのぜんぶを もう片方へ）。from = 'tansu' か 'inv'（もちもののマス）。カーソルに何か持っているときは ふつうのクリック */
  shiftClick(from: 'tansu' | 'inv', i: number): Moved {
    const slots = this.h.slots();
    if (!slots) return { moved: 0, reason: 'closed' };
    const inv = this.h.inventory;
    if (inv.cursor()) {
      if (from === 'tansu') this.click(i);
      else inv.click(i);
      return { moved: 0, reason: null };
    }
    if (from === 'inv') {
      const s = inv.slots()[i];
      if (!s) return { moved: 0, reason: null };
      const moved = this.store(slots, i);
      if (moved === 0) {
        this.h.onFull?.('tansu');
        return { moved: 0, reason: 'full' };
      }
      this.h.changed();
      return { moved, reason: null };
    }
    const s = slots[i];
    if (!s) return { moved: 0, reason: null };
    const left = addStack(inv, s);
    const moved = s.count - left;
    if (moved === 0) {
      this.h.onFull?.('inv');
      return { moved: 0, reason: 'full' };
    }
    slots[i] = left > 0 ? { ...s, count: left } : null;
    this.h.changed();
    return { moved, reason: null };
  }

  /** もちものの マス i の ぜんぶを たんすへ。入らない 分は のこる。しまった 数を 返す */
  private store(slots: TansuSlot[], i: number): number {
    const inv = this.h.inventory;
    const s = inv.slots()[i];
    if (!s) return 0;
    const left = addInto(slots, s.item, s.count, 0, slots.length, s.wear ?? 0, s.water ?? 0, s.power ?? 0, s.plan ?? 0);
    const moved = s.count - left;
    if (moved <= 0) return 0;
    inv.setSlot(i, left > 0 ? { ...s, count: left } : null);
    this.h.onStore?.(s.item, moved);
    return moved;
  }

  /** もちものの マスの うち pred が 通る 物を たんすへ（えらんだ もの を しまう も これ） */
  storeWhere(pred: (i: number, item: ItemId) => boolean): { moved: number; reason: ShiftReason | 'nothing' } {
    const slots = this.h.slots();
    if (!slots) return { moved: 0, reason: 'closed' };
    let moved = 0;
    let tried = 0;
    const mine = this.h.inventory.slots();
    for (let i = 0; i < mine.length; i++) {
      const s = mine[i];
      if (!s || !pred(i, s.item)) continue;
      tried++;
      moved += this.store(slots, i);
    }
    if (moved > 0) this.h.changed();
    else if (tried > 0) {
      this.h.onFull?.('tansu');
      return { moved: 0, reason: 'full' };
    }
    return { moved, reason: moved > 0 || tried === 0 ? null : 'full' };
  }

  /** ぜんぶ しまう: もちもの の上 3 だん（9〜35）。ホットバー と そうび は うごかさない */
  storeAll(): Moved {
    return this.storeWhere((i) => i >= BAG_START) as Moved;
  }

  /** おなじ もの を しまう: たんす に もう ある アイテム と おなじ ものだけ（ホットバー以外） */
  storeSame(): Moved {
    const have = new Set<ItemId>();
    for (const t of this.h.slots() ?? []) if (t) have.add(t.item);
    return this.storeWhere((i, item) => i >= BAG_START && have.has(item)) as Moved;
  }

  /** ぜんぶ とりだす: たんす の中身を もちもの へ（入る分だけ） */
  takeAll(): Moved {
    const slots = this.h.slots();
    if (!slots) return { moved: 0, reason: 'closed' };
    const inv = this.h.inventory;
    let moved = 0;
    let tried = 0;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      tried++;
      const left = addStack(inv, s);
      moved += s.count - left;
      slots[i] = left > 0 ? { ...s, count: left } : null;
    }
    if (moved > 0) this.h.changed();
    else if (tried > 0) {
      this.h.onFull?.('inv');
      return { moved: 0, reason: 'full' };
    }
    return { moved, reason: null };
  }
}
