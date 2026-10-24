import { test, expect, type Page } from '@playwright/test';
import { openGasha, setupBoss } from './helpers/gasha';
import { RELEASE } from '../src/gasha/releaseTuning';

/**
 * #293 体力ゲージの 重なり順: ゲージは メニュー・本より 下。実績の おしらせ（帯）は いちばん 上。
 * ゲージ・帯は マウスを 通す（pointer-events:none）ので、しらべる 間だけ 当たりを 有効に して
 * `document.elementsFromPoint`（上から 下の じゅん）で 見る。時間では 待たない。
 */
test.describe.configure({ timeout: 120_000 });

async function ready(page: Page): Promise<string[]> {
  const errs = await openGasha(page);
  await setupBoss(page);
  await page.addStyleTag({ content: '#gashaBigHp, #gashaBigHp *, .cel-layer--band, .cel-layer--band * { pointer-events: auto !important; }' });
  return errs;
}

/** ゲージの まんなかの 点で、上から 下へ 重なる 要素の 並び。inside(selector) = その 要素の 中の 最初の 位置（なければ -1） */
async function stackAtBar(page: Page, selectors: string[]): Promise<{ topInBar: boolean; barIndex: number; index: Record<string, number>; total: number }> {
  return page.evaluate((selectors) => {
    const bar = document.getElementById('gashaBigHp')!;
    const r = bar.getBoundingClientRect();
    const list = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const index: Record<string, number> = {};
    for (const s of selectors) index[s] = list.findIndex((e) => e.closest(s) !== null);
    return { topInBar: list.length > 0 && bar.contains(list[0]!), barIndex: list.findIndex((e) => bar.contains(e)), index, total: list.length };
  }, selectors);
}

test.describe('体力ゲージ', () => {
  test('近くに いる 間は 出ている。ほかに 何も 開いて いなければ ゲージが 上に 見える', async ({ page }) => {
    const errs = await ready(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('gashaBigHp')!).display)).not.toBe('none');
    const s = await stackAtBar(page, ['#inventory-screen']);
    expect(s.barIndex).toBeGreaterThanOrEqual(0);
    expect(s.topInBar).toBe(true);
    expect(errs).toEqual([]);
  });

  test('メニュー（持ち物）を 開くと メニューが ゲージより 上', async ({ page }) => {
    const errs = await ready(page);
    await page.keyboard.press('KeyE');
    await page.evaluate(() => (window as any).__rikkun.step(3));
    const s = await stackAtBar(page, ['#inventory-screen']);
    expect(s.index['#inventory-screen'], 'メニューが ある').toBeGreaterThanOrEqual(0);
    expect(s.barIndex, 'ゲージは メニューの 下に 見えて いる').toBeGreaterThan(s.index['#inventory-screen']!);
    expect(s.topInBar).toBe(false);
    expect(errs).toEqual([]);
  });

  test('本を 開くと 本が ゲージより 上（ゲージは 上に 出ない）', async ({ page }) => {
    const errs = await ready(page);
    await page.evaluate(() => { const h = (window as any).__rikkun; h.lock.book('toc'); h.step(3); });
    const s = await stackAtBar(page, ['.bk-layer']);
    expect(s.index['.bk-layer'], '本が ある').toBeGreaterThanOrEqual(0);
    expect(s.topInBar).toBe(false);
    if (s.barIndex >= 0) expect(s.barIndex).toBeGreaterThan(s.index['.bk-layer']!);
    expect(errs).toEqual([]);
  });

  test('遠い（barShowDistance より 先）と ゲージは 出ない。片づけたら 消える', async ({ page }) => {
    const errs = await openGasha(page);
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }));
    const shown = () => page.evaluate(() => { const e = document.getElementById('gashaBigHp'); return !!e && getComputedStyle(e).display !== 'none'; });
    await page.evaluate(() => (window as any).__rikkun.step(90));
    expect(await shown(), '近い').toBe(true);
    await page.evaluate((d) => (window as any).__rikkun.gasha.spawn({ distance: d, angleDeg: 0 }), RELEASE.spawn.barShowDistance + 30);
    await page.evaluate(() => (window as any).__rikkun.step(90));
    expect(await shown(), '遠い').toBe(false);
    await page.evaluate(() => (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: -90 }));
    await page.evaluate(() => (window as any).__rikkun.step(30));
    expect(await shown()).toBe(true);
    await page.evaluate(() => (window as any).__rikkun.gasha.despawn());
    expect(await shown(), '片づけた').toBe(false);
    expect(errs).toEqual([]);
  });
});

test.describe('実績の おしらせ', () => {
  const notify = (page: Page) => page.evaluate(() => { const h = (window as any).__rikkun; h.achievements.record('defeat:gashadokuro'); h.achievements.flush(); h.step(20); });

  test('実績の おしらせ（帯）は 体力ゲージより 上', async ({ page }) => {
    const errs = await ready(page);
    await notify(page);
    const s = await stackAtBar(page, ['.cel-layer--band']);
    expect(s.index['.cel-layer--band'], '帯が ゲージの 場所に かさなる').toBeGreaterThanOrEqual(0);
    expect(s.barIndex).toBeGreaterThan(s.index['.cel-layer--band']!);
    expect(errs).toEqual([]);
  });

  test('メニューを 開いて いても 実績の おしらせが いちばん 上（ゲージ < メニュー < おしらせ）', async ({ page }) => {
    const errs = await ready(page);
    await page.keyboard.press('KeyE');
    await page.evaluate(() => (window as any).__rikkun.step(3));
    await notify(page);
    const s = await stackAtBar(page, ['.cel-layer--band', '#inventory-screen']);
    expect(s.index['.cel-layer--band']).toBeGreaterThanOrEqual(0);
    expect(s.index['#inventory-screen']).toBeGreaterThanOrEqual(0);
    expect(s.index['.cel-layer--band']!).toBeLessThan(s.index['#inventory-screen']!);
    expect(s.index['#inventory-screen']!).toBeLessThan(s.barIndex);
    expect(errs).toEqual([]);
  });
});
