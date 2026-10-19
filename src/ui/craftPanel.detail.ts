import type { ItemId } from '../contracts';
import type { ButtonKey } from '../craft/info';
import { materialDotSources, type DetailView } from './craftModel';
import { mouseEl, questionUrl, fingerUrl } from './craftPanel.art';
import { rarityIndex } from '../drops/rarityTable';
import { createChip, createMeter, createButton, setButtonKind, setRarity, } from './theme';
import { starText } from './tooltipModel';
import { withRuby } from './text';

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
  /** 材料が 1 つも無いときの 大きな文と絵 */
  empty: HTMLDivElement;
  emptyArt: HTMLImageElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

export const EMPTY_TEXT = 'ざいりょう を あつめよう！';


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

  const empty = el('div', 'cp-empty', root);
  empty.hidden = true;
  const emptyArt = el('img', 'cp-empty-art rk-art', empty);
  emptyArt.alt = '';
  const emptyText = el('div', 'cp-empty-text rk-fs-title', empty);
  emptyText.textContent = EMPTY_TEXT;

  const hint = el('div', 'cp-hint rk-sub', root);
  const button = createButton({ text: 'つくる', kind: 'primary' });
  button.classList.add('cp-press');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    h.onPress();
  });
  root.append(button);
  return { root, headArt, name, stars, word, scroll, useRow, useText, howRow, howButtons, howText, stats, classEl, mats, fuel, count, more, hint, button, empty, emptyArt };
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

/** チップの右上に たんす の小さな絵（16px。1 倍）。「たんす の ものだ」と分かる印 */
function addTansuMini(chip: HTMLElement, iconOf: (item: ItemId) => string): void {
  const img = document.createElement('img');
  img.className = 'cp-tansu-mini rk-art';
  img.alt = '';
  img.src = iconOf('tansu' as ItemId);
  chip.append(img);
}

/** 中身を入れる（d が null なら かくす）。iconOf はアイテムの絵の URL */
export function renderDetail(e: DetailEls, d: DetailView | null, iconOf: (item: ItemId) => string, onFuel?: (item: ItemId) => void): void {
  e.root.hidden = d === null;
  e.empty.hidden = true;
  delete e.root.dataset.empty;
  if (!d) return;
  setRarity(e.root, rarityIndex(d.rarity));
  e.root.classList.toggle('cp-detail--legendary', rarityIndex(d.rarity) === 6);
  e.headArt.src = iconOf(d.item);
  e.name.innerHTML = withRuby(d.name); // 名前は ［漢字｜よみ］ → ふりがなつき（WEAPON-7 §2.7）
  e.stars.textContent = starText(d.stars);
  e.word.textContent = d.rarityWord;
  e.root.dataset.id = d.id;

  e.useText.innerHTML = withRuby(d.use);
  e.useRow.dataset.later = String(d.later !== null);
  e.howButtons.replaceChildren();
  for (const b of d.buttons) buttonPicture(b, e.howButtons);
  e.howText.innerHTML = withRuby(d.how);
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
    // まる（要る数だけ）: もちもの = みどり、たんす = 桐色、足りない = 赤いわくの白
    const dotSet = el('span', 'cp-dotset', chip);
    for (const src of materialDotSources(m.need, m.have, m.inTansu ?? 0)) {
      const dot = el('span', 'cp-dot', dotSet);
      dot.dataset.src = src;
      dot.dataset.ok = String(src !== 'none');
    }
    chip.dataset.tansu = String(m.inTansu ?? 0);
    if ((m.inTansu ?? 0) > 0) addTansuMini(chip, iconOf);
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
      const t = d.fuel.inTansu?.[item] ?? 0;
      chip.dataset.tansu = String(t);
      if (t > 0) addTansuMini(chip, iconOf);
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

/** 作れる物が 1 つも無いとき: 真ん中に大きな文と木の絵、「つくる」は灰色で押せない */
export function renderDetailEmpty(e: DetailEls, iconUrl: string): void {
  e.root.hidden = false;
  e.root.dataset.empty = 'true';
  delete e.root.dataset.id;
  setRarity(e.root, 0);
  e.empty.hidden = false;
  e.emptyArt.src = iconUrl;
  e.hint.hidden = true;
  e.more.hidden = true;
  e.button.textContent = 'つくる';
  setButtonKind(e.button, 'normal');
  e.button.classList.add('is-disabled');
  e.button.setAttribute('aria-disabled', 'true');
}
