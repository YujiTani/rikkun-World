import type { Page } from '@playwright/test';

/**
 * テストの場所を 自分で作る道具（#103）。
 * 島や 無限の地形（VOX-B）が どう変わっても 同じ場所で 同じ結果になるように、
 * テストは 生成された地形に たよらず、床と その上の空気を ここで 敷いてから 始める。
 *
 * ページの中では `window.__arena` として使う（`installArena(page)` を `open` のあとに 1 回）。
 *   __arena.floor(x0, z0, x1, z1, opts?)   y（既定 8）に 床（既定 stone）を敷き、その上を 空（`size().y − 1`）まで 空気にする（地下の とじた箱にしない・空の光が 床まで届く。opts.air で 段数を 決めてもよい）
 */
export async function installArena(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    (window as any).__arena = {
      floor(x0: number, z0: number, x1: number, z1: number, opts: { y?: number; block?: string; air?: number } = {}) {
        const y = opts.y ?? 8;
        h.world.fill(x0, y, z0, x1, y, z1, opts.block ?? 'stone');
        const top = opts.air === undefined ? h.world.size().y - 1 : Math.min(h.world.size().y - 1, y + opts.air);
        h.world.fill(x0, y + 1, z0, x1, top, z1, 'air');
      },
    };
  });
}
