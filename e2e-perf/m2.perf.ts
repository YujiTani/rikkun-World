import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

/**
 * M2 もちもの画面の「本当の時間で測る所」（もとは e2e/m2.spec.ts の AC19）。
 * E2E は時間を決め打ちしない（decisions.md 2026-10-16）。ここで 描画ありのまま 記録する。
 * クラウドは GPU なし（ソフト描画）なので 数字は目安。オーナーの Mac の F3 表示が本当の値。
 *
 * 目安（こえても 失敗にはしない。記録の withinTarget と annotation で分かる）:
 *   - 開く: E を押してから もちもの画面が開くまで 800ms 未満（ねらいは 0.5 秒くらい。オーナーのきまり）
 *   - 1/4 の速さ: 開いて 2 秒で tick が 20〜40 進む（1 秒に 15 tick が 理想。ゆれの幅を見ている）
 *   - 閉じたあと: 1 秒に 30 tick 以上（1 秒の窓を 最大 3 回見て 一番速いもの）
 * 決まった回数進めたときの 1/4 の中身（画面ステップ）は E2E の AC19 が確かめる。
 */
const TARGET = { openMsMax: 800, openGoalMs: 500, ticksIn2sMin: 20, ticksIn2sMax: 40, closedTicksPerSecMin: 30 };

test('M2: もちもの画面を開く速さ・1/4 の速さ・閉じたあとの速さを記録する', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));

  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
    h.world.fill(0, 9, 0, 12, 20, 12, 'air');
    h.inventory.clear();
    h.inventory.setSlot(3, { item: 'dirt', count: 5 });
    h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    h.step(10);
  });
  // キャラの絵の読みこみ。?char=block では ずっと読みこまれないので 時間切れを付ける（描画は止めない）
  const spriteLoaded = await page
    .waitForFunction(() => (window as any).__rikkun.player.doll().sprite.loaded === true, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  // 世界の光・メッシュの順番待ちが おわってから 時間を動かす（上限つき）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
    h.step(2);
    h.resume();
  });

  // 開く（描画ありで E から開くまで）
  const t0 = Date.now();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__rikkun.inventory.get().open === true, null, { polling: 'raf', timeout: 5000 });
  const openedMs = Date.now() - t0;

  // 開いて 2 秒（1/4 の速さ）
  const a0 = await page.evaluate(() => (window as any).__rikkun.tick());
  await page.waitForTimeout(2000);
  const a1 = await page.evaluate(() => (window as any).__rikkun.tick());
  const ticksIn2s = a1 - a0;

  // 閉じたあとの 1 秒あたりの tick
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__rikkun.inventory.get().open === false, null, { polling: 'raf', timeout: 5000 });
  const closedRates: number[] = [];
  for (let k = 0; k < 3; k++) {
    const ta = await page.evaluate(() => (window as any).__rikkun.tick());
    await page.waitForTimeout(1000);
    const tb = await page.evaluate(() => (window as any).__rikkun.tick());
    closedRates.push(tb - ta);
    if (tb - ta >= TARGET.closedTicksPerSecMin) break;
  }
  const closedTicksPerSec = Math.max(...closedRates);

  const stats = await page.evaluate(() => (window as any).__rikkun.renderStats());
  const withinTarget = {
    open: openedMs < TARGET.openMsMax,
    ticksIn2s: ticksIn2s >= TARGET.ticksIn2sMin && ticksIn2s <= TARGET.ticksIn2sMax,
    closedTicksPerSec: closedTicksPerSec >= TARGET.closedTicksPerSecMin,
  };
  const report = {
    scene: 'm2-inventory',
    measuredAt: new Date().toISOString(),
    target: TARGET,
    spriteLoaded,
    openedMs,
    ticksIn2sWhileOpen: ticksIn2s,
    closedTicksPerSecWindows: closedRates,
    closedTicksPerSec,
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    withinTarget,
  };
  mkdirSync('perf-results', { recursive: true });
  writeFileSync('perf-results/m2.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  // 目安をこえたら 失敗にはせず、結果に印を付ける（ほかの perf と同じ: 記録して 見る）
  for (const [name, ok] of Object.entries(withinTarget)) {
    if (!ok) test.info().annotations.push({ type: 'perf-over-target', description: name });
  }
});
