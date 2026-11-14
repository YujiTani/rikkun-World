import { expect, test, type Page } from '@playwright/test';
import { aimBlock, tapRight } from './helpers/houseBuilt';
import { holdItems } from './helpers/blade';
import { findFlatSpot, goTo, nextMorning, openTown, place1P, timeDay, townCall, townDamage, townInfo, townRepairs, type P3 } from './helpers/town';

/**
 * TOWN-1 区切り 1B-1 の 1.4（TOWN-1-place.md §2.16・§4.5d の AC52・AC53(b1)。実装の 前に 書いた 赤の テスト）。
 * 見た目の ない しくみ だけ。建築士さんの 歩き・足場・るすの ふだ（AC55）は 〔1B-2〕で この 区切りに 入れない。
 * 口: `town.damage()`・`town.repairs()`・`town.planBlock()`・`town.keeps()`（TOWN-1.md §6.1）。まだ 無い ので「…が まだ ない」で 赤。
 * 数・座標は ゲームに 聞く。進めるのは step の 数。時間（ms）では 合否を 決めない（#255）。
 * 数の こまかい 所（n＝1・40、(d)(e)(f)(g)、AC53 の (a)(b2)(c)(d)(e)(f)、AC54・AC56）は ユニット（docs/ の 一覧 town14-unit-list.md）。
 * 約束: 朝 ＝ `time.day()` が 1 ふえる とき。テストでは `nextMorning`（helpers/town.ts）で 日を またぐ（ふとんで ねる のと 同じ きまり。仕様 §2.16 の 2）。
 */

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const key = (c: P3): string => `${c.x},${c.y},${c.z}`;

test.describe('TOWN-1 1B-1 こわれて 朝に もどる（1.4）', () => {
  test.describe.configure({ timeout: 300_000 });

  test('AC52 通し: ひろばの 5 マスを こわす → その 日は そのまま → 1 晩で 半分（下から）→ 2 晩目で ぜんぶ もとどおり', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const spot = await findFlatSpot(page, info, 5);
    const gy = info.groundY;
    const cells: P3[] = [0, 1, 2, 3, 4].map((i) => ({ x: spot.x0 + i, y: gy, z: spot.z0 }));
    // 2 だんに する（下から もどる ことを たしかめる）: 1 マス 目の 上にも 1 つ
    cells.push({ x: spot.x0, y: gy + 1, z: spot.z0 });
    // 1P は まとまりから はなれた 所に 立つ（人が そばに いると まつ）
    await goTo(page, spot.x0, spot.z0);
    const before = await page.evaluate((cells) => cells.map((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z) as string), cells);
    const plan = await page.evaluate((cells) => cells.map((c) => (window as any).__rikkun.town.planBlock(c.x, c.y, c.z) as string), cells);
    expect(plan, '街の 設計の 中身は こわす 前と 同じ').toEqual(before);
    const d = await timeDay(page);
    await townDamage(page, cells, 'air');
    const fx = spot.x0 + 22;
    const fy = (await page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [fx, spot.z0] as const)) + 1;
    await place1P(page, { x: fx + 0.5, y: fy, z: spot.z0 + 0.5 }); // まとまりの 四角 ＋2 マスの 外
    const n = cells.length;
    const blocksNow = (): Promise<string[]> => page.evaluate((cells) => cells.map((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z) as string), cells);
    expect((await blocksNow()).every((b) => b === 'air'), 'こわした マスは 空気').toBe(true);
    let rep = await townRepairs(page);
    expect(rep.cells.length, '記録の マスの 数').toBe(n);
    expect(rep.cells.every((c) => c.day === d), '記録の 日は こわした 日').toBe(true);
    expect(rep.groups.length, '1 まとまり').toBe(1);

    // (a) こわれた 日の うちは もどらない
    await stepN(page, 3600);
    expect((await townRepairs(page)).cells.length, 'その 日の うちは もどらない').toBe(n);

    // (b) つぎの 朝: ちょうど ⌈n/2⌉ マス もどる（下から）。1 ステップに 8 マス 以下・まとまりは 2 ステップに 1 マス 以下
    expect(await nextMorning(page, 0), '朝に なった').toBe(d + 1);
    let prev = (await townRepairs(page)).cells.length;
    let maxPerStep = 0;
    let steps = 0;
    const gaps: number[] = []; // もどった ステップの 間かく
    let last = -1;
    for (; steps < 600; steps++) {
      await stepN(page, 1);
      const left = (await townRepairs(page)).cells.length;
      if (left < prev) {
        maxPerStep = Math.max(maxPerStep, prev - left);
        if (last >= 0) gaps.push(steps - last);
        last = steps;
      }
      prev = left;
      if (left <= n - Math.ceil(n / 2)) break;
    }
    await stepN(page, 120); // これ いじょう もどらない ことの 確かめ
    rep = await townRepairs(page);
    expect(rep.cells.length, '1 晩で 半分（切り上げ）が もどる').toBe(n - Math.ceil(n / 2));
    expect(maxPerStep, '1 ステップに もどる マスは 8 以下').toBeLessThanOrEqual(8);
    expect(Math.min(...gaps, 2), '1 まとまりは 2 ステップに 1 マス 以下').toBeGreaterThanOrEqual(2);
    const left = new Set(rep.cells.map(key));
    for (const c of cells) {
      if (left.has(key(c))) continue;
      const b = await page.evaluate((c) => [(window as any).__rikkun.world.getBlock(c.x, c.y, c.z), (window as any).__rikkun.town.planBlock(c.x, c.y, c.z)], c);
      expect(b[0], `もどった マス ${key(c)} は 設計の 中身`).toBe(b[1]);
      expect(left.has(key({ x: c.x, y: c.y - 1, z: c.z })) && cells.some((o) => key(o) === key({ x: c.x, y: c.y - 1, z: c.z })), `もどった マス ${key(c)} の 真下は まだ もどって いない 同じ まとまりの マスでは ない（下から）`).toBe(false);
    }

    // (c) つぎの 朝（d＋2）: のこりが ぜんぶ もどる
    expect(await nextMorning(page, 1), 'もう 1 晩').toBe(d + 2);
    await stepN(page, 600);
    expect((await townRepairs(page)).cells.length, '2 晩目で 記録が 0').toBe(0);
    expect(await blocksNow(), '街の ブロックは こわす 前と 同じ').toEqual(before);
  });

  test('AC53 (b1): 2 マスの あなの 底に つちを 1 こ 置き、前に 歩く 入力 だけで 地面に 出られる', async ({ page }) => {
    await openTown(page);
    const info = await townInfo(page);
    const spot = await findFlatSpot(page, info, 5); // 5×5
    const gy = info.groundY;
    const cx = spot.x0 + 2;
    const cz = spot.z0 + 2;
    const pit: P3[] = [];
    for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) for (const y of [gy, gy - 1]) pit.push({ x: spot.x0 + dx, y, z: spot.z0 + dz });
    await goTo(page, cx, cz);
    await townDamage(page, pit, 'air');
    expect(await page.evaluate((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z), { x: cx, y: gy - 1, z: cz }), 'あなが あいた').toBe('air');
    // 1P を 底の まん中に（東向き）。オートジャンプは はじめの 設定（オン）の まま
    await page.evaluate(() => (window as any).__rikkun.settings.set('autoJump', true));
    await place1P(page, { x: cx + 0.5, y: gy - 1, z: cz + 0.5 }, 90);
    await holdItems(page, [{ item: 'dirt', count: 1 }]);
    // 東の かべの 横の 面（すぐ 手前の 底の マスに つちを 置く）をねらって 右クリック
    const wall: P3 = { x: spot.x0 + 5, y: gy - 1, z: cz };
    const t = await aimBlock(page, wall, 0.5);
    expect(t, 'かべを ねらえる').not.toBeNull();
    await tapRight(page);
    const put = { x: spot.x0 + 4, y: gy - 1, z: cz };
    expect(await page.evaluate((c) => (window as any).__rikkun.world.getBlock(c.x, c.y, c.z), put), '底の 記録の マスに つちが 置けた').toBe('dirt');
    expect(await townCall<unknown[]>(page, 'repairs').then((r: any) => r.cells.length), 'あなの マスは 記録に ある').toBeGreaterThan(0);
    // 前に 歩く 入力 だけで 600 ステップ 以内に 地面に 立つ
    const stood = await page.evaluate((gy) => {
      const h = (window as any).__rikkun;
      h.input.releaseAll();
      h.input.press('moveForward');
      for (let i = 0; i < 600; i++) {
        h.step(1);
        const p = h.player.get().position;
        if (p.y >= gy + 1 - 0.05 && h.world.groundHeight(Math.floor(p.x), Math.floor(p.z)) === gy) {
          h.input.releaseAll();
          h.step(10);
          return { ok: true, y: h.player.get().position.y as number, steps: i + 1 };
        }
      }
      h.input.releaseAll();
      return { ok: false, y: h.player.get().position.y as number, steps: 600 };
    }, gy);
    expect(stood.ok, `地面（y ${gy + 1}）に 立てた（今 y ${stood.y}）`).toBe(true);
    // 体が すけない ブロックに うまって いない
    const inside = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      return [h.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), h.world.getBlock(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z))];
    });
    expect(inside, '体の 2 マスは 空気').toEqual(['air', 'air']);
  });
});
