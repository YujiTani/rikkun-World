import type { CraftSystem, Inventory, ItemId, Rarity, ScreenState } from '../contracts';
import type { CraftUiSettings, ToolNumbers } from '../fx/craftConfig';
import { CraftPanel, type FurnaceView } from './craftPanel';
import { EquipPanel, type ArmorUi } from './equipPanel';
import { createSlotEl, paintSlot, type SlotEls } from './hotbar';
import { itemIconUrl } from './itemIcon';
import { Tooltip, type HoverTarget } from './tooltip';
import './inventoryScreen.css';

/** M4: つくる/やく の場所・そうびのマス・ツールチップのために要るもの（無ければ M3 までの形） */
export interface InventoryM4 {
  craft: CraftSystem;
  armor: ArmorUi;
  furnaces?: FurnaceView;
  nameOf(item: ItemId): string;
  rarityOf(item: ItemId): Rarity;
  placeable(item: ItemId): boolean;
  /** 「もちもの が いっぱい」の合図 */
  onFull?(): void;
  tools?: ToolNumbers;
  ui?: CraftUiSettings;
}

/** もちもの画面の 上のタブ（M6 §2.7）。じっせき のとき パネルぜんたいが じっせき ページになる */
export type InventoryTab = 'items' | 'achievements';

/** 右の場所に出すもの（M6）: つくる・やく か、たんす（§2.9） */
export type InventorySide = 'craft' | 'storage';

/**
 * パネルの外の マウスの口（M6 §2.8。D の ドラッグでの すてる が使う）。
 * inside = マウスが パネル（持ち物・右の場所・じっせき ページ）の中か。
 */
export interface InventoryOutsideHandlers {
  down?(e: MouseEvent, inside: boolean): void;
  move?(e: MouseEvent, inside: boolean): void;
  up?(e: MouseEvent, inside: boolean): void;
}

/** もちもの画面のマスの並び: 上の 3 段 = マス 9〜35、少しあけて下の 1 段 = マス 0〜8 */
export function inventoryLayout(): { bag: number[][]; hotbar: number[] } {
  const bag: number[][] = [];
  for (let r = 0; r < 3; r++) bag.push(Array.from({ length: 9 }, (_, c) => 9 + r * 9 + c));
  return { bag, hotbar: Array.from({ length: 9 }, (_, c) => c) };
}

/**
 * もちもの画面（E で開く）。マスのクリックは inventory.click(i) を呼ぶ。
 * 「とじる」ボタンは onClose を呼ぶ（閉じる処理は画面の状態の持ち主がする）。
 * 毎ステップ（または毎フレーム）update() を呼ぶ。
 */
export class InventoryScreen {
  readonly el: HTMLDivElement;
  readonly panel: HTMLDivElement;
  readonly closeButton: HTMLButtonElement;
  /**
   * M6 の差しこみ口（中身は 担当が入れる。空のあいだは 何も見えない）:
   * - tabsEl: 上のタブ（もちもの／じっせき。A が入れる。場所は S2 が決める）
   * - craftSlot: 右の「つくる・やく」の場所（今の M4 の CraftPanel。A）
   * - storageSlot: 右の「たんす」の場所（D。ふだんは かくれている）
   * - pageSlot: じっせき ページ（C。ふだんは かくれている）
   */
  readonly tabsEl: HTMLDivElement;
  readonly craftSlot: HTMLDivElement;
  readonly storageSlot: HTMLDivElement;
  readonly pageSlot: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly frame: HTMLDivElement;
  private readonly onResize: () => void;
  private sideNow: InventorySide = 'craft';
  private tabNow: InventoryTab = 'items';
  private outside: InventoryOutsideHandlers | null = null;
  private readonly onPointer: (e: MouseEvent) => void;
  private readonly cells: SlotEls[] = [];
  private readonly cursorEl: HTMLDivElement;
  private readonly cursorIcon: HTMLImageElement;
  private readonly cursorCount: HTMLSpanElement;
  private dirty = true;
  private open = false;
  private mouseX = 0;
  private mouseY = 0;
  readonly craftPanel: CraftPanel | null = null;
  readonly equip: EquipPanel | null = null;
  readonly tooltip: Tooltip | null = null;
  private readonly off: () => void;
  private readonly onMove: (e: MouseEvent) => void;

  constructor(
    parent: HTMLElement,
    private readonly inv: Inventory,
    private readonly screen: ScreenState,
    onClose: () => void,
    private readonly m4?: InventoryM4,
  ) {
    this.el = document.createElement('div');
    this.el.id = 'inventory-screen';
    this.el.hidden = true;

    this.panel = document.createElement('div');
    this.panel.className = 'inv-panel';

    const head = document.createElement('div');
    head.className = 'inv-head';
    const title = document.createElement('div');
    title.className = 'inv-title';
    title.textContent = 'もちもの';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.id = 'inventory-close';
    this.closeButton.className = 'inv-close';
    this.closeButton.innerHTML = '<span class="inv-close-x" aria-hidden="true">✕</span><span>とじる</span>';
    this.closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      onClose();
    });
    head.append(title, this.closeButton);

    const layout = inventoryLayout();
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    const makeRow = (indices: number[], cls: string) => {
      const row = document.createElement('div');
      row.className = `inv-row ${cls}`;
      for (const i of indices) {
        const c = createSlotEl();
        c.root.classList.add('inv-slot');
        c.root.dataset.index = String(i);
        c.root.addEventListener('click', (e) => {
          e.stopPropagation();
          this.inv.click(i);
        });
        c.root.addEventListener('mouseenter', () => this.tooltip?.hover(i));
        c.root.addEventListener('mouseleave', () => this.tooltip?.hover(null));
        this.cells[i] = c;
        row.append(c.root);
      }
      return row;
    };
    for (const r of layout.bag) grid.append(makeRow(r, 'inv-bag'));
    const gap = document.createElement('div');
    gap.className = 'inv-gap';
    grid.append(gap, makeRow(layout.hotbar, 'inv-hot'));

    // 右側は M4 の「つくる」「やく」の場所
    const side = document.createElement('div');
    side.className = 'inv-side';
    const main = document.createElement('div');
    main.className = 'inv-main';
    if (m4) {
      const hover = (t: HoverTarget | null) => this.tooltip?.hover(t);
      this.tooltip = new Tooltip(this.el, {
        nameOf: m4.nameOf,
        rarityOf: m4.rarityOf,
        placeable: m4.placeable,
        recipes: () => m4.craft.recipes(),
        tools: m4.tools,
        ui: m4.ui,
        isOpen: () => this.open,
        cursorHeld: () => this.inv.cursor() !== null,
        resolve: (t) => this.resolveHover(t),
      });
      this.equip = new EquipPanel(m4.armor, hover);
      this.craftPanel = new CraftPanel(side, {
        craft: m4.craft,
        inv,
        isOpen: () => this.open,
        nameOf: m4.nameOf,
        furnaces: m4.furnaces,
        hover,
        slotElFor: (item) => this.slotElFor(item),
        onFull: m4.onFull,
        cfg: m4.ui,
      });
      main.append(this.equip.el);
    }
    main.append(grid);
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'inv-tabs';
    this.panel.append(main);
    // 大きな 1 まいのパネル（わく）: 上に タブ（A が入れる）と とじる、中に 持ち物・つくる・せつめい
    this.frame = document.createElement('div');
    this.frame.className = 'inv-frame';
    head.prepend(this.tabsEl);
    const body = document.createElement('div');
    body.className = 'inv-body';
    this.craftSlot = side;
    this.storageSlot = document.createElement('div');
    this.storageSlot.className = 'inv-storage';
    this.storageSlot.hidden = true;
    body.append(this.panel, side, this.storageSlot);
    this.bodyEl = body;
    this.pageSlot = document.createElement('div');
    this.pageSlot.className = 'inv-page';
    this.pageSlot.hidden = true;
    this.frame.append(head, body, this.pageSlot);
    this.el.append(this.frame);

    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'inv-cursor';
    this.cursorEl.hidden = true;
    this.cursorIcon = document.createElement('img');
    this.cursorIcon.alt = '';
    this.cursorCount = document.createElement('span');
    this.cursorCount.className = 'slot-count';
    this.cursorEl.append(this.cursorIcon, this.cursorCount);
    this.el.append(this.cursorEl);

    parent.append(this.el);
    this.off = inv.onChange(() => (this.dirty = true));
    this.onMove = (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.placeCursor();
    };
    window.addEventListener('mousemove', this.onMove);
    this.onPointer = (e) => {
      if (!this.open || !this.outside) return;
      const h = e.type === 'mousedown' ? this.outside.down : e.type === 'mouseup' ? this.outside.up : this.outside.move;
      h?.(e, this.isInsidePanels(e.clientX, e.clientY));
    };
    for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) window.addEventListener(t, this.onPointer);
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
  }

  /** 小さい画面では パネルぜんたいを 同じ比で ちぢめる（はしから 24px あける。大きい画面は CSS の clamp で大きくなる） */
  private fit(): void {
    const f = this.frame;
    f.style.transform = '';
    const w = f.offsetWidth;
    const h = f.offsetHeight;
    if (w === 0 || h === 0) return;
    const m = parseFloat(getComputedStyle(this.el).getPropertyValue('--rk-sp-5')) || 24;
    const k = Math.min(1, (window.innerWidth - 2 * m) / w, (window.innerHeight - 2 * m) / h);
    f.style.transform = k < 1 ? `scale(${k})` : '';
  }

  /** 右の場所を入れかえる（つくる・やく ⇄ たんす）。見た目は style.display だけで切る */
  setSide(side: InventorySide): void {
    this.sideNow = side;
    this.craftSlot.style.display = side === 'craft' ? '' : 'none';
    this.storageSlot.hidden = side !== 'storage';
  }

  side(): InventorySide {
    return this.sideNow;
  }

  /** 上のタブを切りかえる。じっせき のときは パネルぜんたいを pageSlot に入れかえる */
  setTab(tab: InventoryTab): void {
    this.tabNow = tab;
    this.bodyEl.style.display = tab === 'items' ? '' : 'none';
    this.pageSlot.hidden = tab === 'items';
  }

  tab(): InventoryTab {
    return this.tabNow;
  }

  /** パネルの外のマウスの口（なしにするときは null） */
  setOutsideHandlers(h: InventoryOutsideHandlers | null): void {
    this.outside = h;
  }

  /** その画面の位置が パネル（持ち物・右の場所・じっせき ページ）の中か */
  isInsidePanels(x: number, y: number): boolean {
    const els: HTMLElement[] = [this.panel, this.craftSlot, this.storageSlot, this.pageSlot];
    for (const el of els) {
      if (el.hidden || el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  isOpen(): boolean {
    return this.open;
  }

  update(): void {
    const open = this.screen.inventoryOpen();
    if (open !== this.open) {
      this.open = open;
      this.el.hidden = !open;
      this.dirty = true;
      if (open) this.fit();
      if (!open) this.tooltip?.hover(null);
    }
    if (open && this.dirty) this.render();
    this.craftPanel?.update();
    if (open) {
      this.equip?.update();
      this.tooltip?.update();
    }
  }

  /** ツールチップ用: 合わせた場所にあるアイテム */
  private resolveHover(t: HoverTarget): ItemId | null {
    if (typeof t === 'number') return this.inv.slots()[t]?.item ?? null;
    if (t === 'head' || t === 'body' || t === 'arms' || t === 'legs') return this.m4?.armor.equipped(t) ?? null;
    const [kind, a, b] = t.split(':');
    if (kind === 'card') return this.m4?.craft.recipes().find((r) => r.id === a)?.output.item ?? null;
    if (kind === 'material') return (b as ItemId) || null;
    if (kind === 'fuel') return (a as ItemId) || null;
    return null;
  }

  /** できたものが入ったマス（飛んでいく先） */
  private slotElFor(item: ItemId): HTMLElement | null {
    const slots = this.inv.slots();
    for (let i = 0; i < this.cells.length; i++) if (slots[i]?.item === item) return this.cells[i].root;
    return null;
  }

  private render(): void {
    this.dirty = false;
    const slots = this.inv.slots();
    const sel = this.inv.selected();
    for (let i = 0; i < this.cells.length; i++) {
      paintSlot(this.cells[i], slots[i] ?? null);
      this.cells[i].root.dataset.selected = String(i === sel);
    }
    const cur = this.inv.cursor();
    this.cursorEl.hidden = !cur;
    if (cur) {
      this.cursorIcon.src = itemIconUrl(cur.item);
      this.cursorCount.textContent = cur.count >= 2 ? String(cur.count) : '';
      this.placeCursor();
    }
  }

  private placeCursor(): void {
    this.cursorEl.style.transform = `translate(${this.mouseX - 24}px, ${this.mouseY - 24}px)`;
  }

  dispose(): void {
    this.off();
    this.craftPanel?.dispose();
    this.tooltip?.dispose();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) window.removeEventListener(t, this.onPointer);
    this.el.remove();
  }
}
