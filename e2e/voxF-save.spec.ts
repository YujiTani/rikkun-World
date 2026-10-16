import { expect, test, type Page } from '@playwright/test';

/**
 * VOX-F（docs/tickets/VOX-F.md）: さわった列だけ丸ごと IndexedDB に保存。
 * AC1 読みなおしで同じ / AC3 保存の時間（記録）/ AC5 pagehide の保険。
 */

async function boot(page: Page, query = '') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
}

test.describe('VOX-F 保存', () => {
  test('AC1: ほる・おく → 保存 → 読みなおしで、世界・列のハッシュ・持ち物が同じ', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.world.setBlock(4, 10, 6, 'log');
      h.world.setBlock(100, 8, 60, 'sand');
      h.inventory.setSlot(3, { item: 'dirt', count: 5 });
      h.step(2);
      await h.save.now();
      return { hash: h.world.hash(), c00: h.world.hash(0, 0), c63: h.world.hash(6, 3), info: h.save.info() };
    });
    expect(before.info.dirtyChunks).toBeGreaterThanOrEqual(2);
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { hash: h.world.hash(), c00: h.world.hash(0, 0), c63: h.world.hash(6, 3), slot: h.inventory.get().slots[3], info: h.save.info() };
    });
    expect(after.hash).toBe(before.hash);
    expect(after.c00).toBe(before.c00);
    expect(after.c63).toBe(before.c63);
    expect(after.slot).toEqual({ item: 'dirt', count: 5 });
    expect(after.info.loadedColumns).toBeGreaterThanOrEqual(2);
    expect(after.info.corruptColumns).toBe(0);
  });

  test('AC5: pagehide の保険で、最後の保存のあとの変更が残る（page.close）', async ({ context }) => {
    const page = await context.newPage();
    await boot(page);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.world.setBlock(2, 25, 2, 'stone');
      await h.save.now();
      // 閉じる途中に 保険が 置かれたかを 見張る（保存の側の pagehide の あとに 走る）
      window.addEventListener('pagehide', () => localStorage.setItem('__pendingSeen', localStorage.getItem('rikkun-world-pending') ?? 'none'));
      // 最後の保存のあとの変更
      h.world.setBlock(3, 25, 3, 'sand');
      h.world.setBlock(90, 12, 50, 'log');
    });
    await page.close({ runBeforeUnload: true });
    const page2 = await context.newPage();
    await boot(page2);
    const r = await page2.evaluate(() => {
      const h = (window as any).__rikkun;
      return {
        a: h.world.getBlock(2, 25, 2),
        b: h.world.getBlock(3, 25, 3),
        c: h.world.getBlock(90, 12, 50),
        seen: localStorage.getItem('__pendingSeen'),
      };
    });
    console.log('AC5', JSON.stringify(r));
    expect(r.a).toBe('stone');
    expect(r.b).toBe('sand');
    expect(r.c).toBe('log');
  });

  test('AC3: 保存の時間（記録）: dirty 4 列 + meta', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, '?seed=41');
    const r = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      await h.save.now(); // 準備
      const main: number[] = [];
      const done: number[] = [];
      const bytes: number[] = [];
      for (let k = 0; k < 15; k++) {
        for (const [cx, cz] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
          for (let i = 0; i < 60; i++) h.world.setBlock(cx * 16 + (i % 12), 14 + (i % 4), cz * 16 + 2 + k, i % 2 ? 'stone' : 'log');
        }
        const t = performance.now();
        const p = h.save.now();
        const syncMs = performance.now() - t;
        await p;
        const info = h.save.info();
        main.push(syncMs);
        done.push(info.doneMs);
        bytes.push(info.bytes);
        if (info.dirtyChunks !== 4) throw new Error('dirtyChunks ' + info.dirtyChunks);
      }
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const max = (a: number[]) => Math.max(...a);
      return { mainMedian: med(main), mainMax: max(main), doneMedian: med(done), doneMax: max(done), bytes: med(bytes), failures: h.save.info().failures };
    });
    console.log('AC3', JSON.stringify(r));
    testInfo.annotations.push({ type: 'AC3', description: JSON.stringify(r) });
    expect(r.failures).toBe(0);
    expect(r.mainMedian).toBeLessThan(25); // 目安。本当の数字は docs/perf-reports/VOX-F.md
  });
});
