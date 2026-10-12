import type { CraftSystem, Inventory, ItemId, Recipe, Vec3 } from '../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';
import { FURNACE_MOUTH } from '../world/blocks/textures';
import { buildCards, nextFuel, type CardView, type MaterialView } from './craftModel';
import { drawPixels, itemIconPixels, itemIconUrl } from './itemIcon';
import './craftPanel.css';

/** 開いている かまど の中（A の `furnace.get` と同じ形） */
export interface FurnaceState {
  burning: boolean;
  current: { id: string; progress: number } | null;
  queue: string[];
  done: { item: ItemId; count: number }[];
}

/** かまど の中を読む口（A の実装がこの形で出す） */
export interface FurnaceView {
  get(x: number, y: number, z: number): FurnaceState | null;
}

export type CraftTab = 'craft' | 'bake';

export interface CraftUiState {
  panelVisible: boolean;
  tab: CraftTab;
  tabs: CraftTab[];
  cards: { id: string; glowing: boolean; redItems: ItemId[] }[];
  bakeCards: { id: string; glowing: boolean; redItems: ItemId[]; queued: number }[];
  hintVisible: boolean;
}

export type CraftClickResult = { ok: boolean; reason: string | null };

export interface CraftPanelDeps {
  craft: CraftSystem;
  inv: Pick<Inventory, 'count' | 'onChange'>;
  /** もちもの画面が開いているか */
  isOpen(): boolean;
  nameOf(item: ItemId): string;
  furnaces?: FurnaceView;
  /** マウスを合わせた（ツールチップ）。null で外れた */
  hover?(target: string | null): void;
  /** できたものが入ったマス（飛んでいく先）。無ければ飛ばさない */
  slotElFor?(item: ItemId): HTMLElement | null;
  /** 「もちもの が いっぱい」の合図 */
  onFull?(): void;
  cfg?: CraftUiSettings;
}

interface CardEls {
  root: HTMLDivElement;
  icon: HTMLImageElement;
  count: HTMLSpanElement;
  mats: HTMLDivElement;
  matEls: { chip: HTMLDivElement; icon: HTMLImageElement; dots: HTMLSpanElement[] }[];
  name: HTMLDivElement;
  queue: HTMLSpanElement;
  bar: HTMLDivElement;
  barFill: HTMLDivElement;
}

const DOT_SHOW_MAX = 8;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

/** ふるえる（Web Animations。使えない環境では何もしない） */
function shake(e: HTMLElement): void {
  if (typeof e.animate !== 'function') return;
  e.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 220 },
  );
}

/** ぽよん */
function poyon(e: HTMLElement): void {
  if (typeof e.animate !== 'function') return;
  e.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.4 }, { transform: 'scale(0.96)', offset: 0.75 }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' },
  );
}

/** 画面の 2 点のあいだを絵が飛ぶ */
function fly(icon: string, from: DOMRect, to: DOMRect, ms: number, parent: HTMLElement, shrink = 0.5): void {
  if (typeof parent.animate !== 'function') return;
  const img = el('img', 'craft-fly', parent);
  img.src = icon;
  img.alt = '';
  const a = img.animate(
    [
      { transform: `translate(${from.left + from.width / 2 - 16}px, ${from.top + from.height / 2 - 16}px) scale(1)`, opacity: 1 },
      { transform: `translate(${to.left + to.width / 2 - 16}px, ${to.top + to.height / 2 - 16}px) scale(${shrink})`, opacity: 0.9 },
    ],
    { duration: ms, easing: 'ease-in' },
  );
  a.onfinish = () => img.remove();
}

/**
 * もちもの画面の右がわ「つくる」「やく」（M4 §2.2・§2.3・§3）。
 * 18 まい（つくる）と 4 まい（やく）のカードを 1 度だけ作り、持ち物が変わったときに色・まるを直す。
 * 毎ステップ update() を呼ぶ。
 */
export class CraftPanel {
  readonly el: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly tabButtons: Record<CraftTab, HTMLButtonElement>;
  private readonly craftGrid: HTMLDivElement;
  private readonly bakeBox: HTMLDivElement;
  private readonly bakeGrid: HTMLDivElement;
  private readonly fuelRow: HTMLDivElement;
  private readonly fuelEls: { box: HTMLDivElement; count: HTMLSpanElement; item: ItemId }[] = [];
  private readonly furnaceCanvas: HTMLCanvasElement;
  private readonly craftRecipes: Recipe[];
  private readonly bakeRecipes: Recipe[];
  private readonly craftEls = new Map<string, CardEls>();
  private readonly bakeEls = new Map<string, CardEls>();
  private readonly cfg: CraftUiSettings;
  private tab_: CraftTab = 'craft';
  private tabs_: CraftTab[] = ['craft'];
  private open = false;
  private dirty = true;
  private craftViews: CardView[] = [];
  private bakeViews: CardView[] = [];
  private readonly off: () => void;

  constructor(parent: HTMLElement, private readonly d: CraftPanelDeps) {
    this.cfg = d.cfg ?? CRAFT_UI_SETTINGS;
    const all = d.craft.recipes();
    this.craftRecipes = all.filter((r) => r.station === 'craft');
    this.bakeRecipes = all.filter((r) => r.station === 'furnace');

    this.el = el('div', 'craft-panel');
    this.el.hidden = true;
    this.el.style.setProperty('--glow-seconds', `${this.cfg.glowSeconds}s`);

    this.tabBar = el('div', 'craft-tabs', this.el);
    const mk = (tab: CraftTab, label: string) => {
      const b = el('button', 'craft-tab', this.tabBar);
      b.type = 'button';
      b.dataset.tab = tab;
      b.textContent = label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTab(tab);
      });
      return b;
    };
    this.tabButtons = { craft: mk('craft', 'つくる'), bake: mk('bake', 'やく') };

    this.craftGrid = el('div', 'craft-grid', this.el);
    for (const r of this.craftRecipes) this.craftGrid.append(this.makeCard(r, this.craftEls));

    this.bakeBox = el('div', 'bake-box', this.el);
    const top = el('div', 'bake-top', this.bakeBox);
    this.furnaceCanvas = el('canvas', 'bake-furnace', top);
    drawPixels(this.furnaceCanvas, itemIconPixels('furnace'));
    this.fuelRow = el('div', 'bake-fuel', top);
    for (const f of this.cfg.fuelOrder) {
      const box = el('div', 'fuel', this.fuelRow);
      const img = el('img', 'fuel-icon', box);
      img.src = itemIconUrl(f as ItemId);
      img.alt = '';
      const count = el('span', 'fuel-count', box);
      box.dataset.item = f;
      box.addEventListener('mouseenter', () => d.hover?.(`fuel:${f}`));
      box.addEventListener('mouseleave', () => d.hover?.(null));
      this.fuelEls.push({ box, count, item: f as ItemId });
    }
    this.bakeGrid = el('div', 'bake-grid', this.bakeBox);
    for (const r of this.bakeRecipes) this.bakeGrid.append(this.makeCard(r, this.bakeEls));

    parent.append(this.el);
    this.off = d.inv.onChange(() => (this.dirty = true));
  }

  private makeCard(r: Recipe, into: Map<string, CardEls>): HTMLDivElement {
    const root = el('div', 'card');
    root.dataset.id = r.id;
    root.dataset.works = String(r.works);
    const icon = el('img', 'card-icon', root);
    icon.alt = '';
    icon.src = itemIconUrl(r.output.item);
    const count = el('span', 'card-count', root);
    const queue = el('span', 'card-queue', root);
    const mats = el('div', 'card-mats', root);
    const matEls: CardEls['matEls'] = [];
    for (const inp of r.inputs) {
      const chip = el('div', 'mat', mats);
      const mi = el('img', 'mat-icon', chip);
      mi.alt = '';
      mi.src = itemIconUrl(inp.item);
      const dotsBox = el('div', 'mat-dots', chip);
      const dots: HTMLSpanElement[] = [];
      for (let k = 0; k < Math.min(inp.count, DOT_SHOW_MAX); k++) dots.push(el('span', 'dot', dotsBox));
      chip.dataset.item = inp.item;
      chip.addEventListener('mouseenter', () => this.d.hover?.(`material:${r.id}:${inp.item}`));
      chip.addEventListener('mouseleave', () => this.d.hover?.(null));
      matEls.push({ chip, icon: mi, dots });
    }
    const name = el('div', 'card-name', root);
    name.textContent = this.d.nameOf(r.output.item);
    const bar = el('div', 'card-bar', root);
    const barFill = el('div', 'card-bar-fill', bar);
    icon.addEventListener('mouseenter', () => this.d.hover?.(`card:${r.id}`));
    icon.addEventListener('mouseleave', () => this.d.hover?.(null));
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      this.click(r.id);
    });
    into.set(r.id, { root, icon, count, mats, matEls, name, queue, bar, barFill });
    return root;
  }

  // ---- 状態

  tab(): CraftTab {
    return this.tab_;
  }
  tabs(): CraftTab[] {
    return this.tabs_;
  }

  setTab(tab: CraftTab): void {
    if (!this.tabs_.includes(tab) || tab === this.tab_) return;
    this.tab_ = tab;
    this.dirty = true;
    this.sync();
  }

  private furnacePos(): Vec3 | null {
    return this.d.craft.openedFurnace();
  }

  private furnaceState(): FurnaceState | null {
    const p = this.furnacePos();
    if (!p || !this.d.furnaces) return null;
    return this.d.furnaces.get(p.x, p.y, p.z);
  }

  /** 毎ステップ */
  update(): void {
    const open = this.d.isOpen();
    if (open !== this.open) {
      this.open = open;
      this.el.hidden = !open;
      if (open) this.tab_ = this.furnacePos() ? 'bake' : 'craft';
      this.dirty = true;
    }
    if (!open) return;
    const hasF = this.furnacePos() !== null;
    const tabs: CraftTab[] = hasF ? ['craft', 'bake'] : ['craft'];
    if (tabs.length !== this.tabs_.length) {
      this.tabs_ = tabs;
      this.dirty = true;
    }
    if (this.tab_ === 'bake' && !hasF) {
      this.tab_ = 'craft';
      this.dirty = true;
    }
    // やく画面は棒がのびるので、毎ステップ見る
    if (this.dirty || this.tab_ === 'bake') this.sync();
  }

  /** カードの色・まるを今の持ち物に合わせる */
  private sync(): void {
    this.dirty = false;
    this.craftViews = buildCards(this.craftRecipes, this.d.craft, this.d.inv);
    const st = this.furnaceState();
    const queued: Record<string, number> = {};
    for (const q of st?.queue ?? []) queued[q] = (queued[q] ?? 0) + 1;
    this.bakeViews = buildCards(this.bakeRecipes, this.d.craft, this.d.inv, { bake: true, queued, cfg: this.cfg });
    this.tabBar.hidden = this.tabs_.length < 2;
    this.tabButtons.bake.hidden = !this.tabs_.includes('bake');
    for (const t of ['craft', 'bake'] as CraftTab[]) this.tabButtons[t].dataset.selected = String(t === this.tab_);
    this.craftGrid.hidden = this.tab_ !== 'craft';
    this.bakeBox.hidden = this.tab_ !== 'bake';
    if (this.tab_ === 'craft') for (const v of this.craftViews) this.paint(this.craftEls.get(v.id)!, v, null);
    else {
      for (const v of this.bakeViews) {
        const progress = st?.current && st.current.id === v.id ? st.current.progress : null;
        this.paint(this.bakeEls.get(v.id)!, v, progress);
      }
      this.paintFuel(st);
    }
  }

  private paint(c: CardEls, v: CardView, progress: number | null): void {
    c.root.dataset.glow = String(v.glowing);
    c.count.textContent = v.countLabel;
    v.materials.forEach((m: MaterialView, i) => {
      const me = c.matEls[i];
      me.chip.dataset.red = String(m.red);
      me.dots.forEach((dot, k) => {
        dot.dataset.on = String(m.dots[k] === true);
      });
    });
    c.queue.textContent = v.queued > 0 ? `あと ${v.queued}` : '';
    c.bar.hidden = progress === null;
    if (progress !== null) c.barFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }

  private paintFuel(st: FurnaceState | null): void {
    const countOf = (i: ItemId) => this.d.inv.count(i);
    const next = nextFuel(countOf, this.cfg);
    for (const f of this.fuelEls) {
      const n = countOf(f.item);
      f.count.textContent = String(n);
      f.box.dataset.next = String(f.item === next);
      f.box.dataset.red = String(next === null);
    }
    this.furnaceCanvas.dataset.burning = String(!!st?.burning);
    const ctx = this.furnaceCanvas.getContext('2d');
    if (ctx) {
      // 口に火をのせる（絵のうえに オレンジの四角）
      drawPixels(this.furnaceCanvas, itemIconPixels('furnace'));
      if (st?.burning) {
        ctx.fillStyle = '#FF9A2E';
        const { x, y, w, h } = FURNACE_MOUTH;
        ctx.fillRect(x, y + 1, w, h - 1);
        ctx.fillStyle = '#FFE066';
        ctx.fillRect(x + 2, y + 3, w - 4, h - 3);
      }
    }
  }

  // ---- 押す

  /** つくる のカードを押したのと同じ。閉じていれば `{ok:false, reason:'closed'}` */
  click(id: string): CraftClickResult {
    if (!this.d.isOpen()) return { ok: false, reason: 'closed' };
    const isBake = this.bakeRecipes.some((r) => r.id === id);
    const cardEls = (isBake ? this.bakeEls : this.craftEls).get(id);
    const r = this.d.craft.make(id);
    if (r.ok) {
      this.dirty = true;
      if (cardEls) {
        poyon(cardEls.root);
        if (!isBake) this.flyEffects(id, cardEls);
      }
    } else if (cardEls) {
      if (r.reason === 'full') this.d.onFull?.();
      else if (r.reason === 'noFuel') for (const f of this.fuelEls) shake(f.box);
      else for (const m of cardEls.matEls) if (m.chip.dataset.red === 'true') shake(m.chip);
      if (r.reason === 'missing' && cardEls.matEls.every((m) => m.chip.dataset.red !== 'true')) shake(cardEls.root);
    }
    return { ok: r.ok, reason: r.reason };
  }

  /** 材料がカードにすいこまれ、できたものが入ったマスへ飛ぶ（0.4 秒） */
  private flyEffects(id: string, c: CardEls): void {
    const recipe = this.craftRecipes.find((r) => r.id === id);
    if (!recipe) return;
    const cardRect = c.icon.getBoundingClientRect();
    const slot = this.d.slotElFor?.(recipe.output.item);
    const root = this.el.parentElement ?? this.el;
    for (const m of c.matEls) fly(m.icon.src, m.icon.getBoundingClientRect(), cardRect, 220, root, 0.3);
    if (slot) fly(c.icon.src, cardRect, slot.getBoundingClientRect(), 400, root, 0.6);
  }

  // ---- 窓口用

  /** `craft.ui()` の中身（つくれる マーク以外） */
  ui(): Omit<CraftUiState, 'hintVisible'> {
    const open = this.d.isOpen();
    // 画面の更新を待たずに今の持ち物で作る
    const craftViews = buildCards(this.craftRecipes, this.d.craft, this.d.inv);
    const st = this.furnaceState();
    const queued: Record<string, number> = {};
    for (const q of st?.queue ?? []) queued[q] = (queued[q] ?? 0) + 1;
    const bakeViews = buildCards(this.bakeRecipes, this.d.craft, this.d.inv, { bake: true, queued, cfg: this.cfg });
    return {
      panelVisible: open,
      tab: open && this.tab_ === 'bake' && this.furnacePos() ? 'bake' : open ? this.tab_ : 'craft',
      tabs: open ? (this.furnacePos() ? ['craft', 'bake'] : ['craft']) : this.tabs_,
      cards: craftViews.map((v) => ({ id: v.id, glowing: v.glowing, redItems: v.redItems })),
      bakeCards: bakeViews.map((v) => ({ id: v.id, glowing: v.glowing, redItems: v.redItems, queued: v.queued })),
    };
  }

  /** つくる のカードが 1 まい以上 光っているか（つくれる マーク） */
  anyCraftable(): boolean {
    return buildCards(this.craftRecipes, this.d.craft, this.d.inv).some((c) => c.glowing);
  }

  dispose(): void {
    this.off();
    this.el.remove();
  }
}
