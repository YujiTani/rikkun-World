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

/**
 * 持った武器などの絵（names）が ぜんぶ 'ready' になるのを待つ（本当の時間で進む）。
 * 待つあいだは 描画を止め、1 ステップずつ 進める。時間の上限は テスト全体にまかせる。
 */
export async function waitSpritesReady(page: Page, names: string[]): Promise<void> {
  await page.evaluate(() => (window.__rikkun! as any).suspendRender(true));
  try {
    await page.waitForFunction(
      (ns) => {
        const h = window.__rikkun! as any;
        h.step(1);
        const st = h.player.doll().sprite.status;
        const bad = ns.filter((n: string) => st?.[n] === 'failed');
        if (bad.length) throw new Error('絵の読みこみに失敗: ' + bad.join(','));
        return ns.every((n: string) => st?.[n] === 'ready');
      },
      names,
      { timeout: 0 },
    );
  } finally {
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(false));
  }
}
