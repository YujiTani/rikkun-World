import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { SOLO_BASELINE, SOLO_MAX, measureRender } from './helpers/duoBudget';
import type { DuoState, DuoVec3, DuoView } from '../src/duo/types';

/**
 * COOP-1 作業 1（#395。docs/design/COOP-1.md §12.0・§12.1・AC2・AC3・AC14）の E2E。実装の 前に 書いた 赤の テスト。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun.duo）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（仕様 §12.0 に 足りない 所を ここで 決めた）----
 *   duo.pos(who)   1P・2P の 足もとの 位置 { x, y, z }（型は src/duo/types.ts）
 *   duo.leave()    2P を やめさせる（持ち物は 保存）
 *   gamepad.injectPads(pads)   偽パッドを 何本でも（null は ぬけた）。injectPad(pad) は injectPads([pad]) と 同じ
 *   ?duo=dev       E2E と 開発用。2P の 参加（＋・duo.join・setPadChoice）は ふつうの URL でも 効く（作業 3d・AC64）。`duo.place()` だけ この URL の ときしか 効かない
 *   duo-join-hint  作業 3d: 候補（2 本目の パッド）が つながると 3 秒 出る「＋で さんか」（文に「さんか」）。参加すると 消える。候補が いない ときは 見えない（なくても hidden でも よい。仕様 §12.0 に 足す 案）
 *   duo-wait       作業 3d: 本・建築士さんが 世界を 止めている あいだ だけ ある「ちょっと まってね」。COOP-1 4a から もちもの画面（1P の 2 人用・2P の 2 人用）では 出ない。世界は 止まらない（`duo.timeScale()` は 1）
 *   duo-inv-p1 / duo-inv-p2  4a: 2 人用 もちもの・クラフト画面（`data-layout="duo"`。1P は E、2P は パッドの Y。くわしくは e2e/duoInv.spec.ts）
 *   2P の 出る 所   1P の 右 2 マス（空いて いれば）。ここでは 床を ならして 空けてから 試す
 *   2P の 歩き     2P の 左スティック上は 2P の カメラの 向き（duo.viewports()[1].yawDeg）の 奥（作業 3e・1.8: 2P は いつも 自分の カメラ。AC86）
 */

const START = 9;

async function open(page: Page, query = '?nosave=1&duo=dev'): Promise<void> {
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    (window as any).__rikkun.pause();
    (window as any).__rikkun.achievements.mute(true);
  });
}

/** 偽パッド 2 本（0 = 1P の 候補、1 = 2P の 候補）を 入れる。ページの 中の window.__pads を 書きかえて 押す・倒す */
async function installPads(page: Page, n = 2): Promise<void> {
  await page.evaluate((n) => {
    const w = window as any;
    w.__pads = Array.from({ length: n }, (_, index) => ({
      id: 'Xbox Wireless Controller',
      index,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      timestamp: 0,
    }));
    w.__rikkun.gamepad.injectPads(w.__pads);
    w.__rikkun.step(3); // 押していない 状態を 覚えさせる
  }, n);
}

async function setPad(page: Page, index: number, o: { buttons?: number[]; axes?: number[] }): Promise<void> {
  await page.evaluate(
    ({ index, o }) => {
      const pad = (window as any).__pads[index];
      pad.buttons.forEach((b: any, i: number) => {
        const on = (o.buttons ?? []).includes(i);
        b.pressed = on;
        b.touched = on;
        b.value = on ? 1 : 0;
      });
      pad.axes = o.axes ?? [0, 0, 0, 0];
    },
    { index, o },
  );
}

const step = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const duoState = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.state() as DuoState);
const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3 | null, who);

test('AC2: 2 本目の ＋ を 押した 次の ステップに 2P が 1P の 右 2 マスに いる（?duo=dev）', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  expect((await duoState(page)).joined).toBe(false);
  expect(await pos(page, 2), '2P が いない とき は null').toBeNull();

  // 1 本目（1P）の ＋ では 参加しない
  await setPad(page, 0, { buttons: [START] });
  await step(page, 2);
  await setPad(page, 0, {});
  await step(page, 2);
  expect((await duoState(page)).joined, '1P の ＋ では 参加しない').toBe(false);
  // 1P の ＋ は もちもの画面を 開く → 閉じてから 2 本目の ＋
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('closeMenu');
    h.input.release('closeMenu');
    h.step(3);
  });

  // 2 本目の ＋ → 次の ステップに 2P が いる
  await setPad(page, 1, { buttons: [START] });
  await step(page, 1);
  const s = await duoState(page);
  expect(s.joined).toBe(true);
  expect(s.padLost).toBe(false);
  const view: DuoView = s.view;
  expect(view, '作業 3e（1.8）: 2P が いれば 近くても 左右に 分かれる').toBe('split');
  const p1 = (await pos(page, 1))!;
  const p2 = (await pos(page, 2))!;
  const yaw: number = await page.evaluate(() => (window as any).__rikkun.player.get().yawDeg);
  const rad = (yaw * Math.PI) / 180;
  const right = { x: Math.cos(rad), z: Math.sin(rad) }; // 向きの 右（PlayerController と 同じ 決まり）
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  expect(Math.hypot(dx, dz), '1P から 約 2 マス').toBeGreaterThan(1.5);
  expect(Math.hypot(dx, dz)).toBeLessThan(2.5);
  expect(dx * right.x + dz * right.z, '1P の 右がわ').toBeGreaterThan(0);
  expect(Math.abs(p2.y - p1.y), '同じ 高さ').toBeLessThan(0.5);
});

test('AC64・AC46・AC2: ふつうの URL（?duo=dev なし）で「＋で さんか」が 出て、2 本目の ＋ で 参加できる。place だけ 効かない', async ({ page }) => {
  await open(page, '?nosave=1');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true); // 「クリックして あそぼう」を とじる（duoPad.spec の openPlay と 同じ。ロックして から 試す）
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  const hint = page.getByTestId('duo-join-hint');

  // 候補が いない（1P の 物だけ）: 文は 出ず、どの ＋ でも 参加しない。1P の ＋ は もちもの画面を ひらく（今の まま）
  await installPads(page, 1);
  await expect(hint).toBeHidden();
  await setPad(page, 0, { buttons: [START] });
  await step(page, 3);
  await setPad(page, 0, {});
  await step(page, 3);
  expect((await duoState(page)).joined, '1 本では 参加しない').toBe(false);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('closeMenu');
    h.input.release('closeMenu');
    h.step(3);
  });

  // 2 本目を つなぐ → 「＋で さんか」が 出る（AC46）。1P の ＋ では 参加しない
  await installPads(page, 2);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('さんか');
  await setPad(page, 0, { buttons: [START] });
  await step(page, 2);
  await setPad(page, 0, {});
  await step(page, 2);
  expect((await duoState(page)).joined, '1P の ＋ では 参加しない').toBe(false);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('closeMenu');
    h.input.release('closeMenu');
    h.step(3);
  });

  // 2 本目の ＋ → 次の ステップに 2P が いる。文は 消える（AC64）
  const p1Before = (await pos(page, 1))!;
  await setPad(page, 1, { buttons: [START] });
  await step(page, 1);
  const s = await duoState(page);
  expect(s.joined, '2 本目の ＋ で 参加').toBe(true);
  const p1 = (await pos(page, 1))!;
  const p2 = (await pos(page, 2))!;
  expect(Math.hypot(p2.x - p1.x, p2.z - p1.z), '1P から 約 2 マス').toBeGreaterThan(1.5);
  expect(Math.hypot(p2.x - p1.x, p2.z - p1.z)).toBeLessThan(2.5);
  expect(Math.hypot(p1.x - p1Before.x, p1.z - p1Before.z), '1P は 動かない').toBeLessThan(0.05);
  await expect(hint).toBeHidden();

  // place は ふつうの URL では 何も しない。join・setPadChoice は 効く
  await page.evaluate(() => (window as any).__rikkun.duo.place(2, { x: 130.5, y: 40, z: 130.5 }));
  await step(page, 2);
  const p2After = (await pos(page, 2))!;
  expect(Math.hypot(p2After.x - p2.x, p2After.z - p2.z), 'place は ふつうの URL では 効かない').toBeLessThan(1);
  await page.evaluate(() => (window as any).__rikkun.duo.leave());
  await step(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join()), 'duo.join は ふつうの URL でも 効く').toBe(true);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.setPadChoice({ p1: 1, p2: 0 })), 'setPadChoice も 効く').toBe(true);
});

test('AC3・AC86: 2P の パッドで 2P だけが 動き、1P の キー入力で 2P は 動かない（向きは 2P の カメラの 奥・ずれ 10° 以内）', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  await page.evaluate(() => (window as any).__rikkun.duo.join());
  await step(page, 5);

  const a1 = (await pos(page, 1))!;
  const a2 = (await pos(page, 2))!;
  await setPad(page, 1, { axes: [0, -1, 0, 0] }); // 2P の 左スティック 上
  await step(page, 30);
  const b1 = (await pos(page, 1))!;
  const b2 = (await pos(page, 2))!;
  expect(Math.hypot(b1.x - a1.x, b1.z - a1.z), '1P は 動かない').toBeLessThan(0.05);
  const moved = Math.hypot(b2.x - a2.x, b2.z - a2.z);
  expect(moved, '2P は 動く').toBeGreaterThan(0.5);
  const vps = await page.evaluate(() => (window as any).__rikkun.duo.viewports() as Array<{ who: number; yawDeg: number }>);
  expect(vps.map((v) => v.who), '2P が いれば 近くても 左右に 分かれる').toEqual([1, 2]);
  const yaw2 = vps[1]!.yawDeg; // 2P の カメラの 向き
  const walk = (Math.atan2(b2.x - a2.x, -(b2.z - a2.z)) * 180) / Math.PI; // 歩いた 向き（yawDeg と 同じ 決まり）
  const diff = Math.abs((((walk - yaw2) % 360) + 540) % 360 - 180);
  expect(diff, '2P の カメラの 奥へ（2P の カメラの 向きから 10° 以内）').toBeLessThanOrEqual(10);

  // 2P を 止めて、1P を キー入力 で 歩かせる → 2P は 動かない
  await setPad(page, 1, {});
  await step(page, 15);
  const c1 = (await pos(page, 1))!;
  const c2 = (await pos(page, 2))!;
  await page.evaluate(() => (window as any).__rikkun.input.press('moveBack'));
  await step(page, 30);
  await page.evaluate(() => (window as any).__rikkun.input.release('moveBack'));
  const d1 = (await pos(page, 1))!;
  const d2 = (await pos(page, 2))!;
  expect(Math.hypot(d1.x - c1.x, d1.z - c1.z), '1P は キーで 動く').toBeGreaterThan(0.5);
  expect(Math.hypot(d2.x - c2.x, d2.z - c2.z), '2P は 動かない').toBeLessThan(0.05);
});

test('AC14: 1 人の 描画は SOLO_BASELINE の 1.2 倍以下。2P が 参加して やめたあとも 参加前と 同じ 数', async ({ page }) => {
  await open(page, '?nosave=1&ring=small&duo=dev');
  const before = await measureRender(page);
  expect(before.drawCalls, `描画回数（基準 ${SOLO_BASELINE.drawCalls}）`).toBeLessThanOrEqual(SOLO_MAX.drawCalls);
  expect(before.triangles, `三角形（基準 ${SOLO_BASELINE.triangles}）`).toBeLessThanOrEqual(SOLO_MAX.triangles);
  test.info().annotations.push({ type: 'solo', description: JSON.stringify(before) });

  await page.evaluate(() => (window as any).__rikkun.duo.join());
  await step(page, 60);
  expect((await duoState(page)).joined).toBe(true);
  await page.evaluate(() => (window as any).__rikkun.duo.leave());
  await step(page, 120);
  expect((await duoState(page)).joined).toBe(false);

  const after = await measureRender(page);
  test.info().annotations.push({ type: 'after-leave', description: JSON.stringify(after) });
  expect(after.drawCalls).toBeLessThanOrEqual(Math.ceil(before.drawCalls * 1.02));
  expect(after.triangles).toBeLessThanOrEqual(Math.ceil(before.triangles * 1.02));
});

test('AC11・AC75・AC15: 2 人用の もちもの画面を 開いても 倍率は 1 で 世界は 止まらない。2P の ボタンで 本・建築士さん・とりごや・たんすは 開かない', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 5);
  const timeScale = () => page.evaluate(() => (window as any).__rikkun.duo.timeScale());
  const tapE = () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });

  // AC11: 2P の パネル（Y = 標準の ボタン 2）を 開いても 世界は 止まらない
  await setPad(page, 1, { buttons: [2] });
  await step(page, 3);
  await setPad(page, 1, {});
  await step(page, 3);
  await expect(page.getByTestId('duo-inv-p2')).toBeVisible();
  await expect(page.getByTestId('duo-inv-p2')).toHaveAttribute('data-layout', 'duo');
  expect(await timeScale(), '2P の パネル: ゆっくりに しない・止めない').toBe(1);
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  // 2P の パネルを とじる（B = closeMenu）
  await setPad(page, 1, { buttons: [1] });
  await step(page, 3);
  await setPad(page, 1, {});
  await step(page, 3);
  await expect(page.getByTestId('duo-inv-p2')).toBeHidden();

  // AC75（AC84 から かわった）: 1P が もちもの画面を 開いても 世界は 止まらない。2P は 歩けて、「ちょっと まってね」は 出ない
  await tapE();
  expect((await page.evaluate(() => (window as any).__rikkun.duo.inv(1))).open, '1P の 2 人用 画面').toBe(true);
  await expect(page.locator('#inventory-screen')).toHaveAttribute('data-layout', 'duo');
  expect(await timeScale(), '1P の 画面: 倍率は 1').toBe(1);
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  const g0 = (await pos(page, 2))!;
  await setPad(page, 1, { axes: [0, -1, 0, 0] });
  await step(page, 30);
  await setPad(page, 1, {});
  const g1 = (await pos(page, 2))!;
  expect(Math.hypot(g1.x - g0.x, g1.z - g0.z), '1P が 開いている あいだも 2P は 歩ける（世界は 止まらない）').toBeGreaterThan(0.3);
  await tapE();
  expect((await page.evaluate(() => (window as any).__rikkun.duo.inv(1))).open).toBe(false);
  await expect(page.locator('#inventory-screen')).toBeHidden();
  expect(await timeScale()).toBe(1);

  // 2 人とも 開いても 同じ（世界は 止まらない）。とじると 続き
  await setPad(page, 1, { buttons: [2] });
  await step(page, 3);
  await setPad(page, 1, {});
  await step(page, 3);
  await tapE();
  await expect(page.getByTestId('duo-inv-p1')).toBeVisible();
  await expect(page.getByTestId('duo-inv-p2')).toBeVisible();
  expect(await timeScale()).toBe(1);
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  await tapE();
  await expect(page.getByTestId('duo-inv-p1')).toBeHidden();
  await expect(page.getByTestId('duo-inv-p2'), '2P の パネルは 開いたまま').toBeVisible();
  // 2P の パネルを とじてから、2P の パッドで 画面を 開く ボタンを ひと通り 押す（select・十字・L3・R3・面ボタン）。開かないのは 本・建築士さん・とりごや・たんす
  await setPad(page, 1, { buttons: [1] });
  await step(page, 3);
  await setPad(page, 1, {});
  await step(page, 3);
  await expect(page.getByTestId('duo-inv-p2')).toBeHidden();
  for (const b of [8, 12, 13, 14, 15, 10, 11, 0, 1, 3]) {
    await setPad(page, 1, { buttons: [b] });
    await step(page, 3);
    await setPad(page, 1, {});
    await step(page, 2);
  }
  const opened = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const vis = (q: string) => [...document.querySelectorAll<HTMLElement>(q)].some((e) => e.offsetParent !== null);
    return { book: h.lock.get().bookAnim !== 'none' || vis('[data-book]'), house: vis('[data-testid="house-menu"]'), coop: vis('[data-testid="coop-menu"]') };
  });
  expect(opened, '1P の 画面を 開かない').toEqual({ book: false, house: false, coop: false });
});

test('AC5: 2P の パッドを ぬくと padLost と「つないでね」、3600 ステップで 2P が いなくなる', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  await page.evaluate(() => (window as any).__rikkun.duo.join());
  await step(page, 5);
  expect((await duoState(page)).padLost).toBe(false);
  await page.evaluate(() => {
    const w = window as any;
    w.__rikkun.gamepad.injectPads([w.__pads[0], null]);
    w.__rikkun.step(1);
  });
  expect((await duoState(page)).padLost).toBe(true);
  await expect(page.getByTestId('duo-pad-lost')).toBeVisible();
  await step(page, 3598);
  expect((await duoState(page)).joined, '3599 ステップは いるまま').toBe(true);
  await step(page, 1);
  expect((await duoState(page)).joined).toBe(false);
});

test('AC75（#424 の 直しから）: 2 人の とき 1P が もちもの画面を 開くと 左半分の 2 人用で 見える。物を えらぶと 見た目が かわり、とじると 見えない', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.lock.simulate(true);
    h.step(2);
    h.inventory.add('iron_ingot', 5);
  });
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await step(page, 5);
  const screen = page.locator('#inventory-screen');
  const press = () =>
    page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
  await expect(screen).toBeHidden();

  // 1P が 開く: 世界は 止まらず（ちょっと まってね は 出ない）、1P の 画面は 左半分の 2 人用で ちゃんと 見える
  await press();
  await expect(page.getByTestId('duo-wait')).toBeHidden();
  await expect(screen).toBeVisible();
  await expect(screen).toHaveAttribute('data-layout', 'duo');
  await expect(page.getByTestId('duo-inv-p1')).toBeVisible();
  const half = await page.evaluate(() => innerWidth / 2);
  const box = (await screen.boundingBox())!;
  expect(box.x + box.width, '左半分の 中').toBeLessThanOrEqual(half);

  // 物を えらぶ（もちあげる）と 描きなおされて、手に もった 物の 絵が 出る
  const cursor = screen.locator('.inv-cursor');
  await expect(cursor).toBeHidden();
  const slot = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    return h.inventory.get().slots.findIndex((s: any) => s && s.item === 'iron_ingot');
  });
  expect(slot).toBeGreaterThanOrEqual(0);
  await screen.locator(`.inv-slot[data-index="${slot}"]`).click();
  await step(page, 2);
  await expect(cursor, '物を えらぶと 見た目が かわる').toBeVisible();

  // もどして とじる
  await screen.locator(`.inv-slot[data-index="${slot}"]`).click();
  await step(page, 2);
  await expect(cursor).toBeHidden();
  await press();
  await expect(screen).toBeHidden();
  // 2P が いなくなった あと 次に 開く ときは 全面（data-layout なし。AC75・AC79）
  await page.evaluate(() => (window as any).__rikkun.duo.leave());
  await step(page, 2);
  await press();
  await expect(screen).toBeVisible();
  await expect(screen).not.toHaveAttribute('data-layout', 'duo');
});
