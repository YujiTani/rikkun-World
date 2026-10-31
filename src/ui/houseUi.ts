import type { ItemId } from '../contracts';
import { itemType } from '../inventory/items';
import type { KuraCellView, KuraScreen, KuraScreenView } from '../house/kuraScreen';
import type { RenameView } from '../house/rename';
import type { HouseButtonId, HouseMenuState } from '../house/talk';
import { buildRenameList, buildRenameName, type RenameNamePanel } from './houseEditor/renameView';
import { houseButtonIcons } from './houseMenuArt';
import { itemIconUrl } from './itemIcon';
import { withRuby } from './text';
import './houseUi.css';

/**
 * 建築士さんの メニュー・くらの 画面（HOUSE-1A。docs/design/HOUSE-1.md §2.3・§2.4・§3.2）。HTML（ふりがなを つけるため）。
 *  - 話して いる 間（うなずき・あいさつ）: 頭の 上の ふきだしだけ（`placeBubble` が 毎フレーム 頭に ついて 行く）。
 *  - メニュー: 画面の まん中に ふきだし → ボタンの たて 1 列（ボタンは `menu().buttons` の とおり。押せない 物は disabled）。
 *  - くら: 左 = 持ち物の マス 36、右 = くらの マス。マスを えらぶ → 数 → あずける / とりだす。✕ で ぜんぶ とじる。
 * 画面の 更新は 出来事で 動く（`refresh`）。ゲームの 時間が 止まって いる 間も 動く ように 時計には たよらない。
 * DOM: `[data-testid="house-menu"]`・`house-bubble`・`house-kura`・ボタン `house-btn-<id>`・くらの マス `kura-bag` / `kura-store`・数の えらび `kura-*`。
 */

const LABEL: Readonly<Record<HouseButtonId, string>> = {
  kura: 'あずける・とりだす',
  editor: 'せっけいずを つくる',
  build: 'けんちくを はじめる',
  rename: 'なまえを かえる',
  tools: 'どうぐを もらう',
  close: 'とじる',
};
/** 押すと はたらく ボタン（目立たせる） */
const GO: ReadonlySet<HouseButtonId> = new Set<HouseButtonId>(['kura', 'tools']);

type Mode = 'off' | 'float' | 'menu' | 'kura' | 'editor';

/** エディターの 画面（ui/houseEditor。はじめて 開く とき 作る）。ふきだしは このなかの sayHost に 移して 使う */
export interface EditorViewLike {
  root: HTMLElement;
  sayHost: HTMLElement;
  show(on: boolean): void;
  refresh(): void;
  tick(): void;
  render(): void;
}

interface HouseUiDeps {
  parent: HTMLElement;
  menu(): HouseMenuState;
  press(id: string): void;
  /** なまえを かえる の 画面が 読む もの（HOUSE-1C） */
  rename(): RenameView;
  screen: KuraScreen;
  /** エディターの 画面を 作って 返す（親は 引数の 要素）。はじめて エディターが 開く とき 1 回 */
  makeEditor(parent: HTMLElement): EditorViewLike;
  /** 「ポン」（ボタン・ページを かえた 音） */
  tick(): void;
  /** 話して いる 建築士さんの 頭の 上（画面の ピクセル）。見えなければ null */
  anchor(): { x: number; y: number } | null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function img(src: string): HTMLImageElement {
  const i = document.createElement('img');
  i.alt = '';
  i.src = src;
  i.draggable = false;
  return i;
}

export class HouseUi {
  readonly el: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private mode: Mode = 'off';
  private editorView: EditorViewLike | null = null;
  private menuEl: HTMLDivElement | null = null;
  private menuSig = '';
  /** 名前の 画面（page 'renameName'。入るたびに 作りなおす） */
  private namePanel: RenameNamePanel | null = null;
  private kuraEl: HTMLDivElement | null = null;
  private kuraSig = '';
  /** あずけた・とりだした 物の マスを 次の 描きなおしで ぴょこんと させる */
  private pop: ItemId | null = null;

  constructor(private readonly d: HouseUiDeps) {
    this.el = el('div', 'house-ui');
    this.bubble = el('div', 'house-bubble');
    this.bubble.dataset.testid = 'house-bubble';
    this.el.append(this.bubble);
    d.parent.append(this.el);
  }

  /** メニュー・くら・エディターが 開いて いる */
  isOpen(): boolean {
    return this.mode === 'menu' || this.mode === 'kura' || this.mode === 'editor';
  }

  /** 画面を 今の 状態に あわせる（menu() が かわった とき・マスを おした とき・くらの 画面が 開いて いる 間は 毎ステップ） */
  refresh(): void {
    const m = this.d.menu();
    const mode: Mode = m.open ? (m.page === 'kura' ? 'kura' : m.page === 'editor' || m.page === 'need' ? 'editor' : 'menu') : m.bubble !== '' ? 'float' : 'off';
    if (mode !== this.mode) this.setMode(mode);
    if (mode === 'off') return;
    const html = withRuby(m.bubble);
    if (this.bubble.innerHTML !== html) this.bubble.innerHTML = html;
    if (mode === 'menu') this.renderMenu(m);
    else if (mode === 'kura') this.renderKura();
    else if (mode === 'editor') this.editorView?.refresh();
  }

  /** エディターの 1 コマ（ゲームの 時間が 止まって いても 呼ぶ）と 描画（見本）。エディターが 開いて いなければ 何も しない */
  stepEditor(): void {
    if (this.mode === 'editor') this.editorView?.tick();
  }
  drawEditor(): void {
    if (this.mode === 'editor') this.editorView?.render();
  }

  /** 毎フレーム: 話して いる 間は ふきだしを 頭の 上へ */
  placeBubble(): void {
    if (this.mode !== 'float') return;
    const a = this.d.anchor();
    const w = this.bubble.offsetWidth;
    const h = this.bubble.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = a ? a.x : vw / 2;
    const y = a ? a.y : vh * 0.4;
    const left = Math.max(16, Math.min(vw - w - 16, x - w / 2));
    const top = Math.max(16, Math.min(vh - h - 16, y - h - 16));
    this.bubble.style.left = `${Math.round(left)}px`;
    this.bubble.style.top = `${Math.round(top)}px`;
  }

  // ------------------------------------------------------------ 場面の 切りかえ

  private setMode(mode: Mode): void {
    // ふきだしは 1 つを 使いまわす（くらの 帯に 入れる 前に 一度 出す。くらの 中身を けす ときに 巻きこまない）
    this.el.append(this.bubble);
    this.menuEl?.remove();
    this.menuEl = null;
    this.menuSig = '';
    this.namePanel = null;
    this.kuraEl?.remove();
    this.kuraEl = null;
    this.kuraSig = '';
    if (this.mode === 'editor') this.editorView?.show(false);
    this.mode = mode;
    for (const m of ['float', 'menu', 'kura', 'editor'] as const) this.el.classList.toggle(`is-${m}`, mode === m);
    if (mode === 'editor') {
      this.editorView ??= this.d.makeEditor(this.el);
      this.editorView.sayHost.append(this.bubble);
      this.editorView.show(true);
    }
    if (mode !== 'float') {
      this.bubble.style.left = '';
      this.bubble.style.top = '';
    }
    if (mode === 'kura') this.d.screen.reset();
  }

  // ------------------------------------------------------------ 上の メニュー

  private renderMenu(m: HouseMenuState): void {
    if (m.page === 'rename' || m.page === 'renameName') {
      this.renderRename(m);
      return;
    }
    const sig = `${m.page}|` + m.buttons.map((b) => `${b.id}:${b.enabled ? 1 : 0}`).join(',');
    if (this.menuEl && sig === this.menuSig) return;
    this.menuSig = sig;
    const menu = el('div', 'house-menu');
    menu.dataset.testid = 'house-menu';
    for (const b of m.buttons) menu.append(this.menuButton(b.id as HouseButtonId, b.enabled));
    if (this.menuEl) this.menuEl.replaceWith(menu);
    else this.el.append(menu);
    this.menuEl = menu;
  }

  /** なまえを かえる の 一覧・名前の 画面（ふきだしの 下に 並べる。上の メニューと 同じ 場所） */
  private renderRename(m: HouseMenuState): void {
    const view = this.d.rename();
    const press = (id: string): void => {
      this.d.tick();
      this.d.press(id);
      this.refresh();
    };
    if (m.page === 'rename') {
      const sig = `rename|${view.houses.map((h) => `${h.id}:${h.name}`).join(',')}`;
      if (this.menuEl && sig === this.menuSig) return;
      this.menuSig = sig;
      this.swapMenu(buildRenameList(view, press), null);
      return;
    }
    if (!this.namePanel || this.menuSig !== 'renameName') {
      this.menuSig = 'renameName';
      const panel = buildRenameName(view, press);
      this.swapMenu(panel.root, panel);
    }
    this.namePanel?.update(view, m.buttons);
  }

  private swapMenu(root: HTMLElement, panel: RenameNamePanel | null): void {
    this.namePanel = panel;
    if (this.menuEl) this.menuEl.replaceWith(root);
    else this.el.append(root);
    this.menuEl = root as HTMLDivElement;
  }

  private menuButton(id: HouseButtonId, enabled: boolean): HTMLButtonElement {
    const b = el('button', `house-btn${enabled && GO.has(id) ? ' house-btn--go' : ''}`);
    b.type = 'button';
    b.dataset.testid = `house-btn-${id}`;
    b.disabled = !enabled;
    b.classList.toggle('is-disabled', !enabled);
    b.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    const icons = houseButtonIcons(id);
    if (icons.length === 1) b.append(img(icons[0]!));
    else if (icons.length > 1) {
      const pair = el('span', 'house-btn__pair');
      for (const u of icons) pair.append(img(u));
      b.append(pair);
    }
    if (id === 'close') b.append(el('span', 'house-btn__x', '✕'));
    b.append(el('span', 'house-btn__text', LABEL[id]));
    b.addEventListener('click', () => {
      if (!enabled) return;
      this.d.tick();
      this.d.press(id);
      this.refresh();
    });
    return b;
  }

  // ------------------------------------------------------------ くら

  private renderKura(): void {
    const v = this.d.screen.view();
    const sig = JSON.stringify(v);
    if (this.kuraEl && sig === this.kuraSig) return;
    this.kuraSig = sig;
    const root = el('div', 'house-kura');
    root.dataset.testid = 'house-kura';

    const head = el('div', 'house-kura__head');
    head.append(el('h2', 'house-kura__title', 'くら'), this.bubble, this.closeButton());

    const body = el('div', 'house-kura__body');
    const bagGrid = el('div', 'kura-grid kura-grid--bag');
    v.bag.forEach((c, i) => bagGrid.append(this.cell('kura-bag', c, c.item !== null && !c.locked ? () => this.d.screen.selectBag(i) : null)));
    const storeGrid = el('div', 'kura-grid kura-grid--store');
    for (const c of v.store) storeGrid.append(this.cell('kura-store', c, () => this.d.screen.selectStore(c.item!)));
    body.append(this.panel('bag', 'もちもの', bagGrid), this.panel('store', 'くら', storeGrid));

    root.append(head, body, this.foot(v));
    if (this.kuraEl) this.kuraEl.replaceWith(root);
    else this.el.append(root);
    this.kuraEl = root;
    this.pop = null;
  }

  private closeButton(): HTMLButtonElement {
    const b = el('button', 'house-btn house-btn--close', '✕');
    b.type = 'button';
    b.dataset.testid = 'house-btn-close';
    b.setAttribute('aria-label', 'とじる');
    b.addEventListener('click', () => {
      this.d.tick();
      this.d.press('close');
      this.refresh();
    });
    return b;
  }

  private panel(kind: 'bag' | 'store', label: string, grid: HTMLElement): HTMLElement {
    const p = el('section', `house-kura__panel house-kura__panel--${kind}`);
    p.append(el('h3', 'house-kura__label', label), grid);
    return p;
  }

  /** マス 1 つ（div。48px）。pick が null なら えらべない */
  private cell(testid: 'kura-bag' | 'kura-store', c: KuraCellView, pick: (() => unknown) | null): HTMLDivElement {
    const d = el('div', 'kura-cell');
    d.dataset.testid = testid;
    d.classList.toggle('is-empty', c.item === null);
    d.classList.toggle('is-locked', c.locked);
    d.classList.toggle('is-sel', c.selected);
    if (c.item !== null) {
      d.dataset.item = c.item;
      d.dataset.count = String(c.count);
      d.append(img(itemIconUrl(c.item)));
      if (c.count > 1 || testid === 'kura-store') d.append(el('span', 'kura-cell__n', String(c.count)));
      if (c.item === this.pop) d.classList.add('is-pop');
    }
    if (pick) {
      d.addEventListener('click', () => {
        pick();
        this.d.tick();
        this.refresh();
      });
    }
    return d;
  }

  /** 下の 帯: えらんだ 物の 名前 ＋ 数の えらび ＋「あずける」「とりだす」 */
  private foot(v: KuraScreenView): HTMLElement {
    const foot = el('div', 'house-kura__foot');
    const pick = el('div', 'house-kura__pick');
    if (!v.selected || !v.action) {
      pick.textContent = 'マスを えらんでね';
      foot.append(pick);
      return foot;
    }
    const name = itemType(v.selected.item)?.name ?? v.selected.item;
    const label = el('span', 'house-kura__name');
    label.innerHTML = withRuby(name);
    pick.append(img(itemIconUrl(v.selected.item)), label);
    const ctl = el('div', 'house-kura__controls');
    const step = (id: string, text: string, fn: () => void): HTMLButtonElement => this.kuraButton(id, text, fn, false);
    const count = el('span', 'kura-num', String(v.amount));
    count.dataset.testid = 'kura-count';
    ctl.append(
      step('minus10', '−10', () => this.d.screen.plus(-10)),
      step('minus1', '−1', () => this.d.screen.plus(-1)),
      count,
      step('plus1', '＋1', () => this.d.screen.plus(1)),
      step('plus10', '＋10', () => this.d.screen.plus(10)),
      step('all', 'ぜんぶ', () => this.d.screen.all()),
      this.kuraButton(v.action, v.action === 'deposit' ? 'あずける' : 'とりだす', () => this.act(), true),
    );
    foot.append(pick, ctl);
    return foot;
  }

  private kuraButton(id: string, text: string, fn: () => void, go: boolean): HTMLButtonElement {
    const b = el('button', `house-btn${go ? ' house-btn--go' : ''}`, text);
    b.type = 'button';
    b.dataset.testid = `kura-${id}`;
    b.addEventListener('click', () => {
      fn();
      this.d.tick();
      this.refresh();
    });
    return b;
  }

  private act(): void {
    const sel = this.d.screen.view().selected;
    this.pop = sel ? sel.item : null;
    this.d.screen.act();
    this.refresh();
    this.pop = null;
  }
}
