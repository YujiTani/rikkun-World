import type { RenameView } from '../house/rename';
import type { HouseButtonId, HouseMenuState } from '../house/talk';
import { buildRenameList, buildRenameName, type RenameNamePanel } from './houseEditor/renameView';
import { houseButtonIcons } from './houseMenuArt';
import { HouseSiteUi, type SiteDeps } from './houseSite';
import { withRuby } from './text';
import './houseUi.css';

/**
 * 建築士さんの メニュー（HOUSE-1A。docs/design/HOUSE-1.md §2.3・§3.2）。HTML（ふりがなを つけるため）。1E: くらの 画面は なくなった。
 *  - 話して いる 間（うなずき・あいさつ）: 頭の 上の ふきだしだけ（`placeBubble` が 毎フレーム 頭に ついて 行く）。
 *  - メニュー: 画面の まん中に ふきだし → ボタンの たて 1 列（ボタンは `menu().buttons` の とおり。押せない 物は disabled）。
 * 画面の 更新は 出来事で 動く（`refresh`）。ゲームの 時間が 止まって いる 間も 動く ように 時計には たよらない。
 * DOM: `[data-testid="house-menu"]`・`house-bubble`・ボタン `house-btn-<id>`。
 */

const LABEL: Readonly<Record<HouseButtonId, string>> = {
  editor: 'せっけいずを つくる',
  build: 'けんちくを はじめる',
  rename: 'なまえを かえる',
  tools: 'どうぐを もらう',
  close: 'とじる',
};
/** 押すと はたらく ボタン（目立たせる） */
const GO: ReadonlySet<HouseButtonId> = new Set<HouseButtonId>(['tools']);

type Mode = 'off' | 'float' | 'menu' | 'editor' | 'site' | 'sky';

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
  /** エディターの 画面を 作って 返す（親は 引数の 要素）。はじめて エディターが 開く とき 1 回 */
  makeEditor(parent: HTMLElement): EditorViewLike;
  /** 「ポン」（ボタン・ページを かえた 音） */
  tick(): void;
  /** 話して いる 建築士さんの 頭の 上（画面の ピクセル）。見えなければ null */
  anchor(): { x: number; y: number } | null;
  /** 「けんちくを はじめる」の 画面（一覧・ひつような もの・上空の 視点）が 読む もの。press・tick は 上と 同じ */
  site: Omit<SiteDeps, 'press' | 'tick'>;
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
  /** 「けんちくを はじめる」の 画面（HOUSE-1C PR-2） */
  private readonly site: HouseSiteUi;

  constructor(private readonly d: HouseUiDeps) {
    this.el = el('div', 'house-ui');
    this.bubble = el('div', 'house-bubble');
    this.bubble.dataset.testid = 'house-bubble';
    this.el.append(this.bubble);
    this.site = new HouseSiteUi({ ...d.site, press: (id) => d.press(id), tick: () => d.tick() }, this.bubble);
    d.parent.append(this.el);
  }

  /** メニュー・エディターが 開いて いる */
  isOpen(): boolean {
    return this.mode === 'menu' || this.mode === 'editor' || this.mode === 'site' || this.mode === 'sky';
  }

  /** 画面を 今の 状態に あわせる（menu() が かわった とき・ボタンを おした とき） */
  refresh(): void {
    const m = this.d.menu();
    const mode: Mode = m.open
      ? m.build
        ? m.page === 'sky' ? 'sky' : 'site'
        : m.page === 'editor' || m.page === 'need' ? 'editor' : 'menu'
      : m.bubble !== '' ? 'float' : 'off';
    if (mode !== this.mode) this.setMode(mode);
    if (mode === 'off') return;
    const html = withRuby(m.bubble);
    if (this.bubble.innerHTML !== html) this.bubble.innerHTML = html;
    if (mode === 'menu') this.renderMenu(m);
    else if (mode === 'editor') this.editorView?.refresh();
    else if (mode === 'site' || mode === 'sky') this.site.render(m);
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
    // ふきだしは 1 つを 使いまわす（エディターの 見出しの だんに 入れる 前に 一度 出す。メニューを けす ときに 巻きこまない）
    this.el.append(this.bubble);
    this.menuEl?.remove();
    this.menuEl = null;
    this.menuSig = '';
    this.namePanel = null;
    if (this.mode === 'editor') this.editorView?.show(false);
    if (mode !== 'site' && mode !== 'sky') {
      this.site.clear();
      this.site.root.remove();
    } else if (!this.site.root.isConnected) this.el.append(this.site.root);
    this.mode = mode;
    for (const m of ['float', 'menu', 'editor', 'site', 'sky'] as const) this.el.classList.toggle(`is-${m}`, mode === m);
    if (mode === 'editor') {
      this.editorView ??= this.d.makeEditor(this.el);
      this.editorView.sayHost.append(this.bubble);
      this.editorView.show(true);
    }
    if (mode !== 'float') {
      this.bubble.style.left = '';
      this.bubble.style.top = '';
    }
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
}
