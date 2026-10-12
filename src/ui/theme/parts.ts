/**
 * 部品を作る小さな関数（M6 S1。仕様 §3.5 (6)）。
 * 画面を作る人は、色や大きさを じかに書かずに これを使う（見た目は components.css）。
 * 漢字を入れるときは、呼ぶ側が ruby()（src/ui/text.ts）で作った HTML を html: に渡す。
 */

export type Rarity4 = 0 | 1 | 2 | 3;
export type MedalTier = 'bronze' | 'silver' | 'gold' | 'rainbow' | 'locked';

export interface TextContent {
  /** ふつうの文字 */
  text?: string;
  /** ルビつきの HTML（ruby() の出力）。text より優先 */
  html?: string;
}

function setContent(el: HTMLElement, c: TextContent): void {
  if (c.html !== undefined) el.innerHTML = c.html;
  else if (c.text !== undefined) el.textContent = c.text;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/** めずらしさの色を 部品にわたす（--rk-rarity を切りかえる） */
export function setRarity(el: HTMLElement, rarity: Rarity4 | null): void {
  if (rarity === null) {
    el.style.removeProperty('--rk-rarity');
    el.classList.remove('has-rarity');
    return;
  }
  el.style.setProperty('--rk-rarity', `var(--rk-rarity-${rarity})`);
  el.classList.add('has-rarity');
}

// ---------------------------------------------------------------- パネル・カード

export interface PanelParts {
  root: HTMLDivElement;
  head: HTMLDivElement;
  title: HTMLHeadingElement;
  body: HTMLDivElement;
  closeButton: HTMLButtonElement | null;
}

/** パネル: 上に 見出し（タイトル）と とじる ボタン（右上）。onClose を渡したときだけ ボタンを付ける */
export function createPanel(opts: { title: TextContent; onClose?: () => void; closeLabel?: TextContent }): PanelParts {
  const root = make('div', 'rk-root rk-panel');
  const head = make('div', 'rk-panel__head');
  const title = make('h2', 'rk-panel__title');
  setContent(title, opts.title);
  head.append(title);
  let closeButton: HTMLButtonElement | null = null;
  if (opts.onClose) {
    closeButton = createButton({ ...(opts.closeLabel ?? { text: 'とじる' }), kind: 'primary', onClick: opts.onClose });
    head.append(closeButton);
  }
  const body = make('div', 'rk-panel__body');
  root.append(head, body);
  return { root, head, title, body, closeButton };
}

export function createCard(): HTMLDivElement {
  return make('div', 'rk-card');
}

// ---------------------------------------------------------------- マス

export interface SlotOptions {
  size?: 'hotbar' | 'inv' | 'tansu';
  /** 絵の URL（ドット絵）。なければ からっぽ */
  art?: string;
  count?: number;
  selected?: boolean;
  rarity?: Rarity4 | null;
}

export interface SlotParts {
  root: HTMLDivElement;
  art: HTMLImageElement;
  count: HTMLSpanElement;
}

export function createSlot(opts: SlotOptions = {}): SlotParts {
  const root = make('div', 'rk-slot');
  const art = make('img', 'rk-slot__art rk-art');
  art.alt = '';
  const count = make('span', 'rk-slot__count');
  root.append(art, count);
  const parts = { root, art, count };
  paintSlot(parts, opts);
  return parts;
}

/** マスの見た目を更新する（毎回 new しない） */
export function paintSlot(p: SlotParts, opts: SlotOptions): void {
  p.root.classList.toggle('rk-slot--hotbar', opts.size === 'hotbar');
  p.root.classList.toggle('rk-slot--tansu', opts.size === 'tansu');
  p.root.classList.toggle('rk-slot--empty', !opts.art);
  p.root.classList.toggle('is-selected', !!opts.selected);
  setRarity(p.root, opts.art && opts.rarity !== undefined ? opts.rarity : null);
  if (opts.art) {
    if (p.art.getAttribute('src') !== opts.art) p.art.src = opts.art;
    p.art.hidden = false;
  } else {
    p.art.removeAttribute('src');
    p.art.hidden = true;
  }
  p.count.textContent = opts.count !== undefined && opts.count >= 2 ? String(opts.count) : '';
}

// ---------------------------------------------------------------- ボタン・タブ

export interface ButtonOptions extends TextContent {
  kind?: 'primary' | 'normal';
  disabled?: boolean;
  onClick?: () => void;
}

export function createButton(opts: ButtonOptions): HTMLButtonElement {
  const b = make('button', 'rk-btn');
  b.type = 'button';
  setContent(b, opts);
  setButtonKind(b, opts.kind ?? 'normal');
  setButtonDisabled(b, !!opts.disabled);
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

export function setButtonKind(b: HTMLElement, kind: 'primary' | 'normal'): void {
  b.classList.toggle('rk-btn--primary', kind === 'primary');
}

/** 押せない ボタンにする / もどす（disabled だと クリックも来ない） */
export function setButtonDisabled(b: HTMLButtonElement, disabled: boolean): void {
  b.disabled = disabled;
  b.classList.toggle('is-disabled', disabled);
}

export interface TabOptions extends TextContent {
  selected?: boolean;
  /** 赤い点（あたらしい） */
  dot?: boolean;
  /** 案内画面のタブ（高さ 64px 以上） */
  guide?: boolean;
  onClick?: () => void;
}

export function createTab(opts: TabOptions): HTMLButtonElement {
  const t = make('button', 'rk-tab');
  t.type = 'button';
  t.setAttribute('role', 'tab');
  setContent(t, opts);
  t.classList.toggle('rk-tab--guide', !!opts.guide);
  setTabState(t, { selected: !!opts.selected, dot: !!opts.dot });
  if (opts.onClick) t.addEventListener('click', opts.onClick);
  return t;
}

export function setTabState(t: HTMLElement, s: { selected: boolean; dot: boolean }): void {
  t.classList.toggle('is-selected', s.selected);
  t.setAttribute('aria-selected', String(s.selected));
  let dot = t.querySelector<HTMLElement>(':scope > .rk-tab__dot');
  if (s.dot && !dot) {
    dot = make('span', 'rk-tab__dot');
    t.append(dot);
  }
  if (dot) dot.hidden = !s.dot;
}

// ---------------------------------------------------------------- バー・メーター

export interface BarParts {
  root: HTMLDivElement;
  fill: HTMLDivElement;
}

export function createBar(kind: 'xp' | 'bake' = 'xp', value = 0): BarParts {
  const root = make('div', kind === 'bake' ? 'rk-bar rk-bar--bake' : 'rk-bar');
  const fill = make('div', 'rk-bar__fill');
  root.append(fill);
  const p = { root, fill };
  setBar(p, value);
  return p;
}

/** value は 0〜1 */
export function setBar(p: BarParts, value: number): void {
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  p.root.style.setProperty('--rk-bar-value', String(v));
  p.root.setAttribute('role', 'progressbar');
  p.root.setAttribute('aria-valuenow', String(Math.round(v * 100)));
}

export interface MeterParts {
  root: HTMLDivElement;
  cells: HTMLSpanElement[];
}

export function createMeter(total: number, on = 0): MeterParts {
  const root = make('div', 'rk-meter');
  const cells: HTMLSpanElement[] = [];
  for (let i = 0; i < total; i++) {
    const c = make('span', 'rk-meter__cell');
    cells.push(c);
    root.append(c);
  }
  const p = { root, cells };
  setMeter(p, on);
  return p;
}

export function setMeter(p: MeterParts, on: number): void {
  for (let i = 0; i < p.cells.length; i++) p.cells[i].classList.toggle('is-on', i < on);
}

// ---------------------------------------------------------------- チップ・ツールチップ・バッジ

export interface ChipOptions extends TextContent {
  /** ng = できない（赤い帯）、info = 知らせ（青い帯） */
  tone?: 'ng' | 'info';
  /** 見出しの大きさ（もちもの が いっぱい！ など） */
  head?: boolean;
  art?: string;
}

export function createChip(opts: ChipOptions): HTMLDivElement {
  const c = make('div', 'rk-chip');
  c.classList.toggle('rk-chip--ng', opts.tone === 'ng');
  c.classList.toggle('rk-chip--info', opts.tone === 'info');
  c.classList.toggle('rk-chip--head', !!opts.head);
  if (opts.art) {
    const img = make('img', 'rk-chip__art rk-art');
    img.alt = '';
    img.src = opts.art;
    c.append(img);
  }
  const label = make('span', 'rk-chip__text');
  setContent(label, opts);
  c.append(label);
  return c;
}

export interface TooltipParts {
  root: HTMLDivElement;
  name: HTMLDivElement;
  desc: HTMLDivElement;
}

export function createTooltip(rarity: Rarity4 = 0): TooltipParts {
  const root = make('div', 'rk-tooltip');
  root.style.setProperty('--rk-rarity', `var(--rk-rarity-${rarity})`);
  const name = make('div', 'rk-tooltip__name');
  const desc = make('div', 'rk-tooltip__desc');
  root.append(name, desc);
  return { root, name, desc };
}

export function createBadge(count: number, tone: 'ng' | 'accent' = 'ng'): HTMLSpanElement {
  const b = make('span', tone === 'accent' ? 'rk-badge rk-badge--accent' : 'rk-badge');
  b.textContent = String(count);
  return b;
}

// ---------------------------------------------------------------- メダル・モーダル

/** メダルのわく。中の絵（そのものの 16×16）は art に URL を渡す。locked は 灰色の ？ */
export function createMedal(tier: MedalTier, sizePx = 48, art?: string): HTMLDivElement {
  const m = make('div', 'rk-medal');
  m.dataset.tier = tier;
  m.style.setProperty('--rk-medal-size', `${sizePx}px`);
  if (tier === 'locked') {
    m.textContent = '？';
  } else if (art) {
    const img = make('img', 'rk-medal__art rk-art');
    img.alt = '';
    img.src = art;
    m.append(img);
  }
  return m;
}

export interface ModalParts {
  scrim: HTMLDivElement;
  modal: HTMLDivElement;
}

/** モーダル: うしろの暗い幕（scrim）と、真ん中の大きなカード（上に アクセントの帯） */
export function createModal(): ModalParts {
  const scrim = make('div', 'rk-root rk-scrim');
  const modal = make('div', 'rk-modal rk-enter');
  modal.append(make('div', 'rk-modal__band'));
  scrim.append(modal);
  return { scrim, modal };
}

/** 「ぷるん」をもう一度鳴らす（クラスを付け直す） */
export function popAnimation(el: HTMLElement): void {
  el.classList.remove('rk-pop');
  void el.offsetWidth;
  el.classList.add('rk-pop');
}
