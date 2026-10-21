import { test } from '@playwright/test';

/** PERF-thunder-warmup: 起動の 時間（ページを 開いてから タイトルの 窓口が できる まで / ready まで）と、そこまでに 作った プログラムの 数 */
test.describe.configure({ timeout: 300_000 });
test('boot', async ({ browser }) => {
  const rows: any[] = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const w = window as any;
      w.__links = 0;
      const o = WebGL2RenderingContext.prototype.linkProgram;
      WebGL2RenderingContext.prototype.linkProgram = function (this: any, p: any) {
        w.__links++;
        return o.call(this, p);
      };
      w.__t = {};
      const tick = () => {
        const r = w.__rikkun;
        if (r && w.__t.hook === undefined) w.__t.hook = performance.now();
        if (r?.ready && w.__t.ready === undefined) {
          w.__t.ready = performance.now();
          w.__t.linksAtReady = w.__links;
        }
        if (w.__t.ready === undefined) setTimeout(tick, 5);
      };
      tick();
    });
    await page.goto('/');
    await page.waitForFunction(() => (window as any).__t.ready !== undefined, null, { timeout: 120_000, polling: 100 });
    rows.push(await page.evaluate(() => ({ ...(window as any).__t, domTitle: !!document.body.innerText.length })));
    await ctx.close();
  }
  const med = (k: string) => rows.map((r) => r[k]).sort((a, b) => a - b)[2];
  console.log('BOOT', JSON.stringify(rows.map((r) => [Math.round(r.hook), Math.round(r.ready), r.linksAtReady])), 'median hook/ready/links', Math.round(med('hook')), Math.round(med('ready')), med('linksAtReady'));
});
