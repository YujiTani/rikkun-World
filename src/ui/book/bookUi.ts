import type { ItemId } from '../../contracts';
import { escapeHtml, withRuby } from '../text';
import { itemIconUrl } from '../itemIcon';
import { rarityTier } from '../../drops/rarityTable';
import { BOOK_CHAPTERS, BOOK_ITEMS } from './bookData';
import type { BookLayout, Rect } from './bookLayout';
import type { BookModel } from './bookModel';
import { listSpreads } from './bookNav';
import { ZUKAN_GROUPS, ZUKAN_LEFT, ZUKAN_NO_SOURCE, ZUKAN_SECRET, zukanBodyHtml, type ZukanGroup } from './zukanData';
import './book.css';
import './zukan.css';

/** ZUKAN-1: アイテムの てに いれかた（作る画面の 説明と 同じ データ）。「どんな もの」は 登録表の 読み物の 文〔ZukanEntry.text〕 */
interface ZukanInfo {
  source: string;
}

/**
 * BOOK-1: 本の 外がわの ボタンと、止まっている 間だけ 紙に かさねる HTML（仕様 §3.5 候補 1）。
 * 動きの 間は リンクと 字を かくす（`hidden`）。ボタンは ✕ いがい 動きの 間も 見えるが、押しても 何も 起きない（モデルが 受けつけない）。
 */
export interface BookUiHandlers {
  chapter(id: string): void;
  item(id: string): void;
  back(): void;
  toc(): void;
  close(): void;
  prev(): void;
  next(): void;
  /** ZUKAN-1 */
  zukan(): void;
  zukanItem(id: string): void;
  zukanFilter(query: string, group: ZukanGroup | null): void;
  info(id: ItemId): ZukanInfo;
}

type BtnName = 'back' | 'toc' | 'close' | 'prev' | 'next';

const SVG = (body: string) => `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" fill="none" stroke="#fff3cf" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS: Record<BtnName, string> = {
  back: SVG('<path d="M13 8 5 16l8 8"/><path d="M5 16h14a8 8 0 0 1 8 8"/>'),
  toc: SVG('<path d="M9 4h14v24l-7-6-7 6z" fill="#fff3cf"/>'),
  close: SVG('<path d="M7 7l18 18M25 7 7 25"/>'),
  prev: SVG('<path d="M21 6 9 16l12 10z" fill="#fff3cf"/>'),
  next: SVG('<path d="M11 6l12 10-12 10z" fill="#fff3cf"/>'),
};
const LABEL: Record<BtnName, string> = { back: 'もどる', toc: 'もくじ', close: 'とじる', prev: 'まえ', next: 'つぎ' };

/** 説明の 字（ふりがなを のぞいた もの。テスト用） */
export function plainCaption(html: string): string {
  return html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '');
}

const chapterOf = (id: string) => BOOK_CHAPTERS.find((c) => c.id === id);
const itemOf = (id: string) => BOOK_ITEMS.find((i) => i.id === id);
const artUrl = (art: string) => `${import.meta.env.BASE_URL}${art}`;

export class BookUi {
  readonly layer: HTMLDivElement;
  readonly book: HTMLDivElement;
  private readonly spread: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly buttons = {} as Record<BtnName, HTMLButtonElement>;
  private key = '';
  private gridKey = '';
  /** ずかんの 文の 大きさを 決めた ときの key（key が かわる たびに 決めなおす） */
  private fitKey = '';

  constructor(parent: HTMLElement, private readonly h: BookUiHandlers) {
    this.layer = document.createElement('div');
    this.layer.className = 'bk-layer';
    this.layer.hidden = true;
    // 本の 外を クリックしても 何も 起きない（遊びを 始めない・とじない）
    this.layer.addEventListener('click', (e) => e.stopPropagation());
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
    this.book = document.createElement('div');
    this.book.className = 'bk-book';
    this.book.dataset.book = '';
    this.spread = document.createElement('div');
    this.spread.className = 'bk-spread';
    this.content = document.createElement('div');
    this.content.className = 'bk-content';
    this.spread.appendChild(this.content);
    this.book.appendChild(this.spread);
    for (const name of ['back', 'toc', 'close', 'prev', 'next'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `bk-btn bk-btn-${name}`;
      b.dataset.bookBtn = name;
      b.setAttribute('aria-label', LABEL[name]);
      b.innerHTML = ICONS[name];
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h[name]();
      });
      this.buttons[name] = b;
      this.book.appendChild(b);
    }
    this.content.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = (e.target as Element).closest<HTMLElement>('[data-book-link]');
      if (!el || el.hidden) return;
      const id = el.dataset.bookLink!;
      if (el.dataset.kind === 'chapter') this.h.chapter(id);
      else if (el.dataset.kind === 'zukan') this.h.zukanItem(id);
      else this.h.item(id);
    });
    // ZUKAN-1: ずかんを ひらく・組の ボタン・さがす 字
    this.content.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-zukan-open]')) this.h.zukan();
      const g = t.closest<HTMLElement>('[data-zukan-group]');
      if (g) {
        const id = g.dataset.zukanGroup as ZukanGroup;
        this.h.zukanFilter(this.query(), g.getAttribute('aria-pressed') === 'true' ? null : id);
      }
    });
    this.content.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.matches('[data-zukan-search]')) this.h.zukanFilter(el.value, this.pressedGroup());
    });
    this.layer.appendChild(this.book);
    parent.appendChild(this.layer);
  }

  /** 3D の canvas を 本の うしろに 入れる */
  mountCanvas(c: HTMLCanvasElement): void {
    this.layer.insertBefore(c, this.book);
  }

  show(): void {
    this.layer.hidden = false;
  }
  hide(): void {
    this.layer.hidden = true;
    this.key = '';
  }

  setLayout(L: BookLayout): void {
    const px = (r: Rect) => {
      return { left: `${r.l}px`, top: `${r.t}px`, width: `${r.w}px`, height: `${r.h}px` };
    };
    Object.assign(this.book.style, px(L.book));
    const sp = L.spread;
    Object.assign(this.spread.style, { left: `${sp.l - L.book.l}px`, top: `${sp.t - L.book.t}px`, width: `${sp.w}px`, height: `${sp.h}px` });
    this.spread.style.setProperty('--pw', `${L.pageW}px`);
    this.spread.style.setProperty('--ph', `${L.pageH}px`);
    this.spread.style.setProperty('--art', String(L.artScale));
    for (const name of Object.keys(this.buttons) as BtnName[]) {
      const r = L.buttons[name];
      Object.assign(this.buttons[name].style, { left: `${r.l - L.book.l}px`, top: `${r.t - L.book.t}px` });
    }
    this.key = ''; // 大きさが かわったら 作りなおす
  }

  /** かさねた HTML の 四角（見開き） */
  overlayRect(): Rect {
    const r = this.spread.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  }

  render(m: BookModel): void {
    const moving = m.anim !== 'none';
    const key = `${m.view}|${m.chapter}|${m.item}|${m.listPage}|${m.lastChapter}`;
    if (key !== this.key && m.view !== 'closed') {
      this.key = key;
      this.gridKey = '';
      this.fitKey = '';
      this.content.innerHTML = this.pagesHtml(m);
    }
    // ZUKAN-1: 一覧の マスだけ 作りなおす（さがす 字の らんは そのまま。入力中の 字が 消えない）
    if (m.view === 'zukan') {
      const gk = `${m.zukanQuery}|${m.zukanGroup}|${m.zukanPage}`;
      if (gk !== this.gridKey) {
        this.gridKey = gk;
        this.zukanGrid(m);
      }
    }
    // 動きの 間は 字と リンクを かくす
    this.content.hidden = moving || m.view === 'closed';
    for (const el of this.content.querySelectorAll<HTMLElement>('[data-book-link], [data-item-id]')) el.hidden = moving;
    // ZUKAN-1: 読み物の 文が 右の ページに はいる 大きさに する（止まって 見えて いる 間に 1 回）
    if (!moving && m.view === 'zukanItem' && this.fitKey !== this.key) {
      this.fitKey = this.key;
      this.fitZukanText();
    }
    // ボタン
    const a = m.arrows();
    const inBook = m.isOpen && m.view !== 'closed';
    this.buttons.close.hidden = !inBook;
    this.buttons.back.hidden = !inBook || m.view === 'toc';
    this.buttons.toc.hidden = !inBook || m.view === 'toc';
    this.buttons.prev.hidden = !inBook || !a.show;
    this.buttons.next.hidden = !inBook || !a.show;
    this.buttons.prev.dataset.edge = a.prevEdge ? '1' : '0';
    this.buttons.next.dataset.edge = a.nextEdge ? '1' : '0';
    // 本が あらわれて ひらく 間は ✕ だけ
    const opening = m.anim === 'appear' || m.anim === 'open';
    if (opening) for (const n of ['back', 'toc', 'prev', 'next'] as const) this.buttons[n].hidden = true;
  }

  // ------------------------------------------------------------------ ページの 中

  /** 右の ページの 文を、はいる いちばん 大きい 字（24 → 20 → 16px）に する。16px でも はいらない 小さい 画面は スクロール（zukan.css） */
  private fitZukanText(): void {
    const it = this.content.querySelector<HTMLElement>('.zk-item');
    if (!it) return;
    for (const cls of ['', 'zk-s20', 'zk-s16']) {
      it.classList.remove('zk-s20', 'zk-s16');
      if (cls) it.classList.add(cls);
      if (it.scrollHeight <= it.clientHeight) break;
    }
  }

  private pagesHtml(m: BookModel): string {
    if (m.view === 'toc') return this.tocHtml(m);
    if (m.view === 'chapter') return this.chapterHtml(m);
    if (m.view === 'item') return this.itemHtml(m);
    if (m.view === 'zukan') return this.zukanHtml(m);
    if (m.view === 'zukanItem') return this.zukanItemHtml(m);
    return '';
  }

  private ic(icon: string): string {
    return `<span class="bk-ic" aria-hidden="true">${escapeHtml(icon)}</span>`;
  }

  private tocHtml(m: BookModel): string {
    const hero = itemOf('move-walk');
    const rows = m.data.chapters
      .map((c) => {
        const def = chapterOf(c.id);
        const ribbon = m.lastChapter === c.id ? '<span class="bk-mark" aria-hidden="true"></span>' : '';
        return `<button type="button" class="bk-link bk-chap" data-book-link="${c.id}" data-kind="chapter">${this.ic(def?.icon ?? '')}<span class="bk-label">${escapeHtml(c.label)}</span>${ribbon}</button>`;
      })
      .join('');
    return (
      `<div class="bk-pg bk-pg-l"><h1 class="bk-name">あそびかたの ほん</h1>` +
      (hero ? `<div class="bk-frame"><img class="bk-art" src="${artUrl(hero.art)}" alt=""></div>` : '') +
      `<button type="button" class="bk-link zk-open" data-zukan-open><span class="bk-ic" aria-hidden="true">📖</span><span class="bk-label">アイテム ずかん</span></button>` +
      `</div>` +
      `<div class="bk-pg bk-pg-r"><div class="bk-rows bk-rows-toc">${rows}</div></div>`
    );
  }

  private rowHtml(id: string): string {
    const it = itemOf(id);
    if (!it) return '';
    return `<button type="button" class="bk-link bk-itm" data-book-link="${id}" data-kind="item"><img class="bk-thumb" src="${artUrl(it.art)}" alt=""><span class="bk-label">${escapeHtml(it.title)}</span></button>`;
  }

  private chapterHtml(m: BookModel): string {
    const def = chapterOf(m.chapter ?? '');
    const spread = listSpreads(m.chapterItems())[m.listPage - 1] ?? [];
    const left = spread.slice(0, 6);
    const right = spread.slice(6, 12);
    return (
      `<div class="bk-pg bk-pg-l"><div class="bk-head">${this.ic(def?.icon ?? '')}<span class="bk-chname">${escapeHtml(def?.label ?? '')}</span></div>` +
      `<div class="bk-rows bk-rows-6">${left.map((i) => this.rowHtml(i)).join('')}</div></div>` +
      `<div class="bk-pg bk-pg-r"><div class="bk-head"></div><div class="bk-rows bk-rows-6">${right.map((i) => this.rowHtml(i)).join('')}</div></div>`
    );
  }

  private itemHtml(m: BookModel): string {
    const it = itemOf(m.item ?? '');
    if (!it) return '';
    const def = chapterOf(it.chapter);
    const ids = m.chapterItems();
    const k = ids.indexOf(it.id);
    const dots =
      ids.length <= 15
        ? ids.map((_, i) => `<span class="bk-dot" data-on="${i === k}"></span>`).join('')
        : `<span class="bk-count">${k + 1} / ${ids.length}</span>`;
    return (
      `<div class="bk-pg bk-pg-l"><div class="bk-head">${this.ic(def?.icon ?? '')}<span class="bk-chname">${escapeHtml(def?.label ?? '')}</span></div>` +
      `<div class="bk-frame"><img class="bk-art" src="${artUrl(it.art)}" alt=""></div></div>` +
      `<div class="bk-pg bk-pg-r"><div class="bk-item" data-item-id="${it.id}"><h2 class="bk-title">${escapeHtml(it.title)}</h2><p class="bk-cap">${it.caption}</p></div>` +
      `<div class="bk-dots">${dots}</div></div>`
    );
  }

  // ------------------------------------------------------------------ ZUKAN-1 アイテム ずかん

  private query(): string {
    return this.content.querySelector<HTMLInputElement>('[data-zukan-search]')?.value ?? '';
  }

  private pressedGroup(): ZukanGroup | null {
    return (this.content.querySelector<HTMLElement>('[data-zukan-group][aria-pressed="true"]')?.dataset.zukanGroup as ZukanGroup | undefined) ?? null;
  }

  private zukanHead(): string {
    return `<div class="bk-head">${this.ic('📖')}<span class="bk-chname">アイテム ずかん</span></div>`;
  }

  private zukanHtml(m: BookModel): string {
    const all = m.zukanEntries();
    const groups = ZUKAN_GROUPS.map((g) => {
      const sample = all.find((e) => e.group === g.id && !e.shadow) ?? all.find((e) => e.group === g.id);
      const icon = sample ? `<img class="zk-gicon" src="${itemIconUrl(sample.id)}" alt="">` : '';
      return `<button type="button" class="zk-group" data-zukan-group="${g.id}" aria-pressed="${m.zukanGroup === g.id}">${icon}<span>${escapeHtml(g.label)}</span></button>`;
    }).join('');
    return (
      `<div class="bk-pg bk-pg-l">${this.zukanHead()}` +
      `<label class="zk-search"><span aria-hidden="true">🔍</span><input type="search" data-zukan-search placeholder="なまえ で さがす" value="${escapeHtml(m.zukanQuery)}" autocomplete="off" spellcheck="false"></label>` +
      `<div class="zk-groups">${groups}</div>` +
      `<div class="zk-grid zk-grid-l" data-zukan-grid="l"></div></div>` +
      `<div class="bk-pg bk-pg-r"><div class="zk-grid zk-grid-r" data-zukan-grid="r"></div><div class="zk-count" data-zukan-count></div></div>`
    );
  }

  private zukanGrid(m: BookModel): void {
    const ids = m.zukanVisible();
    const byId = new Map(m.zukanEntries().map((e) => [e.id as string, e]));
    const tile = (id: string) => {
      const e = byId.get(id)!;
      const t = rarityTier(e.rarity);
      return (
        `<button type="button" class="bk-link zk-tile" data-book-link="${id}" data-kind="zukan" style="--zk-r: var(${t.cssVar})">` +
        `<img class="zk-icon${e.shadow ? ' zk-shadow' : ''}" src="${itemIconUrl(e.id)}" alt="">` +
        `<span class="zk-name">${withRuby(e.name)}</span></button>`
      );
    };
    const l = this.content.querySelector('[data-zukan-grid="l"]');
    const r = this.content.querySelector('[data-zukan-grid="r"]');
    if (l) l.innerHTML = ids.slice(0, ZUKAN_LEFT).map(tile).join('');
    if (r) r.innerHTML = ids.slice(ZUKAN_LEFT).map(tile).join('');
    const total = m.zukanIds().length;
    const c = this.content.querySelector('[data-zukan-count]');
    if (c) c.textContent = total === 0 ? 'みつからない よ' : '';
    for (const b of this.content.querySelectorAll<HTMLElement>('[data-zukan-group]')) b.setAttribute('aria-pressed', String(b.dataset.zukanGroup === m.zukanGroup));
  }

  private zukanItemHtml(m: BookModel): string {
    const e = m.zukanEntries().find((x) => x.id === m.item);
    if (!e) return '';
    const t = rarityTier(e.rarity);
    const info = this.h.info(e.id);
    const source = e.shadow ? ZUKAN_SECRET : info.source || ZUKAN_NO_SOURCE;
    const ids = m.zukanIds();
    const k = ids.indexOf(e.id);
    return (
      `<div class="bk-pg bk-pg-l">${this.zukanHead()}` +
      `<div class="zk-big" style="--zk-r: var(${t.cssVar})"><img class="zk-bigicon${e.shadow ? ' zk-shadow' : ''}" src="${itemIconUrl(e.id)}" alt=""></div>` +
      `<h2 class="bk-title zk-title">${withRuby(e.name)}</h2>` +
      `<div class="zk-stars" style="--zk-r: var(${t.cssVar})">${'★'.repeat(t.stars)}<span class="zk-word">${escapeHtml(t.word)}</span></div></div>` +
      `<div class="bk-pg bk-pg-r">${zukanBodyHtml(e, source)}` +
      `<div class="bk-dots"><span class="bk-count">${k + 1} / ${ids.length}</span></div></div>`
    );
  }
}
