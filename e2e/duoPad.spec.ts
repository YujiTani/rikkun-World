import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { installFakePads, openUsePadTab, setFakePad } from './helpers/duoUi';
import type { DuoState, DuoVec3 } from '../src/duo/types';

/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§3.2・§12.0）の E2E。実装の 前に 書いた 赤の テスト。
 * 通し 1 本（AC53。URL に &pad=2p を 付けても 何もしない）と、タブの 画面 1 本（AC50・AC52 の 読みなおし・AC56・AC59・AC60）。
 * 数・座標は 決め打ちせず ゲーム（window.__rikkun.duo）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * 待ち・900 ステップ・光る 30 ステップ・入れかえの 全部の 組み合わせ・保存の こわれかたは ユニット
 * （src/input/gamepad/padChoice.test.ts・duoPadChoice.test.ts・src/ui/settings/padPicker.test.ts）。画面の 重なり・大きさは UI 検査（e2e/ui-gate.spec.ts の duo-use-pad-*）。
 *
 * ---- 開発への つなぎ目の 約束（目印は 仕様 §12.0 と e2e/helpers/duoUi.ts の 先頭）----
 *   偽パッドは index と 並びの 場所を そろえる。決めた ＋ は 標準の ボタン 9。標準の ボタン 10（スティックの おしこみ）は せってい画面を 動かさないので 光る 確認に つかう。
 */

const START = 9; // ＋
const L3 = 10; // 左スティックの おしこみ
const FWD = [0, -1, 0, 0]; // 左スティック 上

const step = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const duoState = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.state() as DuoState);
const pos = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.pos(who) as DuoVec3 | null, who);
const padChoice = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.padChoice() as { p1: number | null; p2: number | null } | null);
const padIndex = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.padIndex(who) as number | null, who);
const moved = (a: DuoVec3, b: DuoVec3) => Math.hypot(b.x - a.x, b.z - a.z);

/** ＋ を 1 回 押して はなす（押している ステップを 通す） */
async function tapPlus(page: Page, pad: number): Promise<void> {
  await setFakePad(page, pad, { buttons: [START] });
  await step(page, 3);
  await setFakePad(page, pad, {});
  await step(page, 3);
}

test('AC53: 通し（?duo=dev&pad=2p）: setPadChoice({p1:1,p2:0}) → 番号 1 の 左スティックで 1P、番号 0 の ＋ で 2P が 参加、番号 0 の 左スティックで 2P だけ 動く。pad=2p は 何もしない', async ({ page }) => {
  await page.goto('/?nosave=1&duo=dev&pad=2p');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.achievements.mute(true);
    h.lock.simulate(true); // 「クリックして あそぼう」を とじる
    h.step(2);
  });
  await standOnGround(page, 100.5, 100.5, { yaw: 90 });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.setPadChoice({ p1: 1, p2: 0 }))).toBe(true);
  expect(await padChoice(page)).toEqual({ p1: 1, p2: 0 });
  expect(await padIndex(page, 1), 'pad=2p は 何もしない（1P は パッドなしに ならない）').toBe(1);
  expect(await padIndex(page, 2), '2P は まだ いない').toBeNull();

  // 番号 1 の 左スティックで 1P が 動く
  const a1 = (await pos(page, 1))!;
  await setFakePad(page, 1, { axes: FWD });
  await step(page, 30);
  const b1 = (await pos(page, 1))!;
  expect(moved(a1, b1), '1P が 動いた').toBeGreaterThan(0.5);
  expect(await pos(page, 2)).toBeNull();
  await setFakePad(page, 1, {});
  await step(page, 10);

  // 番号 0 の ＋ で 2P が 参加
  expect((await duoState(page)).joined).toBe(false);
  await tapPlus(page, 0);
  const s = await duoState(page);
  expect(s.joined, '番号 0 の ＋ で 参加').toBe(true);
  expect(await padIndex(page, 1)).toBe(1);
  expect(await padIndex(page, 2)).toBe(0);

  // 番号 0 の 左スティックで 2P だけ 動く
  const p1Before = (await pos(page, 1))!;
  const p2Before = (await pos(page, 2))!;
  await setFakePad(page, 0, { axes: FWD });
  await step(page, 30);
  const p1After = (await pos(page, 1))!;
  const p2After = (await pos(page, 2))!;
  expect(moved(p2Before, p2After), '2P が 動いた').toBeGreaterThan(0.5);
  expect(moved(p1Before, p1After), '1P は 動かない').toBeLessThan(0.3);
});

test('AC50・AC52・AC56・AC59・AC60: 「つかう コントローラー」タブ（0 本 → 2 本 → 光る → 待ち → ＋ で 決まる → 読みなおし → ふつうの URL）', async ({ page }) => {
  await openUsePadTab(page);

  // AC59: 2 だん目に タブが あり、おすと 2 だん目のまま 中身が かわる
  const tab = page.getByTestId('ctrl-tab-use');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.getByTestId('ctrl-panel-use')).toBeVisible();
  await expect(page.getByTestId('ctrl-panel-keys')).toBeHidden();
  await expect(page.locator('[data-screen="controls"]')).toBeVisible();

  // AC56: パッド 0 本 → えらぶ ボタンは なく、use-none。つなぐと 出る
  await expect(page.getByTestId('use-none')).toContainText('コントローラーを つないでね');
  await expect(page.locator('[data-testid^="use-p"]')).toHaveCount(0);
  await installFakePads(page, 2);
  await step(page, 2);
  for (const id of ['use-p1-c1', 'use-p1-c2', 'use-p2-c1', 'use-p2-c2']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('use-p1-c3')).toHaveCount(0);
  await expect(page.getByTestId('use-none')).toBeHidden();
  await expect(page.getByTestId('use-p1-c1')).toHaveText(/コントローラー 1/);
  await expect(page.getByTestId('use-p2-c2')).toHaveText(/コントローラー 2/);

  // AC59: はじめの 動き（1P=コントローラー 1・2P=コントローラー 2）。決まっている 物だけ aria-pressed
  await expect(page.getByTestId('use-p1-c1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p1-c2')).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p2-c2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p2-c1')).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p1-c1')).toHaveAttribute('data-pad-index', '0');
  await expect(page.getByTestId('use-p1-c2')).toHaveAttribute('data-pad-index', '1');

  // AC60: コントローラー 1 の ボタンを おしている あいだ、1P・2P の 行の コントローラー 1 が 光る。コントローラー 2 は 光らない
  await setFakePad(page, 0, { buttons: [L3] });
  await step(page, 3);
  await expect(page.getByTestId('use-p1-c1')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('use-p2-c1')).toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('use-p1-c2')).not.toHaveAttribute('data-lit', 'true');
  await expect(page.getByTestId('use-p2-c2')).not.toHaveAttribute('data-lit', 'true');
  await setFakePad(page, 0, {});
  await step(page, 40); // はなして 30 ステップを こえる（細かい 数は ユニット）
  await expect(page.getByTestId('use-p1-c1')).not.toHaveAttribute('data-lit', 'true');
  // スティックを いっぱいに 倒しただけ（2P の コントローラー）では 光らない
  await setFakePad(page, 1, { axes: [1, 1, 0, 0] });
  await step(page, 5);
  await expect(page.getByTestId('use-p1-c2')).not.toHaveAttribute('data-lit', 'true');
  await setFakePad(page, 1, {});
  await step(page, 3);

  // AC50: 2P の 行の コントローラー 1 を おす → 待ち
  await page.getByTestId('use-p2-c1').click();
  await expect(page.locator('[data-waiting="true"]').getByTestId('use-p2-c1')).toHaveCount(1);
  await expect(page.getByTestId('use-p2-c1')).toHaveAttribute('data-pending', 'true');
  await expect(page.getByTestId('use-note')).toHaveText(/コントローラー 1 の\s*＋を\s*おしてね/);
  // コントローラー 2 の ＋ では 決まらず、メニューも とじない
  await tapPlus(page, 1);
  await expect(page.getByTestId('use-p2-c1')).toHaveAttribute('data-pending', 'true');
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  expect(await padChoice(page), 'まだ 決まっていない').toBeNull();
  // コントローラー 1 の ＋ で 決まり（入れかえ）。せってい画面も スタートメニューも そのまま
  await tapPlus(page, 0);
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await expect(page.getByTestId('use-p2-c1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p1-c2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p1-c1')).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-waiting="true"]')).toHaveCount(0);
  await expect(page.getByTestId('settings-help')).toContainText('いれかえたよ');
  expect(await padChoice(page)).toEqual({ p1: 1, p2: 0 });
  expect(await padIndex(page, 1)).toBe(1);
  expect(await padIndex(page, 2), '2P は 参加していない').toBeNull();
  expect((await duoState(page)).joined, '決めた ＋ は 参加に ならない').toBe(false);
  const raw = await page.evaluate(() => localStorage.getItem('rikkun.duo.pads.v1'));
  expect(JSON.parse(raw ?? 'null')).toEqual({ p1: 1, p2: 0 });

  // AC50・AC52: ページを 読みなおしても 同じ
  await openUsePadTab(page);
  await installFakePads(page, 2);
  await step(page, 2);
  expect(await padChoice(page)).toEqual({ p1: 1, p2: 0 });
  expect(await padIndex(page, 1)).toBe(1);
  await expect(page.getByTestId('use-p1-c2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('use-p2-c1')).toHaveAttribute('aria-pressed', 'true');

  // AC59・AC61: ふつうの URL では タブが 出ず、setPadChoice は false で 保存も かわらない
  await openUsePadTab(page, '?nosave=1');
  await expect(page.getByTestId('ctrl-tab-pad')).toBeVisible();
  await expect(page.getByTestId('ctrl-tab-use')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.setPadChoice({ p1: 0, p2: 1 }))).toBe(false);
  expect(await padChoice(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('rikkun.duo.pads.v1'))).toBe(raw);
});
