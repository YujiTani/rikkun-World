import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { aimWithItem, tid, visibleBox } from './helpers/duoAim';
import { installFakePads } from './helpers/duoUi';

/**
 * COOP-1 5f-1（docs/design/COOP-1.md 1.16 §3.7 (g) ①・§8・§12.0、AC174・AC175・AC176）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 2 人で 参加 → 1P と 2P が それぞれ ブロックを ねらう → 各半分の ＋マークの 下に 自分の 答えが 出る（2P は パッドの 絵・ZR／ZL）。
 * 1P の ヒントは 2P の ねらいを かえても かわらない（人ごと）。
 * ユニットで 見る 物（式が 1P と 2P で 同じ・条件・面の 名前・半分の 置き場所の 計算）は ここでは 見ない（src/ui/duoAimHud.test.ts・src/duo/halfOf.test.ts）。
 * 3 つの 大きさでの 置き場所・重なり・24px は UI 検査（e2e/ui-gate.spec.ts の 'duo-aim-hud'。e2e/helpers/duoAim.ts）。
 * 数・座標は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束（目印・口。helpers/duoAim.ts の 先頭にも 書いた）----
 *   `duo.actionHint(who)` … `{ left?, right?, progress?, pad }` か null。土を 持って ブロックを ねらう と right＝ { icon: 'dirt', word: 'おく' }・left.word＝ 'ほる'。2P は pad: 'pad'。
 *   `duo-action-hint-p1`／`-p2`・`duo-crosshair-p1`／`-p2` … 各半分の ヒント・＋マーク。2P の ヒントの 字に ZR と ZL（はじめの 割り当て）が ふくまれる。
 */

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const hintOf = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.actionHint(who) as { left?: { icon: string; word: string }; right?: { icon: string; word: string }; pad: string } | null, who);

test('AC174・AC175・AC176: 2 人で それぞれ ねらうと、各半分の ＋マークの 下に 自分の ヒントが 出る（2P は パッドの 絵）', async ({ page }) => {
  await page.goto('/?nosave=1&duo=dev');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('animalAutoSpawn', false);
    h.lock.simulate(true);
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);

  // 2P を 1P から はなして 立たせる（ブロックを 作る 場所が 重ならない ように）
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const p1 = h.duo.pos(1);
    h.duo.place(2, { x: p1.x, y: p1.y, z: p1.z + 6 });
  });
  await stepN(page, 10);

  await aimWithItem(page, 1, 'dirt');
  await aimWithItem(page, 2, 'dirt');
  await stepN(page, 4);

  // ---- ゲームに 聞く: 2P の 答え（土を 持って ブロックを ねらう → おく・ほる、パッドの 絵）----
  const h2 = (await hintOf(page, 2))!;
  expect(h2, '2P の ヒント').not.toBeNull();
  expect(h2.right?.word).toBe('おく');
  expect(h2.right?.icon).toBe('dirt');
  expect(h2.left?.word).toBe('ほる');
  expect(h2.pad, '2P は パッドの 絵').toBe('pad');
  const h1 = (await hintOf(page, 1))!;
  expect(h1, '1P の ヒント').not.toBeNull();
  expect({ right: h1.right, left: h1.left }, '同じ ねらい・同じ もちものなら 1P と 同じ 左右の 絵と 語').toEqual({ right: h2.right, left: h2.left });
  expect(h1.pad, '1P は キーボード・マウスで 動かして いる ので マウスの 絵').toBe('mouse');

  // ---- 画面: 各半分の ＋マークの 下に ヒント ----
  const vw: number = await page.evaluate(() => innerWidth);
  const mid = Math.floor(vw / 2);
  for (const who of [1, 2] as const) {
    const cross = await visibleBox(page, tid(`duo-crosshair-p${who}`));
    const hint = await visibleBox(page, tid(`duo-action-hint-p${who}`));
    expect(cross, `${who}P の ＋マーク`).not.toBeNull();
    expect(hint, `${who}P の ヒント`).not.toBeNull();
    const [lo, hi] = who === 1 ? [0, mid] : [mid, vw];
    expect(cross!.l).toBeGreaterThanOrEqual(lo);
    expect(cross!.r).toBeLessThanOrEqual(hi);
    expect(hint!.l).toBeGreaterThanOrEqual(lo);
    expect(hint!.r).toBeLessThanOrEqual(hi);
    expect(hint!.t, 'ヒントは ＋マークの 下').toBeGreaterThan((cross!.t + cross!.b) / 2);
  }
  expect(await visibleBox(page, '#crosshair'), '画面の まん中（分割の 線の 上）に ＋は 残らない').toBeNull();
  const text2 = await page.locator(tid('duo-action-hint-p2')).innerText();
  expect(text2, '2P の 札に パッドの 面の 名前（はじめの 割り当て）').toContain('ZR');
  expect(text2).toContain('ZL');
  await expect(page.locator(`${tid('duo-action-hint-p2')} .action-hint__mouse`), '2P の 札に マウスの 絵は 出さない').toHaveCount(0);

  // ---- 人ごと: 2P の ねらいを かえても 1P の ヒントは かわらない ----
  const before = await hintOf(page, 1);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const p = h.duo.pos(2);
    h.duo.give(2, 'katana', 1);
    h.duo.aimAt(2, { x: Math.floor(p.x), y: Math.floor(p.y) + 40, z: Math.floor(p.z) }); // 空
  });
  await stepN(page, 4);
  expect(await hintOf(page, 1), '1P の ヒントは 2P の 動きで かわらない').toEqual(before);
});
