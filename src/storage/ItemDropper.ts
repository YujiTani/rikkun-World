import type { ArmorSlot, ItemStack, StorageEvent } from '../contracts';
import type { Action, ActionState } from '../input/actions';

/** すてる元: 持ち物のマス番号・そうびのマス・たんす のマス（`tansu:<i>`） */
export type DragTarget = number | ArmorSlot | `tansu:${number}`;

export interface DropperDeps {
  inventory: {
    held(): ItemStack | null;
    selected(): number;
    cursor(): ItemStack | null;
    setCursor(stack: ItemStack | null): void;
    takeFromSlot(index: number, all: boolean): ItemStack | null;
  };
  storage?: { takeFromSlot(i: number, all: boolean): ItemStack | null };
  armor?: { equipped(slot: ArmorSlot): unknown; click?(slot: ArmorSlot): void };
  /** 1 つ 投げる（DropField.throwItem に yaw と目の高さを渡す） */
  throwItem: (stack: ItemStack) => void;
  tick?: () => number;
  /** 投げたとき（音「ポイッ」と人形の `throw`）。つなぎ込みがつなぐ */
  onThrown?: () => void;
}

const ARMOR_SLOTS: readonly string[] = ['head', 'body', 'arms', 'legs'];

/** ものを すてる（M6 §2.8）。持ち物から取り出して 投げて、「すてた」出来事を残す */
export class ItemDropper {
  private events: StorageEvent[] = [];
  constructor(private readonly d: DropperDeps) {}

  private throwOut(stack: ItemStack): boolean {
    this.d.throwItem(stack);
    this.events.push({ type: 'drop', tick: this.d.tick?.() ?? 0, item: stack.item, count: stack.count });
    this.d.onThrown?.();
    return true;
  }

  /** あそんでいるとき: えらんでいるホットバーのマスから 1 こ（all ならぜんぶ）。手が空なら何もしない */
  dropHeld(all: boolean): boolean {
    const inv = this.d.inventory;
    if (!inv.held()) return false;
    const st = inv.takeFromSlot(inv.selected(), all);
    return st ? this.throwOut(st) : false;
  }

  /** もちもの画面: そのマスから すてる */
  dropTarget(t: DragTarget, all: boolean): boolean {
    const inv = this.d.inventory;
    if (typeof t === 'number') {
      const st = inv.takeFromSlot(t, all);
      return st ? this.throwOut(st) : false;
    }
    if (t.startsWith('tansu:')) {
      const st = this.d.storage?.takeFromSlot(Number(t.slice(6)), all) ?? null;
      return st ? this.throwOut(st) : false;
    }
    if (ARMOR_SLOTS.includes(t) && this.d.armor?.click && !inv.cursor() && this.d.armor.equipped(t as ArmorSlot)) {
      this.d.armor.click(t as ArmorSlot); // 着ているものを カーソルへ
      return this.dropCursor();
    }
    return false;
  }

  /** カーソルに持っているものを ぜんぶ すてる */
  dropCursor(): boolean {
    const cur = this.d.inventory.cursor();
    if (!cur) return false;
    this.d.inventory.setCursor(null);
    return this.throwOut(cur);
  }

  /** C の記録へ（呼ぶと空） */
  drainEvents(): StorageEvent[] {
    if (this.events.length === 0) return NO_EVENTS;
    const out = this.events;
    this.events = [];
    return out;
  }
}
const NO_EVENTS: StorageEvent[] = [];

export interface DropControllerDeps {
  actions: Pick<ActionState, 'wasPressed'>;
  dropper: ItemDropper;
  /** あそべる（ロック中でもちもの画面でもない）か */
  playEnabled: () => boolean;
  inventoryOpen: () => boolean;
  /** もちもの画面で マウスが合っているマス */
  hover: () => DragTarget | null;
}

/** Action `drop`・`dropStack` を読む。押した瞬間に 1 回だけ（`wasPressed`）。毎ステップ update() を呼ぶ */
export class DropController {
  constructor(private readonly d: DropControllerDeps) {}
  update(): void {
    const stack = this.d.actions.wasPressed('dropStack' as Action);
    const one = this.d.actions.wasPressed('drop' as Action);
    if (!stack && !one) return;
    const all = stack; // Shift＋Q のときは drop は出ない
    if (this.d.inventoryOpen()) {
      const t = this.d.hover();
      if (t !== null) this.d.dropper.dropTarget(t, all);
    } else if (this.d.playEnabled()) this.d.dropper.dropHeld(all);
  }
}
