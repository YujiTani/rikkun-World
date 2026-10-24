import { expect, test, type Page } from '@playwright/test';

// とどめ(体力 0 の 一撃)→ 少女は 座りこむ → 大きな 姿が 倒れて 赤い コア → たたく たびに ばらまく → こわすと くずれて 消える（FIX-BRIEF-2 §5）
test.describe.configure({ timeout: 240_000 });

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.lock.simulate(true));
}

type Info = { phase: string; coreHp: number; coreMax: number; fallK: number; redK: number; crumbleK: number };
type W = {
  __rikkun: { gasha: { info(): { form: string; state: string; kills: number }; spawn(o: object): Promise<boolean>; defeat(): void; bigTune: { finish: { core: { hits: number; hitGapSec: number } } } }; step(n: number): void; pause(): void };
  __gashaBig: { damage(p: string, a: number): number; hp(): number; finishInfo(): Info; frozen(): boolean };
  __gashaGirl?: { info(): Record<string, unknown>; tune(o: unknown): void };
};

test('とどめ: 少女は 座りこみ、大きな 姿が 倒れて 赤い コア、たたいて こわすと くずれて 消える', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.evaluate(async () => {
    const w = window as unknown as W;
    await w.__rikkun.gasha.spawn({ distance: 28, angleDeg: 0 });
    w.__rikkun.pause();
  });
  await page.waitForFunction(() => (window as unknown as W).__rikkun.gasha.info().state === 'present');
  // 体力を 1/3 より 少し 下へ → 少女が 出て 笑う ところまで
  await page.evaluate(() => { const w = window as unknown as W; w.__gashaBig.damage('head', 960); w.__rikkun.step(70); });
  await page.waitForFunction(() => !!(window as unknown as W).__gashaGirl, null, { timeout: 60_000 });
  await page.evaluate(() => { const w = window as unknown as W; w.__gashaBig.damage('head', 600); });
  let form = '';
  for (let i = 0; i < 1400 && form !== 'orbit'; i++) form = await page.evaluate(() => { const w = window as unknown as W; w.__rikkun.step(10); return w.__rikkun.gasha.info().form; });
  expect(form).toBe('orbit');
  // コアを たたく 回数を 少なく(早く おわる ように 調整表を 上書き)
  await page.evaluate(() => { const w = window as unknown as W; const c = w.__rikkun.gasha.bigTune.finish.core; c.hits = 3; c.hitGapSec = 0.1; });
  // とどめ
  await page.evaluate(() => { (window as unknown as W).__rikkun.gasha.defeat(); (window as unknown as W).__rikkun.step(30); });
  const g = () => page.evaluate(() => (window as unknown as W).__gashaGirl!.info());
  expect((await g()).phase).toBe('down');
  expect(await page.evaluate(() => (window as unknown as W).__rikkun.gasha.info().form)).toBe('down');
  const before = await g();
  // 倒れて 横たわる まで
  let ph = '';
  for (let i = 0; i < 300 && ph !== 'lie'; i++) ph = await page.evaluate(() => { const w = window as unknown as W; w.__rikkun.step(20); return w.__gashaBig.finishInfo().phase; });
  expect(ph).toBe('lie');
  const after = await g();
  expect(after.phase).toBe('down'); // 少女は 動かない(座った まま)
  expect(after.fireballs).toBe(0);
  expect(after.waves).toBe(0);
  const fi = await page.evaluate(() => (window as unknown as W).__gashaBig.finishInfo());
  expect(fi.redK).toBeGreaterThan(0);
  expect(fi.coreHp).toBe(3);
  expect(Math.hypot(Number(after.girlX) - Number(before.girlX), Number(after.girlZ) - Number(before.girlZ))).toBeLessThan(40); // 肩に 座って 大きな 姿と 一緒に 倒れる
  await testInfo.attach('lie', { body: await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/finish_lie.png` : undefined }), contentType: 'image/png' });
  // コアを たたく: 3 回で こわれる。実績は こわした とき
  expect(await page.evaluate(() => (window as unknown as W).__rikkun.gasha.info().kills)).toBe(0);
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { const w = window as unknown as W; w.__gashaBig.damage('core', 1e6); w.__rikkun.step(30); });
  }
  expect(await page.evaluate(() => (window as unknown as W).__rikkun.gasha.info().state)).toBe('defeated');
  expect(await page.evaluate(() => (window as unknown as W).__rikkun.gasha.info().kills)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as W).__rikkun.gasha.info().form)).toBe('crumble');
  expect((await g()).phase).toBe('crumble');
  await page.evaluate(() => { (window as unknown as W).__rikkun.step(120); });
  await testInfo.attach('crumble', { body: await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/finish_crumble.png` : undefined }), contentType: 'image/png' });
  // くずれ おわって 消える
  let st = 'defeated';
  for (let i = 0; i < 400 && st !== 'idle'; i++) st = await page.evaluate(() => { const w = window as unknown as W; w.__rikkun.step(30); return w.__rikkun.gasha.info().state; });
  expect(st).toBe('idle');
  expect(errors).toEqual([]);
});
