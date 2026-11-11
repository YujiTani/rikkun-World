import { expect, test } from '@playwright/test';
import { PAD_ZL, eventsOf, holdZL, placeBirdFor2P, releasePad, startDuoCoop, stepN } from './helpers/duoCoop';
import { setFakePad } from './helpers/duoUi';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)・§8 の 5c の 行・§12.0、AC137）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 「だっこの 通し」: `?duo=dev` で 2P の 前に なかまの にわとり → 2P の 偽パッドの ZL を carryHoldTicks 押しつづけ → `duo.carrying(2)` が その id・`duo.carrying(1)` は null
 * → 2P を 歩かせ ZL → 出来事 `putDown`（by: 2）が 出て、にわとりの 場所が 2P の 足もとの 前（throwRange の 中）に なる。
 * 数・座標は 決め打ちせず ゲームに 聞く（throwRange・carryHoldTicks は 設定から）。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 * ユニットで 見る 物（人ごとの だっこ・着地点・小屋・えさ・いただきます・倒れた・セーブ・合図の 行き先）は ここでは 見ない
 * （src/animals/duoCarry.test.ts・duoCare.test.ts・src/duo/p2Animals.test.ts・src/ui/*.test.ts）。
 * 1 人の ときは かわらない（AC139）は 今の E2E（live1-carry など）が そのまま 通る ことで 見る（新しく 書かない）。
 */

test('AC137: 2P が なかまの にわとりを ZL 長おしで だっこ → 歩いて ZL で なげる/おろす（by: 2・1P は かわらない）', async ({ page }) => {
  await startDuoCoop(page);
  const id = await placeBirdFor2P(page);
  const hold = await page.evaluate(() => (window as any).__rikkun.settings.get('carryHoldTicks') as number);
  const range = await page.evaluate(() => (window as any).__rikkun.settings.get('throwRange') as number);

  expect(await page.evaluate(() => (window as any).__rikkun.duo.carrying(2))).toBeNull();
  await eventsOf(page, 'carry'); // 出来事を 空に する

  // ---- 長おし: 途中では まだ、carryHoldTicks で だっこ ----
  await holdZL(page, id, Math.floor(hold / 2));
  expect(await page.evaluate(() => (window as any).__rikkun.duo.carrying(2)), '途中では まだ').toBeNull();
  await holdZL(page, id, hold);
  await releasePad(page);
  await stepN(page, 3);
  const carry = await page.evaluate(() => ({ c1: (window as any).__rikkun.duo.carrying(1), c2: (window as any).__rikkun.duo.carrying(2) }));
  expect(carry.c2, '2P が だっこ').toBe(id);
  expect(carry.c1, '1P は だっこ して いない').toBeNull();
  const lifted = (await eventsOf(page, 'carry')).filter((e) => e.id === id);
  expect(lifted).toHaveLength(1);
  expect(lifted[0]!.by).toBe(2);

  // ---- 歩く: 左スティックを 前へ。羽は 2P の 足もとに ついて いく ----
  const before = await page.evaluate(() => (window as any).__rikkun.duo.pos(2) as { x: number; y: number; z: number });
  await setFakePad(page, 1, { axes: [0, -1, 0, 0] });
  await stepN(page, 25);
  await setFakePad(page, 1, {});
  await stepN(page, 3);
  const walked = await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const p = h.duo.pos(2);
    const a = h.animals.list().find((x: any) => x.id === id);
    return { p, bird: { x: a.x, z: a.z }, carried: a.carried as boolean };
  }, id);
  expect(Math.hypot(walked.p.x - before.x, walked.p.z - before.z), '2P が 歩いた').toBeGreaterThan(1);
  expect(walked.carried).toBe(true);
  expect(Math.hypot(walked.bird.x - walked.p.x, walked.bird.z - walked.p.z), '羽は 2P の 足もと').toBeLessThan(0.5);

  // ---- ZL: 前に なげる/おろす → putDown（by: 2）。羽は 2P の 足もとの 前、throwRange の 中 ----
  await eventsOf(page, 'putDown');
  const at = walked.p;
  await setFakePad(page, 1, { buttons: [PAD_ZL] });
  await stepN(page, 3);
  await setFakePad(page, 1, {});
  await stepN(page, 150);
  const put = (await eventsOf(page, 'putDown')).filter((e) => e.id === id);
  expect(put, '着地の 出来事').toHaveLength(1);
  expect(put[0]!.by).toBe(2);
  const end = await page.evaluate((id) => {
    const h = (window as any).__rikkun;
    const a = h.animals.list().find((x: any) => x.id === id);
    return { x: a.x as number, z: a.z as number, carried: a.carried as boolean };
  }, id);
  expect(end.carried).toBe(false);
  const d = Math.hypot(end.x - at.x, end.z - at.z);
  expect(d, '2P の 足もとの 前（throwRange の 中）').toBeLessThanOrEqual(range + 1);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.carrying(2))).toBeNull();
  expect(await page.evaluate(() => (window as any).__rikkun.duo.carrying(1))).toBeNull();
});
