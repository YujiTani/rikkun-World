import type { Page } from '@playwright/test';

/**
 * テストの場所を 自分で作る道具（#103）。
 * 島や 無限の地形（VOX-B）が どう変わっても 同じ場所で 同じ結果になるように、
 * テストは 生成された地形に たよらず、床と その上の空気を ここで 敷いてから 始める。
 *
 * ページの中では `window.__arena` として使う（`installArena(page)` を `open` のあとに 1 回）。
 *   __arena.floor(x0, z0, x1, z1, opts?)   y（既定 8）に 床（既定 stone）を敷き、その上 opts.air（既定 20）段を 空気にする
 */
export async function installArena(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    (window as any).__arena = {
      floor(x0: number, z0: number, x1: number, z1: number, opts: { y?: number; block?: string; air?: number } = {}) {
        const y = opts.y ?? 8;
        h.world.fill(x0, y, z0, x1, y, z1, opts.block ?? 'stone');
        h.world.fill(x0, y + 1, z0, x1, y + (opts.air ?? 20), z1, 'air');
      },
    };
  });
}
