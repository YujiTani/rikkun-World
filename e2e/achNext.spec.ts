import { expect, test, type Page } from '@playwright/test';
import { waitAnimationsDone } from './helpers/anim';

/**
 * ACH-NEXT（#260）: 実績ページで、取った段のすぐ上の 1 段だけ名前を見せる。
 * 決定: docs/decisions/2026-10-23-achievements-next-tier.md ／ タスク票: docs/tickets/ACH-NEXT.md（受け入れ基準 1〜7）
 * 時間で待たず、ゲーム（window.__rikkun.achievements）に聞く。
 * 使うシリーズ: break.dirt（1・10・100）、break.stone・break.grass（手をつけない）、place.furnace（1 段だけ）
 */

async function openAch(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const k = window.__rikkun! as any;
    k.pause();
    k.lock.simulate(true);
    k.achievements.mute(true);
    k.achievements.reset();
    k.step(2);
    k.input.press('toggleInventory');
    k.input.release('toggleInventory');
    k.step(3);
  });
  await waitAnimationsDone(page);
  await page.locator('.inv-tabs [data-tab=achievements]').click();
  await page.evaluate(() => (window.__rikkun as any).step(3));
}

/** 今の分類（こわす）の画面を作り直させて待つ */
const refresh = (page: Page) => page.evaluate(() => (window.__rikkun as any).step(3));
const record = async (page: Page, key: string, n: number) => {
  await page.evaluate(([k, c]) => {
    const h = (window.__rikkun as any).achievements;
    h.record(k, c);
    h.flush();
    (window.__rikkun as any).step(3);
  }, [key, n] as const);
};
const row = (page: Page, id: string) => page.locator(`.ach-row[data-id="${id}"]`);
const uiRow = (page: Page, id: string) =>
  page.evaluate((i) => (window.__rikkun as any).achievements.ui().rows.find((r: any) => r.id === i) ?? null, id);

test.describe('ACH-NEXT: 次の 1 段を見せる', () => {
  test('基準1・2・5: 1 段取る → 次の段に 名前・メダル locked・日付なし・.ach-row--next・いま n / 目標・バー・［未達成｜みたっせい］', async ({ page }) => {
    await openAch(page);
    await record(page, 'break:dirt', 3);
    // 取った段（goal 1）
    const r1 = await uiRow(page, 'break.dirt.1');
    expect(r1).toMatchObject({ unlocked: true, shown: true, next: false });
    // 次の段（goal 10）はゲームの答えと画面の両方で見える
    const r10 = await uiRow(page, 'break.dirt.10');
    expect(r10).toMatchObject({ unlocked: false, shown: true, next: true });
    const el = row(page, 'break.dirt.10');
    await expect(el).toHaveClass(/ach-row--next/);
    expect(await el.locator('.ach-row__name').textContent()).not.toContain('？？？');
    expect((await el.locator('.ach-row__name').textContent())!.length).toBeGreaterThan(3);
    await expect(el.locator('.rk-medal')).toHaveAttribute('data-tier', 'locked');
    await expect(el.locator('.ach-row__day')).toHaveCount(0);
    // 基準2: 数とバー（数は ゲームの stat に合わせる）
    const stat = await page.evaluate(() => (window.__rikkun as any).achievements.stats()['break:dirt'] as number);
    expect(stat).toBe(3);
    await expect(el.locator('.ach-row__cap')).toContainText(`いま ${stat} / 10`);
    await expect(el.locator('.rk-bar')).toHaveCount(1);
    // 札: ［未達成｜みたっせい］（漢字はルビ）。「あたらしい」は どこにも 出ない
    const tag = el.locator('.rk-chip');
    await expect(tag).toHaveCount(1);
    await expect(tag).toContainText('未達成');
    expect(await tag.innerHTML()).toMatch(/<rt>みたっせい<\/rt>/);
    await expect(page.locator('.ach-list')).not.toContainText('あたらしい');
  });

  test('基準2: 今の数は 目標で頭打ち（目標より多く取っても、次の段が 「いま 10 / 10」を こえない）', async ({ page }) => {
    await openAch(page);
    // 10 こ こわす → goal 10 まで取れる。次の段は goal 100。進み具合は 100 まで。
    await record(page, 'break:dirt', 10);
    expect(await uiRow(page, 'break.dirt.10')).toMatchObject({ unlocked: true });
    expect(await uiRow(page, 'break.dirt.100')).toMatchObject({ next: true, shown: true });
    await expect(row(page, 'break.dirt.100').locator('.ach-row__cap')).toContainText('いま 10 / 100');
    // 取っていない段の「いま」は 目標を こえない（どの next 行でも）
    const caps = await page.locator('.ach-row--next .ach-row__cap').allTextContents();
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      const m = c.match(/いま\s*(\d+)\s*\/\s*(\d+)/);
      expect(m, c).not.toBeNull();
      expect(Number(m![1])).toBeLessThanOrEqual(Number(m![2]));
    }
  });

  test('基準3・4: 次の段より上と 1 段も取っていないシリーズは ？？？（名前・数・バー・札なし、ツールチップも ？？？）。次の段のツールチップは名前', async ({ page }) => {
    await openAch(page);
    await record(page, 'break:dirt', 1);
    // dirt: 1 取った → 10 が次、100 は 2 段先 → 隠す
    expect(await uiRow(page, 'break.dirt.100')).toMatchObject({ shown: false, next: false, unlocked: false });
    // stone: 1 段も取っていない → 1 段目も隠す
    expect(await uiRow(page, 'break.stone.1')).toMatchObject({ shown: false, next: false, unlocked: false });
    for (const id of ['break.dirt.100', 'break.stone.1', 'break.stone.10', 'break.grass.1']) {
      const el = row(page, id);
      await expect(el.locator('.ach-row__name'), id).toHaveText('？？？');
      await expect(el.locator('.ach-row__cap'), id).toHaveCount(0);
      await expect(el.locator('.rk-bar'), id).toHaveCount(0);
      await expect(el.locator('.rk-chip'), id).toHaveCount(0);
      await expect(el, id).not.toHaveClass(/ach-row--next/);
      await expect(el.locator('.rk-medal'), id).toHaveAttribute('data-tier', 'locked');
    }
    // 見えている名前は 次の段だけ。取った行と次の行以外に 名前が 出ていない
    const visible = await page.evaluate(() => (window.__rikkun as any).achievements.ui().rows.filter((r: any) => r.shown).map((r: any) => r.id));
    const expected = await page.evaluate(() => (window.__rikkun as any).achievements.ui().rows.filter((r: any) => r.unlocked || r.next).map((r: any) => r.id));
    expect(visible.sort()).toEqual(expected.sort());
    // ツールチップ
    await page.evaluate(() => (window.__rikkun as any).suspendRender?.(true));
    const tipName = async (id: string) => {
      const el = row(page, id);
      await el.scrollIntoViewIfNeeded();
      await el.hover();
      await expect(page.locator('.ach-tip')).toBeVisible();
      return (await page.locator('.ach-tip').textContent()) ?? '';
    };
    const nextName = (await row(page, 'break.dirt.10').locator('.ach-row__name').textContent())!;
    expect(await tipName('break.dirt.10')).toContain(nextName);
    expect(await tipName('break.dirt.100')).toContain('？？？');
    expect(await tipName('break.stone.1')).toContain('？？？');
  });

  test('基準5: 取ったばかり = NEW（英語）、見た後 = ［達成｜たっせい］。「あたらしい」は出ない', async ({ page }) => {
    await openAch(page);
    await record(page, 'break:dirt', 1);
    expect(await uiRow(page, 'break.dirt.1')).toMatchObject({ unlocked: true, isNew: true });
    const el = row(page, 'break.dirt.1');
    await expect(el.locator('.rk-chip')).toHaveText('NEW');
    await expect(page.locator('.ach-list')).not.toContainText('あたらしい');
    // 分類をはなれる → 見た になる。もどると［達成｜たっせい］
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.category('place');
      h.step(3);
      h.achievements.category('break');
      h.step(3);
    });
    expect(await uiRow(page, 'break.dirt.1')).toMatchObject({ unlocked: true, isNew: false });
    const tag = row(page, 'break.dirt.1').locator('.rk-chip');
    await expect(tag).toHaveCount(1);
    await expect(tag).toContainText('達成');
    await expect(tag).not.toContainText('未達成');
    expect(await tag.innerHTML()).toMatch(/<rt>たっせい<\/rt>/);
    await expect(page.locator('.ach-list')).not.toContainText('あたらしい');
  });

  test('基準6: 次の段を取ると、普通の取った行（メダル・日付・NEW）になり、さらに 1 つ上が次の段になる', async ({ page }) => {
    await openAch(page);
    await record(page, 'break:dirt', 1);
    await expect(row(page, 'break.dirt.100')).toHaveCount(1);
    expect(await uiRow(page, 'break.dirt.10')).toMatchObject({ next: true });
    expect(await uiRow(page, 'break.dirt.100')).toMatchObject({ next: false, shown: false });
    await record(page, 'break:dirt', 9); // 合計 10
    expect(await uiRow(page, 'break.dirt.10')).toMatchObject({ unlocked: true, next: false, shown: true, isNew: true });
    expect(await uiRow(page, 'break.dirt.100')).toMatchObject({ unlocked: false, next: true, shown: true });
    const got = row(page, 'break.dirt.10');
    await expect(got).not.toHaveClass(/ach-row--next/);
    await expect(got.locator('.rk-medal')).not.toHaveAttribute('data-tier', 'locked');
    await expect(got.locator('.ach-row__day')).toHaveCount(1);
    await expect(got.locator('.rk-chip')).toHaveText('NEW');
    await expect(got.locator('.rk-bar')).toHaveCount(0);
    await expect(row(page, 'break.dirt.100')).toHaveClass(/ach-row--next/);
    await expect(row(page, 'break.dirt.100').locator('.ach-row__cap')).toContainText('いま 10 / 100');
  });

  test('基準7: 1 段だけのシリーズは 取っても 次の段が出ない', async ({ page }) => {
    await openAch(page);
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.category('place');
      h.step(3);
    });
    await record(page, 'place:furnace', 1);
    expect(await uiRow(page, 'place.furnace.1')).toMatchObject({ unlocked: true, next: false });
    // 同じシリーズに ほかの行がない。次の段の行は 1 つも出ない（ほかのシリーズは 1 段も取っていない）
    const rows = await page.evaluate(() => (window.__rikkun as any).achievements.ui().rows as { id: string; next: boolean }[]);
    expect(rows.filter((r) => r.id.startsWith('place.furnace.')).length).toBe(1);
    expect(rows.some((r) => r.next)).toBe(false);
    await expect(page.locator('.ach-row--next')).toHaveCount(0);
  });

  test('ほかの分類の 取っていない行は 今までどおり 隠れたまま（AC28 を 次の段 以外に 読みかえ）', async ({ page }) => {
    await openAch(page);
    await record(page, 'break:dirt', 1);
    const hidden = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.achievements.category('place');
      h.step(3);
      return h.achievements.ui().rows.every((r: any) => !r.shown && !r.next);
    });
    expect(hidden).toBe(true);
    const names = await page.locator('.ach-row .ach-row__name').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n).toBe('？？？');
    await expect(page.locator('.ach-row .rk-chip')).toHaveCount(0);
    await refresh(page);
  });
});
