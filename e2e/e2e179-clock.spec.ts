import { expect, test, type Page } from '@playwright/test';
import { fine } from './helpers/fine';

/**
 * #179（docs/tickets/E2E-179.md）: 1 コマの仕事を 本当の時間（ms）でなく 数で決める時計（E2E のサーバーは count）。
 * 実装の前に書いたテスト（落ちるのが正しい）。本当の時間で待たず、ゲームに聞く（pause・step・rebuildLog・meshStats・lightPending）。
 *
 *  AC1: E2E の開発サーバーでは __rikkun.clock() === 'count'。?clock=time を付けると 'time'。
 *  AC2: 細かいメッシュあり（fine）で 一時停止して step(1) を くりかえしたとき、各コマで 作った小ブロックは 1 個まで・メッシュは 8 個まで。
 *  AC3: 同じ URL を 2 回開いて 同じ手順で 落ちつくまで進めたとき、コマ数・rebuildLog（x, y, z, kind, frame）・drawCalls・triangles が 同じ。
 */

type Entry = { x: number; y: number; z: number; kind: string; frame: number };

async function openRaw(page: Page, query: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true, null, { timeout: 120_000 });
}

/** 一時停止して、妖怪を出さず、昼にする（e2e/helpers/tex.ts の openTex と同じ静かにする手順）。落ちつくまでは進めない */
async function quietDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
  });
}

/** キャラの板の絵の読みこみ（非同期）を待つ */
async function waitDoll(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const d = (window as any).__rikkun.player.doll?.();
        return !d || !d.sprite || d.sprite.loaded === true;
      },
      null,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
}

test.describe('#179 テストの時計', () => {
  test('AC1: E2E のサーバーでは clock() は count。?clock=time を付けると time', async ({ page }) => {
    await openRaw(page, '?nosave=1');
    const a = await page.evaluate(() => (window as any).__rikkun.clock?.());
    expect(a).toBe('count');
    await openRaw(page, '?nosave=1&clock=time');
    const b = await page.evaluate(() => (window as any).__rikkun.clock?.());
    expect(b).toBe('time');
  });

  test('AC2: 1 コマ（step(1)）で作る 小ブロックは 1 個まで・メッシュは 8 個まで', async ({ page }) => {
    await openRaw(page, fine('?nosave=1'));
    expect(await page.evaluate(() => (window as any).__rikkun.clock?.()), 'この確かめは count の時計で行う').toBe('count');
    await quietDown(page);
    const frames = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.rebuildLog(true);
      const out: { micro: number; total: number }[] = [];
      let quietFrames = 0;
      for (let i = 0; i < 1500 && quietFrames < 3; i++) {
        h.step(1);
        const log = h.world.rebuildLog(true) as Entry[];
        out.push({ micro: log.filter((e) => e.kind === 'micro').length, total: log.length });
        quietFrames = h.world.lightPending() === 0 && h.world.meshStats().pending === 0 ? quietFrames + 1 : 0;
      }
      return out;
    });
    expect(frames.reduce((s, f) => s + f.micro, 0), '小ブロックを作った（確かめる材料がある）').toBeGreaterThan(0);
    expect(Math.max(...frames.map((f) => f.micro))).toBeLessThanOrEqual(1);
    expect(Math.max(...frames.map((f) => f.total))).toBeLessThanOrEqual(8);
  });

  test('AC3: 同じ URL を 2 回開いて 同じ手順で落ちつくまで進めると コマ数・rebuildLog・drawCalls・triangles が同じ', async ({ page }) => {
    const run = async (): Promise<{ n: number; log: Entry[]; drawCalls: number; triangles: number }> => {
      await openRaw(page, fine('?nosave=1'));
      await quietDown(page);
      await waitDoll(page);
      // ready のあと テストが止めるまでの間は 本当の時間で コマが進む（そろうまで読みこみを続ける）。そこで差が出ないように、
      // まず輪を全部そろえて（どの道すじでも同じ終わりの形）、そこから 決まった穴をほって 落ちつくまでのコマを数える（#203）
      await page.evaluate(() => (window as any).__rikkun.world.settle({ full: true }));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const p = h.player.get().position;
        const x = Math.floor(p.x);
        const z = Math.floor(p.z);
        const gy = h.world.groundHeight(x, z + 6);
        h.world.rebuildLog(true);
        h.world.fill(x - 4, gy - 3, z + 3, x + 4, gy, z + 9, 'air');
        let n = 0;
        while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
          if (n >= 3000) throw new Error('QUIET_TIMEOUT');
          h.step(1);
          n++;
        }
        h.step(2);
        const s = h.renderStats();
        return { n, log: h.world.rebuildLog() as Entry[], drawCalls: s.drawCalls as number, triangles: s.triangles as number };
      });
      return r;
    };
    const a = await run();
    const b = await run();
    expect(a.log.length, '作ったメッシュがある').toBeGreaterThan(0);
    expect(b.n).toBe(a.n);
    expect(b.log).toEqual(a.log);
    expect(b.drawCalls).toBe(a.drawCalls);
    expect(b.triangles).toBe(a.triangles);
  });
});
