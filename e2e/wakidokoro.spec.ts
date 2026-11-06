import { expect, test, type Page } from '@playwright/test';
import { installAimHelpers } from './helpers/aim';
import { installArena } from './helpers/arena';

/**
 * WAKIDOKORO（docs/design/WAKIDOKORO.md）: わきどころ（5 方向・渦の 見た目）・こわしても 落とさない・たきつぼは アイテムに なる・
 * マグマの ダメージで 1 秒の むてき（ノックバック なし）・マグマに 落ちた アイテムは 20 秒で 燃えて 消える。WK_SHOTS=dir で 画面を のこす。
 * 場所: 床 `__arena.floor`（y=8 の 石、上面 y=9）。時間（ms）で 合否を 決めない（ステップで すすめる）。
 */
async function open(page: Page): Promise<void> {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await installArena(page);
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(12000);
    (window as any).__arena.floor(0, 0, 30, 30);
    h.player.set({ position: { x: 15.5, y: 9, z: 15.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }); // わきどころが 休まない（activeRadius）
    h.water.pause(false);
    for (let n = 0; h.water.queue() > 0 && n < 3000; n++) h.step(1);
  });
}

const shotDir = process.env.WK_SHOTS;

test.describe('WAKIDOKORO', () => {
  test('わきどころ: 5 方向（下・北・東・南・西）に 出る・上には 出ない。渦が 動く。マグマ版も', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.setBlock(10, 13, 10, 'wakimizu');
      h.step(15);
      const a = (x: number, y: number, z: number) => h.water.amount(x, y, z) as number;
      return { down: a(10, 12, 10), n: a(10, 13, 9), e: a(11, 13, 10), s: a(10, 13, 11), w: a(9, 13, 10), up: a(10, 14, 10) };
    });
    expect(r).toEqual({ down: 1, n: 1, e: 1, s: 1, w: 1, up: 0 });
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.setBlock(20, 13, 10, 'magma_wakimizu');
      h.step(45 * 20);
      h.player.set({ position: { x: 15.5, y: 9, z: 18.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 10 });
      h.step(2);
    });
    const magma = await page.evaluate(() => (window as any).__rikkun.water.magma.amount(20, 13, 9) as number);
    expect(magma, 'マグマも よこへ 出る').toBeGreaterThan(0);
    if (shotDir) await page.screenshot({ path: `${shotDir}/1-wakidokoro-water-magma.png` });
    // 渦: 近くから 見て 時間を すすめると 絵が かわる（ゲームの 秒で コマが すすむ）
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.water.pause(true);
      h.world.fill(2, 9, 22, 6, 12, 26, 'air');
      h.world.setBlock(4, 9, 24, 'wakimizu');
      h.world.setBlock(6, 9, 24, 'magma_wakimizu');
      h.player.set({ position: { x: 5.0, y: 9, z: 27.2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -35 });
      h.step(2);
    });
    const a = await page.screenshot();
    if (shotDir) await page.screenshot({ path: `${shotDir}/2-swirl-frame-a.png` });
    await page.evaluate(() => (window as any).__rikkun.step(30)); // 0.5 秒 → 3 コマ/秒 で 1〜2 コマ 先
    const b = await page.screenshot();
    if (shotDir) await page.screenshot({ path: `${shotDir}/2-swirl-frame-b.png` });
    expect(Buffer.compare(a, b), '渦の コマが かわる').not.toBe(0);
  });

  test('こわす: わきどころは 何も 落とさない。たきつぼ・マグマの たきつぼ は その アイテム 1 こ（置き直せる）', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const dig = async (x: number, z: number) =>
      page.evaluate(([x, z]) => {
        const h = (window as any).__rikkun;
        h.player.set({ position: { x: x + 0.5, y: 9, z: z + 2.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -30 });
        h.step(2);
        (window as any).__aim.solve(x, 9, z, 0.5);
        h.step(1);
        // ひびが いっぱいに なるまで 押す → 押し直して こわす（houseSite.ts と 同じ）
        h.input.release('primary');
        h.input.press('primary');
        for (let i = 0; i < 900 && !h.dig.get().ready; i++) h.step(1);
        h.input.release('primary');
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        h.step(30);
        return { gone: h.world.getBlock(x, 9, z) === 'air', bags: (h.combat.bags() as { slots: { item: string }[] }[]).map((b) => b.slots[0]!.item) };
      }, [x, z] as const);
    const got = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.water.pause(true);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'iron_pickaxe', count: 1 });
      h.inventory.select(0);
      h.world.setBlock(6, 9, 6, 'wakimizu');
      h.world.setBlock(12, 9, 6, 'magma_wakimizu');
      h.world.setBlock(18, 9, 6, 'takitsubo');
      h.world.setBlock(24, 9, 6, 'magma_takitsubo');
      h.step(1);
      return true;
    });
    expect(got).toBe(true);
    const count = (id: string) => page.evaluate((id) => (window as any).__rikkun.inventory.count(id) as number, id);
    for (const [x, id] of [[6, 'wakimizu'], [12, 'magma_wakimizu']] as const) {
      const r = await dig(x, 6);
      expect(r.gone).toBe(true);
      expect(await count(id), `${id} は もどらない`).toBe(0);
      expect(r.bags).not.toContain(id);
    }
    for (const [x, id] of [[18, 'takitsubo'], [24, 'magma_takitsubo']] as const) {
      const r = await dig(x, 6);
      expect(r.gone).toBe(true);
      expect(await count(id), `${id} が 1 こ`).toBe(1);
      expect(await count('stone'), 'いしでは ない').toBe(0);
    }
    // 置き直す
    const placed = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'takitsubo', count: 1 });
      h.inventory.select(0);
      h.player.set({ position: { x: 18.5, y: 9, z: 12.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -40 });
      h.step(2);
      (window as any).__aim.solve(18, 8, 10, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(2);
      return h.world.getBlock(18, 9, 10) as string;
    });
    expect(placed).toBe('takitsubo');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.world.setBlock(20, 9, 10, 'magma_takitsubo');
      h.player.set({ position: { x: 19.5, y: 10.5, z: 13.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -50 });
      h.step(3);
    });
    if (shotDir) await page.screenshot({ path: `${shotDir}/3-takitsubo-water-magma.png` });
  });

  test('マグマの ダメージ: むてき 1 秒（60 ステップ）。ノックバック なし', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      // マグマの いけ（x 8〜15・深さ 1）。プレイヤーは 東より（x 13.8）→ まわりの マグマの まん中（x 13.5）より 東 → 東へ
      h.world.fill(8, 8, 8, 15, 8, 12, 'air');
      for (let x = 8; x <= 15; x++) for (let z = 8; z <= 12; z++) h.water.magma.set(x, 8, z, 8);
      h.water.pause(true);
      h.combat.setHp(20);
      h.player.set({ position: { x: 13.8, y: 8.2, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      const s0 = h.combat.get();
      const x0 = 13.8;
      h.step(10);
      const p = h.player.get().position;
      return { hp1: s0.hp, inv: s0.invincibleTicks, dx: p.x - x0, hpAfter: h.combat.get().hp };
    });
    expect(r.hp1, 'ふれた すぐ 1').toBe(19);
    expect(r.inv, 'むてき 1 秒').toBe(60);
    expect(Math.abs(r.dx), 'おされない').toBeLessThan(0.05);
  });

  test('マグマに 落ちた アイテムは 燃えて（炎・けむり）20 秒で 消える', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.time.set(67400);
      h.world.fill(10, 7, 10, 14, 8, 14, 'air');
      h.world.fill(9, 6, 9, 15, 6, 15, 'stone');
      for (let x = 10; x <= 14; x++) for (let z = 10; z <= 14; z++) for (let y = 7; y <= 8; y++) h.water.magma.set(x, y, z, 8);
      h.water.pause(true);
      h.inventory.clear();
      h.inventory.setSlot(0, { item: 'dirt', count: 3 });
      h.inventory.select(0);
      h.player.set({ position: { x: 12.5, y: 9, z: 16.2 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -30 });
      h.step(2);
      h.input.press('drop');
      h.step(1);
      h.input.release('drop');
      h.player.set({ position: { x: 12.5, y: 9, z: 18.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -35 });
      h.step(120);
      const b = h.combat.bags() as { burning?: boolean }[];
      return { n: b.length, burning: b[0]?.burning === true };
    });
    expect(r.n).toBe(1);
    expect(r.burning).toBe(true);
    if (shotDir) await page.screenshot({ path: `${shotDir}/4-item-burning.png` });
    const left = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1000);
      const mid = h.combat.bags().length as number;
      h.step(200);
      return { mid, end: h.combat.bags().length as number };
    });
    expect(left.mid, '20 秒 まえは まだ ある').toBe(1);
    expect(left.end, '20 秒で 消える').toBe(0);
  });
});
