import type { ItemId } from '../contracts';
import type { ButtonKey } from '../craft/info';
import { materialDotSources, type DetailView } from './craftModel';
import { mouseEl, questionUrl, fingerUrl } from './craftPanel.art';
import { rarityIndex } from '../drops/rarityTable';
import { createChip, createMeter, createButton, setButtonDisabled, setButtonKind, setRarity } from './theme';
import { starText } from './tooltipModel';
import { withRuby } from './text';

/** せつめい パネル（M6 §2.1 (2)）の DOM。1 度だけ作り、`renderDetail` で中身を入れかえる */
export interface DetailEls {
  root: HTMLDivElement;
  headArt: HTMLImageElement;
  name: HTMLDivElement;
  stars: HTMLSpanElement;
  word: HTMLSpanElement;
  /** CRAFT-PAGE: ページの 中身を 入れる 欄（スクロールしない） */
  body: HTMLDivElement;
  pageMake: HTMLDivElement;
  pageDesc: HTMLDivElement;
  pageStats: HTMLDivElement;
  /** ◀ ▶ とページ名・● の 行 */
  pager: HTMLDivElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  pageName: HTMLDivElement;
  pageDots: HTMLDivElement;
  useRow: HTMLDivElement;
  useText: HTMLElement;
  howRow: HTMLDivElement;
  howButtons: HTMLElement;
  howText: HTMLElement;
  stats: HTMLDivElement;
  classEl: HTMLDivElement;
  mats: HTMLDivElement;
  fuel: HTMLDivElement;
  /** 出来る物の 行（絵と できる かず） */
  out: HTMLSpanElement;
  outNum: HTMLSpanElement;
  outArt: HTMLImageElement;
  count: HTMLDivElement;
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


export function createDetailEls(parent: HTMLElement, h: { onPress(): void; onEnter(): void; onPage(delta: -1 | 1): void }): DetailEls {
  const root = el('div', 'rk-card cp-detail', parent);
  root.addEventListener('mouseenter', h.onEnter);
  const head = el('div', 'cp-head', root);
  const headArt = el('img', 'cp-head-art rk-art', head);
  headArt.alt = '';
  const name = el('div', 'cp-name rk-fs-title', head);
  const rarity = el('div', 'cp-rarity', root);
  const stars = el('span', 'cp-stars', rarity);
  const word = el('span', 'cp-word', rarity);

  // ◀ ページ名（その下に ●○） ▶
  const pager = el('div', 'cp-pager', root);
  const arrowBtn = (cls: string, delta: -1 | 1): HTMLButtonElement => {
    const b = createButton({ text: '' });
    b.classList.add(cls);
    b.setAttribute('aria-label', delta < 0 ? 'まえの ページ' : 'つぎの ページ');
    const arrow = el('span', 'cp-arrow', b); // 小さな ▲ の絵（当たりは ボタンの四角）
    arrow.dataset.dir = delta < 0 ? 'prev' : 'next';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      h.onPage(delta);
    });
    return b;
  };
  const prev = arrowBtn('cp-prev', -1);
  const mid = el('div', 'cp-pagemid');
  const pageName = el('div', 'cp-pagename', mid);
  const pageDots = el('div', 'cp-pagedots', mid);
  pager.append(prev, mid);
  const next = arrowBtn('cp-next', 1);
  pager.append(next);

  const body = el('div', 'cp-pagebody', root);
  const pageMake = el('div', 'cp-pg cp-pg-make', body);
  const mats = el('div', 'cp-mats', pageMake);
  const fuel = el('div', 'cp-fuelrow', pageMake);
  // 「→ 出来る物の絵 ×数」は ひとかたまり（材料の行の さいごに 付け、折り返すときも いっしょに 動く）
  const out = el('span', 'cp-out');
  const to = el('span', 'cp-to', out);
  to.textContent = '→';
  const outArt = el('img', 'cp-out-art rk-art', out);
  outArt.alt = '';
  const outNum = el('span', 'cp-out-num', out);
  const count = el('div', 'cp-count', pageMake); // できる かず = 今の材料で 作れる回数

  const pageDesc = el('div', 'cp-pg cp-pg-desc', body);
  const useRow = el('div', 'cp-row cp-use', pageDesc);
  const q = el('img', 'cp-mark-ico rk-art', useRow);
  q.alt = '';
  q.src = questionUrl();
  const useText = el('div', 'cp-text', useRow);
  const howRow = el('div', 'cp-row cp-how', pageDesc);
  const hand = el('img', 'cp-mark-ico cp-hand rk-art', howRow);
  hand.alt = '';
  hand.src = fingerUrl();
  const howBody = el('div', 'cp-text', howRow);
  const howButtons = el('span', 'cp-btns', howBody);
  const howText = el('span', 'cp-howtext', howBody);

  const pageStats = el('div', 'cp-pg cp-pg-stats', body);
  const classEl = el('div', 'cp-class rk-sub', pageStats);
  const stats = el('div', 'cp-stats', pageStats);

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
  return {
    root, headArt, name, stars, word, body, pageMake, pageDesc, pageStats, pager, prev, next, pageName, pageDots,
    useRow, useText, howRow, howButtons, howText, stats, classEl, mats, fuel, out, outNum, outArt, count, hint, button, empty, emptyArt,
  };
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

  const pg = d.pages[d.page] ?? d.pages[0];
  // せつめいの ページ: 長い せつめいは 文で 区切って 何ページかに 分けてある（このページの 分だけ 出す）
  const dp = pg.kind === 'desc' ? pg : undefined;
  e.useText.innerHTML = withRuby(dp?.use ?? d.use);
  e.useRow.dataset.later = String(d.later !== null);
  e.useRow.hidden = dp ? dp.use === '' : false;
  e.howButtons.replaceChildren();
  if (!dp || dp.buttons) for (const b of d.buttons) buttonPicture(b, e.howButtons);
  e.howText.innerHTML = withRuby(dp?.how ?? d.how);
  e.howRow.hidden = dp ? dp.how === '' && !dp.buttons : d.how === '';
  // ---- ページ（CRAFT-PAGE）: 今のページの 部品だけ 出す
  const many = d.pages.length > 1;
  e.pageMake.hidden = pg.kind !== 'make';
  e.pageDesc.hidden = pg.kind !== 'desc';
  e.pageStats.hidden = pg.kind !== 'stats';
  e.pageName.textContent = pg.name;
  e.pageDots.textContent = d.pages.map((_, i) => (i === d.page ? '●' : '○')).join(' ');
  e.pageDots.hidden = !many;
  e.prev.hidden = !many;
  e.next.hidden = !many;
  setButtonDisabled(e.prev, d.page <= 0);
  setButtonDisabled(e.next, d.page >= d.pages.length - 1);
  e.root.dataset.page = pg.kind;

  // 分類の文: つよさ の 1 ページ目に。つよさ が 無い物は せつめい の さいごに
  const hasStatsPage = d.pages.some((p) => p.kind === 'stats');
  const classHome = hasStatsPage ? e.pageStats : e.pageDesc;
  if (e.classEl.parentElement !== classHome) hasStatsPage ? classHome.prepend(e.classEl) : classHome.append(e.classEl);
  const classHere = hasStatsPage ? pg.kind === 'stats' && (pg.from ?? 0) === 0 : pg.kind === 'desc';
  e.classEl.textContent = d.classText;
  e.classEl.hidden = d.classText === '' || !classHere;
  e.stats.replaceChildren();
  const shownStats = pg.kind === 'stats' ? d.stats.slice(pg.from ?? 0, pg.to ?? d.stats.length) : [];
  e.stats.hidden = shownStats.length === 0;
  for (const s of shownStats) {
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
  e.mats.hidden = false;
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
  e.mats.append(e.out);

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

  e.outArt.src = iconOf(d.item);
  e.outNum.textContent = `×${d.count}`;
  const times = d.materials.length === 0 ? 0 : Math.min(...d.materials.map((m) => Math.floor(m.have / Math.max(1, m.need))));
  e.count.textContent = `できる かず ×${times}`;

  e.hint.textContent = d.hint ?? '';
  e.hint.hidden = d.hint === null;
  e.button.textContent = d.button.label;
  setButtonKind(e.button, d.button.enabled ? 'primary' : 'normal');
  e.button.classList.toggle('is-disabled', !d.button.enabled);
  e.button.setAttribute('aria-disabled', String(!d.button.enabled));
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
  e.button.textContent = 'つくる';
  setButtonKind(e.button, 'normal');
  e.button.classList.add('is-disabled');
  e.button.setAttribute('aria-disabled', 'true');
}
