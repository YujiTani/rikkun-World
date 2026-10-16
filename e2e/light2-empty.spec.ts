import { expect, test } from '@playwright/test';

/** LIGHT-2 #43: 材料が 1 つも無いとき、せつめい欄に 大きな文と絵、「つくる」は押せない */
const OUT = process.env.LIGHT2_OUT ?? 'test-results';

for (const [w, h] of [[1280, 800], [1024, 700]] as const) {
  test(`材料なし ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?nosave=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => {
      const r = (window as any).__rikkun;
      r.pause();
      r.lock.simulate(true);
      r.inventory.clear();
      r.inventory.setSlot(0, { item: 'dirt', count: 5 });
      r.input.press('toggleInventory');
      r.step(3);
    });
    const d = page.locator('.cp-detail');
    await expect(d).toBeVisible();
    await expect(d.locator('.cp-empty')).toBeVisible();
    await expect(d.locator('.cp-empty')).toContainText('ざいりょう を あつめよう！');
    await expect(d.locator('.cp-press')).toHaveClass(/is-disabled/);
    await page.screenshot({ path: `${OUT}/light2-empty-${w}x${h}.png` });
    // 材料がそろったら もどる
    await page.evaluate(() => {
      const r = (window as any).__rikkun;
      r.inventory.setSlot(1, { item: 'log', count: 3 });
      r.step(3);
    });
    await expect(d.locator('.cp-empty')).toBeHidden();
    await expect(d.locator('.cp-name')).toBeVisible();
    if (w === 1280) await page.screenshot({ path: `${OUT}/light2-have-${w}x${h}.png` });
  });
}
