import type { CraftSystem, Inventory, ItemId, ItemStack, Rarity, ScreenState } from '../contracts';
import type { CraftUiSettings, ToolNumbers } from '../fx/craftConfig';
import { CraftPanel, type FurnaceView, type PanelMaterials } from './craftPanel';
import { EquipPanel, type ArmorUi } from './equipPanel';
import { createSlotEl, paintSlot, type SlotEls } from './hotbar';
import { itemIconUrl } from './itemIcon';
import { Tooltip, type HoverTarget } from './tooltip';
import { buildHintChips } from './inventoryHints';
import { duoPageOf, duoInvSnapshot, type DuoInvPage, type FullPage, type InvLayout } from '../duo/invRules';
import { InvFocus } from '../duo/invFocus';
import { duoPageShown, focusName, mountDuoChrome, type DuoChrome } from './inventoryDuo';
import { PadNav } from './menu/padNav';
import type { FocusDir } from './menu/focusNav';
import { wearSignature } from './wearGauge';
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
  /** LIVE-3: やいた もも にく で もどる 体力 */
  meatHeal?: () => number;
  /** CRAFT-2: たんす の素材（つくる・やく の数え方） */
  materials?: PanelMaterials;
}

/** 画面の 形（COOP-1 4a。'duo' = 2 人の あいだの 半分の 形。§3.3）。ふだんは 全面 */
export type InventoryLayout = InvLayout;

/** もちもの画面の 上のタブ（M6 §2.7）。じっせき のとき パネルぜんたいが じっせき ページになる */
export type InventoryTab = 'items' | 'achievements' | 'log';

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
  /** 上の 帯（タブ・とじる）と 外わく。2 人用の 帯が ここに 入る（COOP-1 4a） */
  readonly head: HTMLDivElement;
  readonly frame: HTMLDivElement;
  /** 2P の 画面だけ: パネルごとの 十字の えらび（§3.3「2P の えらび」。DOM の フォーカスを 使わない） */
  readonly nav: PadNav | null = null;
  private readonly bodyEl: HTMLDivElement;
  private readonly onResize: () => void;
  private layoutNow: InventoryLayout = 'full';
  private pageNow: DuoInvPage = 'items';
  private duoChrome: DuoChrome | null = null;
  /** 1P の えらび = DOM の フォーカス（`duo.inv(1).focus`） */
  private readonly domFocus: InvFocus;
  private sideNow: InventorySide = 'craft';
  private tabNow: InventoryTab = 'items';
  private hintsEl!: HTMLDivElement;
  private hintsKey = '';
  private marker: { active(): boolean; toggle(i: number): void; has(i: number): boolean } | null = null;
  /** たんす の ✓ えらびの口（StorageScreen がつなぐ） */
  setMarker(m: { active(): boolean; toggle(i: number): void; has(i: number): boolean } | null): void {
    this.marker = m;
  }
  /** ✓ が かわったので 描きなおす */
  refresh(): void {
    this.dirty = true;
  }
  private fitSize = '';
  private fitWin = '';
  private pollId = 0;
  private frameObserver: ResizeObserver | null = null;
  private pageSize: { w: number; h: number } | null = null;
  private outside: InventoryOutsideHandlers | null = null;
  private readonly onPointer: (e: MouseEvent) => void;
  private readonly cells: SlotEls[] = [];
  private readonly cursorEl: HTMLDivElement;
  private readonly cursorIcon: HTMLImageElement;
  private readonly cursorCount: HTMLSpanElement;
  private dirty = true;
  private wearSig = 0;
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
    private readonly onClose: () => void,
    private readonly m4?: InventoryM4,
    /** COOP-1 4a: 1 = 今までの 画面（id・マウス・窓の 大きさの 聞き耳あり）、2 = 2P の 画面（id なし・マウスを うけない・いつも 半分） */
    private readonly who: 1 | 2 = 1,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'inv-root';
    this.el.dataset.who = String(who);
    this.el.dataset.page = 'items';
    if (who === 1) this.el.id = 'inventory-screen';
    this.el.hidden = true;
    this.domFocus = new InvFocus({ who: 1, dom: { get: () => this.domName() } });

    this.panel = document.createElement('div');
    this.panel.className = 'inv-panel';

    const head = document.createElement('div');
    head.className = 'inv-head';
    const title = document.createElement('div');
    title.className = 'inv-title';
    title.textContent = 'もちもの・クラフト';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    if (who === 1) this.closeButton.id = 'inventory-close';
    this.closeButton.className = 'inv-close';
    this.closeButton.innerHTML = '<span class="inv-close-x" aria-hidden="true">✕</span><span>とじる</span>';
    this.closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClose();
    });
    head.append(title, this.closeButton);
    this.head = head;

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
        c.root.dataset.menuItem = '';
        c.root.tabIndex = 0;
        c.root.addEventListener('click', (e) => {
          e.stopPropagation();
          // Ctrl（Mac は ⌘）クリック: たんす に しまう ものを えらぶ（✓）
          if ((e.ctrlKey || e.metaKey) && this.marker?.active()) {
            this.marker.toggle(i);
            this.dirty = true;
            return;
          }
          this.inv.click(i);
        });
        c.root.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (this.m4?.armor.equipFromSlot?.(i)) this.dirty = true;
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
      // ツールチップは マウスの 物（2P の 画面には 出さない。§3.3）
      if (who === 1) this.tooltip = new Tooltip(this.el, {
        nameOf: m4.nameOf,
        rarityOf: m4.rarityOf,
        placeable: m4.placeable,
        recipes: () => m4.craft.recipes(),
        tools: m4.tools,
        ui: m4.ui,
        meatHeal: m4.meatHeal,
        isOpen: () => this.open,
        cursorHeld: () => this.inv.cursor() !== null,
        resolve: (t) => this.resolveHover(t),
        resolveStack: (t) => this.resolveHoverStack(t),
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
        materials: m4.materials,
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
    this.hintsEl = document.createElement('div');
    this.hintsEl.className = 'inv-hints';
    this.frame.append(head, body, this.pageSlot, this.hintsEl);
    this.paintHints();
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
    if (who === 2) {
      // 2P の 画面: マウス・キー・窓の 大きさの 聞き耳は つけない。いつも 2 人用の 半分の 形（§3.3）
      this.nav = new PadNav(this.el, focusName);
      this.el.inert = true; // キーでは さわれない（Tab で フォーカスが 来ない）。十字は PadNav が 動かす
      this.onMove = () => undefined;
      this.onPointer = () => undefined;
      this.onResize = () => undefined;
      this.setLayout('duo');
      return;
    }
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
    this.onResize = () => {
      this.fit();
      // 窓の大きさが 反映される のが 遅れる ことが あるので、すぐ後にも もう一度 合わせる
      requestAnimationFrame(() => {
        if (this.open) this.fit();
      });
      window.setTimeout(() => {
        if (this.open) this.fit();
      }, 40);
    };
    window.addEventListener('resize', this.onResize);
    // resize の 知らせが 遅れても、ひらいている あいだは 窓の 大きさを 毎コマ みて すぐ 合わせる（数の くらべだけ）
    const poll = () => {
      this.pollId = requestAnimationFrame(poll);
      if (this.open && `${window.innerWidth}x${window.innerHeight}` !== this.fitWin) this.fit();
    };
    this.pollId = requestAnimationFrame(poll);
    // 窓の大きさで 文字・マスの大きさが 後から かわっても、枠の大きさが かわったら すぐ ちぢめなおす
    if (typeof ResizeObserver !== 'undefined') {
      this.frameObserver = new ResizeObserver(() => {
        if (this.open && `${this.frame.offsetWidth}x${this.frame.offsetHeight}` !== this.fitSize) this.fit();
      });
      this.frameObserver.observe(this.frame);
    }
  }

  /** 小さい画面では パネルぜんたいを 同じ比で ちぢめる（はしから 24px あける。大きい画面は CSS の clamp で大きくなる） */
  private fit(): void {
    const f = this.frame;
    if (this.layoutNow === 'duo') {
      // 2 人用は ちぢめない（マス・ボタン・字は 1 人の ときと 同じ。§3.3）
      f.style.transform = '';
      f.style.removeProperty('--rk-fit');
      // 上は 高さの 12%（メーター・お知らせ）。右上の 時計と かさなる ときは 時計の 下 ＋8px まで 下げる（1P・2P そろえる。§9.8）
      const clock = document.getElementById('clock');
      const cb = clock && !clock.hidden ? clock.getBoundingClientRect().bottom : 0;
      this.el.style.top = `${Math.round(Math.max(window.innerHeight * 0.12, cb > 0 ? cb + 8 : 0))}px`;
      this.fitSize = `${f.offsetWidth}x${f.offsetHeight}`;
      this.fitWin = `${window.innerWidth}x${window.innerHeight}`;
      return;
    }
    const w = f.offsetWidth;
    const h = f.offsetHeight;
    this.fitSize = `${w}x${h}`;
    this.fitWin = `${window.innerWidth}x${window.innerHeight}`;
    if (w === 0 || h === 0) {
      f.style.transform = '';
      return;
    }
    const m = parseFloat(getComputedStyle(this.el).getPropertyValue('--rk-sp-5')) || 24;
    const k = Math.min(1, (window.innerWidth - 2 * m) / w, (window.innerHeight - 2 * m) / h);
    f.style.transform = k < 1 ? `scale(${k})` : '';
    // 押せる物は ちぢめた後でも 見た目 44px 以上にするための 比（CSS の --rk-fit）
    f.style.setProperty('--rk-fit', String(Math.round(k * 100) / 100));
  }

  /** 画面の下に「ここでできる操作」を出す（じっせき タブでは出さない。たんす のときは 文をかえる） */
  private paintHints(): void {
    const tansu = this.sideNow === 'storage';
    const duo = this.layoutNow === 'duo';
    const key = `${this.tabNow}|${tansu}|${duo}`;
    if (key === this.hintsKey) return;
    this.hintsKey = key;
    this.hintsEl.hidden = this.tabNow !== 'items';
    this.hintsEl.replaceChildren(...buildHintChips({ tansu, duo }));
  }

  /** 右の場所を入れかえる（つくる・やく ⇄ たんす）。見た目は style.display だけで切る */
  setSide(side: InventorySide): void {
    this.sideNow = side;
    this.paintHints();
    this.craftSlot.style.display = side === 'craft' ? '' : 'none';
    this.storageSlot.hidden = side !== 'storage';
  }

  side(): InventorySide {
    return this.sideNow;
  }

  /** 上のタブを切りかえる。じっせき のときは パネルぜんたいを pageSlot に入れかえる */
  setTab(tab: InventoryTab): void {
    // じっせき ページは もちもの のときの 中身と同じ大きさにする（はかってから かくす）
    if (tab !== 'items' && this.tabNow === 'items') {
      const w = this.bodyEl.offsetWidth;
      const h = this.bodyEl.offsetHeight;
      if (w > 0 && h > 0) this.pageSize = { w, h };
    }
    if (tab !== 'items' && this.pageSize) {
      this.pageSlot.style.width = `${this.pageSize.w}px`;
      if (tab === 'log') {
        // できごと ページは 7 行が ぜんぶ 見える高さが いる。もちもの の中身より 高いときは 伸ばす（枠ぜんたいは fit() が 縮める）
        this.pageSlot.style.height = 'auto';
        this.pageSlot.style.minHeight = `${this.pageSize.h}px`;
      } else {
        this.pageSlot.style.minHeight = '';
        this.pageSlot.style.height = `${this.pageSize.h}px`;
      }
    }
    this.tabNow = tab;
    this.paintHints();
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
    // 2 人用は わくぜんたいが「パネルの 中」（panel などは 並べるだけで 大きさを もたない）
    const els: HTMLElement[] = this.layoutNow === 'duo' ? [this.frame] : [this.panel, this.craftSlot, this.storageSlot, this.pageSlot];
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

  // ---- COOP-1 4a: 2 人用（§3.3）

  layout(): InventoryLayout {
    return this.layoutNow;
  }

  /** 全面の ページ（タブ「もちもの／じっせき／できごと」と 右の「つくる／たんす」） */
  private fullPage(): FullPage {
    return this.tabNow !== 'items' ? this.tabNow : this.sideNow === 'storage' ? 'storage' : 'items';
  }

  /** 画面の 形を かえる。開いたまま かえても 手に もった 物は そのまま。2 人用に する ときは 全面の ページを 2 人用の ページに うつす（AC79） */
  setLayout(layout: InventoryLayout): void {
    if (layout === this.layoutNow) return;
    if (layout === 'duo') {
      const page = duoPageOf(this.fullPage());
      if (this.tabNow !== 'items') this.setTab('items'); // じっせき・できごと は 2 人用に ない
      this.layoutNow = layout;
      this.el.dataset.layout = 'duo';
      this.el.setAttribute('data-testid', `duo-inv-p${this.who}`);
      this.duoChrome ??= mountDuoChrome(this, this.who, this.onClose);
      this.setPage(duoPageShown(page) ? page : 'items');
    } else {
      this.layoutNow = layout;
      delete this.el.dataset.layout;
      this.el.style.top = '';
      this.el.removeAttribute('data-testid');
      this.frame.style.transform = '';
    }
    this.fitSize = '';
    this.dirty = true;
    this.paintHints();
    if (this.open) this.fit();
  }

  /** 2 人用の ページ（もちもの／つくる。やく・たんす は 4c） */
  page(): DuoInvPage {
    return this.pageNow;
  }

  setPage(page: DuoInvPage): void {
    if (!duoPageShown(page)) return;
    this.pageNow = page;
    this.el.dataset.page = page;
    this.duoChrome?.update();
    // かくれていた「つくる」を 見せたら、せつめいの 分け方を 実際の 大きさで 測りなおす
    if (page === 'craft') this.craftPanel?.relayout();
    this.dirty = true;
    this.nav?.sync();
  }

  /** 「やめる」ゲージ 0〜1（2P の 画面） */
  setQuitGauge(g: number): void {
    this.duoChrome?.setGauge(g);
  }

  /** 1P の えらび: DOM の フォーカスを 名前に した物（この 画面の 中に なければ null） */
  private domName(): string | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && this.el.contains(a) ? focusName(a) : null;
  }

  /** `duo.inv(who)` の 値。2 人用で 開いている ときだけ 中身が ある */
  snapshot(): { open: boolean; page: DuoInvPage | null; focus: string | null } {
    return duoInvSnapshot({ layout: this.layoutNow, open: this.open, page: this.pageNow, focus: this.focusKey() });
  }

  /** いま えらんでいる 物の 名前。1P は DOM の フォーカス、2P は 2P の えらび */
  focusKey(): string | null {
    return this.nav ? this.nav.current() : this.domFocus.current();
  }

  /** 十字 1 回（2P の えらび。1P の フォーカスには さわらない） */
  padMove(dir: FocusDir): void {
    this.nav?.move(dir);
  }

  /** `confirm`（2P の えらび） */
  padPress(): void {
    this.nav?.press();
  }

  update(): void {
    const open = this.screen.inventoryOpen();
    if (open !== this.open) {
      this.open = open;
      this.el.hidden = !open;
      this.dirty = true;
      if (open) {
        // 見せる前に 中身を作ってから 縮める（開いた 1 コマ目から正しい大きさ）
        this.render();
        this.craftPanel?.update();
        this.fit();
        this.nav?.reset();
        if (this.tabNow === 'items') {
          const w = this.bodyEl.offsetWidth;
          const h = this.bodyEl.offsetHeight;
          if (w > 0 && h > 0) this.pageSize = { w, h };
        }
      }
      if (!open) {
        this.tooltip?.hover(null);
        this.nav?.clear();
      }
    }
    if (open && this.layoutNow === 'duo' && `${window.innerWidth}x${window.innerHeight}` !== this.fitWin) this.fit(); // 窓の 大きさ（2P の 画面は 聞き耳を もたない）
    if (open && `${this.frame.offsetWidth}x${this.frame.offsetHeight}` !== this.fitSize) this.fit(); // せつめい などで 大きさが変わったら ちぢめなおす
    if (open) {
      const sig = wearSignature(this.inv.slots());
      if (sig !== this.wearSig) {
        this.wearSig = sig;
        this.dirty = true;
      }
    }
    if (open && this.dirty) {
      this.render();
      this.nav?.tick(); // 描きなおしで 要素が かわっても えらびの わくを 付け直す
    }
    this.craftPanel?.update();
    if (open) {
      this.equip?.update();
      this.tooltip?.update();
      if (this.layoutNow === 'duo' && !this.cursorEl.hidden) this.placeCursor();
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

  /** ツールチップ用（WEAPON-2）: へった 量つきの 中身。持ち物の マスと そうびの マスだけ */
  private resolveHoverStack(t: HoverTarget): ItemStack | null {
    if (typeof t === 'number') return this.inv.slots()[t] ?? null;
    if (t === 'head' || t === 'body' || t === 'arms' || t === 'legs') return this.m4?.armor.equippedStack?.(t) ?? null;
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
      this.cells[i].root.dataset.marked = String(!!this.marker?.active() && this.marker.has(i));
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
    let x = this.mouseX - 24;
    let y = this.mouseY - 24;
    const anchor = this.layoutNow === 'duo' ? this.cursorAnchor() : null;
    if (anchor) {
      // 手に もっている 物は えらんでいる マスの 右上に 出す。パネルの そとへ はみ出さない（§3.3）
      const r = anchor.getBoundingClientRect();
      const f = this.frame.getBoundingClientRect();
      x = Math.min(Math.max(r.right - 24, f.left), f.right - 48);
      y = Math.min(Math.max(r.top - 24, f.top), f.bottom - 48);
    }
    this.cursorEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** 手に もっている 物を 出す 目じるし: 2P は いつも えらんでいる マス。1P は マウスが パネルの そとに ある ときだけ フォーカス */
  private cursorAnchor(): HTMLElement | null {
    if (this.nav) return this.nav.currentEl();
    if (this.isInsidePanels(this.mouseX, this.mouseY)) return null;
    const a = document.activeElement;
    return a instanceof HTMLElement && this.el.contains(a) ? a : null;
  }

  dispose(): void {
    this.off();
    this.craftPanel?.dispose();
    this.tooltip?.dispose();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    this.frameObserver?.disconnect();
    cancelAnimationFrame(this.pollId);
    for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) window.removeEventListener(t, this.onPointer);
    this.el.remove();
  }
}
