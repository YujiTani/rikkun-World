import { expect, test, type Page } from '@playwright/test';
import { aimAtBlock, installAimHelpers, standOnGround } from './helpers/aim';

/**
 * KONGO-1 E2E（docs/design/KONGO-1.md 版 1.1 §6 の 【E2E】: AC8・AC9・AC10）。
 * 実装の 前に 書いた テスト（落ちるのが 正しい）。数は 決めうちせず、設定と 窓口に 聞く。時間（ms）では 待たず、ステップで 進める。
 * 窓口は 今の もの だけ（inventory.add/count/select/setSlot・craft.click・rarity.of・craft.info・armor.get/durability・world.setBlock・step）。
 */
async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.inventory.clear();
  });
}

test.describe('KONGO-1 こんごうの そうび', () => {
  test.describe.configure({ timeout: 120_000 });

  test('AC8 通し: diamond 2・log 1 → 作業台で kongo_katana → mythic・説明の 表 たたく つよさ 7・たいきゅう 1500', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.add('diamond', 2);
      h.inventory.add('log', 1);
      if (!h.inventory.get().open) {
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
      }
      h.step(4);
      const click = h.craft.click('kongo_katana');
      h.step(3);
      const info = h.craft.info('kongo_katana');
      return {
        click: click?.ok ?? false,
        katana: h.inventory.count('kongo_katana'),
        diamond: h.inventory.count('diamond'),
        log: h.inventory.count('log'),
        rarity: h.rarity.of('kongo_katana')?.id,
        stats: (info?.stats ?? []).map((s: any) => ({ label: s.label, value: s.value })),
      };
    });
    expect(r.click).toBe(true);
    expect(r.katana).toBe(1);
    expect(r.diamond).toBe(0);
    expect(r.log).toBe(0);
    expect(r.rarity).toBe('mythic');
    expect(r.stats).toContainEqual({ label: 'たたく つよさ', value: 7 });
    expect(r.stats).toContainEqual({ label: 'たいきゅう', value: 1500 });
  });

  test('AC9 つるはし: いちばん 高い 段階の ブロック（てつの 鉱石 以上）を 長おしで こわす → 持ち物に 入る', async ({ page }) => {
    await open(page);
    const { floorY } = await standOnGround(page, 10.5, 10.5, { floorY: 8 });
    const r = await page.evaluate((floorY) => {
      const h = (window as any).__rikkun;
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'kongo_pickaxe', count: 1 });
      h.inventory.select(0);
      // いちばん 高い 段階が いる ブロックを 窓口に 聞いて えらぶ（ダイヤの 鉱石が あれば それ。無ければ てつの 鉱石）
      const types: any[] = h.world.blockTypes();
      const ids = types.map((t) => t.id as string);
      const target = ids.includes('diamond_ore') ? 'diamond_ore' : 'iron_ore';
      const bx = 12;
      const bz = 10;
      h.world.setBlock(bx, floorY + 1, bz, target);
      h.step(2);
      return { target, bx, bz, floorY };
    }, floorY);
    await aimAtBlock(page, r.bx, r.floorY + 1, r.bz, 0.5);
    const out = await page.evaluate((r) => {
      const h = (window as any).__rikkun;
      const aimed = h.target.get();
      // ひびが MAX（ready）に なるまで 長おし → はなして もう 1 回 おすと こわれる（bal-d と おなじ）
      let readyAt = -1;
      let broke = -1;
      h.input.press('primary');
      for (let i = 1; i <= 600; i++) {
        h.step(1);
        if (h.dig.get().ready) {
          readyAt = i;
          break;
        }
      }
      h.input.release('primary');
      h.step(2);
      h.input.press('primary');
      for (let i = 1; i <= 20; i++) {
        h.step(1);
        if (h.world.getBlock(r.bx, r.floorY + 1, r.bz) === 'air') {
          broke = i;
          break;
        }
      }
      h.input.release('primary');
      h.step(30);
      return { aimed: !!aimed, readyAt, broke, after: h.world.getBlock(r.bx, r.floorY + 1, r.bz), items: h.inventory.get() };
    }, r);
    expect(out.aimed, 'ねらいが ブロックに 乗った').toBe(true);
    expect(out.readyAt, 'ひびが MAX').toBeGreaterThan(0);
    expect(out.broke, 'こわれた').toBeGreaterThan(0);
    // 中身（ドロップ）は 持ち物に 入る。かず・id は 表で きまる ので 1 こ以上 だけ 見る
    const total = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return h.inventory.count('iron_ore') + h.inventory.count('iron_ingot') + h.inventory.count('diamond') + h.inventory.count('diamond_ore');
    });
    expect(total, 'こわした ブロックの 中身が 持ち物に 入る').toBeGreaterThan(0);
  });

  test('AC10 防具: kongo_kabuto を ホットバーで 持って みぎクリック → armor head が kongo_kabuto・たいきゅう 1500', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.armor.set(null, null, null, null);
      h.inventory.add('kongo_kabuto', 1);
      h.inventory.select(0);
      h.step(2);
      h.input.press('secondary');
      h.step(2);
      h.input.release('secondary');
      h.step(3);
      return { head: h.armor.get().head, dur: h.armor.durability('head'), left: h.inventory.count('kongo_kabuto') };
    });
    expect(r.head).toBe('kongo_kabuto');
    expect(r.dur).toEqual({ left: 1500, max: 1500 });
    expect(r.left).toBe(0);
  });
});
