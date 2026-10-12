import type { Inventory, ItemStack } from '../contracts';
import { FX_SETTINGS, type FxSettings } from '../fx/config';
import { HOTBAR_SIZE, gainedSlots, hotbarCells, snapshotSlots } from './hotbarModel';
import { itemIconUrl } from './itemIcon';
import './hotbar.css';

export interface SlotEls {
  root: HTMLDivElement;
  icon: HTMLImageElement;
  count: HTMLSpanElement;
}

/** マス 1 つ分の DOM（ホットバーともちもの画面で同じ形） */
export function createSlotEl(keyLabel?: string): SlotEls {
  const root = document.createElement('div');
  root.className = 'slot';
  const icon = document.createElement('img');
  icon.className = 'slot-icon';
  icon.alt = '';
  icon.hidden = true;
  const count = document.createElement('span');
  count.className = 'slot-count';
  if (keyLabel) {
    const key = document.createElement('span');
    key.className = 'slot-key';
    key.textContent = keyLabel;
    root.append(key);
  }
  root.append(icon, count);
  return { root, icon, count };
}

/** マスの中身を絵と数に反映する（数は 2 こ以上のときだけ） */
export function paintSlot(els: SlotEls, stack: ItemStack | null): void {
  if (stack) {
    const url = itemIconUrl(stack.item);
    if (els.icon.getAttribute('src') !== url) els.icon.src = url;
    els.icon.hidden = false;
    els.root.dataset.item = stack.item;
    els.count.textContent = stack.count >= 2 ? String(stack.count) : '';
  } else {
    els.icon.hidden = true;
    delete els.root.dataset.item;
    els.count.textContent = '';
  }
}

/** ぽよん（Web Animations。使えない環境では何もしない） */
export function popElement(el: HTMLElement, cfg: FxSettings = FX_SETTINGS): void {
  if (typeof el.animate !== 'function') return;
  const base = el.dataset.selected === 'true' ? 1.12 : 1;
  const big = base * cfg.slotPopScale;
  el.animate(
    [
      { transform: `scale(${base})` },
      { transform: `scale(${big})`, offset: 0.35 },
      { transform: `scale(${base * 0.94})`, offset: 0.7 },
      { transform: `scale(${base})` },
    ],
    { duration: cfg.slotPopSeconds * 1000, easing: 'ease-out' },
  );
}

/**
 * 画面の下の真ん中のホットバー（9 マス）。
 * マスをえらぶと名前を出し、アイテムが入ると「ぽよん」と +1 と飛んでくる絵を出す。
 */
export class Hotbar {
  readonly el: HTMLDivElement;
  private readonly cells: SlotEls[] = [];
  private dirty = true;
  private lastSelected = -1;
  private snapshot: Array<ItemStack | null> = [];
  private readonly names = new Map<string, string>();
  private readonly off: () => void;

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
    private readonly notice: { showName(text: string): void },
    private readonly cfg: FxSettings = FX_SETTINGS,
  ) {
    for (const t of inv.itemTypes()) this.names.set(t.id, t.name);
    this.el = document.createElement('div');
    this.el.id = 'hotbar';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const c = createSlotEl(String(i + 1));
      c.root.dataset.index = String(i);
      this.cells.push(c);
      this.el.append(c.root);
    }
    parent.append(this.el);
    this.off = inv.onChange(() => (this.dirty = true));
    this.snapshot = snapshotSlots(inv.slots());
    this.render();
    this.lastSelected = inv.selected();
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  /** 毎ステップ呼ぶ */
  update(): void {
    const sel = this.inv.selected();
    if (sel !== this.lastSelected) {
      this.lastSelected = sel;
      this.dirty = true;
      const held = this.inv.slots()[sel];
      if (held) this.notice.showName(this.names.get(held.item) ?? '');
    }
    if (this.dirty) this.render();
  }

  private render(): void {
    this.dirty = false;
    const slots = this.inv.slots();
    const view = hotbarCells(slots, this.inv.selected());
    for (const v of view) {
      const c = this.cells[v.index];
      paintSlot(c, slots[v.index] ?? null);
      c.root.dataset.selected = String(v.selected);
    }
    this.snapshot = snapshotSlots(slots);
  }

  /** アイテムが 1 こ入った（この変化は、まだ描きなおす前に呼ぶ） */
  pickup(item: string, count = 1): void {
    const gained = gainedSlots(this.snapshot, this.inv.slots()).filter(
      (i) => this.inv.slots()[i]?.item === item,
    );
    for (const i of gained) {
      const root = this.cells[i].root;
      popElement(root, this.cfg);
      this.flyIn(item, root, count);
    }
  }

  private flyIn(item: string, target: HTMLElement, count: number): void {
    if (typeof target.animate !== 'function') return;
    const r = target.getBoundingClientRect();
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const sx = window.innerWidth / 2;
    const sy = window.innerHeight / 2;
    const ms = this.cfg.flySeconds * 1000;
    const img = document.createElement('img');
    img.className = 'fly-item';
    img.src = itemIconUrl(item as never);
    this.el.parentElement?.append(img);
    const a = img.animate(
      [
        { transform: `translate(${sx - 24}px, ${sy - 24}px) scale(1.2)`, opacity: 1 },
        { transform: `translate(${tx - 24}px, ${ty - 24}px) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: ms, easing: 'ease-in' },
    );
    a.onfinish = () => img.remove();
    const plus = document.createElement('div');
    plus.className = 'plus-one';
    plus.textContent = `+${count}`;
    this.el.parentElement?.append(plus);
    const b = plus.animate(
      [
        { transform: `translate(${tx - 12}px, ${r.top - 8}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${tx - 12}px, ${r.top - 34}px) scale(1.2)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${tx - 12}px, ${r.top - 50}px) scale(1)`, opacity: 0 },
      ],
      { duration: ms * 1.6, easing: 'ease-out' },
    );
    b.onfinish = () => plus.remove();
  }

  dispose(): void {
    this.off();
    this.el.remove();
  }
}
