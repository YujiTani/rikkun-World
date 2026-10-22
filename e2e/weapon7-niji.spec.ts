import { expect, test, type Page } from '@playwright/test';
import { chargeRun, legendWorld, markLegend, spawnAt, stepN, types, type LStep } from './helpers/legend';

/**
 * WEAPON-7 PR3（虹。docs/design/WEAPON-7.md §5・§11 AC29〜AC33）の E2E。
 * 数（F・高さ・半径・ダメージ）は 仕様の まま。ゲーム（window.__rikkun）に 聞いて 一時停止・コマ送りで 確かめる。
 * 聞く 窓口: `legend.state()`（item・power・charge・move・moveF・cooldownLeft・dome）・`legend.events()`
 * （shiningStart・domeHit・shiningEnd・shiningReady）・`player.get()`・`combat.get()`・`combat.events()`・`combat.sounds()`・
 * `inventory.add(item, n, { power })`（新しい 口）・`inventory.durability()`・`achievements.list()`。
 * 実装の 前は 虹が ないので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

const NIJI = 'niji';

/** 虹を 強さ power で 手に 持つ（スロット 0）。窓口 `inventory.add(item, n, { power })` は 新しい 口 */
async function holdNiji(page: Page, power: number): Promise<number> {
  const floorY = await legendWorld(page, 'katana');
  await page.evaluate((p) => {
    const h = window.__rikkun as any;
    h.inventory.clear();
    h.inventory.add('niji', 1, { power: p });
    h.inventory.select(0);
    h.step(2);
  }, power);
  const st = await page.evaluate(() => (window.__rikkun as any).legend.state());
  expect(st.item, '手に 持っている 物が 虹').toBe(NIJI);
  expect(st.power, 'その 1 本の 強さ').toBe(power);
  await markLegend(page);
  return floorY;
}

const feetY = (s: LStep) => s.pos.y;

test.describe('WEAPON-7 PR3 虹 シャイニング（AC29・AC33）', () => {
  test('AC33: power 10 を 90 ステップ 押して はなす → shiningStart・前 5 の からかさに domeHit 25・shiningEnd（260 ステップ目）・たいきゅう 9999', async ({ page }) => {
    await holdNiji(page, 10);
    const id = await spawnAt(page, 'karakasa', 20.5, await page.evaluate(() => (window.__rikkun as any).player.get().position.y as number), 20.5 - 5, 99);
    await markLegend(page);
    const rec = await chargeRun(page, 90, 270);
    const start = rec.findIndex((s) => s.events.some((e) => e.type === 'shiningStart'));
    const end = rec.findIndex((s) => s.events.some((e) => e.type === 'shiningEnd'));
    expect(start, 'shiningStart').toBeGreaterThanOrEqual(0);
    expect(end, 'shiningEnd').toBeGreaterThan(start);
    expect(end - start, 'シャイニングは 260 ステップ').toBeGreaterThanOrEqual(259);
    expect(end - start).toBeLessThanOrEqual(260);
    const hits = rec.flatMap((s) => s.events).filter((e) => e.type === 'domeHit' && e.yokaiId === id);
    expect(hits.length, '前 5 の からかさに ドームが 当たる').toBeGreaterThanOrEqual(1);
    expect(hits[0].damage).toBeCloseTo(25, 2);
    expect(rec.some((s) => s.sounds.includes('shiningStart'))).toBe(true);
    const dur = await page.evaluate(() => (window.__rikkun as any).inventory.durability(0));
    expect(dur).toEqual({ max: 10000, left: 9999 });
  });

  test('AC29: ためF 90 で いっぱい（chargeReady）・うかぶ 40 で +2.0・とどまる 160・おりる 40・もどり 20', async ({ page }) => {
    await holdNiji(page, 7);
    const y0 = await page.evaluate(() => (window.__rikkun as any).player.get().position.y as number);
    const rec = await chargeRun(page, 90, 270);
    const ready = rec.findIndex((s) => s.events.some((e) => e.type === 'chargeReady'));
    expect(ready, 'ためF 90 の ステップに chargeReady').toBe(89);
    expect(rec[88].charge?.ready).toBe(false);
    const s = rec.findIndex((s) => s.events.some((e) => e.type === 'shiningStart'));
    expect(s).toBeGreaterThanOrEqual(90);
    const F = (n: number) => rec[s + n - 1]; // わざの F（shiningStart の ステップ = F1）
    expect(F(1).move).toBe('shining');
    expect(feetY(F(40)) - y0, 'うかぶ 40 で +2.0').toBeCloseTo(2.0, 1);
    expect(Math.abs(feetY(F(40)) - y0 - 2.0)).toBeLessThan(0.011);
    for (let n = 41; n <= 200; n++) expect(feetY(F(n)) - y0, `とどまる F${n}`).toBeCloseTo(2.0, 1);
    expect(feetY(F(240)) - y0, 'おりる 40 で もとの 高さ').toBeLessThan(0.05);
    expect(F(260).move, '260 の あとは わざが おわる').toBe('shining');
    expect(rec[s + 260]?.move ?? null).toBeNull();
    // 横には 動けない（うかぶ〜おりる）
    expect(Math.abs(F(200).pos.z - F(1).pos.z)).toBeLessThan(0.01);
  });

  test('AC29: 休み 600 の 間は ためが いっぱいに ならない（はなすと ふつうの わざ）・あけた ステップに shiningReady', async ({ page }) => {
    await holdNiji(page, 7);
    const a = await chargeRun(page, 90, 270);
    const endIdx = a.findIndex((s) => s.events.some((e) => e.type === 'shiningEnd'));
    expect(endIdx).toBeGreaterThan(0);
    const cd0 = await page.evaluate(() => (window.__rikkun as any).legend.state().cooldownLeft as number);
    expect(cd0, '休みが 始まっている').toBeGreaterThan(0);
    expect(cd0).toBeLessThanOrEqual(600);
    // 休み中: 90 ステップ 押しても chargeReady に ならず、はなすと ふつうの わざ
    const b = await chargeRun(page, 100, 5);
    expect(types(b), '休み中は いっぱいに ならない').not.toContain('chargeReady');
    expect(types(b)).not.toContain('shiningStart');
    expect(b.some((s) => s.bladeTech !== null), 'ふつうの わざが 出る').toBe(true);
    // 休みが あける まで すすめる（shiningReady が 1 回、そのあと ためが いっぱいに なる）
    const left = await page.evaluate(() => (window.__rikkun as any).legend.state().cooldownLeft as number);
    const c = await stepN(page, left + 2);
    const readyAt = c.findIndex((s) => s.events.some((e) => e.type === 'shiningReady'));
    expect(readyAt, 'shiningReady').toBeGreaterThanOrEqual(0);
    expect(types(c).filter((t) => t === 'shiningReady')).toHaveLength(1);
    expect(c[readyAt].sounds).toContain('shiningReady');
    await page.evaluate(() => (window.__rikkun as any).step(60));
    const d = await chargeRun(page, 90, 2);
    expect(types(d), '休みが あけたら また シャイニング').toContain('shiningStart');
  });
});

test.describe('WEAPON-7 PR3 虹 ドームの 当たり（AC30）', () => {
  test('AC30: 前 6.5 の からかさに domeHit P×2.5（P 7 → 17.5）・同じ 妖怪は 60 ステップに 1 回', async ({ page }) => {
    await holdNiji(page, 7);
    const y = await page.evaluate(() => (window.__rikkun as any).player.get().position.y as number);
    const id = await spawnAt(page, 'karakasa', 20.5, y, 20.5 - 6.5, 999);
    await markLegend(page);
    const rec = await chargeRun(page, 90, 270);
    const tickOf = (s: LStep) => s.tick;
    const hits = rec.filter((s) => s.events.some((e) => e.type === 'domeHit' && e.yokaiId === id));
    expect(hits.length, '前 6.5 は ドームの 中').toBeGreaterThanOrEqual(1);
    for (const s of hits) for (const e of s.events.filter((e) => e.type === 'domeHit' && e.yokaiId === id)) expect(e.damage).toBeCloseTo(17.5, 2);
    expect(hits.length, '1 回の シャイニングで 4 回まで').toBeLessThanOrEqual(4);
    for (let i = 1; i < hits.length; i++) expect(tickOf(hits[i]) - tickOf(hits[i - 1]), '60 ステップに 1 回').toBeGreaterThanOrEqual(60);
  });

  test('AC30: 8.5 より 外（前 9）の からかさには 当たらない', async ({ page }) => {
    await holdNiji(page, 7);
    const y = await page.evaluate(() => (window.__rikkun as any).player.get().position.y as number);
    const id = await spawnAt(page, 'karakasa', 20.5, y, 20.5 - 9, 999);
    await markLegend(page);
    const rec = await chargeRun(page, 90, 270);
    expect(types(rec)).toContain('shiningStart');
    const hit = rec.flatMap((s) => s.events).filter((e) => e.type === 'domeHit' && e.yokaiId === id);
    expect(hit).toHaveLength(0);
  });
});

test.describe('WEAPON-7 PR3 虹 安全（AC31）', () => {
  test('AC31: シャイニング中は 妖怪の 攻撃が 当たらない（hp 一定）・おりた あと 落下ダメージなし', async ({ page }) => {
    await holdNiji(page, 7);
    const y = await page.evaluate(() => (window.__rikkun as any).player.get().position.y as number);
    await page.evaluate((y) => {
      const h = window.__rikkun as any;
      for (const dz of [1.2, 2, 2.8]) h.yokai.spawn('karakasa', 20.5, y, 20.5 - dz, { ai: true });
    }, y);
    const rec = await page.evaluate(() => {
      const h = window.__rikkun as any;
      h.input.press('primary');
      let started = -1;
      let ended = -1;
      const hp: number[] = [];
      const fall: number[] = [];
      for (let i = 0; i < 90 + 300; i++) {
        if (i === 90) h.input.release('primary');
        h.step(1);
        const st = h.legend.state();
        if (started < 0 && st.move === 'shining') started = i;
        if (started >= 0 && ended < 0 && st.move !== 'shining') ended = i;
        hp.push(h.combat.get().hp);
        fall.push((h.combat.events() as any[]).filter((e) => e.type === 'fallHurt').length);
      }
      return { started, ended, hp, fall };
    });
    expect(rec.started).toBeGreaterThanOrEqual(0);
    expect(rec.ended).toBeGreaterThan(rec.started);
    const during = rec.hp.slice(rec.started, rec.ended + 1);
    expect(Math.min(...during), 'シャイニング中は hp が へらない').toBe(during[0]);
    expect(rec.fall.reduce((a, b) => a + b, 0), '落下ダメージなし').toBe(0);
  });
});

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
