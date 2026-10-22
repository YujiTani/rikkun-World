import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { aimGroundAhead, chargeUntilReady, legendWorld } from '../e2e/helpers/legend';

/** PERF-thunder-warmup: 前後の 見た目の 比べ用。昼・夜の 落雷 F8・F12 を PERF_OUT に 保存する */
const OUT = process.env.PERF_OUT ?? 'perf-results/shots';
test.describe.configure({ timeout: 300_000 });
for (const [name, time] of [['day', 6000], ['night', 70000]] as const) {
  test(`shots ${name}`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const floorY = await legendWorld(page);
    await page.evaluate((t) => (window as any).__rikkun.time.set(t), time);
    await aimGroundAhead(page, floorY, 8);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1);
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      h.step(60);
    });
    await chargeUntilReady(page, 60);
    await page.evaluate(() => (window as any).__rikkun.renderStats());
    await page.screenshot({ path: `${OUT}/${name}-F0.png` });
    await page.evaluate(() => (window as any).__rikkun.input.release('primary'));
    for (let F = 1; F <= 12; F++) {
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.step(1);
        h.renderStats();
      });
      if (F === 8 || F === 12) await page.screenshot({ path: `${OUT}/${name}-F${F}.png` });
    }
    await ctx.close();
  });
}
