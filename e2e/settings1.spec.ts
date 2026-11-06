import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
}

function press(page: Page, index: number, on: boolean) {
  return page.evaluate(({ index, on }) => {
    const g = window as unknown as { __rikkunPad?: { buttons: { pressed: boolean; value: number }[] } };
    const b = g.__rikkunPad!.buttons[index]!;
    b.pressed = on;
    b.value = on ? 1 : 0;
    window.__rikkun!.step(2);
  }, { index, on });
}

async function inject(page: Page) {
  await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      index: 0,
      connected: true,
      mapping: 'standard' as GamepadMappingType,
      axes: [0, 0, 0, 0],
      buttons,
      timestamp: performance.now(),
    };
    const g = window as unknown as { __rikkunPad?: typeof pad };
    g.__rikkunPad = pad;
    window.__rikkun!.gamepad!.injectPad(pad as unknown as Gamepad);
    window.__rikkun!.step(2);
  });
}

test('せってい: 表・はやさ・おと・割り当て・動作確認', async ({ page }) => {
  await boot(page);
  await expect(page.getByText('スタートメニュー')).toBeVisible();
  await page.getByTestId('settings-open').click();
  const table = page.getByTestId('settings-controls');
  await expect(table).toContainText('すること');
  await expect(table).toContainText('キー・マウス');
  await expect(table).toContainText('Space');
  await expect(table).toContainText('Esc');
  await expect(table).toContainText('ひだりクリック');
  await expect(page.getByTestId('tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('sound-master')).toBeVisible();
  await expect(page.getByTestId('look-speed')).toBeHidden();
  await expect(page.getByTestId('pad-open')).toBeVisible();
  await page.getByTestId('tab-camera').click();
  await expect(page.getByTestId('tab-camera')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('look-speed')).toBeVisible();
  await expect(page.getByTestId('sound-master')).toBeHidden();
  await page.getByTestId('look-speed').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '4';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('tab-sound').click();
  await expect(page.getByTestId('sound-master')).toBeVisible();
  await expect(page.getByTestId('look-speed')).toBeHidden();
  await page.getByTestId('tab-camera').click();
  await expect(page.getByTestId('look-speed')).toHaveValue('4');

  await page.getByTestId('pad-open').click();
  await expect(page.getByTestId('pad-screen')).toBeVisible();
  await expect(page.getByTestId('pad-screen').getByTestId('look-speed')).toHaveCount(0);
  await expect(page.getByTestId('settings-diag')).toBeVisible();
  await page.getByTestId('pad-diag-open').click();
  await expect(page.getByTestId('dead-zone')).toBeVisible();
  await expect(page.locator('[data-pad-face="faceBottom"] text')).toHaveText('B');
  await expect(page.locator('[data-pad-face="faceRight"] text')).toHaveText('A');
  await page.getByTestId('dead-zone').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '0.33';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('pad-to-camera').click();
  await expect(page.getByTestId('pad-screen')).toBeHidden();
  await expect(page.getByTestId('tab-camera')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('look-speed')).toBeVisible();
  await expect(page.getByTestId('look-speed')).toHaveValue('4');
  const sens = await page.evaluate(() => window.__rikkun!.gamepad!.settings());
  expect(sens.lookSensitivity).toBe(4);
  expect(sens.deadZone).toBeCloseTo(0.33);

  // パッドを刺すと案内が閉じて遊びが始まる。＋ でスタートメニューに戻してから割り当てる
  await inject(page);
  await press(page, 9, true);
  await press(page, 9, false);
  await page.getByTestId('settings-open').click();
  await page.getByTestId('pad-open').click();
  await page.getByTestId('bind-jump').click({ force: true });
  await expect(page.getByTestId('bind-capture')).toBeVisible();
  await page.getByTestId('bind-cancel').click({ force: true });
  await expect(page.getByTestId('bind-capture')).toBeHidden();
  const before = await page.evaluate(() => window.__rikkun!.gamepad!.binds() as { r2?: string });
  expect(before.r2).toBe('primary');

  await page.getByTestId('bind-jump').click({ force: true });
  await press(page, 7, true);
  await expect(page.getByTestId('bind-note')).toContainText('ほる');
  const after = await page.evaluate(() => window.__rikkun!.gamepad!.binds() as { r2?: string; faceBottom?: string });
  expect(after.r2).toBe('jump');
  expect(after.faceBottom).toBe('jump');

  await page.getByTestId('binds-reset').click({ force: true });
  await expect(page.getByTestId('reset-no')).toBeFocused();
  await page.getByTestId('reset-no').click();
  expect((await page.evaluate(() => window.__rikkun!.gamepad!.binds() as { r2?: string })).r2).toBe('jump');
  await page.getByTestId('binds-reset').click({ force: true });
  await page.getByTestId('reset-yes').click();
  expect((await page.evaluate(() => window.__rikkun!.gamepad!.binds() as { r2?: string; start?: string })).r2).toBe('primary');
});

test('＋ はスタートメニュー。十字はメニューだけ。遊びのボタンは漏れない', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const h = window.__rikkun!;
    h.lock.simulate(true);
    h.step(2);
  });
  await inject(page);
  await press(page, 9, true);
  expect(await page.evaluate(() => window.__rikkun!.lock.get().overlayVisible)).toBe(true);
  expect(await page.evaluate(() => document.getElementById('inventory-screen')?.hidden)).toBe(true);
  const heldOpen = await page.evaluate(() => window.__rikkun!.input.held());
  expect(heldOpen).not.toContain('toggleInventory');
  await press(page, 9, false);
  await press(page, 7, true);
  const held = await page.evaluate(() => window.__rikkun!.input.held());
  expect(held).not.toContain('primary');
  expect(held).not.toContain('drop');
  await press(page, 7, false);
  await press(page, 13, true);
  const focus = await page.evaluate(() => ({
    held: window.__rikkun!.input.held(),
    tag: document.activeElement?.tagName ?? '',
    inMenu: !!document.activeElement?.closest('.play-overlay, #inventory-screen, [data-testid="settings-panel"]'),
  }));
  expect(focus.held).toContain('focusDown');
  expect(focus.held).not.toContain('drop');
  expect(focus.inMenu).toBe(true);

  await press(page, 13, false);
  await press(page, 9, true);
  await press(page, 9, false);
  await page.evaluate(() => {
    const h = window.__rikkun!;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
    h.step(2);
  });
  expect(await page.evaluate(() => document.getElementById('inventory-screen')?.hidden)).toBe(false);
  await press(page, 13, true);
  const inv = await page.evaluate(() => ({
    held: window.__rikkun!.input.held(),
    inInv: !!document.activeElement?.closest('#inventory-screen'),
  }));
  expect(inv.held).not.toContain('drop');
  expect(inv.inInv).toBe(true);
});

test('タイトルにもどる確認は やめる が先。やめるでは残る', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    (window as unknown as { __mark?: number }).__mark = 1;
  });
  await page.getByTestId('return-title').click();
  await expect(page.getByTestId('return-title-dialog')).toBeVisible();
  await expect(page.getByTestId('return-title-no')).toBeFocused();
  await expect(page.getByTestId('return-title-dialog')).toContainText('本当');
  await page.getByTestId('return-title-no').click();
  await expect(page.getByTestId('return-title-dialog')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __mark?: number }).__mark)).toBe(1);
  expect(await page.evaluate(() => window.__rikkun!.ready)).toBe(true);
});
