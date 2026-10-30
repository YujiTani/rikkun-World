import { expect, test, type Page } from '@playwright/test';
import { GADGET_TUNING } from '../src/content/items/gadgetTuning';
import { installAimHelpers } from './helpers/aim';

/**
 * ITEM-FX-1（issue #342）の代表: ちょうちんを置くと近くで湧かない（AC1〜AC3）、ふとんで朝になる（AC6・AC7）、
 * たこをあげる（AC8・AC9）、おまもりがやぶれる（AC11・AC12）、わらじではねる（AC16・AC17）。
 * 数・持ち物・状態の細かい確認はユニットテスト（gadgetTuning.test.ts ほか）。約束は docs/tickets/ITEM-FX-1-contract.md。
 * 数は gadgetTuning.ts から読む。見た目（形・色）は yuzu の OK 前なので スクショ比較はしない。
 * まだ ないもの: window.__rikkun.sleep / kite / world.darkForSpawn。
 */

const NIGHT = 67400; // 夜の真ん中（night76.spec.ts と同じ）
const DAY = 14000;

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => (window as any).__rikkun.achievements.mute(true));
  await installAimHelpers(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.yokai.clear();
    // 平らな床（上面 y=9）と、その上の空気
    h.world.fill(0, 8, 0, 24, 8, 24, 'stone');
    h.world.fill(0, 9, 0, 24, h.world.size().y - 1, 24, 'air');
    h.inventory.clear();
    h.settings.set('dropMax', { common: 1, uncommon: 1, rare: 1, superRare: 1 });
    (window as any).__aim.standForS(2.5, 6.5, 90, 0, 9);
    h.step(10);
  });
}

/** ライトとメッシュの作り直しが落ちつくまで */
const settleLight = (page: Page) =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
  });

/** (tx, ty, tz) のブロックの上の面をねらって、いま持っているものを右クリックで置く */
async function placeOnTop(page: Page, tx: number, ty: number, tz: number) {
  await page.evaluate(
    ([x, y, z]) => {
      const h = (window as any).__rikkun;
      (window as any).__aim.solve(x, y, z, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
      h.step(2);
    },
    [tx, ty, tz],
  );
}

test.describe('ちょうちん（AC1〜AC3）', () => {
  test('置くと そのまわりでは 夜でも 妖怪が 湧かない。はなれた所は 湧ける。こわすと もどる', async ({ page }) => {
    await open(page);
    const R = GADGET_TUNING.lantern.noSpawnRadius;
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.time.set(67400);
      h.inventory.setSlot(0, { item: 'lantern', count: 1 });
      h.inventory.select(0);
    });
    await settleLight(page);
    // 対照: 置く前は 夜の外は 湧ける場所
    expect(await page.evaluate(() => (window as any).__rikkun.world.darkForSpawn(8, 9, 8)), '対照: 置く前').toBe(true);
    await placeOnTop(page, 6, 8, 6);
    const placed = await page.evaluate(() => (window as any).__rikkun.world.getBlock(6, 9, 6));
    expect(placed).toBe('lantern');
    expect(await page.evaluate(() => (window as any).__rikkun.inventory.count('lantern'))).toBe(0);
    await settleLight(page);
    const lit = await page.evaluate(() => (window as any).__rikkun.world.lightAt(6, 9, 6));
    expect(lit.block).toBe(GADGET_TUNING.lantern.light);
    // 半径の中は 湧かない（水平・上下）。外は 湧ける
    const dark = (dx: number, dy: number, dz: number) =>
      page.evaluate(([x, y, z]) => (window as any).__rikkun.world.darkForSpawn(x, y, z), [6 + dx, 9 + dy, 6 + dz]);
    expect(await dark(R, 0, 0)).toBe(false);
    expect(await dark(0, 0, R)).toBe(false);
    expect(await dark(0, R, 0)).toBe(false);
    expect(await dark(R + 1, 0, 0)).toBe(true);
    // 夜のあいだ 長く進めても、ちょうちんの半径の中には 妖怪が 湧かない（AC3）。
    // 見るのは「湧いた 場所」（yokai.events() の spawn）。いる 場所では 見ない:
    // 妖怪は 足 ±8 の 床にも 湧くので（MINE-1A）、半径の 外に 湧いた 妖怪が プレイヤーを 追って 半径に 入って 来ることが ある（湧きでは ない）
    const spawns = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.yokai.events(); // ここまでの 出来事は すてて、この 間に 湧いた 物だけ 見る
      const out: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < 1800; i++) {
        h.step(1);
        for (const ev of h.yokai.events()) if (ev.type === 'spawn') out.push(ev.position);
      }
      return out;
    });
    // 半径の はんいは ゲームの きまり（WorldLight.isDarkForSpawn）と 同じ: 湧いた 足もとの マスが ちょうちんの マス（6, 9, 6）から 水平も 上下も R 以内
    const inside = spawns.filter(
      (p) => Math.abs(Math.floor(p.x) - 6) <= R && Math.abs(Math.floor(p.y) - 9) <= R && Math.abs(Math.floor(p.z) - 6) <= R,
    );
    expect(spawns.length, '対照: 同じ 間に 湧きは ある（0 回で 通って しまわない）').toBeGreaterThan(0);
    expect(inside, '半径の中には 湧かない').toEqual([]);
    // こわすと 湧ける所に もどる
    await page.evaluate(() => (window as any).__rikkun.world.setBlock(6, 9, 6, 'air'));
    await settleLight(page);
    expect(await dark(8, 0, 0)).toBe(true);
  });
});

test.describe('ふとん（AC6・AC7）', () => {
  test('よるに 右クリックすると 画面が 暗くなって 明るくなり、あさの はじまりになる。ねている間は 動けない', async ({ page }) => {
    await open(page);
    await page.evaluate((t) => {
      const h = (window as any).__rikkun;
      h.time.set(t);
      h.world.setBlock(4, 9, 6, 'futon');
      h.step(2);
    }, NIGHT);
    const before = await page.evaluate(() => (window as any).__rikkun.time.get());
    expect(before.phase).toBe('night');
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).__aim.solve(4, 9, 6, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
    });
    const s0 = await page.evaluate(() => (window as any).__rikkun.sleep.get());
    expect(s0.sleeping).toBe(true);
    // ねている間は 前へ 進めない
    const p0 = await page.evaluate(() => (window as any).__rikkun.player.get().position);
    const fades: number[] = [];
    await page.evaluate(() => (window as any).__rikkun.input.press('moveForward'));
    for (let i = 0; i < GADGET_TUNING.futon.sleepSteps + 5; i++) {
      const s = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.step(1);
        return h.sleep.get();
      });
      fades.push(s.fade);
      if (!s.sleeping) break;
      const p = await page.evaluate(() => (window as any).__rikkun.player.get().position);
      expect(Math.hypot(p.x - p0.x, p.z - p0.z), 'ねている間は 動かない').toBeLessThan(0.05);
    }
    await page.evaluate(() => (window as any).__rikkun.input.releaseAll());
    expect(Math.max(...fades)).toBeGreaterThan(0.9); // 暗くなって
    expect(fades[fades.length - 1]).toBe(0); // 明るくなる
    const after = await page.evaluate(() => (window as any).__rikkun.time.get());
    expect(after.phase).toBe('day'); // ひるの はじまりに おきる
    expect(after.day).toBe(before.day + 1);
    expect((await page.evaluate(() => (window as any).__rikkun.sleep.get())).sleeping).toBe(false);
  });

  test('ひるに 右クリックすると 「よる に ねようね」と出るだけで 時刻は 変わらない', async ({ page }) => {
    await open(page);
    await page.evaluate((t) => {
      const h = (window as any).__rikkun;
      h.time.set(t);
      h.world.setBlock(4, 9, 6, 'futon');
      h.step(2);
    }, DAY);
    const before = await page.evaluate(() => (window as any).__rikkun.time.get());
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      (window as any).__aim.solve(4, 9, 6, 1);
      h.step(1);
      h.input.press('secondary');
      h.step(1);
      h.input.release('secondary');
    });
    const s = await page.evaluate(() => (window as any).__rikkun.sleep.get());
    expect(s.sleeping).toBe(false);
    expect(s.notice).toBe('よる に ねようね');
    await page.evaluate(() => (window as any).__rikkun.step(30));
    const after = await page.evaluate(() => (window as any).__rikkun.time.get());
    expect(after.day).toBe(before.day);
    expect(after.dayTick - before.dayTick).toBeLessThan(200); // 30 ステップぶんだけ（ねて 飛んでいない）
    expect(after.phase).toBe('day');
  });
});

test.describe('たこ（AC8・AC9）', () => {
  test('持って右クリックで 上空へ上がる。もう一度で 戻る。持ちかえても 戻る。たこは なくならない', async ({ page }) => {
    await open(page);
    const H = GADGET_TUNING.kite.height;
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(0, { item: 'kite', count: 1 });
      h.inventory.setSlot(1, { item: 'dirt', count: 1 });
      h.inventory.select(0);
      h.step(2);
    });
    const tap = () =>
      page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.input.press('secondary');
        h.step(1);
        h.input.release('secondary');
        h.step(2);
      });
    const kite = () => page.evaluate(() => (window as any).__rikkun.kite.get());
    expect((await kite()).up).toBe(false);
    await tap();
    expect((await kite()).up).toBe(true);
    await page.evaluate(() => (window as any).__rikkun.step(600));
    const k = await kite();
    expect(k.up).toBe(true);
    expect(k.solid).toBe(false);
    expect(Math.abs(k.height - H)).toBeLessThanOrEqual(1);
    const p = await page.evaluate(() => (window as any).__rikkun.player.get().position);
    expect(Math.abs(k.position.y - (p.y + H))).toBeLessThanOrEqual(1);
    // ゆらゆら: すこし 進めると 位置が かわる
    await page.evaluate(() => (window as any).__rikkun.step(37));
    const k2 = await kite();
    expect(Math.hypot(k2.position.x - k.position.x, k2.position.y - k.position.y, k2.position.z - k.position.z)).toBeGreaterThan(0);
    // もう一度 右クリックで 戻る
    await tap();
    expect((await kite()).up).toBe(false);
    expect((await kite()).position).toBeNull();
    expect(await page.evaluate(() => (window as any).__rikkun.inventory.count('kite'))).toBe(1);
    // また あげて、持ちかえると 戻る
    await tap();
    expect((await kite()).up).toBe(true);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.select(1);
      h.step(2);
    });
    expect((await kite()).up).toBe(false);
    expect(await page.evaluate(() => (window as any).__rikkun.inventory.count('kite'))).toBe(1);
  });
});

test.describe('おまもり（AC11・AC12）', () => {
  test('やられても 持ち物も防具も 落とさず、おまもりは やぶれた おまもり に かわる', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(0, { item: 'dirt', count: 5 });
      h.inventory.setSlot(8, { item: 'stone', count: 3 });
      h.inventory.setSlot(20, { item: 'omamori', count: 1 });
      h.inventory.select(0);
      h.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
      h.step(2);
    });
    // 対照は ユニットテスト（おまもりなしは落とす）。ここでは 実際のゲームで やられる
    await page.evaluate(() => (window as any).__rikkun.combat.setHp(0));
    await page.evaluate(() => (window as any).__rikkun.step(2));
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return {
        dead: h.combat.get().dead,
        bags: h.combat.bags().length,
        dirt: h.inventory.count('dirt'),
        stone: h.inventory.count('stone'),
        omamori: h.inventory.count('omamori'),
        torn: h.inventory.count('omamori_torn'),
        armor: h.armor.get(),
      };
    });
    expect(r.dead).toBe(true);
    expect(r.bags).toBe(0);
    expect(r.dirt).toBe(5);
    expect(r.stone).toBe(3);
    expect(r.omamori).toBe(0);
    expect(r.torn).toBe(1);
    expect(r.armor).toMatchObject({ head: 'kabuto', body: 'yoroi', arms: 'kote', legs: 'suneate' });
  });
});

test.describe('わらじ（AC16・AC17）', () => {
  test('はいている間だけ ジャンプが 高い（表の高さ）。脱ぐと 元に戻る', async ({ page }) => {
    await open(page);
    const peak = (): Promise<number> =>
      page.evaluate(() => {
        const h = (window as any).__rikkun;
        (window as any).__aim.standForS(2.5, 6.5, 90, 0, 9);
        h.step(5);
        const y0 = h.player.get().position.y;
        h.input.press('jump');
        h.step(1);
        h.input.release('jump');
        let top = y0;
        for (let i = 0; i < 80; i++) {
          h.step(1);
          top = Math.max(top, h.player.get().position.y);
        }
        return top - y0;
      });
    const base = await peak();
    expect(base).toBeGreaterThan(1.15);
    expect(base).toBeLessThan(1.35); // ふだん 1.25
    await page.evaluate(() => (window as any).__rikkun.armor.set(null, null, null, 'waraji'));
    const high = await peak();
    expect(high).toBeGreaterThan(GADGET_TUNING.waraji.jumpHeight - 0.1);
    expect(high).toBeLessThan(GADGET_TUNING.waraji.jumpHeight + 0.1);
    expect(high).toBeLessThan(2); // 2 段には届かない
    await page.evaluate(() => (window as any).__rikkun.armor.set(null, null, null, null));
    const back = await peak();
    expect(back).toBeCloseTo(base, 1);
  });
});
