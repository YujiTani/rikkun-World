import { expect, test, type Page } from '@playwright/test';
import { openGasha } from './helpers/gasha';
import { installFakePads, setFakePad } from './helpers/duoUi';

/**
 * COOP-1 4d-3（docs/design/COOP-1.md §3.6 (c)・§8 の 4d-3 の 行・§12.0 `duo.gasha.target()`、AC110・AC109）の E2E（1 本）。実装の 前に 書いた 赤の テスト。
 * 2P を がしゃどくろの 近くに（1P は 遠く）→ `duo.gasha.target()` が 2 → 2P の 刀で がしゃどくろの 体力が へり、最後に 当てたのは 2P。1P の けいけんちは かわらない。
 * ユニットで 見る 物（ねらう 人の 決め方・とちゅうで かえない・のる／ひるみ／止め・ゆれ・消える・ゲージ・不具合 ②）は ここでは 見ない
 * （src/gasha/gashaTargets.test.ts・gashaBig2p.test.ts・gashaBigHit2p.test.ts・gashaBigShockSet.test.ts・gashaGeyser2p.test.ts・releaseDuo.test.ts）。
 * 数・座標は 決め打ちせず ゲーム（window.__rikkun・window.__gashaBig）に 聞く。進めるのは step の 数で、時間（ms）では 合否を 決めない（#255）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `duo.gasha.target()`（仕様 §12.0）: (): 1 | 2 | null。出す・たおすは 今の `__rikkun.gasha` の 口。ふつうの URL でも 効く（見るだけ）。
 *   `window.__gashaBig.info().lastHit.who`（GashaBigHandle.info() の lastHit に who を 足す）: 最後に 当てた 人。
 *   2P の 刀: `duo.give(2, 'katana', 1)`（ホットバー 0 番を えらぶ）→ 2P の パッドの r2（standard の ボタン 7 = primary）。向きは `duo.aimAt(2, cell)`（`?duo=dev`）。
 */

const PAD_R2 = 7;
type V3 = { x: number; y: number; z: number };

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);

test('AC110・AC109: 2P が がしゃどくろの 近くで 刀を ふると 当たり（体力が へる・当てたのは 2P）、ねらう 人は 近い 2P。1P の けいけんちは かわらない', async ({ page }) => {
  test.setTimeout(240_000);
  const errs = await openGasha(page, '?nosave=1&duo=dev');
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.settings.set('yokaiAutoSpawn', false);
  });
  await installFakePads(page, 2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
  await stepN(page, 30);

  // がしゃどくろを 出す（足を とめて 立たせる）。いまは だれも ねらって いない／1P が ねらい
  expect(await page.evaluate(async () => (await (window as any).__rikkun.gasha.spawn({ distance: 60, angleDeg: 0 })) as boolean)).toBe(true);
  await page.evaluate(() => (window as any).__gashaBig.walk(false));
  await stepN(page, 5);

  // 手の 当たりの 箱（世界の 座標）。2P を その 横に 置き、1P は 体から 遠く（それでも 消えない 距離）に 置く
  const hand = await page.evaluate(() => {
    const g = (window as any).__gashaBig;
    g.refreshColliders();
    const c = g.colliders().find((q: any) => q.name === 'handL') ?? g.colliders().find((q: any) => q.name.startsWith('hand'));
    return { c: c.center as number[], half: c.half as number[] };
  });
  // 2P は 体の 外がわ（体の まん中 → 手の 向き）から 手の 箱の ふち + 0.9 マスに 立つ（刀の とどく 2.2 マスの 中。箱の 向きに よらず 手前に 立つ）
  const boss = await page.evaluate(() => (window as any).__gashaBig.info().pos as number[]);
  let ox = hand.c[0]! - boss[0]!, oz = hand.c[2]! - boss[2]!;
  const od = Math.hypot(ox, oz) || 1;
  ox /= od; oz /= od;
  const stand = Math.abs(ox) * hand.half[0]! + Math.abs(oz) * hand.half[2]! + 0.9;
  const spot = { x: hand.c[0]! + ox * stand, z: hand.c[2]! + oz * stand };
  const put = async (who: 1 | 2, p: V3) => {
    await page.evaluate(({ who, p }) => {
      const h = (window as any).__rikkun;
      const gy = h.world.groundHeight(Math.floor(p.x), Math.floor(p.z)) + 1;
      h.duo.place(who, { x: p.x, y: gy, z: p.z });
    }, { who, p });
  };
  await put(1, { x: hand.c[0]! - 120, y: 0, z: hand.c[2]! });
  await put(2, { x: spot.x, y: 0, z: spot.z });
  await stepN(page, 5);

  // ねらいは 近い 2P（がしゃどくろの 近くに 2P・遠くに 1P）
  expect(await page.evaluate(() => (window as any).__rikkun.duo.gasha.target()), '近い 2P が ねらい').toBe(2);
  expect(await page.evaluate(() => (window as any).__rikkun.gasha.state())).toBe('present');

  // 2P の 刀を ふる
  await page.evaluate(({ c }) => {
    const h = (window as any).__rikkun;
    h.duo.give(2, 'katana', 1);
    h.duo.aimAt(2, { x: Math.floor(c[0]!), y: Math.floor(c[1]!), z: Math.floor(c[2]!) });
  }, { c: hand.c });
  const xp1 = await page.evaluate(() => (window as any).__rikkun.duo.level(1).xp as number);
  const hp0 = await page.evaluate(() => (window as any).__gashaBig.hp() as number);
  for (let k = 0; k < 12; k++) {
    await setFakePad(page, 1, { buttons: [PAD_R2] });
    await stepN(page, 3);
    await setFakePad(page, 1, { buttons: [] });
    await stepN(page, 40);
    if ((await page.evaluate(() => (window as any).__gashaBig.hp() as number)) < hp0) break;
  }
  const after = await page.evaluate(() => ({ hp: (window as any).__gashaBig.hp() as number, who: (window as any).__gashaBig.info().lastHit?.who as number | undefined }));
  expect(after.hp, '2P の 刀で 体力が へる').toBeLessThan(hp0);
  expect(after.who, '最後に 当てたのは 2P').toBe(2);
  expect(await page.evaluate(() => (window as any).__rikkun.duo.level(1).xp as number), '1P の けいけんちは かわらない').toBe(xp1);
  expect(errs).toEqual([]);
});
