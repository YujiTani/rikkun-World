import { expect, test } from '@playwright/test';
import { openLive3 } from './helpers/live3';

/**
 * LIVE-3 E2E その 3（docs/design/LIVE-3.md 版 1.1 §2.5・§2.6・§4.2・§6 AC11〜AC13）: なま は たべられない・かまど で やく・やいた にく を たべる。
 * かまど は M4 の「K」: `world.setBlock(.., 'furnace')` ＋ `craft.openFurnace` ＋ `furnace.click(id)`（e2e/craft2.spec.ts AC7 と 同じ）。
 */
test.describe('LIVE-3 やいて たべる', () => {
  test.describe.configure({ timeout: 120_000 });

  test('AC11 なま: momo_nama を 持って 空 を ねらい 右クリック → へらない・体力 かわらず・rawMeat・チップ に「かまど で やこう」・照準 の 下 は disabled', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      A.base();
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9); // 空（床）しか ねらわない
      const o: any = {};
      L.hp(10);
      A.hold('momo_nama', 3);
      h.step(2);
      o.right = A.hintRight();
      h.animals.events();
      A.tap();
      o.count = h.inventory.count('momo_nama');
      o.hp = h.combat.get().hp;
      o.hint = h.animals.lastHint();
      h.step(2);
      o.chip = A.chip();
      o.eat = A.stat('eat:momo_yaki') + A.stat('eat:*');
      // 満タン でも 同じ
      L.hp(h.combat.get().maxHp);
      A.tap();
      o.countFull = h.inventory.count('momo_nama');
      // 置けない（地面 を ねらって も）
      (window as any).__aim.standForS(2.5, 6.5, 90, 80, 9);
      h.step(1);
      A.tap();
      o.countPlace = h.inventory.count('momo_nama');
      return o;
    });
    expect(r.count, 'へらない').toBe(3);
    expect(r.hp, '体力 かわらない').toBe(10);
    expect(r.hint).toBe('rawMeat');
    expect(r.chip.text.replace(/\s+/g, '')).toContain('かまどでやこう');
    expect(r.chip.bare, '漢字 0').toEqual([]);
    expect(r.right).toMatchObject({ word: 'かまど で やこう', disabled: true });
    expect(r.eat).toBe(0);
    expect(r.countFull).toBe(3);
    expect(r.countPlace, '置けない').toBe(3);
  });

  test('AC12 やく: K で momo_nama 1・せきたん 1 → click → 59 で 0・60 で momo_yaki 1。furnace.list() は 5 こ・5 つ目 が momo_yaki', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      A.base();
      h.world.setBlock(11, 9, 12, 'furnace');
      h.step(2);
      h.inventory.clear();
      h.inventory.add('momo_nama', 1);
      h.inventory.add('coal_ore', 1);
      h.craft.openFurnace(11, 9, 12);
      const o: any = {};
      const list = h.furnace.list();
      o.ids = list.map((c: any) => c.id);
      o.last = list[list.length - 1];
      const c = h.furnace.click('momo_yaki');
      o.click = { ok: c.ok, used: c.used };
      o.nama = h.inventory.count('momo_nama');
      o.coal = h.inventory.count('coal_ore');
      h.step(59);
      o.at59 = h.inventory.count('momo_yaki');
      h.step(1);
      o.at60 = h.inventory.count('momo_yaki');
      o.namaAfter = h.inventory.count('momo_nama');
      // 材料 なし
      const c2 = h.furnace.click('momo_yaki');
      o.noMat = { ok: c2.ok };
      return o;
    });
    expect(r.ids, 'やく 5 こ').toHaveLength(5);
    expect(r.ids[4]).toBe('momo_yaki');
    expect(r.last).toMatchObject({ id: 'momo_yaki', canBake: true, fuelOk: true });
    expect(r.click.ok).toBe(true);
    expect(r.nama, '材料 を つかう').toBe(0);
    expect(r.coal, 'ねんりょう 1').toBe(0);
    expect(r.at59, '59 では 0').toBe(0);
    expect(r.at60, '60 で 1').toBe(1);
    expect(r.namaAfter).toBe(0);
    expect(r.noMat.ok, 'なま が 無い とき は やけない').toBe(false);
  });

  test('AC13 たべる: 体力 6 → 16。15 → 20（こえない）。20 → へらない・full。120 ステップ 押しつづけて も 1 こ。eat:momo_yaki 1・eat:* 変わらず・animal.eatMeat.1', async ({ page }) => {
    await openLive3(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const L = (window as any).__L;
      A.base();
      (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9);
      const o: any = { heal: h.settings.get('meatHeal'), per: h.settings.get('meatPerBird'), ticks: h.settings.get('meatTicks') };
      const max = h.combat.get().maxHp;
      o.max = max;
      const eat0 = A.stat('eat:*');
      o.un0 = A.unlocked('animal.eatMeat.1');
      L.hp(6);
      A.hold('momo_yaki', 5);
      h.step(1);
      o.right = A.hintRight();
      A.tap();
      o.hp6 = h.combat.get().hp;
      o.n1 = h.inventory.count('momo_yaki');
      o.stat1 = A.stat('eat:momo_yaki');
      o.un1 = A.unlocked('animal.eatMeat.1');
      L.hp(15);
      A.tap();
      o.hp15 = h.combat.get().hp;
      o.n2 = h.inventory.count('momo_yaki');
      L.hp(max);
      A.tap();
      o.hpFull = h.combat.get().hp;
      o.nFull = h.inventory.count('momo_yaki');
      o.hint = h.farm.lastHint();
      L.hp(1);
      h.inventory.clear();
      A.hold('momo_yaki', 5);
      h.input.press('secondary');
      h.step(120);
      h.input.release('secondary');
      o.nHold = h.inventory.count('momo_yaki');
      o.eatAll = A.stat('eat:*') - eat0;
      o.stat = A.stat('eat:momo_yaki');
      o.snd = A.sfx();
      return o;
    });
    expect(r.heal).toBe(10);
    expect(r.per).toBe(2);
    expect(r.ticks).toBe(220);
    expect(r.right).toMatchObject({ word: 'たべる' });
    expect(r.hp6).toBe(16);
    expect(r.n1).toBe(4);
    expect(r.stat1).toBe(1);
    expect(r.un1).toBe(true);
    expect(r.hp15, 'こえない').toBe(r.max);
    expect(r.n2).toBe(3);
    expect(r.hpFull).toBe(r.max);
    expect(r.nFull, '満タン は たべない').toBe(3);
    expect(r.hint).toBe('full');
    expect(r.nHold, '押しつづけて も 1 こ').toBe(4);
    expect(r.eatAll, 'eat:* は やさい だけ').toBe(0);
    expect(r.stat).toBe(3);
  });
});
