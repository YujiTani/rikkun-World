import { expect, test } from '@playwright/test';

/** FIX-action-hint: ねらっている所で 右クリックすると どうなるか が照準の下に出る */
test('ねらう物でヒントの文がかわる', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
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
    h.inventory.clear();
    h.inventory.add('dirt', 10);
    h.inventory.add('tansu', 1);
    h.inventory.add('furnace', 1);
    h.inventory.add('kabuto', 1);
    h.inventory.add('katana', 1);
    for (let x = 3; x <= 9; x++) for (let y = 10; y <= 12; y++) h.world.setBlock(x, y, 6, 'air');
    h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
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

  // 刀でブロック: 置けないので 左だけ
  await select('katana');
  expect(await hint()).toEqual({ left: { icon: 'wood_pickaxe', word: 'ほる' } });

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

test('妖怪をねらうと 黄色いふちどり と たたく が出て、外すと消える', async ({ page }) => {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  const r = await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.lock.simulate(true);
    h.inventory.clear();
    h.inventory.add('katana', 1);
    h.inventory.select(0);
    h.world.fill?.(0, 9, 0, 12, 20, 12, 'air');
    h.yokai.clear();
    h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
    const id = h.yokai.spawn('karakasa', 5.5, 9, 6.5);
    h.step(1);
    const out: any = { id };
    // 当たる高さをさがす（まっすぐ→少し下）
    for (const pitch of [0, -5, -10, -15]) {
      h.player.set({ pitch });
      h.step(1);
      if (h.hud.yokaiFocus() === id) break;
    }
    out.focus = h.hud.yokaiFocus();
    out.hint = h.hud.actionHint();
    return out;
  });
  expect(r.focus).toBe(r.id);
  expect(r.hint.left.word).toBe('たたく');
  await page.screenshot({ path: 'docs/screenshots/fix-action-hint-yokai.png' });
  const after = await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.player.set({ yaw: 270 });
    h.step(2);
    return { focus: h.hud.yokaiFocus(), hint: h.hud.actionHint() };
  });
  expect(after.focus).toBeNull();
  expect(after.hint.left?.word).not.toBe('たたく');
});
