import { expect, test } from '@playwright/test';

/**
 * #264: シャイニングの あとの 休み（ゲームに 聞く: legend.state().cooldownLeft）の 間、虹の マスに 円の おおい
 * （`.slot-cooldown`）と のこりの 秒が 出て、休みが あけた ステップの 次に 消える。ほかの マスには 出ない。
 * 休みの 長さ・ためF は 決め打ちせず ゲームに 聞く。
 */
test.describe.configure({ timeout: 120_000 });

test('#264 休み中は 虹の マスに 円の おおいと のこりの 秒。あけたら 消える', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  const r = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(12);
    h.input.releaseAll();
    h.inventory.clear();
    h.inventory.add('katana', 1);
    h.inventory.add('niji', 1, { power: 10 });
    h.inventory.select(1);
    // 空を 見る（ブロックを ねらわない。押すと わざ → ため）
    h.player.set({ ...h.player.get(), pitch: 25 });
    h.step(30);
    const closeModal = () => {
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps));
    };
    closeModal();
    const cells = () => [...document.querySelectorAll('#hotbar .slot')].map((s) => {
      const o = s.querySelector('.slot-cooldown') as HTMLElement | null;
      return o && !o.hidden && getComputedStyle(o).display !== 'none' ? (o.textContent ?? '') : null;
    });
    const before = cells();
    const full = (h.settings.get('legendary') as { item: string; charge: { chargeTicks: number } | null }[]).find((d) => d.item === 'niji')!.charge!.chargeTicks;
    h.input.press('primary');
    h.step(full + 5);
    h.input.release('primary');
    let n = 0;
    while (h.legend.state().cooldownLeft === 0 && n < 600) {
      h.step(1);
      n++;
    }
    closeModal();
    const left0 = h.legend.state().cooldownLeft as number;
    const start = cells();
    h.step(Math.max(0, left0 - 60 - 1)); // のこり 61 → 2 秒
    const late = cells();
    const leftLate = h.legend.state().cooldownLeft as number;
    h.step(leftLate + 1);
    const after = cells();
    return { before, left0, start, late, leftLate, after, leftEnd: h.legend.state().cooldownLeft as number };
  });
  expect(r.before.every((c) => c === null), `休みの 前に おおいが ある: ${JSON.stringify(r.before)}`).toBe(true);
  expect(r.left0, 'シャイニングの あと 休みが 始まらない（テストの 手順を 見直す）').toBeGreaterThan(0);
  expect(r.start[0], 'かたなの マスに おおいが 出た').toBeNull();
  expect(r.start[1], '休みの 始めに 虹の マスに のこりの 秒が 出ない').toBe(String(Math.ceil(r.left0 / 60)));
  expect(r.late[1], `のこり ${r.leftLate} で 秒が ちがう`).toBe(String(Math.ceil(r.leftLate / 60)));
  expect(r.leftEnd).toBe(0);
  expect(r.after.every((c) => c === null), `休みが あけても おおいが のこる: ${JSON.stringify(r.after)}`).toBe(true);
});
