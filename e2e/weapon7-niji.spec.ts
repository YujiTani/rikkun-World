import { expect, test } from '@playwright/test';
import { legendWorld } from './helpers/legend';

/**
 * WEAPON-7 PR3（虹。docs/design/WEAPON-7.md §5・§11 AC29〜AC33）の E2E。
 * 数（F・高さ・半径・ダメージ）は 仕様の まま。ゲーム（window.__rikkun）に 聞いて 一時停止・コマ送りで 確かめる。
 * 聞く 窓口: `legend.state()`（item・power・charge・move・moveF・cooldownLeft・dome）・`legend.events()`
 * （shiningStart・domeHit・shiningEnd・shiningReady）・`player.get()`・`combat.get()`・`combat.events()`・`combat.sounds()`・
 * `inventory.add(item, n, { power })`（新しい 口）・`inventory.durability()`・`achievements.list()`。
 * 実装の 前は 虹が ないので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

/** シャイニング本体（ため・ドーム・すいこみ・ダメージ 1/3）は 2026-10-21 の決定で かわったので e2e/weapon9-niji.spec.ts が 持つ。ここは 実績と 強さの 数だけ */
test.describe('WEAPON-7 PR3 虹 実績・強さの 数（AC28・AC32・AC33）', () => {
  test('AC33: 虹を はじめて 手に 入れる → get.niji.1。3 しゅるい目で legend.kinds.3', async ({ page }) => {
    await legendWorld(page, 'katana');
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.achievements.reset();
      h.step(1);
    });
    const un = async () => new Set(((await page.evaluate(() => (window.__rikkun as any).achievements.list())) as { id: string; unlocked: boolean }[]).filter((r) => r.unlocked).map((r) => r.id));
    const add = (item: string, power?: number) =>
      page.evaluate(
        ({ item, power }) => {
          const h = window.__rikkun as any;
          h.inventory.add(item, 1, power ? { power } : undefined);
          h.step(2);
        },
        { item, power },
      );
    await add('raijin_ken');
    await add('fujin_ken');
    expect((await un()).has('legend.kinds.3'), '2 しゅるい では まだ').toBe(false);
    await add('niji', 10);
    const u = await un();
    expect(u.has('get.niji.1')).toBe(true);
    expect(u.has('legend.kinds.3')).toBe(true);
    await add('niji', 5);
    const rows = (await page.evaluate(() => (window.__rikkun as any).achievements.list())) as { id: string; unlocked: boolean; small: boolean }[];
    for (const r of rows.filter((r) => ['get.niji.1', 'legend.kinds.3'].includes(r.id))) expect(r.small).toBe(false);
  });

  test('AC32: マスに 強さの 数（4〜10）が 出る。2 本 あっても それぞれ ちがう 数', async ({ page }) => {
    await legendWorld(page, 'katana');
    await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.inventory.clear();
      h.inventory.add('niji', 1, { power: 4 });
      h.inventory.add('niji', 1, { power: 10 });
      h.step(2);
      h.input.press('toggleInventory');
      h.step(1);
      h.input.release('toggleInventory');
      h.step(2);
    });
    const slots = await page.evaluate(() => {
      const h = window.__rikkun as any;
      const out: { index: number; text: string; item: string | null }[] = [];
      document.querySelectorAll('.inv-slot').forEach((el) => {
        const i = Number((el as HTMLElement).dataset.index);
        const s = h.inventory.get().slots[i];
        if (s && s.item === 'niji') out.push({ index: i, text: (el.textContent ?? '').trim(), item: s.item });
      });
      return out;
    });
    expect(slots, '虹の マスが 2 つ').toHaveLength(2);
    const texts = slots.map((s) => s.text).sort();
    expect(texts.some((t) => /(^|\D)4(\D|$)/.test(t)), '強さ 4 の 数').toBe(true);
    expect(texts.some((t) => /(^|\D)10(\D|$)/.test(t)), '強さ 10 の 数').toBe(true);
  });
});
