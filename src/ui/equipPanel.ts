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
  unequipToBag?(slot: ArmorSlot): boolean;
  equipFromSlot?(i: number): boolean;
}

/** そうびのマス 4 つ（あたま・からだ・うで・あし）。持ち物の上に 横 1 列で出す（M6 §3.6 (2)。M4 の人形のわくから 変えた） */
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
      c.root.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.armor.unequipToBag?.(slot);
      });
      c.root.addEventListener('mouseenter', () => this.hover?.(slot));
      c.root.addEventListener('mouseleave', () => this.hover?.(null));
      return c;
    };
    this.cells = { head: mk('head', 'あたま'), body: mk('body', 'からだ'), arms: mk('arms', 'うで'), legs: mk('legs', 'あし') };
    // 左から あたま・からだ・うで・あし。マスの下に 小さな 部位の印（文字 16px）
    const labels: Record<ArmorSlot, string> = { head: 'あたま', body: 'からだ', arms: 'うで', legs: 'あし' };
    for (const slot of ['head', 'body', 'arms', 'legs'] as ArmorSlot[]) {
      const cell = document.createElement('div');
      cell.className = 'equip-cell';
      const mark = document.createElement('div');
      mark.className = 'equip-label';
      mark.textContent = labels[slot];
      cell.append(this.cells[slot].root, mark);
      doll.append(cell);
    }
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
