import { expect, test } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';

/** FIX-action-hint: ねらっている所で 右クリックすると どうなるか が照準の下に出る */
test('ねらう物でヒントの文がかわる', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await installAimHelpers(page);
  const hint = async () =>
    page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.step(2);
      return h.hud.actionHint();
    });
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.world.fill(0, 8, 0, 12, 8, 12, 'stone'); // 足もとの 床（落ちないように）
    h.inventory.clear();
    h.inventory.add('dirt', 10);
    h.inventory.add('tansu', 1);
    h.inventory.add('furnace', 1);
    h.inventory.add('kabuto', 1);
    h.inventory.add('katana', 1);
    for (let x = 3; x <= 9; x++) for (let y = 10; y <= 12; y++) h.world.setBlock(x, y, 6, 'air');
    (window as any).__aim.standForS(2.5, 6.5, 90, 0, 9);
  });
  const select = (item: string) =>
    page.evaluate((it) => {
      const h = window.__rikkun! as any;
      const s = h.inventory.get().slots.findIndex((x: any) => x?.item === it);
      h.inventory.select(s);
    }, item);
  const put = (id: string) =>
    page.evaluate((b) => (window.__rikkun as any).world.setBlock(4, 10, 6, b), id);

  // 何もない所 + 道具: 何も出ない
  await select('katana');
  await put('air');
  expect(await hint()).toEqual({});

  // つち を持って ブロックをねらう
  await select('dirt');
  await put('stone');
  expect(await hint()).toEqual({ right: { icon: 'dirt', word: 'おく' }, left: { icon: 'wood_pickaxe', word: 'ほる' } });

  // たんす・かまど
  await put('tansu');
  expect((await hint()).right).toEqual({ icon: 'tansu', word: 'ひらく' });
  await put('furnace');
  expect((await hint()).right).toEqual({ icon: 'furnace', word: 'ひらく' });
  await page.screenshot({ path: 'docs/screenshots/fix-action-hint.png' });

  // 防具
  await put('stone');
  await select('kabuto');
  expect((await hint()).right).toEqual({ icon: 'kabuto', word: 'きる' });

  // 刀でブロック: 置けないので 左だけ。刀のときは ほる も「きる」にそろえる（WEAPON-2 のオーナー決定）
  await select('katana');
  expect(await hint()).toEqual({ left: { icon: 'katana', word: 'きる' } });

  // 設定で消せる
  await select('dirt');
  await page.evaluate(() => (window.__rikkun as any).settings.set('actionHint', false));
  expect(await hint()).toEqual({});
  await page.evaluate(() => (window.__rikkun as any).settings.set('actionHint', true));

  // もちもの画面では出さない
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.input.press('toggleInventory');
    h.input.release('toggleInventory');
  });
  expect(await hint()).toEqual({});
});

for (const kind of ['karakasa', 'rokurokubi']) {
  test(`妖怪（${kind}）をねらうと 黄色いふちどり と たたく が出て、外すと消える`, async ({ page }) => {
    await page.goto('/?nosave=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await installAimHelpers(page);
    const r = await page.evaluate((k) => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.inventory.clear();
      h.inventory.select(0); // すで。刃物（ぼくとう・刀）を持つと「きる」にそろう（WEAPON-2 のオーナー決定）
      h.yokai.clear();
      (window as any).__aim.standForS(2.5, 6.5, 90, 0, 9);
      const id = h.yokai.spawn(k, 6.5, 9, 6.5);
      h.step(1);
      for (const pitch of [0, -5, -10, -15, 5, 10]) {
        h.player.set({ pitch });
        h.step(1);
        if (h.hud.yokaiFocus() === id) break;
      }
      h.step(20); // 動いても付いてくる
      return { id, focus: h.hud.yokaiFocus(), hulls: h.hud.yokaiFocusHulls(), hint: h.hud.actionHint() };
    }, kind);
    expect(r.focus).toBe(r.id);
    expect(r.hulls).toBeGreaterThan(0);
    expect(r.hint.left.word).toBe('たたく');
    await page.screenshot({ path: `docs/screenshots/fix-action-hint-${kind}.png` });
    const after = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.player.set({ yaw: 270 });
      h.step(2);
      return { focus: h.hud.yokaiFocus(), hulls: h.hud.yokaiFocusHulls(), hint: h.hud.actionHint() };
    });
    expect(after.focus).toBeNull();
    expect(after.hulls).toBe(0);
    expect(after.hint.left?.word).not.toBe('たたく');
  });
}
