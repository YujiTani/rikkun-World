import { expect, test } from '@playwright/test';
import { waitAnimationsDone } from './helpers/anim';

/** FIX-ach-scroll: じっせき の一覧が 実際のホイールで 縦にスクロールできる */
for (const [w, h] of [[960, 540], [1280, 720], [1440, 900]] as const) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('ホイールで一覧が動き、いちばん下のカードが見える。分類を変えると上にもどる', async ({ page }) => {
      await page.goto('/?nosave=1');
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      await page.evaluate(() => {
        const k = window.__rikkun! as any;
        k.pause();
        k.lock.simulate(true);
        k.step(2);
        k.input.press('toggleInventory');
        k.input.release('toggleInventory');
        k.step(3);
      });
      await waitAnimationsDone(page);
      await page.locator('.inv-tabs [data-tab=achievements]').click();
      const list = page.locator('.ach-list');
      const cats = page.locator('.ach-cats > *');
      for (const i of [0, 1]) {
        await cats.nth(i).click();
        await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBe(0);
        const over = await list.evaluate((e) => e.scrollHeight - e.clientHeight);
        expect(over).toBeGreaterThan(0);
        const b = (await list.boundingBox())!;
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        for (let n = 0; n < 15; n++) await page.mouse.wheel(0, 300);
        await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
        const visible = await page.evaluate(() => {
          const l = document.querySelector('.ach-list')!.getBoundingClientRect();
          const rows = document.querySelectorAll('.ach-row');
          const r = rows[rows.length - 1].getBoundingClientRect();
          return r.bottom <= l.bottom + 1 && r.top >= l.top - 1;
        });
        expect(visible).toBe(true);
      }
      await cats.nth(0).click();
      await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBe(0);
    });
  });
}
