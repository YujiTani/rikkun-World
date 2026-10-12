import type { ArmorSlot, ArmorSystem } from '../contracts';
import { createSlotEl, paintSlot, type SlotEls } from './hotbar';
import './equipPanel.css';

/**
 * そうびを使う口。`click` は「もちもの画面のマスのクリック」と同じやり方
 * （M2 §2.5: カーソルのものが合えば入れて、前のものがカーソルへ。空なら取り出す）。
 * 実装は A（ArmorSystem）が `click(slot)` として足す。
 */
export interface ArmorUi extends ArmorSystem {
  click?(slot: ArmorSlot): void;
}

/** そうびのマス 4 つ（あたま・からだ・うで・あし）。人形の形のわくで、ホットバーの左に出す（M4 §2.7） */
export class EquipPanel {
  readonly el: HTMLDivElement;
  private readonly cells: Record<ArmorSlot, SlotEls>;

  constructor(
    private readonly armor: ArmorUi,
    private readonly hover?: (target: string | null) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'equip-panel';
    const doll = document.createElement('div');
    doll.className = 'equip-doll';
    const mk = (slot: ArmorSlot, label: string): SlotEls => {
      const c = createSlotEl();
      c.root.classList.add('inv-slot', 'equip-slot');
      c.root.dataset.slot = slot;
      c.root.title = label;
      c.root.addEventListener('click', (e) => {
        e.stopPropagation();
        this.click(slot);
      });
      c.root.addEventListener('mouseenter', () => this.hover?.(slot));
      c.root.addEventListener('mouseleave', () => this.hover?.(null));
      return c;
    };
    this.cells = { head: mk('head', 'あたま'), body: mk('body', 'からだ'), arms: mk('arms', 'うで'), legs: mk('legs', 'あし') };
    doll.append(this.cells.head.root, this.cells.arms.root, this.cells.body.root, this.cells.legs.root);
    this.el.append(doll);
    this.update();
  }

  click(slot: ArmorSlot): void {
    this.armor.click?.(slot);
  }

  slotEl(slot: ArmorSlot): HTMLElement {
    return this.cells[slot].root;
  }

  /** 着ているものを絵にする */
  update(): void {
    for (const slot of ['head', 'body', 'arms', 'legs'] as ArmorSlot[]) {
      const item = this.armor.equipped(slot);
      paintSlot(this.cells[slot], item ? { item, count: 1 } : null);
    }
  }
}
