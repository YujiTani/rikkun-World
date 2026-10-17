import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { checkAnimations, checkColors, checkComponents, checkContrast, checkFontSizes, checkPressedShift, checkRootVars, snapshotUi } from './helpers/uiRules';

/** 部品見本のページで S1 の部品が AC31〜AC33・AC35・AC36 を満たすか（道具そのものの確かめもかねる） */
test.describe('部品見本（M6 S1）', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('色・文字・コントラスト・部品・点滅のきまり', async ({ page }) => {
    await page.goto('/src/ui/theme/parts.html');
    await page.waitForSelector('#parts-panel');
    const snap = await snapshotUi(page, { root: '#parts-root' });
    expect(snap.els.length).toBeGreaterThan(30);
    expect(await checkRootVars(page)).toEqual([]);
    expect(checkColors(snap)).toEqual([]);
    expect(checkFontSizes(snap)).toEqual([]);
    expect(checkContrast(snap)).toEqual([]);
    expect(checkComponents(snap)).toEqual([]);
    expect(await checkAnimations(page)).toEqual([]);
    expect(await checkPressedShift(page, '.rk-btn--primary')).toEqual([]);
  });

  test('道具が わるい例を見つける', async ({ page }) => {
    await page.goto('/src/ui/theme/parts.html');
    await page.waitForSelector('#parts-panel');
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'bad';
      d.textContent = 'わるい';
      d.style.cssText = 'position:fixed;top:0;left:0;color:#777;background:#123456;font-size:13px;padding:5px;border-radius:5px;animation:bad 200ms infinite alternate;';
      const st = document.createElement('style');
      st.textContent = '@keyframes bad{from{opacity:.2}to{opacity:1}}';
      document.head.append(st);
      document.body.append(d);
    });
    const snap = await snapshotUi(page, { root: '#bad' });
    expect(checkColors(snap).length).toBeGreaterThan(0);
    expect(checkFontSizes(snap).length).toBeGreaterThan(0);
    expect(checkContrast(snap).length).toBeGreaterThan(0);
    expect(checkComponents(snap).length).toBeGreaterThan(0);
    expect((await checkAnimations(page)).length).toBeGreaterThan(0);
  });

  test('スクショ', async ({ page }) => {
    await page.goto('/src/ui/theme/parts.html');
    await page.waitForSelector('#parts-panel');
    mkdirSync('test-shots', { recursive: true });
    await page.screenshot({ path: 'test-shots/m6-s1-parts.png', fullPage: true });
  });
});
