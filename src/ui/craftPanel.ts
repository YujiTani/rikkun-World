import type { CraftSystem, Inventory, ItemId, Recipe, Vec3 } from '../contracts';
import { createDefaultItemInfo, type ItemInfoSource } from '../craft/info';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';
import { FURNACE_MOUTH } from '../world/blocks/textures';
import { baseRecipeId, groupRecipes } from '../craft/recipes';
import {
  buildPageDefs,
  packDesc,
  type DescPage,
  buildCards,
  buildDetail,
  buildTiles,
  nextFuel,
  visibleCards,
  pickSelection,
  pageStart,
  type CardView,
  type DetailView,
  type TileView,
} from './craftModel';
import { fingerUrl } from './craftPanel.art';
import { el, fly, rectOf, shake, type Rect } from './craftPanel.fx';
import { renderDetail, renderDetailEmpty, createDetailEls, EMPTY_TEXT, type DetailEls } from './craftPanel.detail';
import { drawPixels, extraIconUrl, itemIconPixels, itemIconUrl } from './itemIcon';
import { itemRarity } from '../drops/rarity';
import { gemShape, gemUrl } from './gemArt';
import { itemCategory, rarityIndex } from './itemCategory';
import { createBar, createSlot, createTab, setBar, setTabState } from './theme';
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

/** CRAFT-PAGE: 窓口 `craft.page()` の 形 */
export interface PageInfo {
  names: string[];
  index: number;
  recipe: string | null;
  prevEnabled: boolean;
  nextEnabled: boolean;
  dots: number;
}

export type { Rect };

export interface CraftUiState {
  panelVisible: boolean;
  tab: CraftTab;
  tabs: CraftTab[];
  cards: { id: string; glowing: boolean; redItems: ItemId[] }[];
  bakeCards: { id: string; glowing: boolean; redItems: ItemId[]; queued: number }[];
  hintVisible: boolean;
  /** M6: 今のタブの マス */
  tiles: TileView[];
  /** M6: えらんでいるマス */
  selected: string | null;
  /** M6: せつめい パネルの中身（出ていなければ null） */
  detail: DetailView | null;
  detailRect: Rect | null;
  tileRects: Record<string, Rect>;
}

export type CraftClickResult = { ok: boolean; reason: string | null };
export type TileClickResult = { action: 'select' | 'make'; ok: boolean; reason: string | null };

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
  /** M6: 説明のデータ（無ければ初期値の数で作る。つなぎ込みが設定とつなぐ） */
  info?: ItemInfoSource;
  /** M6: カーソルに何か持っているか（持っているあいだは パネルの中身を替えない） */
  cursorHeld?(): boolean;
  /** M6: そのレシピを つくった・やいた ことがあるか（実績の記録） */
  isMade?(kind: 'craft' | 'bake', recipe: string): boolean;
  /** M6: マスを えらんだ（音「ポン」） */
  onSelect?(id: string): void;
  /** CRAFT-2: たんす の素材（あれば `count` は たんす もふくむ合計。つなぎ込みが つなぐ） */
  materials?: PanelMaterials;
}

/** CRAFT-2: 画面が たんす の素材を 数えるための口（`CraftSystemImpl` が合う） */
export interface PanelMaterials {
  /** もちもの＋たんす の合計 */
  count(item: ItemId): number;
  /** たんす だけの数 */
  inTansu(item: ItemId): number;
  fuelInTansu(): Record<string, number>;
  /** たんす の中身が 変わるたびに ふえる数（画面の作り直しの目印） */
  version(): number;
  /** 画面を開いたとき しぼり直す */
  refresh(): void;
}

interface TileEls {
  root: HTMLDivElement;
  art: HTMLImageElement;
  count: HTMLSpanElement;
  queue: HTMLSpanElement;
  barFill: ReturnType<typeof createBar>;
  recipe: Recipe;
}

export { EMPTY_TEXT };

/**
 * もちもの画面の右がわ「つくる」「やく」（M4 §2.2・§2.3、M6 §2.1）。
 * 左に 絵だけのマスの一覧（1 回目の クリックで えらぶ・同じマスを もう 1 回で つくる）、
 * 右に 決まった場所の せつめい パネル（合わせたマス／えらんでいるマスの中身。つくる ボタンは いつも えらんでいるマスのもの）。
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
  private readonly detailEls: DetailEls;
  private readonly finger: HTMLSpanElement;
  /** カードに なる（作り方が いくつか あれば 先頭の）レシピ */
  private readonly craftRecipes: Recipe[];
  private readonly bakeRecipes: Recipe[];
  /** 作り方ぜんぶ（たいまつ は 3 つ）と、カードの id → 作り方の id たち */
  private readonly craftAll: Recipe[];
  private readonly bakeAll: Recipe[];
  private readonly groups: Map<string, string[]>;
  /** CRAFT-PAGE: えらんでいるマスの ページ（ちがうマスに うつる・画面を開くと 作れる いちばん前に もどる） */
  /** 画面で 測った せつめいの ページ分け（物 × 画面の大きさ ごと）。字の幅が 環境で ちがっても はみ出さない */
  private readonly descPlans = new Map<string, DescPage[]>();
  private pageSel: { id: string; index: number; recipe: string } | null = null;
  private readonly tileEls = new Map<string, TileEls>();
  private readonly cfg: CraftUiSettings;
  private d: CraftPanelDeps;
  private matVer = 0;
  private info_: ItemInfoSource;
  private tab_: CraftTab = 'craft';
  private tabs_: CraftTab[] = ['craft'];
  private open = false;
  private dirty = true;
  private heldSeen = false;
  private craftViews: CardView[] = [];
  private bakeViews: CardView[] = [];
  private selected_: Record<CraftTab, string | null> = { craft: null, bake: null };
  private hovered_: string | null = null;
  private readonly madeLocal = new Set<string>();
  private detailKey = '';
  private readonly off: () => void;

  constructor(parent: HTMLElement, deps: CraftPanelDeps) {
    this.d = deps;
    this.cfg = deps.cfg ?? CRAFT_UI_SETTINGS;
    this.info_ = deps.info ?? createDefaultItemInfo((i) => deps.nameOf(i));
    const all = deps.craft.recipes();
    this.craftAll = all.filter((r) => r.station === 'craft');
    this.bakeAll = all.filter((r) => r.station === 'furnace');
    this.groups = groupRecipes(all);
    this.craftRecipes = this.craftAll.filter((r) => this.groups.has(r.id));
    this.bakeRecipes = this.bakeAll.filter((r) => this.groups.has(r.id));

    this.el = el('div', 'craft-panel');
    this.el.hidden = true;
    this.el.style.setProperty('--glow-seconds', `${this.cfg.glowSeconds}s`);

    const left = el('div', 'cp-left', this.el);
    this.tabBar = el('div', 'craft-tabs', left);
    const mk = (tab: CraftTab, label: string) => {
      const b = createTab({ text: label, onClick: () => this.setTab(tab) });
      b.classList.add('craft-tab');
      b.dataset.tab = tab;
      b.addEventListener('click', (e) => e.stopPropagation());
      this.tabBar.append(b);
      return b;
    };
    this.tabButtons = { craft: mk('craft', 'つくる'), bake: mk('bake', 'やく') };

    this.craftGrid = el('div', 'cp-grid craft-grid', left);
    for (const r of this.craftRecipes) this.craftGrid.append(this.makeTile(r));

    this.bakeBox = el('div', 'bake-box', left);
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
      box.addEventListener('mouseenter', () => deps.hover?.(`fuel:${f}`));
      box.addEventListener('click', () => this.chooseFuel(f as ItemId));
      box.addEventListener('mouseleave', () => deps.hover?.(null));
      this.fuelEls.push({ box, count, item: f as ItemId });
    }
    this.bakeGrid = el('div', 'cp-grid bake-grid', this.bakeBox);
    for (const r of this.bakeRecipes) this.bakeGrid.append(this.makeTile(r));

    this.detailEls = createDetailEls(this.el, {
      onPress: () => void this.detailPress(),
      onEnter: () => this.hover(null),
      onPage: (d) => void this.pageGo(d),
    });

    // ゆびの印（つくれる えらんでいるマスにだけ付ける。ひとつを使いまわす）
    this.finger = el('span', 'cp-finger');
    this.finger.style.backgroundImage = `url(${fingerUrl()})`;

    parent.append(this.el);
    this.off = deps.inv.onChange(() => (this.dirty = true));
  }

  /** つなぎ込みが 設定とつないだ説明のデータや、カーソル・記録の口を渡す */
  configure(p: Partial<Pick<CraftPanelDeps, 'info' | 'cursorHeld' | 'isMade' | 'onSelect' | 'onFull' | 'slotElFor'>>): void {
    if (p.info) this.info_ = p.info;
    this.d = { ...this.d, ...p, info: this.info_ };
    this.dirty = true;
  }

  info(): ItemInfoSource {
    return this.info_;
  }

  private makeTile(r: Recipe): HTMLDivElement {
    const slot = createSlot({ art: itemIconUrl(r.output.item) });
    const root = slot.root;
    // 色分け（§3.5 (7)）: 背景 = カテゴリーの色、ふち = めずらしさ、右上に 宝石の印
    const rar = rarityIndex(itemRarity(r.output.item));
    root.dataset.cat = itemCategory(r.output.item);
    root.dataset.rarity = String(rar);
    const gem = document.createElement('img');
    gem.className = 'slot-gem';
    gem.alt = '';
    gem.src = gemUrl(rar);
    gem.dataset.gem = gemShape(rar);
    root.append(gem);
    root.classList.add('cp-tile');
    root.dataset.id = r.id;
    root.dataset.station = r.station;
    root.dataset.works = String(r.works);
    const made = el('span', 'cp-made', root);
    made.textContent = '✓';
    el('span', 'cp-later', root).style.backgroundImage = `url(${extraIconUrl('clock')})`;
    const mark = el('span', 'cp-mark', root);
    mark.textContent = '▼';
    const queue = el('span', 'card-queue cp-queue', root);
    const barFill = createBar('bake', 0);
    barFill.root.classList.add('cp-bar');
    barFill.root.hidden = true;
    root.append(barFill.root);
    root.addEventListener('mouseenter', () => this.hover(r.id));
    root.addEventListener('mouseleave', () => this.hover(null));
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tileClick(r.id);
    });
    this.tileEls.set(r.id, { root, art: slot.art, count: slot.count, queue, barFill, recipe: r });
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
    this.hovered_ = null;
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

  private bakeQueued(st: FurnaceState | null): Record<string, number> {
    const queued: Record<string, number> = {};
    for (const q of st?.queue ?? []) queued[q] = (queued[q] ?? 0) + 1;
    return queued;
  }

  /** カードごとの 作り方のカード（たいまつ は 3 つ。ほかは 1 つ） */
  private variantViews = new Map<string, CardView[]>();

  private views(): { craft: CardView[]; bake: CardView[] } {
    const st = this.furnaceState();
    const craftAll = buildCards(this.craftAll, this.d.craft, this.counter(), this.cardOpt());
    const bakeAll = buildCards(this.bakeAll, this.d.craft, this.counter(), { ...this.cardOpt(), bake: true, queued: this.bakeQueued(st), cfg: this.cfg });
    const variants = new Map<string, CardView[]>();
    const merge = (list: CardView[]): CardView[] => {
      const byId = new Map(list.map((c) => [c.id, c]));
      const out: CardView[] = [];
      for (const [primary, ids] of this.groups) {
        const vs = ids.map((id) => byId.get(id)).filter((c): c is CardView => !!c);
        if (vs.length === 0) continue;
        variants.set(primary, vs);
        const first = vs[0];
        if (vs.length === 1) {
          out.push(first);
          continue;
        }
        // 3 つの どれかが 作れれば「作れる」。材料の赤・まるは 作れる作り方（無ければ 材料を もっている いちばん前の作り方）で見る
        const def = vs.find((v) => v.glowing) ?? vs.find((v) => v.materials.some((m) => m.have > 0)) ?? first;
        out.push({ ...def, id: first.id, output: first.output, countLabel: first.countLabel, glowing: vs.some((v) => v.glowing) });
      }
      return out;
    };
    const craft = merge(craftAll);
    const bake = merge(bakeAll);
    this.variantViews = variants;
    return { craft, bake };
  }

  private currentTab(): CraftTab {
    return this.tab_ === 'bake' && this.furnacePos() ? 'bake' : 'craft';
  }

  private stationOf(id: string): CraftTab | null {
    if (this.craftAll.some((r) => r.id === id)) return 'craft';
    if (this.bakeAll.some((r) => r.id === id)) return 'bake';
    return null;
  }

  private made(kind: 'craft' | 'bake', id: string): boolean {
    const base = baseRecipeId(id);
    return this.madeLocal.has(`${kind}:${base}`) || (this.d.isMade?.(kind, base) ?? false);
  }

  /** 材料の数え方（たんす もふくむ）。なければ もちもの だけ */
  private counter(): Pick<Inventory, 'count'> {
    const m = this.d.materials;
    return m ? { count: (i) => m.count(i) } : this.d.inv;
  }

  private cardOpt(): { tansuOf?: (item: ItemId) => number } {
    const m = this.d.materials;
    return m ? { tansuOf: (i) => m.inTansu(i) } : {};
  }

  /** 毎ステップ */
  update(): void {
    const open = this.d.isOpen();
    if (open !== this.open) {
      this.open = open;
      this.el.hidden = !open;
      if (open) {
        this.d.materials?.refresh();
        this.matVer = this.d.materials?.version() ?? 0;
        this.tab_ = this.furnacePos() ? 'bake' : 'craft';
        this.hovered_ = null;
        this.pageSel = null;
        this.ensureSelection();
      } else this.hovered_ = null;
      this.dirty = true;
    }
    if (!open) return;
    if (this.d.materials) {
      const v = this.d.materials.version();
      if (v !== this.matVer) {
        this.matVer = v;
        this.dirty = true;
      }
    }
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
    // それ以外は、変わったとき（dirty・カーソルに持った/はなした）だけ作る
    const held = this.d.cursorHeld?.() ?? false;
    if (this.dirty || this.tab_ === 'bake') this.sync();
    else if (held !== this.heldSeen) this.paintDetail();
    this.heldSeen = held;
  }

  /** 開いたとき・タブが変わったとき: えらんでいるマスが無ければ つくれる いちばん前（無ければ 1 つ目） */
  private ensureSelection(): void {
    const v = this.views();
    for (const t of ['craft', 'bake'] as CraftTab[]) {
      this.selected_[t] = pickSelection(visibleCards(t === 'craft' ? v.craft : v.bake), this.selected_[t]);
    }
  }

  private sync(): void {
    this.dirty = false;
    const v = this.views();
    this.craftViews = v.craft;
    this.bakeViews = v.bake;
    const st = this.furnaceState();
    this.tabBar.hidden = this.tabs_.length < 2;
    this.tabButtons.bake.hidden = !this.tabs_.includes('bake');
    for (const t of ['craft', 'bake'] as CraftTab[]) setTabState(this.tabButtons[t], { selected: t === this.tab_, dot: false });
    this.craftGrid.hidden = this.tab_ !== 'craft';
    this.bakeBox.hidden = this.tab_ !== 'bake';
    if (this.tab_ === 'craft') this.paintTiles(this.craftViews, 'craft', null);
    else {
      this.paintTiles(this.bakeViews, 'bake', st);
      this.paintFuel(st);
    }
    this.paintDetail();
  }

  private paintTiles(views: CardView[], tab: CraftTab, st: FurnaceState | null): void {
    const vis = visibleCards(views);
    const sel = pickSelection(vis, this.selected_[tab]);
    this.selected_[tab] = sel;
    const tiles = buildTiles(vis, sel, (id) => this.made(tab, id));
    const shown = new Set(tiles.map((t) => t.id));
    const grid = tab === 'craft' ? this.craftGrid : this.bakeGrid;
    for (const c of views) this.tileEls.get(c.id)!.root.hidden = !shown.has(c.id);
    // 作れる → 足りない の順に ならべる（同じ順なら DOM は動かさない）
    tiles.forEach((t, i) => {
      const r = this.tileEls.get(t.id)!.root;
      if (grid.children[i] !== r) grid.insertBefore(r, grid.children[i] ?? null);
    });
    let fingerOn: HTMLElement | null = null;
    for (const t of tiles) {
      const e = this.tileEls.get(t.id)!;
      const r = e.root;
      r.dataset.glow = String(t.glowing);
      r.dataset.dim = String(t.dim);
      r.dataset.made = String(t.made);
      r.dataset.later = String(t.later);
      r.dataset.selected = String(t.selected);
      e.count.textContent = t.count >= 2 ? `×${t.count}` : '';
      e.queue.textContent = t.queued > 0 ? `あと ${t.queued}` : '';
      const progress = st?.current && st.current.id === t.id ? st.current.progress : null;
      e.barFill.root.hidden = progress === null;
      if (progress !== null) setBar(e.barFill, progress);
      if (t.selected && t.glowing) fingerOn = r;
    }
    if (fingerOn) {
      if (this.finger.parentElement !== fingerOn) fingerOn.append(this.finger);
    } else this.finger.remove();
  }

  /** 今つかう ねんりょう（えらんだ物。0 こなら 自動の順） */
  private currentFuel(): ItemId | null {
    return this.d.craft.fuel?.() ?? nextFuel((i) => this.counter().count(i), this.cfg);
  }

  private chooseFuel(id: ItemId): void {
    if (this.counter().count(id) <= 0) return;
    this.d.craft.setFuel?.(id);
    this.paintFuel(this.furnaceState());
    this.paintDetail();
  }

  private paintFuel(st: FurnaceState | null): void {
    const countOf = (i: ItemId) => this.counter().count(i);
    const next = this.currentFuel();
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

  // ---- せつめい パネル

  /** 今の せつめい パネルの中身（出ていなければ null） */
  detail(): DetailView | null {
    if (!this.d.isOpen()) return null;
    const tab = this.currentTab();
    const views = visibleCards(this.views()[tab]);
    const sel = views.find((c) => c.id === pickSelection(views, this.selected_[tab]));
    if (!sel) return null;
    const hov = this.hovered_ && !this.d.cursorHeld?.() ? views.find((c) => c.id === this.hovered_) : undefined;
    const shown = hov ?? sel;
    const selVariants = this.variantViews.get(sel.id) ?? [sel];
    const selPage = this.pageFor(sel.id, selVariants);
    const shownVariants = this.variantViews.get(shown.id) ?? [shown];
    // 合わせただけの マスは 開いたときの ページ。えらんでいるマスは おぼえている ページ
    const shownPage = shown.id === sel.id ? selPage : undefined;
    const countOf = (i: ItemId) => this.counter().count(i);
    const fuelCounts: Record<string, number> = {};
    for (const f of this.cfg.fuelOrder) fuelCounts[f] = countOf(f as ItemId);
    return buildDetail({
      shown,
      selected: sel,
      info: this.info_.info(shown.output.item),
      bake: tab === 'bake',
      fuelCounts: tab === 'bake' ? fuelCounts : null,
      fuelNext: this.currentFuel(),
      fuelInTansu: this.d.materials ? this.d.materials.fuelInTansu() : undefined,
      variants: shownVariants,
      page: shownPage,
      selectedCard: selVariants.find((v) => v.id === selPage.recipe) ?? sel,
      desc: this.descPlans.get(this.descKey(shown.output.item)),
    });
  }

  // ---- ページ（CRAFT-PAGE）

  /** えらんでいるマスの ページ。ちがうマスに うつったら（画面を開いても）作れる いちばん前から */
  private pageFor(id: string, variants: readonly CardView[]): { index: number; recipe: string } {
    if (this.pageSel?.id === id) return this.pageSel;
    const ids = variants.map((v) => v.id);
    const info = this.info_.info(variants[0]?.output.item ?? ('log' as ItemId));
    const pages = buildPageDefs({ recipes: ids, statCount: info.stats.length, use: info.use, how: info.how, desc: this.descPlans.get(this.descKey(info.item)) });
    this.pageSel = { id, ...pageStart(pages, variants) };
    return this.pageSel;
  }

  private selectedId(): string | null {
    const tab = this.currentTab();
    return pickSelection(visibleCards(this.views()[tab]), this.selected_[tab]);
  }

  /** 「つくる」が 今 使う 作り方（作り方のページを見ていれば そのページ、せつめい・つよさ なら さいごに見た作り方） */
  private currentRecipe(id: string): string {
    const v = this.variantViews.get(id) ?? [];
    return this.pageSel?.id === id ? this.pageSel.recipe : this.pageFor(id, v).recipe;
  }

  /** ◀ ▶ を 押したのと同じ。はしで 動かなければ false */
  pageGo(delta: -1 | 1): boolean {
    if (!this.d.isOpen()) return false;
    const id = this.selectedId();
    if (!id) return false;
    const views = this.views();
    const sel = (this.currentTab() === 'bake' ? views.bake : views.craft).find((c) => c.id === id);
    if (!sel) return false;
    const variants = this.variantViews.get(id) ?? [sel];
    const cur = this.pageFor(id, variants);
    const d = this.detail();
    if (!d) return false;
    const next = cur.index + delta;
    if (next < 0 || next >= d.pages.length) return false;
    const pg = d.pages[next];
    this.pageSel = { id, index: next, recipe: pg.kind === 'make' && pg.recipe ? pg.recipe : cur.recipe };
    this.paintDetail();
    return true;
  }

  /** `craft.page()`（テスト用）。中身が 出ていなければ null */
  page(): PageInfo | null {
    const d = this.detail();
    if (!d) return null;
    return {
      names: d.pages.map((p) => p.name),
      index: d.page,
      recipe: d.recipe,
      prevEnabled: d.page > 0,
      nextEnabled: d.page < d.pages.length - 1,
      dots: d.pages.length > 1 ? d.pages.length : 0,
    };
  }

  private paintDetail(): void {
    const d = this.detail();
    const key = d ? JSON.stringify(d) : this.d.isOpen() ? 'empty' : '';
    if (key === this.detailKey) return;
    this.detailKey = key;
    if (d || !this.d.isOpen()) renderDetail(this.detailEls, d, (i) => itemIconUrl(i), (i) => this.chooseFuel(i));
    else renderDetailEmpty(this.detailEls, itemIconUrl('log' as ItemId));
    // せつめいが 入りきるか 実際の 大きさで 測る（初めて 見る 物・大きさ のときだけ）。ページ分けが かわったら 描きなおす
    if (d && this.fitDesc(d)) {
      this.detailKey = '';
      this.paintDetail();
    }
  }

  private descKey(item: ItemId): string {
    const r = this.detailEls.root;
    return `${item}|${innerWidth}x${innerHeight}|${r.offsetWidth}x${r.offsetHeight}`;
  }

  /** せつめいを 1 ページずつ 画面に 入れて はみ出さないか 測り、入る 分け方を 決める。決めた分け方が 仮と ちがえば true */
  private fitDesc(d: DetailView): boolean {
    const root = this.detailEls.root;
    if (root.hidden || root.offsetHeight === 0 || !d.pages.some((p) => p.kind === 'desc')) return false;
    const item = d.item;
    const key = this.descKey(item);
    if (this.descPlans.has(key)) return false;
    const info = this.info_.info(item);
    const body = this.detailEls.body;
    const dummy = { kind: 'desc' as const, name: 'せつめい' };
    const fits = (p: DescPage): boolean => {
      const probe: DetailView = { ...d, pages: [{ ...dummy, use: p.use, how: p.how, buttons: p.buttons }, dummy], page: 0 };
      renderDetail(this.detailEls, probe, (i) => itemIconUrl(i));
      return body.scrollHeight - body.clientHeight <= 1;
    };
    const plan = packDesc(info.use, info.how, fits);
    this.descPlans.set(key, plan);
    const before = d.pages.filter((p) => p.kind === 'desc');
    const same = before.length === plan.length && before.every((p, i) => p.use === plan[i].use && p.how === plan[i].how && p.buttons === plan[i].buttons);
    if (!same) return true;
    renderDetail(this.detailEls, d, (i) => itemIconUrl(i), (i) => this.chooseFuel(i)); // 測りで 変えた 中身を もどす
    return false;
  }

  /** マスにマウスを合わせた／外した（パネルの中は null と同じ）。同じステップで中身が替わる */
  hover(id: string | null): void {
    this.hovered_ = id && this.stationOf(id) ? id : null;
    if (this.d.isOpen()) this.paintDetail();
  }

  // ---- 押す

  /** マスを 1 回 クリックしたのと同じ（えらんでいなければ えらぶ、えらんでいれば つくる／やく） */
  tileClick(id: string): TileClickResult {
    const station = this.stationOf(id);
    if (!this.d.isOpen()) return { action: 'select', ok: false, reason: 'closed' };
    if (!station) return { action: 'select', ok: false, reason: 'unknown' };
    if (!visibleCards(this.views()[station]).some((c) => c.id === id)) return { action: 'select', ok: false, reason: 'hidden' };
    if (this.selected_[station] !== id) {
      this.selected_[station] = id;
      this.d.onSelect?.(id);
      this.dirty = true;
      this.sync();
      return { action: 'select', ok: true, reason: null };
    }
    const r = this.click(this.currentRecipe(id));
    return { action: 'make', ok: r.ok, reason: r.reason };
  }

  /** せつめい パネルの つくる（やく）ボタン = えらんでいるマスを つくる */
  detailPress(): CraftClickResult {
    if (!this.d.isOpen()) return { ok: false, reason: 'closed' };
    const tab = this.currentTab();
    const id = pickSelection(visibleCards(this.views()[tab]), this.selected_[tab]);
    if (!id) return { ok: false, reason: 'unknown' };
    return this.click(this.currentRecipe(id));
  }

  /** つくる のカードを押したのと同じ（すぐ つくる。えらぶ も そのマスに替わる）。閉じていれば `{ok:false, reason:'closed'}` */
  click(id: string): CraftClickResult {
    if (!this.d.isOpen()) return { ok: false, reason: 'closed' };
    const station = this.stationOf(id);
    const isBake = station === 'bake';
    const base = baseRecipeId(id); // 足した作り方も カードは 元のマス
    const tile = this.tileEls.get(base);
    if (station) this.selected_[station] = base;
    const r = this.d.craft.make(id);
    this.dirty = true;
    if (r.ok) {
      this.madeLocal.add(`${isBake ? 'bake' : 'craft'}:${base}`);
      if (tile && !isBake) this.flyEffects(id, tile);
    } else if (tile) {
      if (r.reason === 'full') this.d.onFull?.();
      else if (r.reason === 'noFuel') for (const f of this.fuelEls) shake(f.box);
      else shake(tile.root);
      shake(this.detailEls.button);
    }
    if (this.open) this.sync();
    return { ok: r.ok, reason: r.reason };
  }

  /** できたものが入ったマスへ飛ぶ（0.4 秒） */
  private flyEffects(id: string, t: TileEls): void {
    const recipe = this.craftAll.find((r) => r.id === id);
    if (!recipe) return;
    const slot = this.d.slotElFor?.(recipe.output.item);
    const root = this.el.parentElement ?? this.el;
    if (slot) fly(t.art.src, t.root.getBoundingClientRect(), slot.getBoundingClientRect(), 400, root, 0.6);
  }

  /** そのレシピの マスの DOM（B の演出の出どころ） */
  tileElFor(recipe: string): HTMLElement | null {
    return this.tileEls.get(baseRecipeId(recipe))?.root ?? null;
  }

  /** せつめい パネルの つくる ボタンの DOM（B の「できた！」ハンコの場所） */
  buttonEl(): HTMLButtonElement {
    return this.detailEls.button;
  }

  // ---- 窓口用

  /** `craft.ui()` の中身（つくれる マーク以外） */
  ui(): Omit<CraftUiState, 'hintVisible'> {
    const open = this.d.isOpen();
    const v = this.views();
    const st = this.furnaceState();
    void st;
    const tab = open ? this.currentTab() : this.tab_;
    const views = visibleCards(tab === 'bake' ? v.bake : v.craft);
    const sel = pickSelection(views, this.selected_[tab]);
    const tileRects: Record<string, Rect> = {};
    if (open) for (const c of views) tileRects[c.id] = rectOf(this.tileEls.get(c.id)!.root);
    return {
      panelVisible: open,
      tab,
      tabs: open ? (this.furnacePos() ? ['craft', 'bake'] : ['craft']) : this.tabs_,
      cards: v.craft.map((c) => ({ id: c.id, glowing: c.glowing, redItems: c.redItems })),
      bakeCards: v.bake.map((c) => ({ id: c.id, glowing: c.glowing, redItems: c.redItems, queued: c.queued })),
      tiles: buildTiles(views, sel, (id) => this.made(tab, id)),
      selected: sel,
      detail: this.detail(),
      detailRect: open ? rectOf(this.detailEls.root) : null,
      tileRects,
    };
  }

  /** つくる のカードが 1 まい以上 光っているか（つくれる マーク） */
  anyCraftable(): boolean {
    return buildCards(this.craftRecipes, this.d.craft, this.counter(), this.cardOpt()).some((c) => c.glowing);
  }

  dispose(): void {
    this.off();
    this.el.remove();
  }
}

