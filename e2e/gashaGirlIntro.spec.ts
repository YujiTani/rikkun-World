import { expect, test, type Page } from '@playwright/test';

// 体力 1/2 → 噴火して 固まる → BGM ぶつっと → 笑い声 → 少女が ワープで 飛びまわる → 決めポーズ → 戦い → 5 回の あと 肩に 座る（FIX-BRIEF-2 §4）
test.describe.configure({ timeout: 180_000 });

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.lock.simulate(true));
}

type W = { __rikkun: { gasha: { info(): { form: string; state: string }; spawn(o: object): Promise<boolean> }; step(n: number): void; pause(): void }; __gashaBig: { damage(p: string, a: number): number; frozen(): boolean; info(): Record<string, unknown>; perchSpot(): { x: number; y: number; z: number } | null }; __gashaGirl?: { info(): Record<string, unknown>; tune(o: unknown): void; camera(m: string): void }; __gashaBgm?: { status(): { cut: boolean; playing: string | null } } };

test('固まって 笑い、飛びまわり、ポーズを 決め、5 回の あと 肩に 座る', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.evaluate(async () => {
    const w = window as unknown as W;
    await w.__rikkun.gasha.spawn({ distance: 45, angleDeg: 0 });
    w.__rikkun.pause();
  });
  await page.waitForFunction(() => (window as unknown as W).__rikkun.gasha.info().state === 'present');
    // まず 体力を 55% へ（頭 ×0.5 − 防御 30）→ 少女の 読みこみを 待つ → 1/3 より 少し 下へ
  await page.evaluate(() => { const w = window as unknown as W; w.__gashaBig.damage('head', 960); w.__rikkun.step(70); });
  await page.waitForFunction(() => !!(window as unknown as W).__gashaGirl, null, { timeout: 60_000 });
  await page.evaluate(() => { const w = window as unknown as W; w.__gashaBig.damage('head', 600); });
  const forms: string[] = [];
  const seen = async (n: number) => {
    return page.evaluate((n) => {
      const w = window as unknown as W;
      w.__rikkun.step(n);
      return w.__rikkun.gasha.info().form;
    }, n);
  };
  let last = '';
  let cutSeen = false;
  for (let i = 0; i < 1400 && last !== 'girl'; i++) {
    const f = await seen(10);
    if (f !== last) { forms.push(f); last = f;  }
    if (f === 'laugh') cutSeen = cutSeen || (await page.evaluate(() => (window as unknown as W).__gashaBgm?.status().cut ?? false));
    if (f === 'pose' && !testInfo.attachments.some((a) => a.name === 'pose')) {
      await page.evaluate(() => { (window as unknown as W).__rikkun.step(40); });
      // 決めポーズ「空中で 足を 組んで 座る」(オーナー 2026-10-24 17:31): 入り(約 0.55 秒)の あとは 浮いて いる
      const gi = await page.evaluate(() => (window as unknown as W).__gashaGirl!.info());
      expect(gi.poseName).toBe('float');
      expect(Number(gi.footGap)).toBeGreaterThan(0.6);
      await testInfo.attach('pose', { body: await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/pose.png` : undefined }), contentType: 'image/png' });
    }
    if (f === 'freeze' && !testInfo.attachments.some((a) => a.name === 'freeze')) {
      await page.evaluate(() => { (window as unknown as W).__rikkun.step(120); });
    }
  }
  expect(forms).toEqual(['freeze', 'laugh', 'orbit', 'pose', 'girl']);
  expect(cutSeen).toBe(true);
  expect(await page.evaluate(() => (window as unknown as W).__gashaBig.frozen())).toBe(true);
  // 戦いの 5 回を 早送りして 肩へ（1 回で 座る ように 調整表を 上書き。休みも 短く）
  await page.evaluate(() => { (window as unknown as W).__gashaGirl!.tune({ eye: { turnsPerShow: 1, bigWaitSec: 6 }, timing: { goneSec: 0.2 } }); });
  let perch = false;
  for (let i = 0; i < 2500 && !perch; i++) { perch = (await seen(10)) === 'perch'; }
  expect(perch).toBe(true);
  await page.evaluate(() => { (window as unknown as W).__rikkun.step(60); (window as unknown as W).__gashaGirl!.camera('idleSide'); (window as unknown as W).__rikkun.step(2); });
  if (process.env.SHOT_DIR) { await page.evaluate(() => { (window as unknown as W).__gashaGirl!.camera('idle'); (window as unknown as W).__rikkun.step(2); }); await page.screenshot({ path: `${process.env.SHOT_DIR}/perch2.png` }); await page.evaluate(() => { (window as unknown as W).__gashaGirl!.camera('idleSide'); (window as unknown as W).__rikkun.step(2); }); }
  await testInfo.attach('perch', { body: await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/perch.png` : undefined }), contentType: 'image/png' });
  const gi = await page.evaluate(() => (window as unknown as W).__gashaGirl!.info());
  const sp = await page.evaluate(() => (window as unknown as W).__gashaBig.perchSpot());
  expect(Math.hypot(Number(gi.girlX) - sp!.x, Number(gi.girlZ) - sp!.z)).toBeLessThan(0.5);
  // 休みが おわると また 戦いへ
  let back = false;
  for (let i = 0; i < 1500 && !back; i++) { back = (await seen(10)) === 'girl'; }
  expect(back).toBe(true);
  expect(errors).toEqual([]);
});
