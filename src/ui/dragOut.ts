import type { ArmorSlot } from '../contracts';
import type { DragTarget, ItemDropper } from '../storage/ItemDropper';
import './dragOut.css';

/** ドラッグが始まる動き（px。M6 §2.8 (2)） */
export const DRAG_START_PX = 8;

/** もちもの画面の口（InventoryScreen が合う） */
export interface DragOutHost {
  el: HTMLElement;
  setOutsideHandlers(h: { down?(e: MouseEvent, inside: boolean): void; move?(e: MouseEvent, inside: boolean): void; up?(e: MouseEvent, inside: boolean): void } | null): void;
}

export interface DragOutDeps {
  inventory: { cursor(): unknown; click(i: number): void; returnCursor(): void; slots(): ReadonlyArray<unknown> };
  dropper: ItemDropper;
  /** たんす のマス。開いているときだけ */
  storage?: { openSlots(): ReadonlyArray<unknown> | null; click(i: number): boolean; shiftClick(from: 'tansu' | 'inv', i: number): unknown };
  armor?: { equipped(slot: ArmorSlot): unknown; click?(slot: ArmorSlot): void };
  /** 持ち物のマスを シフトクリック（たんす が開いていれば たんす へ。無ければ ホットバー ⇄ ふくろ） */
  shiftMove: (index: number) => void;
}

const ARMOR: readonly string[] = ['head', 'body', 'arms', 'legs'];

/** 要素から「すてる元」を読む（持ち物のマス・そうび・たんす のマス） */
export function targetOf(el: EventTarget | null): DragTarget | null {
  if (!(el instanceof Element)) return null;
  const t = el.closest('[data-tansu]') as HTMLElement | null;
  if (t) return `tansu:${Number(t.dataset.tansu)}`;
  const e = el.closest('[data-slot]') as HTMLElement | null;
  if (e && ARMOR.includes(e.dataset.slot ?? '')) return e.dataset.slot as ArmorSlot;
  const i = el.closest('[data-index]') as HTMLElement | null;
  if (i) return Number(i.dataset.index);
  return null;
}

/**
 * ドラッグでパネルの外へ出して すてる・シフトクリック・マウスが合っているマスの記録（Q 用）。
 * 押して 8px 以上 動かすとドラッグ（カーソルに何か持っているときはならない）。
 */
export class DragOut {
  private readonly overlay: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private pending: { target: DragTarget; x: number; y: number } | null = null;
  private dragging: DragTarget | null = null;
  private hovered: DragTarget | null = null;
  private swallow = false;
  private watch: MutationObserver | null = null;
  private readonly onOver = (e: MouseEvent) => {
    this.hovered = targetOf(e.target);
  };
  private readonly onClickCapture = (e: MouseEvent) => {
    if (this.swallow) {
      this.swallow = false;
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (!e.shiftKey || this.d.inventory.cursor()) return;
    const t = targetOf(e.target);
    if (typeof t === 'number') {
      e.stopPropagation();
      e.preventDefault();
      this.d.shiftMove(t);
    }
  };

  constructor(
    private readonly host: DragOutHost,
    private readonly d: DragOutDeps,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'rk-dragout';
    this.chip = document.createElement('div');
    this.chip.className = 'rk-chip rk-chip--ng rk-dragout__chip';
    this.chip.textContent = 'すてる';
    this.chip.hidden = true;
    host.el.prepend(this.overlay);
    host.el.append(this.chip);
    host.setOutsideHandlers({
      down: (e, inside) => this.down(e, inside),
      move: (e, inside) => this.move(e, inside),
      up: (e, inside) => this.up(e, inside),
    });
    window.addEventListener('mouseover', this.onOver);
    // 画面を閉じた（hidden になった）ら合っていたマスを忘れる
    if (typeof MutationObserver !== 'undefined') {
      this.watch = new MutationObserver(() => {
        if (host.el.hidden) this.hovered = null;
      });
      this.watch.observe(host.el, { attributes: true, attributeFilter: ['hidden'] });
    }
    window.addEventListener('click', this.onClickCapture, true);
  }

  /** マウスが合っているマス（Q・Shift＋Q の元） */
  hoverTarget(): DragTarget | null {
    // 画面が閉じているあいだは、前に合っていたマスを返さない（見えないマスをすてない）
    if (this.host.el.hidden) this.hovered = null;
    return this.hovered;
  }

  isDragging(): boolean {
    return this.dragging !== null;
  }

  private hasItem(t: DragTarget): boolean {
    const d = this.d;
    if (typeof t === 'number') return d.inventory.slots()[t] != null;
    if (t.startsWith('tansu:')) return d.storage?.openSlots()?.[Number(t.slice(6))] != null;
    return !!d.armor?.equipped(t as ArmorSlot);
  }

  private down(e: MouseEvent, inside: boolean): void {
    this.pending = null;
    if (e.button !== 0 || !inside || e.shiftKey || this.d.inventory.cursor()) return;
    const t = targetOf(e.target);
    if (t !== null && this.hasItem(t)) this.pending = { target: t, x: e.clientX, y: e.clientY };
  }

  private lift(t: DragTarget): void {
    if (typeof t === 'number') this.d.inventory.click(t);
    else if (t.startsWith('tansu:')) this.d.storage?.click(Number(t.slice(6)));
    else this.d.armor?.click?.(t as ArmorSlot);
  }

  private place(t: DragTarget): void {
    this.lift(t); // クリックと同じ決まり
  }

  private move(e: MouseEvent, inside: boolean): void {
    if (this.pending && !this.dragging && Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y) >= DRAG_START_PX) {
      this.dragging = this.pending.target;
      this.pending = null;
      this.lift(this.dragging);
      if (!this.d.inventory.cursor()) this.dragging = null;
      else this.overlay.classList.add('is-on');
    }
    if (this.dragging) {
      this.chip.hidden = inside;
      if (!inside) this.chip.style.transform = `translate(${e.clientX + 24}px, ${e.clientY + 32}px)`;
    }
  }

  private up(e: MouseEvent, inside: boolean): void {
    this.pending = null;
    if (!this.dragging) return;
    this.dragging = null;
    this.overlay.classList.remove('is-on');
    this.chip.hidden = true;
    this.swallow = true;
    setTimeout(() => (this.swallow = false), 0);
    if (!inside) {
      this.d.dropper.dropCursor();
      return;
    }
    const t = targetOf(document.elementFromPoint(e.clientX, e.clientY));
    if (t !== null) this.place(t);
    else this.d.inventory.returnCursor();
  }

  dispose(): void {
    this.host.setOutsideHandlers(null);
    this.watch?.disconnect();
    window.removeEventListener('mouseover', this.onOver);
    window.removeEventListener('click', this.onClickCapture, true);
    this.overlay.remove();
    this.chip.remove();
  }
}
