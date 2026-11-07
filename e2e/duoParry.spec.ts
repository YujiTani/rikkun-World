import { expect, test, type Page } from '@playwright/test';
import { setFakePad } from './helpers/duoUi';
import { firstGuardF, openDuoParry, parry2PAtF, parryNums, probeHit2P, spawnInFront2P } from './helpers/duoParry';

// 4d-0（duo.camDistance・parryScales・duoCamFx）が 入るまで 通らない。
/**
 * COOP-1 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)・§8 の 4d-1・§12.0、AC99・AC100）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 通し: 2P が 刀を 持って 2P の パッド（run＋ZR）だけで パリィ → 2P を ねらった 妖怪の こうげきを 受ける（ひるむ・2P の ダメージ 0）→
 * 成功の 次の ステップから 世界ぜんたいが ゆっくり（`duo.timeScale()` 0.25）→ 調整表の ステップ数で 1 に もどる。1P の パリィは かわらない。
 * ユニットで 見る 物（1P と 同じ 流れ・同じ コマ数・向き・陣笠・おしい／失敗・どの パリィに 聞くか・ステップの あいだの 短い 押し・よせの 数・ふちの 濃さ）は ここでは 見ない
 * （src/duo/p2Parry.test.ts・src/duo/p2ParryView.test.ts・src/yokai/ai/parryWho.test.ts・src/input/gamepad/slowInput.test.ts）。
 * ふちの 置き場は UI 検査（e2e/ui-gate.spec.ts の 'duo-parry-edge'）。数は 決め打ちせず、ゲーム（window.__rikkun）に 聞く。時間（ms）では 合否を 決めない（#255）。
 * 開発への つなぎ目の 約束（口・目印）は e2e/helpers/duoParry.ts の 先頭に 書いた。
 */

const step = (page: Page, n: number): Promise<void> => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const hearts = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.hearts(who) as { hp: number; maxHp: number; down: boolean }, who);
const parryOf = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.parry(who) as { phase: string; frame: number; slowLeft: number; timeScale: number; glowLeft: number } | null, who);
const timeScale = (page: Page) => page.evaluate(() => (window as any).__rikkun.duo.timeScale() as number);
const camDistance = (page: Page, who: 1 | 2) => page.evaluate((who) => (window as any).__rikkun.duo.camDistance(who) as number | null, who);
const staggerOf = (page: Page, id: number) => page.evaluate((id) => (window as any).__rikkun.yokai.stagger(id) as { ticksLeft: number; double: boolean } | null, id);
const yokaiHp = (page: Page, id: number) => page.evaluate((id) => (window as any).__rikkun.yokai.list().find((y: any) => y.id === id)?.hp as number | undefined, id);

test('AC99・AC100: 2P が パッドの run＋ZR で パリィ → 妖怪が ひるむ・2P の ダメージ 0・世界が 0.25 倍 → 調整表の ステップ後に 1・2P の 半分だけ ふち と よせ・1P は かわらない', async ({ page }) => {
  await page.goto('/?nosave=1&duo=dev');
  await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
  await openDuoParry(page);
  const n = await parryNums(page);

  // 前提: 2 人とも 元気・1P の パリィは 何も していない・ゆっくりでない
  const before = await hearts(page, 2);
  expect(before.down).toBe(false);
  expect((await parryOf(page, 2))?.phase, '2P の パリィの 口').toBe('idle');
  expect((await parryOf(page, 1))?.phase).toBe('idle');
  expect(await timeScale(page)).toBe(1);
  const base1 = await camDistance(page, 1);
  const base2 = await camDistance(page, 2);
  expect(base2).toBe(base1);
  await expect(page.getByTestId('duo-parry-edge-p2'), 'ふちは まだ 出ない').toBeHidden();

  // 2P を ねらう 妖怪の こうげきを、受けの まん中の F で 受ける（2P の パッドだけ）
  const hit = await probeHit2P(page);
  expect(hit).toBeGreaterThan(0);
  const id = await spawnInFront2P(page);
  const hp0 = await yokaiHp(page, id);
  const F = firstGuardF(n); // 受けの はじめ。F > hit でも parry2PAtF が 先に 押して 組む
  expect(F).toBeGreaterThan(n.ready);
  expect(F).toBeLessThanOrEqual(n.ready + n.guard);
  await parry2PAtF(page, id, hit, F);

  // 成功: ダメージ 0・妖怪は ひるむ・2P の パリィは 動いている・1P の パリィは かわらない
  expect((await hearts(page, 2)).hp, '2P の ダメージ 0').toBe(before.maxHp);
  expect((await hearts(page, 1)).hp).toBe((await hearts(page, 1)).maxHp);
  expect(await staggerOf(page, id), '妖怪が ひるむ').not.toBeNull();
  expect(await yokaiHp(page, id), '妖怪の 体力は へらない').toBe(hp0);
  const p2 = await parryOf(page, 2);
  expect(p2?.phase, '2P の パリィが 動いた').not.toBe('idle');
  expect((await parryOf(page, 1))?.phase, '1P の パリィは かわらない').toBe('idle');
  expect(await page.evaluate(() => (window as any).__rikkun.parry.state().phase), '1P の parry.state() と 同じ').toBe('idle');
  await setFakePad(page, 1, {}); // run も はなす

  // 成功の 次の ステップから ゆっくり: 調整表の ステップ数だけ 0.25、そのあと 1
  const scales: number[] = [];
  for (let i = 0; i < n.slowTicks + 4; i++) {
    await step(page, 1);
    scales.push(await timeScale(page));
    if (i === 3) {
      // ゆっくりの 途中: 2P の 半分だけ ふち と よせ（1P の 半分は ふちも よせも ない）
      await expect(page.getByTestId('duo-parry-edge-p2')).toBeVisible();
      await expect(page.getByTestId('duo-parry-edge-p1')).toBeHidden();
      expect((await camDistance(page, 2))!, '2P の カメラが よった').toBeLessThan(base2!);
      expect(await camDistance(page, 1), '1P の カメラは かわらない').toBe(base1);
    }
  }
  expect(scales.slice(0, n.slowTicks), '成功の 次の ステップから ゆっくり').toEqual(Array(n.slowTicks).fill(n.slowScale));
  expect(scales.slice(n.slowTicks), 'おわると 1').toEqual([1, 1, 1, 1]);

  // ふちは 消え、カメラは ふだんの きょりに もどる
  await step(page, 80);
  await expect(page.getByTestId('duo-parry-edge-p2')).toBeHidden();
  expect(await camDistance(page, 2)).toBe(base2);
  expect(await timeScale(page)).toBe(1);
});
