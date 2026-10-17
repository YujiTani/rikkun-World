import type { Page } from '@playwright/test';

/**
 * キャラの板の絵の読みこみを待つ（本当の時間で進む）。
 * 読みこみ中は 重い描画を止め、待ちの時間は テスト全体の上限にまかせる。
 * 既定は `sprite.loaded === true`。`gpuBytes` を渡すと、その数になるまで待つ（例: はじめの 4 つが ぜんぶ 読めるまで）。
 */
export async function waitCharLoaded(page: Page, opts: { gpuBytes?: number } = {}): Promise<void> {
  await page.evaluate(() => (window.__rikkun! as any).suspendRender(true));
  try {
    await page.waitForFunction(
      (bytes) => {
        const s = (window.__rikkun! as any).player.doll().sprite;
        return bytes === null ? s.loaded === true : s.gpuBytes === bytes;
      },
      opts.gpuBytes ?? null,
      { timeout: 0 },
    );
  } finally {
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(false));
  }
}
