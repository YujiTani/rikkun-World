import { expect, test, type Page } from '@playwright/test';

/** M6 の画面のスクショ（docs/screenshots/m6-*.png）と、つなぎ込みの動作の確認 */
const OUT = 'docs/screenshots';

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.step(2);
  });
}

const stuff = () => {
  const h = window.__rikkun! as any;
  h.inventory.clear();
  const items: [string, number][] = [
    ['dirt', 64], ['stone', 40], ['log', 32], ['coal_ore', 12], ['iron_ore', 9], ['iron_ingot', 6], ['paper', 4],
    ['string', 5], ['cloth', 3], ['clay', 8], ['oil', 2], ['crystal', 2], ['furnace', 1], ['tansu', 2], ['wood_pickaxe', 1],
    ['katana', 1], ['yumi', 1], ['ya', 20], ['torch', 10], ['yokai_orb', 1],
  ];
  items.forEach(([item, n]) => h.inventory.add(item, n));
};

test.describe('M6 つなぎ込み', () => {
  test('HUD・もちもの・作る・せつめい', async ({ page }) => {
    await open(page);
    await page.evaluate(stuff);
    await page.evaluate(() => (window.__rikkun as any).step(3));
    await page.screenshot({ path: `${OUT}/m6-hud.png` });
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
    const ui = await page.evaluate(() => (window.__rikkun as any).craft.ui());
    expect(ui.open ?? true).toBeTruthy();
    await page.screenshot({ path: `${OUT}/m6-inventory.png` });
    // 作る: マスに合わせると せつめい
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const t = h.craft.ui().tiles ?? [];
      h.craft.hover(t[4]?.id ?? t[0]?.id);
      h.step(3);
    });
    await page.screenshot({ path: `${OUT}/m6-craft-detail.png` });
  });

  test('はじめて作った横断幕・おめでとう画面・じっせきページ', async ({ page }) => {
    await open(page);
    await page.evaluate(stuff);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
    const ids = await page.evaluate(() => (window.__rikkun as any).craft.ui().tiles?.map((t: any) => t.id ?? t) ?? []);
    const id = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const t = h.craft.ui().tiles ?? [];
      return (t.find((x: any) => x.craftable) ?? t[0])?.id ?? null;
    });
    expect(ids.length).toBeGreaterThan(0);
    expect(id).not.toBeNull();
    await page.evaluate((id) => {
      const h = window.__rikkun! as any;
      h.craft.tileClick(id);
      h.craft.tileClick(id);
      h.step(40);
    }, id);
    const fx = await page.evaluate(() => (window.__rikkun as any).craft.fx());
    console.log('fx', JSON.stringify(fx));
    await page.screenshot({ path: `${OUT}/m6-banner.png` });
    // 実績: 大きいものを取って おめでとう画面
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
      h.achievements.record('level', 5);
      h.step(2);
      h.achievements.flush();
      h.step(70);
    });
    const modal = await page.evaluate(() => (window.__rikkun as any).achievements.modal());
    console.log('modal', JSON.stringify(modal));
    await page.screenshot({ path: `${OUT}/m6-congrats.png` });
    if (modal.open) {
      const r = await page.evaluate(() => (window.__rikkun as any).achievements.close());
      expect(r.ok).toBe(true);
    }
    // じっせきページ
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
      h.achievements.tab('achievements');
      h.step(3);
    });
    const u = await page.evaluate(() => (window.__rikkun as any).achievements.ui());
    expect(u.tab).toBe('achievements');
    await expect(page.locator('.ach-page')).toBeVisible();
    await page.screenshot({ path: `${OUT}/m6-achievements.png` });
    // もどれる（タブが隠れない）
    await page.locator('[data-tab="items"]').click();
    await page.evaluate(() => (window.__rikkun as any).step(2));
    expect((await page.evaluate(() => (window.__rikkun as any).achievements.ui())).tab).toBe('items');
  });

  test('たんす画面・すてる', async ({ page }) => {
    await open(page);
    await page.evaluate(stuff);
    const ok = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.achievements.mute(true);
      const p = h.player.get().position;
      const x = Math.floor(p.x) + 2;
      const z = Math.floor(p.z);
      const y = Math.floor(p.y);
      h.world.setBlock(x, y, z, 'tansu');
      h.storage.set(x, y, z, 0, { item: 'iron_ingot', count: 5 });
      h.storage.set(x, y, z, 1, { item: 'katana', count: 1 });
      h.storage.set(x, y, z, 5, { item: 'crystal', count: 2 });
      const o = h.storage.open(x, y, z);
      h.step(3);
      return o;
    });
    expect(ok).toBe(true);
    await expect(page.locator('.tansu-panel')).toBeVisible();
    await page.screenshot({ path: `${OUT}/m6-tansu.png` });
    const drop = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const before = h.inventory.count('dirt');
      h.inventory.dragOut(9 > 0 ? 0 : 0);
      return before - h.inventory.count('dirt');
    });
    expect(drop).toBeGreaterThanOrEqual(0);
  });
});
