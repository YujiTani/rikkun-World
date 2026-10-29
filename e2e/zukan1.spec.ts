import { expect, test } from '@playwright/test';
import { OPEN_BTN, btn, link, openGuide, settle, state } from './helpers/book';

/**
 * ZUKAN-1: 本の アイテム ずかん（docs/decisions/2026-10-29-item-zukan.md）。
 * アイテムの id と 数は ゲームに 聞く（`zukanIds`・`zukanShadow`）。
 */
const zukan = async (page: import('@playwright/test').Page) => (await state(page)) as unknown as { bookView: string; zukanItem: string | null; bookLinks: string[]; zukanIds: string[]; zukanShadow: string[] };

test('ZUKAN-1: もくじ → ずかん → さがす → アイテム（説明・てにいれかた）→ 影は ？？？', async ({ page }) => {
  await openGuide(page);
  await page.locator(OPEN_BTN).click();
  await settle(page);
  await page.locator('[data-zukan-open]').click();
  await settle(page);
  let s = await zukan(page);
  expect(s.bookView).toBe('zukan');
  const all = s.zukanIds.length;
  expect(all).toBeGreaterThan(40);
  expect(await page.locator('[data-book-link]:not([hidden])').count()).toBe(s.bookLinks.length);

  // カタカナでも 見つかる
  await page.locator('[data-zukan-search]').fill('カタナ');
  await page.evaluate(() => (window.__rikkun as any).step(1));
  s = await zukan(page);
  expect(s.zukanIds.length).toBeGreaterThan(0);
  expect(s.zukanIds.length).toBeLessThan(all);
  expect(s.bookLinks).toEqual(s.zukanIds.slice(0, s.bookLinks.length));

  // ふつうの アイテム: 説明と てに いれかた が 出る
  const first = s.zukanIds.find((id) => !s.zukanShadow.includes(id))!;
  await page.locator(link(first)).click();
  await settle(page);
  s = await zukan(page);
  expect(s.bookView).toBe('zukanItem');
  expect(s.zukanItem).toBe(first);
  await expect(page.locator('[data-zukan-use]')).not.toHaveText('');
  await expect(page.locator('[data-zukan-source]')).not.toHaveText('？？？');

  // レア度 7: 絵は 影、てに いれかた は ？？？
  await page.locator(btn('back')).click();
  await settle(page);
  await page.locator('[data-zukan-search]').fill('');
  await page.evaluate(() => (window.__rikkun as any).lock.book(`zukan:${(window.__rikkun as any).lock.get().zukanShadow[0]}`));
  await page.evaluate(() => (window.__rikkun as any).step(1));
  await expect(page.locator('[data-zukan-source]')).toHaveText('？？？');
  await expect(page.locator('.zk-bigicon.zk-shadow')).toHaveCount(1);
});
