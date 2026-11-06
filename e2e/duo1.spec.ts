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
 *   ?duo=dev       この URL の ときだけ 2 本目の ＋ で 参加できる。ふつうの URL では ＋ を 押しても 何も 起きない（§8。作業 3 まで）
 *   2P の 出る 所   1P の 右 2 マス（空いて いれば）。ここでは 床を ならして 空けてから 試す
 *   2P の 歩き     1 画面の とき 2P の 左スティック上は 1P の カメラの 向き（player.get().yawDeg）の 奥
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
const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3, who);

test('AC2: 2 本目の ＋ を 押した 次の ステップに 2P が 1P の 右 2 マスに いる（?duo=dev）', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  expect((await duoState(page)).joined).toBe(false);

  // 1 本目（1P）の ＋ では 参加しない
  await setPad(page, 0, { buttons: [START] });
  await step(page, 2);
  await setPad(page, 0, {});
  await step(page, 2);
  expect((await duoState(page)).joined, '1P の ＋ では 参加しない').toBe(false);

  // 2 本目の ＋ → 次の ステップに 2P が いる
  await setPad(page, 1, { buttons: [START] });
  await step(page, 1);
  const s = await duoState(page);
  expect(s.joined).toBe(true);
  expect(s.padLost).toBe(false);
  const view: DuoView = s.view;
  expect(view, '作業 1 は 1 画面だけ').toBe('one');
  const p1 = await pos(page, 1);
  const p2 = await pos(page, 2);
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

test('AC2: ふつうの URL（?duo=dev なし）では 2 本目の ＋ を 押しても 参加しない（作業 3 まで）', async ({ page }) => {
  await open(page, '?nosave=1');
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  await setPad(page, 1, { buttons: [START] });
  await step(page, 5);
  const joined = await page.evaluate(() => (window as any).__rikkun.duo?.state().joined ?? false);
  expect(joined).toBe(false);
});

test('AC3: 2P の パッドで 2P だけが 動き、1P の キー入力で 2P は 動かない（向きは カメラの 奥・ずれ 10° 以内 = AC4）', async ({ page }) => {
  await open(page);
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installPads(page);
  await page.evaluate(() => (window as any).__rikkun.duo.join());
  await step(page, 5);

  const a1 = await pos(page, 1);
  const a2 = await pos(page, 2);
  await setPad(page, 1, { axes: [0, -1, 0, 0] }); // 2P の 左スティック 上
  await step(page, 30);
  const b1 = await pos(page, 1);
  const b2 = await pos(page, 2);
  expect(Math.hypot(b1.x - a1.x, b1.z - a1.z), '1P は 動かない').toBeLessThan(0.05);
  const moved = Math.hypot(b2.x - a2.x, b2.z - a2.z);
  expect(moved, '2P は 動く').toBeGreaterThan(0.5);
  const yaw: number = await page.evaluate(() => (window as any).__rikkun.player.get().yawDeg);
  const walk = (Math.atan2(b2.x - a2.x, -(b2.z - a2.z)) * 180) / Math.PI; // 歩いた 向き（yawDeg と 同じ 決まり）
  const diff = Math.abs((((walk - yaw) % 360) + 540) % 360 - 180);
  expect(diff, '画面の 奥へ（カメラの 向きから 10° 以内）').toBeLessThanOrEqual(10);

  // 2P を 止めて、1P を キー入力 で 歩かせる → 2P は 動かない
  await setPad(page, 1, {});
  await step(page, 15);
  const c1 = await pos(page, 1);
  const c2 = await pos(page, 2);
  await page.evaluate(() => (window as any).__rikkun.input.press('moveBack'));
  await step(page, 30);
  await page.evaluate(() => (window as any).__rikkun.input.release('moveBack'));
  const d1 = await pos(page, 1);
  const d2 = await pos(page, 2);
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
