import { expect, test, type Page } from '@playwright/test';
import { waitAnimationsDone } from './helpers/anim';

/**
 * CRAFT-PAGE（#277、docs/tickets/CRAFT-PAGE.md）の受け入れ基準 1〜6。基準 7（check:ui）は 開発のあとで回す。
 *
 * 開発が足す窓口（`src/craft/hook.ts` の `createCraftPanelHook` ＋ `src/ui/craftPanel.ts`。ふりがなの タグは 入れない 文字だけ）:
 *  - `craft.page(): { names: string[]; index: number; recipe: string | null; prevEnabled: boolean; nextEnabled: boolean; dots: number }`
 *      えらんでいるマスの 説明欄。names = ページ名の ぜんぶ（例 ['つくりかた ①','つくりかた ②','つくりかた ③','せつめい']）、
 *      index = 今のページ、recipe = 「つくる」が 使う 作り方の レシピ id（作り方のページなら そのページ、
 *      せつめい・つよさ なら さいごに見た作り方、無ければ 開いたときの作り方）、
 *      prevEnabled / nextEnabled = ◀ ▶ が 押せるか、dots = ●○ の 数（ページが 1 枚なら 0）。
 *  - `craft.pageGo(delta: -1 | 1): boolean`  ◀ ▶ を 押したのと 同じ。はしで 動かなければ false。
 *  - `craft.list()` に たいまつの 新しい作り方が 2 つ ふえる（id は 開発が決める。出来る物は torch、works: true、station: craft）。
 * 画面の 部品（DOM。矢印の当たりと はみ出しを 見る）: 前へ = `.cp-detail .cp-prev`、次へ = `.cp-detail .cp-next`
 *   （`<button>` の 四角が 押せる広さ。見えない当たりを 広げてよい）、ページ名 = `.cp-detail .cp-pagename`、●○ = `.cp-detail .cp-pagedots`。
 */

type PageState = { names: string[]; index: number; recipe: string | null; prevEnabled: boolean; nextEnabled: boolean; dots: number };

async function open(page: Page, items: [string, number][]) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate((items) => {
    const h = window.__rikkun as any;
    h.pause();
    h.lock.simulate(true);
    h.step(2);
    h.achievements?.mute?.(true);
    h.inventory.clear();
    for (const [item, n] of items) h.inventory.add(item, n);
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(3);
  }, items);
  await waitAnimationsDone(page);
}

const select = (page: Page, id: string) =>
  page.evaluate((id) => {
    const h = window.__rikkun as any;
    h.craft.hover(null);
    // すでに えらばれていれば 押さない（もう 1 回押すと「つくる」になる）
    const r = h.craft.ui().selected === id ? { action: 'keep', ok: true } : h.craft.tileClick(id);
    h.step(2);
    return { action: r.action, ok: r.ok, selected: h.craft.ui().selected };
  }, id);

const pageState = (page: Page): Promise<PageState> => page.evaluate(() => (window.__rikkun as any).craft.page());
const go = (page: Page, d: -1 | 1) =>
  page.evaluate((d) => {
    const h = window.__rikkun as any;
    const r = h.craft.pageGo(d);
    h.step(2);
    return r as boolean;
  }, d);
const count = (page: Page, item: string) => page.evaluate((i) => (window.__rikkun as any).inventory.count(i), item);
const make = (page: Page) =>
  page.evaluate(() => {
    const h = window.__rikkun as any;
    const r = h.craft.detailPress();
    h.step(2);
    return r as { ok: boolean; reason: string | null };
  });

test.describe('CRAFT-PAGE たいまつの作り方', () => {
  test('AC1: き1・せきたん1 → +4 / き3 → +1 / き1・あぶら1 → +4（それぞれ craft.make で作れる）', async ({ page }) => {
    await open(page, []);
    const r = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const torchIds: string[] = h.craft.list().filter((c: any) => c.output?.item === 'torch' || c.id.startsWith('torch')).map((c: any) => c.id);
      const inv = (i: string) => h.inventory.count(i);
      const run = (id: string, have: [string, number][]) => {
        h.inventory.clear();
        for (const [i, n] of have) h.inventory.add(i, n);
        const before = { torch: inv('torch'), log: inv('log'), coal: inv('coal_ore'), oil: inv('oil') };
        const res = h.craft.make(id);
        return { ok: res.ok, d: { torch: inv('torch') - before.torch, log: inv('log') - before.log, coal: inv('coal_ore') - before.coal, oil: inv('oil') - before.oil } };
      };
      const list = h.craft.list();
      const byInputs = (want: Record<string, number>) =>
        list.find(
          (c: any) =>
            (c.output?.item ?? c.id) === 'torch' &&
            c.inputs.length === Object.keys(want).length &&
            c.inputs.every((i: any) => want[i.item] === i.count),
        )?.id as string | undefined;
      const coalId = byInputs({ log: 1, coal_ore: 1 });
      const logId = byInputs({ log: 3 });
      const oilId = byInputs({ log: 1, oil: 1 });
      return {
        torchIds,
        coalId,
        logId,
        oilId,
        coal: coalId ? run(coalId, [['log', 1], ['coal_ore', 1]]) : null,
        log: logId ? run(logId, [['log', 3]]) : null,
        oil: oilId ? run(oilId, [['log', 1], ['oil', 1]]) : null,
        coalMissing: coalId ? run(coalId, [['log', 1]]) : null,
      };
    });
    expect(r.torchIds.length, 'たいまつの 作り方は 3 つ').toBe(3);
    expect(r.coalId, 'き1・せきたん1 → たいまつ のレシピ').toBeTruthy();
    expect(r.logId, 'き3 → たいまつ のレシピ').toBeTruthy();
    expect(r.oilId).toBe('torch'); // 元の id は かえない
    expect(r.coal).toEqual({ ok: true, d: { torch: 4, log: -1, coal: -1, oil: 0 } });
    expect(r.log).toEqual({ ok: true, d: { torch: 1, log: -3, coal: 0, oil: 0 } });
    expect(r.oil).toEqual({ ok: true, d: { torch: 4, log: -1, coal: 0, oil: -1 } });
    expect(r.coalMissing?.ok, 'せきたん が無いと 作れない').toBe(false);
  });

  test('AC2: カードの たいまつ は 1 枚（作り方が 3 つでも）', async ({ page }) => {
    await open(page, [['log', 9], ['coal_ore', 3], ['oil', 3]]);
    const r = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const tiles = h.craft.ui().tiles as { id: string }[];
      const cards = h.craft.ui().cards as { id: string }[]; // tiles は 材料を持つ物だけ。カード数は cards で見る
      const list = h.craft.list() as { id: string; output: { item: string } }[];
      return { torchTiles: tiles.filter((t) => t.id === 'torch' || t.id.startsWith('torch')).length, cards: cards.length, recipes: list.length, torchRecipes: list.filter((c) => c.output.item === 'torch').length };
    });
    expect(r.torchRecipes).toBe(3);
    expect(r.torchTiles).toBe(1);
    expect(r.cards).toBe(r.recipes - 2); // レシピは 38 こ、カードは 36 枚
    // 材料が き 1 + せきたん 1 だけでも カードは 「作れる」（3 つのどれかが 作れれば）
    await open(page, [['log', 1], ['coal_ore', 1]]);
    const glow = await page.evaluate(() => (window.__rikkun as any).craft.ui().cards.find((c: any) => c.id === 'torch'));
    expect(glow?.glowing).toBe(true);
  });
});

test.describe('CRAFT-PAGE 説明欄のページ', () => {
  test('AC4: ページの 数と順（たいまつ・かたな）・◀ ▶ で前後・はしで止まる', async ({ page }) => {
    await open(page, [['log', 9], ['coal_ore', 3], ['oil', 3], ['iron_ingot', 3]]);
    await select(page, 'torch');
    const torch = await pageState(page);
    expect(torch.names).toEqual(['つくりかた ①', 'つくりかた ②', 'つくりかた ③', 'せつめい']);
    expect(torch.dots).toBe(4);

    // はしで止まる: 最初で ◀ は 動かない
    await page.evaluate(() => (window.__rikkun as any).craft.pageGo(-1)); // どこにいても 先頭へ（最大 4 回）
    for (let i = 0; i < 4; i++) await go(page, -1);
    let s = await pageState(page);
    expect(s.index).toBe(0);
    expect(s.prevEnabled).toBe(false);
    expect(s.nextEnabled).toBe(true);
    expect(await go(page, -1)).toBe(false);
    expect((await pageState(page)).index).toBe(0);
    // ▶ で 1 つずつ進む
    for (let i = 1; i < torch.names.length; i++) {
      expect(await go(page, 1)).toBe(true);
      expect((await pageState(page)).index).toBe(i);
    }
    s = await pageState(page);
    expect(s.nextEnabled).toBe(false);
    expect(s.prevEnabled).toBe(true);
    expect(await go(page, 1)).toBe(false);
    expect((await pageState(page)).index).toBe(torch.names.length - 1);
    // ◀ で もどる
    expect(await go(page, -1)).toBe(true);
    expect((await pageState(page)).index).toBe(torch.names.length - 2);
    // 本当のボタン: 画面の ◀ ▶ を 押しても 同じ
    const before = (await pageState(page)).index;
    await page.locator('.cp-detail .cp-next').click();
    await page.evaluate(() => (window.__rikkun as any).step(2));
    expect((await pageState(page)).index).toBe(before + 1);
    await page.locator('.cp-detail .cp-prev').click();
    await page.evaluate(() => (window.__rikkun as any).step(2));
    expect((await pageState(page)).index).toBe(before);
    // ページ名と ●○ が 画面に 出る
    await expect(page.locator('.cp-detail .cp-pagename')).toContainText(torch.names[before]);
    expect(await page.locator('.cp-detail .cp-pagedots').textContent()).toMatch(/^[●○\s]+$/);

    // かたな: ざいりょう（作り方 1 つ）→ せつめい → つよさ…（1 つ以上）
    await select(page, 'katana');
    const k = await pageState(page);
    expect(k.names.slice(0, 2)).toEqual(['ざいりょう', 'せつめい']);
    expect(k.names.length).toBeGreaterThanOrEqual(3);
    for (const n of k.names.slice(2)) expect(n.startsWith('つよさ')).toBe(true);
    // 作り方が 1 つの 物の 先頭ページは 開いたとき 先頭
    expect(k.index).toBe(0);

    // ページが 1 枚だけの 物は ◀▶ と ● を 出さない（ページが 1 枚の物を さがす）
    const single = await page.evaluate(() => {
      const h = window.__rikkun as any;
      for (const t of h.craft.ui().tiles as { id: string }[]) {
        h.craft.hover(null);
        h.craft.tileClick(t.id);
        h.step(1);
        const p = h.craft.page();
        if (p.names.length === 1) return t.id;
      }
      return null;
    });
    if (single) {
      const p = await pageState(page);
      expect(p.dots).toBe(0);
      await expect(page.locator('.cp-detail .cp-prev')).toBeHidden();
      await expect(page.locator('.cp-detail .cp-next')).toBeHidden();
      await expect(page.locator('.cp-detail .cp-pagedots')).toBeHidden();
    }
  });

  test('AC5: き・せきたん を持つと 開いたとき「つくりかた ②」→「つくる」で せきたん で作る / ◀ で ① にすると あぶら が無くて押せない', async ({ page }) => {
    await open(page, [['log', 1], ['coal_ore', 1]]);
    await select(page, 'torch');
    const s = await pageState(page);
    expect(s.names[s.index]).toBe('つくりかた ②'); // 今の材料で作れる いちばん前
    await expect(page.locator('.cp-detail .cp-pagename')).toContainText('つくりかた ②');
    const ui = await page.evaluate(() => (window.__rikkun as any).craft.ui());
    expect(ui.detail.button.enabled).toBe(true);
    expect(s.recipe).not.toBe('torch'); // ② は あぶら の作り方ではない

    // せつめい のページへ行っても、「つくる」は さいごに見た作り方（②）
    // ② → ▶ ③ → ▶ せつめい: 「さいごに見た作り方」は ③
    await go(page, 1);
    const third = await pageState(page);
    expect(third.names[third.index]).toBe('つくりかた ③');
    await go(page, 1);
    const desc = await pageState(page);
    expect(desc.names[desc.index]).toBe('せつめい');
    expect(desc.recipe).toBe(third.recipe);
    for (let i = 0; i < 2; i++) await go(page, -1);
    expect((await pageState(page)).index).toBe(1);

    // ◀ で ① → あぶら が足りないので 押せない形
    await go(page, -1);
    const first = await pageState(page);
    expect(first.names[first.index]).toBe('つくりかた ①');
    expect(first.recipe).toBe('torch');
    const ui1 = await page.evaluate(() => (window.__rikkun as any).craft.ui());
    expect(ui1.detail.button.enabled).toBe(false);
    await expect(page.locator('.cp-detail .cp-press')).toHaveClass(/is-disabled/);
    const blocked = await make(page);
    expect(blocked.ok).toBe(false);
    expect(await count(page, 'torch')).toBe(0);
    expect(await count(page, 'log')).toBe(1);

    // ② にもどして 「つくる」→ せきたん の作り方で +4、き −1、せきたん −1
    await go(page, 1);
    const made = await make(page);
    expect(made.ok).toBe(true);
    expect(await count(page, 'torch')).toBe(4);
    expect(await count(page, 'log')).toBe(0);
    expect(await count(page, 'coal_ore')).toBe(0);
  });

  test('AC5 の つづき: 別の物にうつると 作れる いちばん前に もどる / どれも作れないなら 1 ページ目', async ({ page }) => {
    await open(page, [['log', 3]]); // き 3 だけ → ③ で 作れる
    await select(page, 'torch');
    let s = await pageState(page);
    expect(s.names[s.index]).toBe('つくりかた ③');
    await go(page, -1);
    await select(page, 'katana');
    await select(page, 'torch');
    s = await pageState(page);
    expect(s.names[s.index]).toBe('つくりかた ③'); // 前に ◀ したことは おぼえない
    await open(page, [['oil', 1]]); // 何も作れない（材料が 1 つだけ ある → たいまつは 一覧に 出る）
    await select(page, 'torch');
    s = await pageState(page);
    expect(s.index).toBe(0);
  });

  test('AC6: 矢印の当たりは 44×44px 以上（3 つの大きさ）。1 ページ目の ◀・さいごの ▶ は うすくて押せない', async ({ page }) => {
    test.setTimeout(120_000); // 3 つの大きさで 開き直す
    for (const [w, h] of [[1280, 800], [1440, 900], [1024, 700]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, [['log', 9], ['coal_ore', 3], ['oil', 3]]);
      await select(page, 'torch');
      for (let i = 0; i < 4; i++) await go(page, -1);
      for (const sel of ['.cp-detail .cp-prev', '.cp-detail .cp-next']) {
        const b = await page.locator(sel).boundingBox();
        expect(b, `${sel} ${w}x${h}`).not.toBeNull();
        expect(b!.width, `${sel} 幅 ${w}x${h}`).toBeGreaterThanOrEqual(44);
        expect(b!.height, `${sel} 高さ ${w}x${h}`).toBeGreaterThanOrEqual(44);
      }
      // 先頭では ◀ が 押せない形
      await expect(page.locator('.cp-detail .cp-prev')).toHaveClass(/is-disabled/);
      await expect(page.locator('.cp-detail .cp-next')).not.toHaveClass(/is-disabled/);
      // 絵は 小さく（試作より小さい）: 見える矢印の 絵は 当たりより 小さい（当たりを 広げているので）
      const art = await page.evaluate(() => {
        const e = document.querySelector<HTMLElement>('.cp-detail .cp-next')!;
        const ico = e.querySelector<HTMLElement>('img, svg, .cp-arrow, span');
        const b = e.getBoundingClientRect();
        const r = ico?.getBoundingClientRect();
        return { btn: b.width, ico: r ? r.width : 0 };
      });
      expect(art.ico).toBeLessThan(art.btn);
      // さいごの ▶ は 押せない
      for (let i = 0; i < 4; i++) await go(page, 1);
      await expect(page.locator('.cp-detail .cp-next')).toHaveClass(/is-disabled/);
      await expect(page.locator('.cp-detail .cp-prev')).not.toHaveClass(/is-disabled/);
    }
  });

  for (const [w, h] of [[1280, 800], [1440, 900], [1024, 700]] as const) {
    test(`AC3: どの物・どのページも 縦にスクロールしない・「▼ つづき」は出ない（${w}x${h}）`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      // ぜんぶの材料を たくさん（作れる物も 作れない物も ページの中身が いちばん多い形）
      await open(page, [
        ['dirt', 64], ['stone', 40], ['log', 32], ['coal_ore', 12], ['iron_ore', 9], ['iron_ingot', 9], ['paper', 4], ['string', 5],
        ['cloth', 3], ['clay', 8], ['oil', 2], ['crystal', 2], ['grass', 9], ['torch', 3],
      ]);
      const ids: string[] = await page.evaluate(() => (window.__rikkun as any).craft.ui().tiles.map((t: any) => t.id));
      expect(ids.length).toBeGreaterThan(30);
      const bad: string[] = [];
      let pagesSeen = 0;
      for (const id of ids) {
        await select(page, id);
        for (let i = 0; i < 8; i++) {
          const st = await pageState(page);
          pagesSeen++;
          const r = await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('.cp-detail')!;
            const rr = root.getBoundingClientRect();
            const issues: string[] = [];
            const more = document.querySelector<HTMLElement>('.cp-more');
            if (more && !more.hidden && more.getBoundingClientRect().width > 0) issues.push('▼ つづき が出ている');
            if (/▼\s*つづき/.test(root.textContent ?? '')) issues.push('「▼ つづき」の文字');
            for (const e of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
              const cs = getComputedStyle(e);
              if (cs.display === 'none') continue;
              const over = e.scrollHeight - e.clientHeight;
              if (over > 1 && cs.overflowY !== 'visible') issues.push(`${e.className} が 縦に ${over}px はみ出し（overflow ${cs.overflowY}）`);
              if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') issues.push(`${e.className} は スクロール欄`);
              const b = e.getBoundingClientRect();
              if (b.width > 0 && b.height > 0 && (b.bottom > rr.bottom + 1 || b.right > rr.right + 1)) issues.push(`${e.className} が せつめい欄の外`);
            }
            return issues;
          });
          if (r.length) bad.push(`${id} ページ ${st.index + 1}/${st.names.length} ${st.names[st.index]}: ${r.slice(0, 3).join(' / ')}`);
          if (!(await go(page, 1))) break;
        }
      }
      expect(pagesSeen).toBeGreaterThan(ids.length); // 2 ページ以上の物が ある
      expect(bad, bad.join('\n')).toEqual([]);
    });
  }
});
