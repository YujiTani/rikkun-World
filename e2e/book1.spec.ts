import { expect, test, type Page } from '@playwright/test';
import { OPEN_BTN, SIZES, animTrail, bookAt, btn, link, openGuide, poke, repeatKey, settle, state, step, visibleBehind } from './helpers/book';

/**
 * BOOK-1（issue #42）3D の本。docs/design/BOOK-1.md §6 の【E2E】の基準。
 * 章・項目の id と 数は ゲームに 聞く（`bookChapters`）。決め打ちは 「長い説明」の grow-seeds と 角の項目だけ。
 * 動きの長さは 決めていないので、時間では待たず `h.step(1)` を くり返して 終わりを見る。
 */

/** 本を出して もくじまで（ボタンを押す → 動きが終わるまで） */
async function openBookByButton(page: Page) {
  await page.locator(OPEN_BTN).click();
  await settle(page);
}

/** 項目が 2 こ以上 あって 3 こ以上ある章（まん中の項目を 作るため）の 先頭から 3 つ */
async function chapterWithMiddle(page: Page) {
  const s = await state(page);
  return s.bookChapters.find((c) => c.itemIds.length >= 3)!;
}

test.describe('BOOK-1 本の 流れ', () => {
  test('AC1: ボタンは 1 つ。押すと ロックなしで appear → open → none、もくじ、リンク ＝ 章', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator(OPEN_BTN)).toHaveCount(1);
    const before = await state(page);
    expect(before.bookOpen).toBe(false);
    await page.locator(OPEN_BTN).click();
    const trail = await animTrail(page);
    expect(trail).toEqual(['appear', 'open', 'none']);
    const s = await state(page);
    expect(s.locked).toBe(false);
    expect(s.bookOpen).toBe(true);
    expect(s.bookView).toBe('toc');
    expect(s.bookLinks).toEqual(s.bookChapters.map((c) => c.id));
    expect(s.bookChapters.length).toBeGreaterThanOrEqual(5);
    // 画面にも その章の リンクが ある
    const dom = await page.locator('[data-book-link]:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.bookLink));
    expect(dom).toEqual(s.bookLinks);
  });

  test('AC5: 章の リンク → turn → 章の一覧。リンク ＝ 項目（12 まで）、guideTab・guideItems', async ({ page }) => {
    await openGuide(page);
    await openBookByButton(page);
    const toc = await state(page);
    for (const ch of toc.bookChapters) {
      await bookAt(page, 'toc');
      await page.locator(link(ch.id)).click();
      await step(page, 1);
      const mid = await state(page);
      expect(mid.bookAnim, ch.id).toBe('turn');
      await settle(page);
      const s = await state(page);
      expect(s.bookView, ch.id).toBe('chapter');
      expect(s.bookChapter).toBe(ch.id);
      expect(s.bookLinks).toEqual(ch.itemIds.slice(0, 12));
      expect(s.guideTab).toBe(ch.id);
      expect(s.guideItems).toBe(ch.itemIds.length);
    }
  });

  test('AC6: 項目の リンク → turn → 項目。data-item-id は ちょうど 1 つ、字 ＝ bookCaption', async ({ page }) => {
    await openGuide(page);
    const toc = (await (async () => {
      await openBookByButton(page);
      return state(page);
    })());
    const ch = toc.bookChapters[0];
    await bookAt(page, ch.id);
    const id = ch.itemIds[1];
    await page.locator(link(id)).click();
    await step(page, 1);
    expect((await state(page)).bookAnim).toBe('turn');
    await settle(page);
    const s = await state(page);
    expect(s.bookView).toBe('item');
    expect(s.bookItem).toBe(id);
    expect(s.bookLinks).toEqual([]);
    const ids = page.locator('[data-item-id]:not([hidden])');
    await expect(ids).toHaveCount(1);
    expect(await ids.getAttribute('data-item-id')).toBe(id);
    expect(s.bookCaption.length).toBeGreaterThan(0);
    const text = await ids.evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelectorAll('rt, rp').forEach((n) => n.remove());
      return (c.textContent ?? '').replace(/\s+/g, '');
    });
    // 字の かたまりには 見出しなども 入るので、説明が ふくまれることを 見る
    expect(text).toContain(s.bookCaption.replace(/\s+/g, ''));
  });

  test('AC7: ▶ ◀ と → ←、はしでは bookItem そのまま・bookBumps ＋1', async ({ page }) => {
    await openGuide(page);
    await bookAt(page, 'toc');
    const ch = await chapterWithMiddle(page);
    const [a, b, c] = ch.itemIds;
    await bookAt(page, a);
    expect((await state(page)).bookItem).toBe(a);
    // 最初で ◀: ゆれるだけ
    const b0 = (await state(page)).bookBumps;
    await page.locator(btn('prev')).click();
    await step(page, 1);
    expect((await state(page)).bookAnim).toBe('bump');
    await settle(page);
    let s = await state(page);
    expect(s.bookItem).toBe(a);
    expect(s.bookBumps).toBe(b0 + 1);
    // ▶ で つぎ
    await page.locator(btn('next')).click();
    await settle(page);
    expect((await state(page)).bookItem).toBe(b);
    // → で つぎ
    await page.keyboard.press('ArrowRight');
    await settle(page);
    expect((await state(page)).bookItem).toBe(c);
    // ◀ ← で まえ
    await page.locator(btn('prev')).click();
    await settle(page);
    expect((await state(page)).bookItem).toBe(b);
    await page.keyboard.press('ArrowLeft');
    await settle(page);
    expect((await state(page)).bookItem).toBe(a);
    // 最後で ▶ と →
    const last = ch.itemIds[ch.itemIds.length - 1];
    await bookAt(page, last);
    const b1 = (await state(page)).bookBumps;
    await page.locator(btn('next')).click();
    await settle(page);
    await page.keyboard.press('ArrowRight');
    await settle(page);
    s = await state(page);
    expect(s.bookItem).toBe(last);
    expect(s.bookBumps).toBe(b1 + 2);
  });

  test('AC7: 最初の ◀・最後の ▶ は ほかと 見た目が ちがう（うすさ ＋ 形の しるし）', async ({ page }) => {
    await openGuide(page);
    await bookAt(page, 'toc');
    const ch = await chapterWithMiddle(page);
    const look = () =>
      page.evaluate(() => {
        const f = (n: string) => {
          const el = document.querySelector(`[data-book-btn="${n}"]`) as HTMLElement;
          return { op: Number(getComputedStyle(el).opacity), html: el.innerHTML, attr: el.getAttribute('aria-disabled') ?? el.getAttribute('data-edge') };
        };
        return { prev: f('prev'), next: f('next') };
      });
    await bookAt(page, ch.itemIds[0]);
    const first = await look();
    expect(first.prev.op).toBeLessThan(first.next.op);
    expect(first.prev.html !== first.next.html || first.prev.attr !== first.next.attr).toBe(true);
    await bookAt(page, ch.itemIds[1]);
    const mid = await look();
    expect(mid.prev.op).toBe(mid.next.op);
    await bookAt(page, ch.itemIds[ch.itemIds.length - 1]);
    const last = await look();
    expect(last.next.op).toBeLessThan(last.prev.op);
  });

  test('AC8: もどる・Esc・もくじ・✕ で とじる。とじたら 案内画面で ロックなし', async ({ page }) => {
    await openGuide(page);
    const ch = (await (async () => {
      await bookAt(page, 'toc');
      return chapterWithMiddle(page);
    })());
    const id = ch.itemIds[1];
    // もどる: ③ → ② → ①
    await bookAt(page, id);
    await page.locator(btn('back')).click();
    await settle(page);
    let s = await state(page);
    expect([s.bookView, s.bookChapter]).toEqual(['chapter', ch.id]);
    await page.locator(btn('back')).click();
    await settle(page);
    expect((await state(page)).bookView).toBe('toc');
    // Esc: ③ → ② → ①
    await bookAt(page, id);
    await page.keyboard.press('Escape');
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookChapter]).toEqual(['chapter', ch.id]);
    await page.keyboard.press('Escape');
    await settle(page);
    expect((await state(page)).bookView).toBe('toc');
    // Backspace: ③ → ②、① では 何もしない
    await bookAt(page, id);
    await page.keyboard.press('Backspace');
    await settle(page);
    expect((await state(page)).bookView).toBe('chapter');
    await page.keyboard.press('Backspace');
    await settle(page);
    expect((await state(page)).bookView).toBe('toc');
    await page.keyboard.press('Backspace');
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookOpen]).toEqual(['toc', true]);
    // もくじ: ③ から すぐ ①
    await bookAt(page, id);
    await page.locator(btn('toc')).click();
    await settle(page);
    expect((await state(page)).bookView).toBe('toc');
    // ① の Esc で とじる
    const closeCheck = async () => {
      const t = await animTrail(page);
      expect(t).toContain('close');
      const e = await state(page);
      expect(e.bookOpen).toBe(false);
      expect(e.bookView).toBe('closed');
      expect(e.locked).toBe(false);
      await expect(page.locator(OPEN_BTN)).toBeVisible();
    };
    await page.keyboard.press('Escape');
    await closeCheck();
    // ✕: ①・②・③
    for (const t of ['toc', ch.id, id]) {
      await bookAt(page, t);
      await page.locator(btn('close')).click();
      await closeCheck();
    }
  });

  test('AC9: 動きの途中は リンク・◀▶・もどる・もくじ を うけつけない。✕ は 効く', async ({ page }) => {
    await openGuide(page);
    await bookAt(page, 'toc');
    const ch = await chapterWithMiddle(page);
    const [a, b, c] = ch.itemIds;
    // ③ a で ▶ → 途中で 他を 押す → 終わると b
    await bookAt(page, a);
    await page.locator(btn('next')).click();
    await step(page, 1);
    let s = await state(page);
    expect(s.bookAnimLeft).toBeGreaterThan(0);
    expect(s.bookLinks).toEqual([]);
    for (const n of ['next', 'prev', 'back', 'toc'] as const) await poke(page, btn(n));
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookItem]).toEqual(['item', b]);
    // ② で 項目 a を押す → 途中で 別の リンク・もどる・もくじ を押す → 終わると a の ③
    await bookAt(page, ch.id);
    await page.locator(link(a)).click();
    await step(page, 1);
    s = await state(page);
    expect(s.bookAnimLeft).toBeGreaterThan(0);
    expect(s.bookLinks).toEqual([]);
    await poke(page, link(c));
    await poke(page, link(b));
    for (const n of ['back', 'toc'] as const) await poke(page, btn(n));
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookItem]).toEqual(['item', a]);
    // ① → 章 → 途中で ほかの 章を押す
    await bookAt(page, 'toc');
    const chapters = s.bookChapters;
    await page.locator(link(chapters[0].id)).click();
    await step(page, 1);
    expect((await state(page)).bookLinks).toEqual([]);
    await poke(page, link(chapters[1].id));
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookChapter]).toEqual(['chapter', chapters[0].id]);
    // ✕ は 途中でも 効く
    await bookAt(page, a);
    await page.locator(btn('next')).click();
    await step(page, 1);
    expect((await state(page)).bookAnimLeft).toBeGreaterThan(0);
    await page.locator(btn('close')).click();
    await step(page, 1);
    expect((await state(page)).bookAnim).toBe('close');
    await settle(page);
    expect((await state(page)).bookOpen).toBe(false);
  });

  test('AC10: repeat の keydown（→・Esc）では 動かない', async ({ page }) => {
    await openGuide(page);
    await bookAt(page, 'toc');
    const ch = await chapterWithMiddle(page);
    await bookAt(page, ch.itemIds[1]);
    await repeatKey(page, 'ArrowRight');
    await settle(page);
    let s = await state(page);
    expect([s.bookView, s.bookItem]).toEqual(['item', ch.itemIds[1]]);
    await repeatKey(page, 'Escape');
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookItem, s.bookOpen]).toEqual(['item', ch.itemIds[1], true]);
    await bookAt(page, 'toc');
    await repeatKey(page, 'Escape');
    await settle(page);
    s = await state(page);
    expect([s.bookView, s.bookOpen]).toEqual(['toc', true]);
    // 押しなおすと 動く
    await page.keyboard.press('Escape');
    await settle(page);
    expect((await state(page)).bookOpen).toBe(false);
  });

  test('AC8: ① ② ③ の Backspace は ブラウザの「前のページへ」を 止める（defaultPrevented）。遊び中は 止めない', async ({ page }) => {
    await openGuide(page);
    const prevented = () =>
      page.evaluate(() => {
        const ev = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true });
        document.body.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
    await bookAt(page, 'toc');
    expect(await prevented()).toBe(true);
    await page.evaluate(() => (window.__rikkun as any).lock.simulate(true));
    await bookAt(page, 'toc'); // lock.book は ロックを はずして 本を出す
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.lock.simulate(true);
      h.step(2);
    });
    expect((await state(page)).bookOpen).toBe(false);
    expect(await prevented()).toBe(false);
  });

  test('AC11: 遊んでいる間（ロック中）の → ← Esc Backspace では 本が 出ない・変わらない', async ({ page }) => {
    await openGuide(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.lock.simulate(true);
      h.step(2);
    });
    const before = await state(page);
    for (const k of ['ArrowRight', 'ArrowLeft', 'Escape', 'Backspace']) {
      await page.keyboard.press(k);
      await step(page, 2);
      const s = await state(page);
      expect(s.bookOpen, k).toBe(false);
      expect(s.bookView, k).toBe('closed');
      expect(s.bookItem, k).toBe(before.bookItem);
      expect(s.bookChapter, k).toBe(before.bookChapter);
      expect(s.bookBumps, k).toBe(before.bookBumps);
      expect(s.bookSounds, k).toEqual(before.bookSounds);
      // Esc で ロックを 手ばなした場合は 案内画面が 出てよいので、次の キーの 前に ロックを もどす
      await page.evaluate(() => (window.__rikkun as any).lock.simulate(true));
    }
  });

  test('AC12: 章を ひらいて とじ、もう一度 ひらくと もくじ ＋ しおりひも。リロードで null', async ({ page }) => {
    await openGuide(page);
    await openBookByButton(page);
    const s0 = await state(page);
    expect(s0.bookLastChapter).toBeNull();
    const x = s0.bookChapters[2].id;
    await page.locator(link(x)).click();
    await settle(page);
    await page.locator(btn('close')).click();
    await settle(page);
    await page.locator(OPEN_BTN).click();
    await settle(page);
    const s = await state(page);
    expect(s.bookView).toBe('toc');
    expect(s.bookLastChapter).toBe(x);
    // リロード
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    expect((await state(page)).bookLastChapter).toBeNull();
  });

  test('AC13: 音の記録（open・turn・bump・close を 1 つずつ）', async ({ page }) => {
    await openGuide(page);
    const count = async (name: string) => (await state(page)).bookSounds.filter((x) => x === name).length;
    expect(await count('open')).toBe(0);
    await openBookByButton(page);
    expect(await count('open')).toBe(1);
    const base = await count('turn');
    const toc = await state(page);
    const ch = toc.bookChapters.find((c) => c.itemIds.length >= 3)!;
    const [a, b] = ch.itemIds;
    await page.locator(link(ch.id)).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 1);
    await page.locator(link(a)).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 2);
    await page.locator(btn('next')).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 3);
    expect((await state(page)).bookItem).toBe(b);
    await page.locator(btn('prev')).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 4);
    // はし
    const bump0 = await count('bump');
    await page.locator(btn('prev')).click();
    await settle(page);
    expect(await count('bump')).toBe(bump0 + 1);
    expect(await count('turn')).toBe(base + 4);
    await page.locator(btn('back')).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 5);
    await page.locator(link(a)).click();
    await settle(page);
    await page.locator(btn('toc')).click();
    await settle(page);
    expect(await count('turn')).toBe(base + 7);
    const close0 = await count('close');
    await page.locator(btn('close')).click();
    await settle(page);
    expect(await count('close')).toBe(close0 + 1);
    expect(await count('open')).toBe(1);
  });

  test('AC15: 「あそぼう」は ロックを求める。本が出ている間は 本の外を クリックしても 始まらない', async ({ page }) => {
    await openGuide(page);
    const req = () => page.evaluate(() => (window as any).__lockReq as number);
    expect(await req()).toBe(0);
    await page.locator('.po-button').click();
    expect(await req()).toBeGreaterThan(0);
    // 本を出す
    await page.evaluate(() => {
      (window.__rikkun as any).lock.simulate(false);
      (window.__rikkun as any).step(2);
    });
    await openBookByButton(page);
    const r0 = await req();
    const vp = page.viewportSize()!;
    await page.mouse.click(2, 2); // 本の外（うすい黒の所）
    await page.mouse.click(vp.width - 2, vp.height - 2);
    await step(page, 2);
    const s = await state(page);
    expect(await req()).toBe(r0);
    expect(s.bookOpen).toBe(true);
    expect(s.bookView).toBe('toc');
    expect(s.locked).toBe(false);
  });
});

test.describe('BOOK-1 動きを へらす', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('AC14: どの動きも bookAnimLeft 0 から。押した 次の 1 コマで 次の ページ。音は 同じ', async ({ page }) => {
    await openGuide(page);
    const sounds = async () => (await state(page)).bookSounds;
    await page.locator(OPEN_BTN).click();
    expect((await state(page)).bookAnimLeft).toBe(0);
    await step(page, 1);
    let s = await state(page);
    expect([s.bookView, s.bookAnim, s.bookAnimLeft]).toEqual(['toc', 'none', 0]);
    expect((await sounds()).filter((x) => x === 'open').length).toBe(1);
    const ch = s.bookChapters.find((c) => c.itemIds.length >= 3)!;
    await page.locator(link(ch.id)).click();
    expect((await state(page)).bookAnimLeft).toBe(0);
    await step(page, 1);
    s = await state(page);
    expect([s.bookView, s.bookChapter]).toEqual(['chapter', ch.id]);
    await page.locator(link(ch.itemIds[0])).click();
    await step(page, 1);
    s = await state(page);
    expect([s.bookView, s.bookItem]).toEqual(['item', ch.itemIds[0]]);
    await page.locator(btn('next')).click();
    expect((await state(page)).bookAnimLeft).toBe(0);
    await step(page, 1);
    expect((await state(page)).bookItem).toBe(ch.itemIds[1]);
    await page.locator(btn('prev')).click();
    await step(page, 1);
    await page.locator(btn('prev')).click(); // はし
    expect((await state(page)).bookAnimLeft).toBe(0);
    await step(page, 1);
    s = await state(page);
    expect(s.bookBumps).toBe(1);
    expect(s.bookAnim).toBe('none');
    expect(s.bookItem).toBe(ch.itemIds[0]);
    await page.locator(btn('close')).click();
    expect((await state(page)).bookAnimLeft).toBe(0);
    await step(page, 1);
    s = await state(page);
    expect(s.bookOpen).toBe(false);
    const snd = await sounds();
    expect(snd.filter((x) => x === 'turn').length).toBe(4);
    expect(snd.filter((x) => x === 'bump').length).toBe(1);
    expect(snd.filter((x) => x === 'close').length).toBe(1);
  });
});

test.describe('BOOK-1 画面', () => {
  test('AC16: 本が出ている間 後ろの HUD・案内のボタンは 見えない。とじると 見える', async ({ page }) => {
    await openGuide(page);
    const shown = await visibleBehind(page);
    expect(shown.length, `本の前: ${shown}`).toBeGreaterThan(0);
    await openBookByButton(page);
    expect(await visibleBehind(page)).toEqual([]);
    for (const t of ['toc', 'grow', 'grow-seeds']) {
      await bookAt(page, t);
      expect(await visibleBehind(page), t).toEqual([]);
    }
    await page.locator(btn('close')).click();
    await settle(page);
    expect((await visibleBehind(page)).length).toBeGreaterThan(0);
  });

  for (const { w, h } of SIZES) {
    test(`AC16: ${w}x${h} 本と ボタンが 画面に 入り 上下左右 24px 以上あく・ボタン 64px 以上`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openGuide(page);
      for (const t of ['toc', 'grow', 'grow-seeds', 'dig-bag']) {
        await bookAt(page, t);
        const r = await page.evaluate(() => {
          const rect = (el: Element | null) => {
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
          };
          const btns = Array.from(document.querySelectorAll('[data-book-btn]')).filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && !(e as HTMLElement).hidden;
          });
          return { book: rect(document.querySelector('[data-book]') ?? document.querySelector('#book')), btns: btns.map(rect), vw: innerWidth, vh: innerHeight };
        });
        expect(r.btns.length, t).toBeGreaterThan(0);
        const all = [...(r.book ? [r.book] : []), ...r.btns.map((b) => b!)];
        for (const b of all) {
          expect(b.l, `${t} 左`).toBeGreaterThanOrEqual(24 - 0.5);
          expect(b.t, `${t} 上`).toBeGreaterThanOrEqual(24 - 0.5);
          expect(r.vw - b.r, `${t} 右`).toBeGreaterThanOrEqual(24 - 0.5);
          expect(r.vh - b.b, `${t} 下`).toBeGreaterThanOrEqual(24 - 0.5);
        }
        for (const b of r.btns) {
          expect(b!.w, `${t} ボタンのはば`).toBeGreaterThanOrEqual(63.5);
          expect(b!.h, `${t} ボタンの高さ`).toBeGreaterThanOrEqual(63.5);
        }
      }
    });
  }

  test('AC16b: 止まっている間は 描画回数が ふえない。世界の時間は 本を出す前と 同じ', async ({ page }) => {
    await openGuide(page);
    const time0 = await page.evaluate(() => JSON.stringify((window.__rikkun as any).time.get?.() ?? null));
    await openBookByButton(page);
    for (const t of ['toc', 'grow', 'grow-seeds']) {
      await bookAt(page, t);
      expect((await state(page)).bookAnim).toBe('none');
      const a = await page.evaluate(() => (window.__rikkun as any).renderStats());
      await step(page, 60);
      const b = await page.evaluate(() => (window.__rikkun as any).renderStats());
      expect(b.drawCalls, t).toBe(a.drawCalls);
      expect(b.triangles, t).toBe(a.triangles);
      // 描き直した累計（three の info.render.frame）。必須: 窓口に なければ ここで 落ちる（毎コマ描く実装を 見つけるため）
      expect(typeof a.frames, 'renderStats().frames').toBe('number');
      expect(b.frames, `${t} 描き直し`).toBe(a.frames);
    }
    const time1 = await page.evaluate(() => JSON.stringify((window.__rikkun as any).time.get?.() ?? null));
    expect(time1).toBe(time0);
  });

  for (const { w, h } of SIZES) {
    test(`AC17: ${w}x${h} 3D の見開きと かさねた HTML が 2px 以内。どの ページでも 本の四角は 同じ`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openGuide(page);
      let ref: { l: number; t: number; r: number; b: number } | null = null;
      for (const t of ['toc', 'grow', 'grow-seeds']) {
        await bookAt(page, t);
        const r = await page.evaluate(() => {
          const s = (window.__rikkun as any).lock.get();
          const bk = document.querySelector('[data-book]') ?? document.querySelector('#book');
          const b = bk?.getBoundingClientRect();
          return { page: s.bookPageRect, ov: s.bookOverlayRect, book: b ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null };
        });
        const norm = (q: any) => {
          const l = q.left ?? q.x ?? q.l;
          const t = q.top ?? q.y ?? q.t;
          return { l, t, r: q.right ?? l + q.width, b: q.bottom ?? t + q.height };
        };
        expect(r.page, t).toBeTruthy();
        expect(r.ov, t).toBeTruthy();
        const p = norm(r.page);
        const o = norm(r.ov);
        for (const k of ['l', 't', 'r', 'b'] as const) expect(Math.abs(p[k] - o[k]), `${t} ${k}`).toBeLessThanOrEqual(2);
        expect(r.book, t).toBeTruthy();
        if (!ref) ref = r.book!;
        for (const k of ['l', 't', 'r', 'b'] as const) expect(Math.abs(r.book![k] - ref[k]), `${t} 本 ${k}`).toBeLessThanOrEqual(1);
      }
    });
  }
});
