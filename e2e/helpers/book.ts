import type { Page } from '@playwright/test';

/**
 * BOOK-1（3D の本）の E2E の準備。窓口 `window.__rikkun.lock` に聞いて確かめる（docs/design/BOOK-1.md §4.4）。
 * 本の窓口は まだ ない時期にも 書けるよう、型は any で受ける。
 */

export interface BookState {
  locked: boolean;
  bookOpen: boolean;
  bookView: 'toc' | 'chapter' | 'item' | 'closed';
  bookChapter: string | null;
  bookItem: string | null;
  bookListPage: number;
  bookAnim: 'none' | 'appear' | 'open' | 'turn' | 'bump' | 'close';
  bookAnimLeft: number;
  bookLinks: string[];
  bookChapters: { id: string; label: string; itemIds: string[] }[];
  bookItemIds: string[];
  bookCaption: string;
  bookLastChapter: string | null;
  bookBumps: number;
  bookSounds: string[];
  guideTab: string;
  guideItems: number;
}

export const OPEN_BTN = '[data-book-open]';
export const link = (id: string) => `[data-book-link="${id}"]`;
export const btn = (name: 'back' | 'toc' | 'close' | 'prev' | 'next') => `[data-book-btn="${name}"]`;

/** ゲームを開いて 止める。案内画面（ロックなし）のまま。 */
export async function openGuide(page: Page, query = '?nosave=1'): Promise<void> {
  await page.addInitScript(() => {
    const w = window as any;
    w.__lockReq = 0;
    const orig = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function (...a: any[]) {
      w.__lockReq++;
      return (orig as any).apply(this, a);
    };
  });
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.achievements?.mute(true);
    h.input?.releaseAll();
    h.step(2);
  });
}

export const state = (page: Page): Promise<BookState> => page.evaluate(() => (window.__rikkun as any).lock.get());

export const step = (page: Page, n = 1) => page.evaluate((n) => (window.__rikkun as any).step(n), n);

/** 動きが ぜんぶ おわるまで 1 コマずつ進める（時間では待たない）。進めた コマ数を返す */
export async function settle(page: Page, max = 1200): Promise<number> {
  return page.evaluate((max) => {
    const h = window.__rikkun as any;
    let n = 0;
    while (n < max && h.lock.get().bookAnim !== 'none') {
      h.step(1);
      n++;
    }
    return n;
  }, max);
}

/** 本を出す（動きなし・音なし）。target は 'toc'・章の id・項目の id */
export async function bookAt(page: Page, target: string): Promise<void> {
  await page.evaluate((t) => {
    const h = window.__rikkun as any;
    h.lock.simulate(false);
    h.lock.book(t);
    h.step(2);
  }, target);
  await settle(page);
}

/** 動きを 1 コマずつ 進めながら、`bookAnim` の 変わり目を 集める（同じ名前の連続は 1 つ） */
export async function animTrail(page: Page, max = 1200): Promise<string[]> {
  return page.evaluate((max) => {
    const h = window.__rikkun as any;
    const seen: string[] = [];
    const push = () => {
      const a = h.lock.get().bookAnim;
      if (seen[seen.length - 1] !== a) seen.push(a);
    };
    push();
    for (let n = 0; n < max && h.lock.get().bookAnim !== 'none'; n++) {
      h.step(1);
      push();
    }
    return seen;
  }, max);
}

/** 要素を 画面の外の 判定なしで 押す（hidden でも 動く）。なければ false */
export function poke(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, selector);
}

/** キーの くり返し（repeat: true）の keydown を 送る */
export function repeatKey(page: Page, key: string): Promise<void> {
  return page.evaluate((key) => {
    const code = key === 'Escape' ? 'Escape' : key;
    const ev = new KeyboardEvent('keydown', { key, code, repeat: true, bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(ev);
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, repeat: true, bubbles: true, cancelable: true }));
  }, key);
}

export const SIZES = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1024, h: 700 },
] as const;

/** 本の外の 見えなくなる べき もの（§2.2b）の 見えている 数 */
export function visibleBehind(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sels = ['#hud', '#clock', '.po-button', '.po-adult', '[data-book-open]', 'button[aria-label="おと"]'];
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.01;
    };
    const out: string[] = [];
    for (const sel of sels) for (const el of document.querySelectorAll(sel)) if (vis(el)) out.push(sel);
    return out;
  });
}
