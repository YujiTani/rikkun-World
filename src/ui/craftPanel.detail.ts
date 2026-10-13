import type { ItemId } from '../contracts';
import type { ButtonKey } from '../craft/info';
import type { DetailView } from './craftModel';
import { mouseEl, questionUrl, fingerUrl } from './craftPanel.art';
import { createChip, createMeter, createButton, setButtonKind, setRarity, type Rarity4 } from './theme';
import { starText } from './tooltipModel';

/** せつめい パネル（M6 §2.1 (2)）の DOM。1 度だけ作り、`renderDetail` で中身を入れかえる */
export interface DetailEls {
  root: HTMLDivElement;
  headArt: HTMLImageElement;
  name: HTMLDivElement;
  stars: HTMLSpanElement;
  word: HTMLSpanElement;
  scroll: HTMLDivElement;
  useRow: HTMLDivElement;
  useText: HTMLElement;
  howRow: HTMLDivElement;
  howButtons: HTMLElement;
  howText: HTMLElement;
  stats: HTMLDivElement;
  classEl: HTMLDivElement;
  mats: HTMLDivElement;
  fuel: HTMLDivElement;
  count: HTMLDivElement;
  more: HTMLButtonElement;
  hint: HTMLDivElement;
  button: HTMLButtonElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

const RARITY_INDEX = { common: 0, uncommon: 1, rare: 2, superRare: 3 } as const;

export function createDetailEls(parent: HTMLElement, h: { onPress(): void; onEnter(): void }): DetailEls {
  const root = el('div', 'rk-card cp-detail', parent);
  root.addEventListener('mouseenter', h.onEnter);
  const head = el('div', 'cp-head', root);
  const headArt = el('img', 'cp-head-art rk-art', head);
  headArt.alt = '';
  const name = el('div', 'cp-name rk-fs-title', head);
  const rarity = el('div', 'cp-rarity', root);
  const stars = el('span', 'cp-stars', rarity);
  const word = el('span', 'cp-word', rarity);

  const scroll = el('div', 'cp-scroll', root);
  const useRow = el('div', 'cp-row cp-use', scroll);
  const q = el('img', 'cp-mark-ico rk-art', useRow);
  q.alt = '';
  q.src = questionUrl();
  const useText = el('div', 'cp-text', useRow);
  const howRow = el('div', 'cp-row cp-how', scroll);
  const hand = el('img', 'cp-mark-ico cp-hand rk-art', howRow);
  hand.alt = '';
  hand.src = fingerUrl();
  const howBody = el('div', 'cp-text', howRow);
  const howButtons = el('span', 'cp-btns', howBody);
  const howText = el('span', 'cp-howtext', howBody);
  const classEl = el('div', 'cp-class rk-sub', scroll);
  const stats = el('div', 'cp-stats', scroll);
  const mats = el('div', 'cp-mats', scroll);
  const fuel = el('div', 'cp-fuelrow', scroll);
  const count = el('div', 'cp-count', scroll);

  const more = el('button', 'cp-more', root);
  more.type = 'button';
  more.textContent = '▼ つづき';
  more.hidden = true;
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    scroll.scrollBy({ top: scroll.clientHeight * 0.8 });
    updateMore({ scroll, more });
  });
  scroll.addEventListener('scroll', () => updateMore({ scroll, more }));

  const hint = el('div', 'cp-hint rk-sub', root);
  const button = createButton({ text: 'つくる', kind: 'primary' });
  button.classList.add('cp-press');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    h.onPress();
  });
  root.append(button);
  return { root, headArt, name, stars, word, scroll, useRow, useText, howRow, howButtons, howText, stats, classEl, mats, fuel, count, more, hint, button };
}

/** ▼ つづき: はみ出していて、まだ いちばん下でないとき だけ出す */
export function updateMore(e: Pick<DetailEls, 'scroll' | 'more'>): void {
  const s = e.scroll;
  e.more.hidden = !(s.scrollHeight - s.clientHeight > 1 && s.scrollTop + s.clientHeight < s.scrollHeight - 1);
}

function buttonPicture(key: ButtonKey, into: HTMLElement): void {
  const cap = (text: string) => {
    const k = el('span', 'cp-key', into);
    k.textContent = text;
  };
  const mouse = (which: 'left' | 'right') => {
    const m = mouseEl(which);
    m.classList.add('cp-mouse');
    into.append(m);
  };
  if (key === 'E') cap('E');
  else if (key === '1-9') cap('1〜9');
  else if (key === 'left') mouse('left');
  else if (key === 'right') mouse('right');
  else {
    mouse('left');
    const d = el('span', 'cp-dots', into);
    d.textContent = '…';
  }
}

function statNum(v: number | string): string {
  return typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
}

/** 中身を入れる（d が null なら かくす）。iconOf はアイテムの絵の URL */
export function renderDetail(e: DetailEls, d: DetailView | null, iconOf: (item: ItemId) => string, onFuel?: (item: ItemId) => void): void {
  e.root.hidden = d === null;
  if (!d) return;
  setRarity(e.root, RARITY_INDEX[d.rarity] as Rarity4);
  e.headArt.src = iconOf(d.item);
  e.name.textContent = d.name;
  e.stars.textContent = starText(d.stars);
  e.word.textContent = d.rarityWord;
  e.root.dataset.id = d.id;

  e.useText.textContent = d.use;
  e.useRow.dataset.later = String(d.later !== null);
  e.howButtons.replaceChildren();
  for (const b of d.buttons) buttonPicture(b, e.howButtons);
  e.howText.textContent = d.how;
  e.howRow.hidden = d.how === '';

  e.classEl.textContent = d.classText;
  e.classEl.hidden = d.classText === '';
  e.stats.replaceChildren();
  e.stats.hidden = d.stats.length === 0;
  for (const s of d.stats) {
    const row = el('div', 'cp-stat', e.stats);
    row.dataset.key = s.key;
    const label = el('span', 'cp-stat-label', row);
    label.textContent = s.label;
    const num = el('span', 'cp-stat-num rk-num', row);
    num.textContent = statNum(s.value);
    if (typeof s.value === 'number' && s.max !== undefined) {
      const m = createMeter(s.max, Math.min(s.max, Math.round(s.value)));
      m.root.classList.add('cp-meter');
      row.append(m.root);
    }
    if (s.compare) {
      const c = el('span', 'cp-compare rk-sub', row);
      c.textContent = s.compare;
    }
  }

  e.mats.replaceChildren();
  e.mats.hidden = d.materials.length === 0;
  for (const m of d.materials) {
    const chip = createChip({ art: iconOf(m.item), html: `<span class="cp-have">${m.have}</span> / ${m.need}`, tone: m.ok ? undefined : 'ng' });
    chip.classList.add('cp-mat');
    chip.dataset.ok = String(m.ok);
    chip.dataset.item = m.item;
    el('span', 'cp-dot', chip).dataset.ok = String(m.ok);
    e.mats.append(chip);
  }

  e.fuel.replaceChildren();
  e.fuel.hidden = d.fuel === null;
  if (d.fuel) {
    for (const [item, n] of Object.entries(d.fuel.counts)) {
      if (n <= 0) continue; // 持っていない物は出さない
      const chip = createChip({ art: iconOf(item as ItemId), text: String(n) });
      chip.classList.add('cp-fuelchip');
      chip.dataset.next = String(d.fuel.next === item);
      chip.dataset.item = item;
      chip.style.cursor = 'pointer';
      chip.style.pointerEvents = 'auto';
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onFuel?.(item as ItemId);
      });
      e.fuel.append(chip);
    }
  }

  e.count.hidden = d.count < 2;
  e.count.textContent = `できる かず ×${d.count}`;

  e.hint.textContent = d.hint ?? '';
  e.hint.hidden = d.hint === null;
  e.button.textContent = d.button.label;
  setButtonKind(e.button, d.button.enabled ? 'primary' : 'normal');
  e.button.classList.toggle('is-disabled', !d.button.enabled);
  e.button.setAttribute('aria-disabled', String(!d.button.enabled));
  updateMore(e);
}
