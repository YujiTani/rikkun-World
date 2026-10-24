import { expect, test, type Page } from '@playwright/test';
import { openBladeWorld, spawnAhead, stage, takeKatana } from './helpers/blade';

/**
 * HURT-1 ダメージを受けたら怯む＋無敵を長く（#296）。仕様: docs/tickets/HURT-1.md の A1〜A5。
 * A6（設定の数を変えると長さが変わる）は ユニット（src/combat/PlayerCombat.test.ts）。
 * 時間（ms）では 合否を決めない。window.__rikkun で 一時停止・コマ送りして 決める。
 * ダメージは `combat.damage(n)`（押されない）で 受ける。ヒットストップは 当たりが ないので 関係しない
 * （当たりが 出る 場面では 歩数を 決め打ちしない）。
 * 怯み 24 ステップ・無敵 90 ステップは 仕様の 決まった 数。
 */
test.describe.configure({ timeout: 120_000 });

const FLINCH = 24;
const INVINCIBLE = 90;

/** 刀を 持って 平らな 地面に 立つ（前 = 北）。0 番が 刀、1 番は からて */
async function world(page: Page): Promise<void> {
  await openBladeWorld(page);
  await takeKatana(page, 'chudan');
  await stage(page);
}

const combat = (page: Page) =>
  page.evaluate(() => (window.__rikkun as any).combat.get() as { hp: number; flinchTicks: number; invincibleTicks: number; punching: boolean; dead: boolean });

const pos = (page: Page) => page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; y: number; z: number });

const step = (page: Page, n: number) => page.evaluate((n) => (window.__rikkun as any).step(n), n);

const bladeFrame = (page: Page) => page.evaluate(() => (window.__rikkun as any).blade.state().frame as number);

const hit = (page: Page, n = 1) => page.evaluate((n) => { (window.__rikkun as any).combat.damage(n); }, n);

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test.describe('HURT-1 怯み（A1〜A5）', () => {
  test('A5: combat.get() に flinchTicks が 出る（はじめ 0 → ダメージで 24 → 1 ステップごとに 1 へる → 0）', async ({ page }) => {
    await world(page);
    const s0 = await combat(page);
    expect(s0.flinchTicks, 'flinchTicks が 窓口に ある（まだ 実装が ない）').toBe(0);
    await hit(page);
    expect((await combat(page)).flinchTicks).toBe(FLINCH);
    await step(page, 1);
    expect((await combat(page)).flinchTicks).toBe(FLINCH - 1);
    await step(page, FLINCH - 2);
    expect((await combat(page)).flinchTicks).toBe(1);
    await step(page, 1);
    expect((await combat(page)).flinchTicks).toBe(0);
  });

  test('A1: 前へ 進む 入力を しても 怯みの 24 ステップは 水平に 進まない。25 ステップ目から 進める', async ({ page }) => {
    await world(page);
    // 対照: ダメージなしなら 進む
    const p0 = await pos(page);
    await page.evaluate(() => { const h = window.__rikkun as any; h.input.press('moveForward'); });
    await step(page, 10);
    const moved = flat(await pos(page), p0);
    expect(moved, '対照: ダメージなしなら 歩ける').toBeGreaterThan(0.3);
    await page.evaluate(() => { const h = window.__rikkun as any; h.input.release('moveForward'); });
    await step(page, 40); // 止まる

    await hit(page);
    await page.evaluate(() => { const h = window.__rikkun as any; h.input.press('moveForward'); });
    const q0 = await pos(page);
    await step(page, FLINCH);
    const q1 = await pos(page);
    expect(flat(q1, q0), '怯みのあいだ 水平に 進まない').toBeLessThan(0.01);
    expect((await combat(page)).flinchTicks).toBe(0);
    // 25 ステップ目 → 進み はじめる
    await step(page, 1);
    const q2 = await pos(page);
    expect(flat(q2, q1), '25 ステップ目から 進める').toBeGreaterThan(0);
    await step(page, 10);
    expect(flat(await pos(page), q1), '怯みが 終われば ふつうに 歩く（無敵は のこっている）').toBeGreaterThan(0.3);
    expect((await combat(page)).invincibleTicks).toBeGreaterThan(0);
  });

  test('A1: 怯みの あいだは ジャンプも できない', async ({ page }) => {
    await world(page);
    const y0 = (await pos(page)).y;
    await hit(page);
    await page.evaluate(() => { (window.__rikkun as any).input.press('jump'); });
    let maxY = y0;
    for (let i = 0; i < FLINCH; i++) {
      await step(page, 1);
      maxY = Math.max(maxY, (await pos(page)).y);
    }
    expect(maxY - y0, '怯みのあいだ 上がらない').toBeLessThan(0.01);
    await step(page, 3);
    expect((await pos(page)).y - y0, '怯みが 終われば とべる').toBeGreaterThan(0.05);
  });

  test('A2: 怯みのあいだ 左クリックしても 刀のわざが 始まらない。怯みが 終われば 始まる（無敵の ままでも）', async ({ page }) => {
    await world(page);
    const id = await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await hit(page);
    await page.evaluate(() => { (window.__rikkun as any).input.press('primary'); });
    let maxF = 0;
    for (let i = 0; i < FLINCH; i++) {
      await step(page, 1);
      maxF = Math.max(maxF, await bladeFrame(page));
    }
    expect(maxF, '怯みのあいだ わざの コマが 進まない').toBe(0);
    const ev = await page.evaluate(() => ((window.__rikkun as any).blade.events() as { type: string }[]).filter((e) => e.type === 'techStart').length);
    expect(ev, 'techStart が 出ない').toBe(0);
    // 押したまま 怯みが 終わる → 始まる
    await step(page, 2);
    expect(await bladeFrame(page), '怯みが 終われば わざが 始まる').toBeGreaterThan(0);
    expect((await combat(page)).invincibleTicks, '無敵は のこっている').toBeGreaterThan(0);
    const hp = await page.evaluate((id) => (window.__rikkun as any).yokai.list().find((y: any) => y.id === id).hp as number, id);
    expect(hp, '怯みの あいだに 当たりは 出ていない').toBe(400);
  });

  test('A2: 怯みのあいだ パンチ（からて）も 始まらない。終われば 始まる', async ({ page }) => {
    await world(page);
    await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    await page.evaluate(() => { (window.__rikkun as any).inventory.select(1); });
    await step(page, 1);
    // 対照: ダメージなしなら パンチが 始まる
    await page.evaluate(() => { (window.__rikkun as any).input.press('primary'); });
    await step(page, 2);
    expect((await combat(page)).punching, '対照: ダメージなしなら パンチが 始まる').toBe(true);
    await page.evaluate(() => { (window.__rikkun as any).input.release('primary'); });
    await step(page, 40); // パンチが おわる（当たりは 出る）
    // 無敵・怯みが 切れてから やりなおす
    await step(page, INVINCIBLE);
    expect((await combat(page)).punching).toBe(false);

    await hit(page);
    await page.evaluate(() => { (window.__rikkun as any).input.press('primary'); });
    for (let i = 0; i < FLINCH; i++) {
      await step(page, 1);
      expect((await combat(page)).punching, `怯み ${i + 1} ステップ目`).toBe(false);
    }
    await step(page, 2);
    expect((await combat(page)).punching, '怯みが 終われば パンチが 始まる').toBe(true);
  });

  test('A3: 刀のわざの とちゅうで ダメージを 受けると わざが とぎれる（当たりは 出ない）', async ({ page }) => {
    await world(page);
    const id = await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
    // 突きを 始め、当たりの 前の 2〜3 コマまで 進める
    await page.evaluate(() => { (window.__rikkun as any).input.press('primary'); });
    await step(page, 1);
    await page.evaluate(() => { (window.__rikkun as any).input.release('primary'); });
    expect(await bladeFrame(page), 'わざが 始まっている').toBeGreaterThan(0);
    const f = await bladeFrame(page);
    const before = await page.evaluate(() => ((window.__rikkun as any).blade.events() as { type: string }[]).filter((e) => e.type === 'techHit').length);
    await hit(page);
    await step(page, 1);
    expect(await bladeFrame(page), `わざが とぎれる（コマ ${f} の 次で 0）`).toBe(0);
    await step(page, 40);
    const after = await page.evaluate(() => ((window.__rikkun as any).blade.events() as { type: string }[]).filter((e) => e.type === 'techHit').length);
    expect(after, 'とぎれた わざの 当たりは 出ない').toBe(before);
    const hp = await page.evaluate((id) => (window.__rikkun as any).yokai.list().find((y: any) => y.id === id).hp as number, id);
    expect(hp).toBe(400);
  });

  test('A4: ダメージから 89 ステップ以内の 2 発目は 体力が へらない。90 ステップ後は へる', async ({ page }) => {
    await world(page);
    const hp0 = (await combat(page)).hp;
    await hit(page);
    const c1 = await combat(page);
    expect(c1.hp).toBe(hp0 - 1);
    expect(c1.invincibleTicks, '無敵は 90 ステップ').toBe(INVINCIBLE);
    await step(page, 1);
    await hit(page);
    expect((await combat(page)).hp, '1 ステップ後').toBe(hp0 - 1);
    await step(page, FLINCH + 10); // 怯みが 終わったあと（無敵は のこる）
    await hit(page);
    expect((await combat(page)).hp, '怯みの あとも 無敵の あいだは へらない').toBe(hp0 - 1);
    // ちょうど 89 ステップ後（ここまでで 1 + FLINCH + 10 ステップ）
    await step(page, INVINCIBLE - 1 - (1 + FLINCH + 10));
    await hit(page);
    expect((await combat(page)).hp, '89 ステップ後').toBe(hp0 - 1);
    await step(page, 1);
    await hit(page);
    expect((await combat(page)).hp, '90 ステップ後は へる').toBe(hp0 - 2);
    expect((await combat(page)).flinchTicks, '2 発目でも 怯む').toBe(FLINCH);
  });

  test('復活したら 怯みは のこらない（やられた画面・復活の 無敵は 今のまま）', async ({ page }) => {
    await world(page);
    await page.evaluate(() => { (window.__rikkun as any).combat.damage(20); });
    expect((await combat(page)).flinchTicks).toBeGreaterThan(0);
    await step(page, 125);
    const c = await combat(page);
    expect(c.dead).toBe(false);
    expect(c.flinchTicks, '復活したら 怯みは のこらない').toBe(0);
    expect(c.invincibleTicks, '復活の無敵 3 秒').toBeGreaterThan(90);
  });
});
