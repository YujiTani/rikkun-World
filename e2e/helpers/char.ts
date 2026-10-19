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

/**
 * CHAR-5: キャラを URL で 決めて 開く（`search` は '?char=boy&nosave=1' など）。
 * 世界が できて、そのキャラの はじめの 4 つが ぜんぶ 'ready' になるまで 待つ。止めて、ひらけた所に 立つ。
 */
export async function openCharWorld(page: Page, search: string, opts: { stand?: boolean } = {}): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/${search}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await waitSpritesReady(page, ['idle', 'walk', 'run', 'jump']);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.achievements.mute(true);
    h.lock.simulate(true);
    h.pause();
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.time.set(0);
    h.inventory.clear();
  });
  if (opts.stand !== false) {
    const { standOnGround } = await import('./aim');
    await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
  }
}

/** そのキャラの `atlas.json` の `packed` の よこ × たて の合計（ちょうど `gpuBytes` になる） */
export function packedBytesOf(page: Page, kind: 'girl' | 'boy', names: string[]): Promise<number> {
  return page.evaluate(
    async ({ kind, names }) => {
      const atlas = await (await fetch(`./models/char/${kind}/atlas.json`)).json();
      return names.reduce((a: number, n: string) => a + atlas.motions[n].packed.width * atlas.motions[n].packed.height, 0);
    },
    { kind, names },
  );
}
