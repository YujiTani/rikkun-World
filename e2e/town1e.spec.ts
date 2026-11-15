import { expect, test, type Page } from '@playwright/test';
import { findEdgeSpot, goTo, openTown, place1P, place2P, townInfo, type P3, type TownInfo } from './helpers/town';
import { countOf, damaOf, hpOf, shopCall, shopState, stepN, tid, type Who } from './helpers/shop';
import { duoDurability, duoPos, giveWornKatana, ofudaCharging, screenOpen, smithState, stallState, talkVendor, hookCall, type Screen } from './helpers/town1e';
import { setFakePad } from './helpers/duoUi';

/**
 * TOWN-1 区切り 1E（かえりの おふだ・かじやさん・かいとりの やたい・食事。docs/design/TOWN-1-shop.md §2.10〜§2.13・§3.2・AC32〜37・AC48・AC49）。実装の 前に 書いた 赤の テスト。
 * E2E に 書くのは 通しと 2 人だけ（TOWN-1.md §6）。数・ねだん・上限・食べ物の 数は ユニット（AC33〜36・AC48・AC49）。画面の ならべ方は 見ない（よろずやと 同じ 形に なる。位置・大きさは UI 検査）。
 * 通しは 1P・2P の 両方（同じ 基準）。
 *
 * ---- 開発への つなぎ目の 約束（置く 所は developer。TOWN-1.md §6.1 の 1E の フックを ふくらませた 物）----
 * 窓口（p ＝ 1 | 2。2P が いなければ open は false）:
 *   ofuda.use(p)                    手に もって 右クリック（つかう）と 同じ。ため（60 ステップ）が はじまる。つかえない 時（街の 中）は 何も しない
 *   ofuda.state(p) → { charging: number | null }   ため の のこり ステップ（ためて いない ときは null）
 *   smith.open(p) / smith.state(p) → { open, items: { slot: number | 'armor:<部位>', item, durability, max, price, canFix }[] } / smith.fix(p, slot) → 'ok' | 'short' | 'full'
 *     items は たいきゅうが へって いる 物 だけ（まんたんの 物・ブロックは 入らない）。smith.open の とき なおす 物が 1 つも なければ 画面は 開かず ふきだし だけ
 *   stall.open(p) / stall.state(p) → { open, today, cap, rows: { item, need, have, canGive }[] } / stall.give(p, item) → 'ok' | 'short' | 'cap'
 *   food.open(p, 'dango' | 'gohan') / food.eat(p, kind) → 'ok' | 'short' | 'full'
 *   【足した 準備の フック（ユニットでは 使えない 画面と 持ち物の 準備）】
 *   duo.durability(p, slot) → { max, left } | null        その 人の ホットバー/もちものの マス（0 はじまり）の たいきゅう（1P は inventory.durability と 同じ）
 *   duo.setDurability(p, slot, left)                       たいきゅうを left に する（`?duo=dev` の ときだけ。1P は inventory.setDurability と 同じ。2P が いなければ 何も しない）
 *   よろずやの 品の id ＝ 'kaeri_ofuda'（TOWN-1-shop §4.2・§4.7 の 案）。duo.give(p, 'kaeri_ofuda', n, slot) で もたせられる ように アイテムの id も 同じ
 * data-testid（1 人も 2 人も 同じ 名前。2 人の ときは 開いた 人の 画面だけ DOM に ある。根は `data-owner="1|2"`）:
 *   smith-screen / stall-screen / meal-screen   画面の 根（開いて いる 間だけ DOM に ある。meal-screen は `data-kind="dango|gohan"` も）
 *   smith-dama / stall-dama                     上の「もっている ようかいダマ」の 数
 *   smith-bubble / stall-bubble / meal-bubble   ふきだし（ない ときは DOM に ない。たりない・きょうは もう いっぱい・おなか いっぱい など）
 *   smith-card-<slot> / stall-card-<item>       カード（slot は フックの slot の まま、item は 物の id）。`data-can="1|0"`（0 ＝ 灰色）
 *   smith-detail / stall-detail                 えらんだ 物の 下の 帯（大きな 絵）
 *   smith-buy / stall-buy                       「なおす」「わたす」ボタン。`aria-disabled`（たりない・上限の とき "true"。`disabled` 属性は 使わない。押すと ふきだしが 出る）
 *   meal-buy                                    「たべる」ボタン（`aria-disabled`）。体力 まんたん・ようかいダマ たりない とき "true"
 *   smith-close / stall-close / meal-close      ✕（56×56 以上）
 * 話す: 1P は 人を ねらって 右クリック、2P は ZL。画面が 開く（根が DOM に ある）。人は town.info().npcs（smith・stall・dango・gohan）。
 * 食べる: 「たべる」を 押すと ようかいダマが へり ふきだしが とじて（meal-screen が きえる）その 場で 30 ステップ もぐもぐ → 体力が ふえる。
 */

const WORLD_SEED = 11;
const OPEN_MAX = 300; // 話してから 画面が 開くまでの 上限 ステップ（回）
const FAR = 110; // 街の 中心から はなれる マス（仕様 AC32: 100 マス）
const CHARGE = 60; // ため（ステップ。仕様 §4.7）
const FREEZE_STEPS = 300; // 1 人で 開いて いる 間 ステップ

const rect = (page: Page, id: string) =>
  page.evaluate((id) => {
    const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, w: r.width, h: r.height } : null;
  }, id);

const near = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.z - b.z);

async function duoWorld(page: Page): Promise<TownInfo> {
  await openTown(page, { duo: true, extra: `&seed=${WORLD_SEED}` });
  return townInfo(page);
}

const place = (page: Page, who: Who, pos: P3): Promise<void> => (who === 1 ? place1P(page, pos) : place2P(page, pos));

test.describe('TOWN-1 1E おふだ・かじやさん・やたい・食事', () => {
  test.describe.configure({ timeout: 300_000 });

  for (const p of [1, 2] as const) {
    test(`通し（${p}P）AC32〜35・AC48: おふだを 買う → とおくで つかって 街へ → かじやで なおす → やたいで わたす → だんごを 食べる`, async ({ page }) => {
      const info = await duoWorld(page);
      const other: Who = p === 1 ? 2 : 1;
      const plaza = { x: info.plaza.x + 0.5, y: info.plaza.y, z: info.plaza.z + 0.5 };
      await page.evaluate(([p]) => (window as any).__rikkun.dama.give(p, 80), [p] as const);

      // ---- おふだを 買う（AC33 の 見える 側。ねだんは 表から 読む） ----
      expect(await shopCall(page, 'open', p)).toBe(true);
      const row = (await shopState(page, p)).items.find((i) => i.id === 'kaeri_ofuda');
      expect(row, 'よろずやの 表に かえりの おふだ（kaeri_ofuda）の 行が ある').toBeTruthy();
      expect(row!.canBuy).toBe(true);
      const d0 = await damaOf(page, p);
      expect(await shopCall(page, 'buy', p, 'kaeri_ofuda')).toBe('ok');
      expect(await shopCall(page, 'buy', p, 'kaeri_ofuda')).toBe('ok');
      expect(await damaOf(page, p), 'ようかいダマが ねだん ぶん へる').toBe(d0 - 2 * row!.price);
      await shopCall(page, 'close', p);
      // 手に もつ（ホットバー 0 番）
      await page.evaluate(([p]) => (window as any).__rikkun.duo.give(p, 'kaeri_ofuda', 1, 0), [p] as const);
      const o0 = await countOf(page, p, 'kaeri_ofuda');
      expect(o0, 'おふだを 2 まい 以上 もっている').toBeGreaterThanOrEqual(2);

      // ---- 街から 100 マス はなれた 所で つかう（AC32）。もう 1 人は ひろばの まま ----
      const fx = Math.floor(info.center.x) + FAR;
      const fz = Math.floor(info.center.z);
      await goTo(page, fx, fz);
      const gy = await page.evaluate(([x, z]) => (window as any).__rikkun.world.groundHeight(x, z) as number, [fx, fz] as const);
      const far = { x: fx + 0.5, y: gy + 1, z: fz + 0.5 };
      await place(page, p, far);
      await place(page, other, plaza);
      const otherPos0 = await duoPos(page, other);
      const hp0 = await hpOf(page, p);
      await hookCall(page, 'ofuda', 'use', p);
      await stepN(page, 1);
      const ch = await ofudaCharging(page, p);
      expect(ch, 'つかうと ため が はじまる').not.toBeNull();
      expect(ch!, 'ため は 60 ステップ 以内').toBeLessThanOrEqual(CHARGE);
      // ため の 間に 歩いて・たたかれても やめない
      await setFakePad(page, p - 1, { axes: [0, -1, 0, 0] });
      await stepN(page, 25);
      await setFakePad(page, p - 1, {});
      await page.evaluate(([p]) => (window as any).__rikkun.duo.hurt(p, 1), [p] as const);
      expect(await hpOf(page, p), 'たたかれた').toBeLessThan(hp0);
      await stepN(page, CHARGE - 1 - 1 - 25); // ここまでで 合計 59 ステップ（use の あと 1 ＋ 25 ＋ この）
      expect(await ofudaCharging(page, p), 'ため の 間は まだ（歩いても・たたかれても やめない）').not.toBeNull();
      expect(near(await duoPos(page, p), plaza), '59 ステップでは まだ うつらない').toBeGreaterThan(50);
      expect(await countOf(page, p, 'kaeri_ofuda'), 'ため の 間は へらない').toBe(o0);
      await stepN(page, 3);
      expect(await ofudaCharging(page, p), 'ため が おわる').toBeNull();
      const here = await duoPos(page, p);
      expect(near(here, plaza), 'ふんすいの 前（plaza の そば）に うつる').toBeLessThan(8);
      expect(near(here, otherPos0), 'もう 1 人と 重ならない').toBeGreaterThan(0.4);
      expect(await countOf(page, p, 'kaeri_ofuda'), 'おふだが 1 まい へる').toBe(o0 - 1);
      expect(await duoPos(page, other), 'もう 1 人は うごかない').toEqual(otherPos0);
      await test.info().attach(`ofuda-${p}P`, { body: await page.screenshot({ path: `test-shots/town1e-ofuda-${p}P.png` }), contentType: 'image/png' });
      // 街の 中では つかえない（へらない・うつらない・ため も はじまらない）
      await hookCall(page, 'ofuda', 'use', p);
      await stepN(page, CHARGE + 5);
      expect(await ofudaCharging(page, p), '街の 中では ため が はじまらない').toBeNull();
      expect(await countOf(page, p, 'kaeri_ofuda'), '街の 中では へらない').toBe(o0 - 1);
      expect(near(await duoPos(page, p), here), '街の 中では うごかない').toBeLessThan(0.5);

      // ---- かじやさん（AC34）。かたなが 2 本 へって いる（1 へった・半分）。ねだんは ★ だけで 決まる ----
      await giveWornKatana(page, p, 1, (m) => m - 1);
      await giveWornKatana(page, p, 2, (m) => Math.floor(m / 2));
      await talkVendor(page, p, 'smith', info, 'smith', OPEN_MAX);
      await expect(tid(page, 'smith-screen')).toBeVisible();
      expect(await tid(page, 'smith-screen').getAttribute('data-owner')).toBe(String(p));
      expect((await smithState(page, other)).open, '話して いない 人の 画面は 開かない').toBe(false);
      const sm = await smithState(page, p);
      const w1 = sm.items.find((i) => i.slot === 1);
      const w2 = sm.items.find((i) => i.slot === 2);
      expect(w1 && w2, 'へった かたな 2 本が カードに 出る').toBeTruthy();
      expect(w1!.price, '1 へった かたなと 半分の かたなで ねだんが 同じ').toBe(w2!.price);
      expect(w1!.price).toBeGreaterThan(0);
      expect(sm.items.every((i) => i.durability < i.max), 'まんたんの 物は 出ない').toBe(true);
      await test.info().attach(`smith-${p}P`, { body: await page.screenshot({ path: `test-shots/town1e-smith-${p}P.png` }), contentType: 'image/png' });
      const dS = await damaOf(page, p);
      const oD = await damaOf(page, other);
      await tid(page, 'smith-card-1').click();
      await stepN(page, 2);
      await expect(tid(page, 'smith-detail')).toBeVisible();
      expect(await tid(page, 'smith-buy').getAttribute('aria-disabled')).not.toBe('true');
      await tid(page, 'smith-buy').click();
      await stepN(page, 5);
      expect(await damaOf(page, p), 'ようかいダマが ねだん だけ へる').toBe(dS - w1!.price);
      expect((await duoDurability(page, p, 1))!.left, 'たいきゅうが まんたん').toBe((await duoDurability(page, p, 1))!.max);
      const sm2 = await smithState(page, p);
      expect(sm2.items.some((i) => i.slot === 1), 'なおした 物は カードから きえる').toBe(false);
      expect(sm2.items.some((i) => i.slot === 2), 'ほかの へった 物は のこる').toBe(true);
      expect(await damaOf(page, other), 'もう 1 人の ようかいダマは かわらない').toBe(oD);
      await tid(page, 'smith-close').click();
      await stepN(page, 2);
      expect(await screenOpen(page, 'smith', p), '✕ で とじる').toBe(false);

      // ---- かいとりの やたい（AC35 の 通し）: 9 こ では たりない・10 こ で ようかいダマ 1 ----
      await page.evaluate(([p]) => (window as any).__rikkun.duo.give(p, 'tomato', 9, 3), [p] as const);
      await talkVendor(page, p, 'kaitori', info, 'stall', OPEN_MAX);
      await expect(tid(page, 'stall-screen')).toBeVisible();
      const st0 = await stallState(page, p);
      const rowT = st0.rows.find((r) => r.item === 'tomato');
      expect(rowT, 'やさいの 行（トマト）が ある').toBeTruthy();
      expect(rowT!.canGive, 'たりない').toBe(false);
      expect(await tid(page, 'stall-card-tomato').getAttribute('data-can'), 'カードが うすく なる').toBe('0');
      const dY = await damaOf(page, p);
      await tid(page, 'stall-card-tomato').click();
      await stepN(page, 2);
      expect(await tid(page, 'stall-buy').getAttribute('aria-disabled'), 'わたす ボタンは 灰色').toBe('true');
      await tid(page, 'stall-buy').click({ force: true });
      await stepN(page, 2);
      expect(await damaOf(page, p), 'たりない ときは 何も へらない').toBe(dY);
      await expect(tid(page, 'stall-bubble')).toBeVisible();
      await page.evaluate(([p, n]) => (window as any).__rikkun.duo.give(p, 'tomato', n, 3), [p, rowT!.need] as const);
      await stepN(page, 2);
      expect(await tid(page, 'stall-card-tomato').getAttribute('data-can'), '足りると 明るく なる').toBe('1');
      const t0 = await countOf(page, p, 'tomato');
      await tid(page, 'stall-buy').click();
      await stepN(page, 3);
      expect(await countOf(page, p, 'tomato'), 'トマトが 組の 数だけ へる').toBe(t0 - rowT!.need);
      expect(await damaOf(page, p), 'ようかいダマ +1').toBe(dY + 1);
      expect((await stallState(page, p)).today, 'きょう もらった 数').toBe(st0.today + 1);
      expect((await stallState(page, other)).today, 'もう 1 人の きょうの 数は かわらない').toBe(0);
      await tid(page, 'stall-close').click();
      await stepN(page, 2);

      // ---- だんごの やたい（AC48 の 通し）: 体力が へって いる → たべる → ようかいダマが へり 体力が ふえる ----
      await page.evaluate(([p]) => (window as any).__rikkun.duo.hurt(p, 10), [p] as const);
      await stepN(page, 2);
      const hpBefore = await hpOf(page, p);
      const otherHp = await hpOf(page, other);
      await talkVendor(page, p, 'dango', info, 'meal', OPEN_MAX);
      await expect(tid(page, 'meal-screen')).toBeVisible();
      expect(await tid(page, 'meal-screen').getAttribute('data-kind')).toBe('dango');
      expect(await tid(page, 'meal-buy').getAttribute('aria-disabled'), '体力が へって いれば たべられる').not.toBe('true');
      await test.info().attach(`meal-${p}P`, { body: await page.screenshot({ path: `test-shots/town1e-meal-${p}P.png` }), contentType: 'image/png' });
      const dM = await damaOf(page, p);
      await tid(page, 'meal-buy').click();
      await stepN(page, 2);
      expect(await screenOpen(page, 'meal', p), '「たべる」を 押すと ふきだしが とじる').toBe(false);
      expect(await damaOf(page, p), 'ようかいダマが へる（だんごは 1 以上）').toBeLessThan(dM);
      await stepN(page, 60); // もぐもぐ 30 ステップ ＋ ハートが ふえる ぶん
      const hpAfter = await hpOf(page, p);
      expect(hpAfter, '体力が ふえる').toBeGreaterThan(hpBefore);
      expect(await hpOf(page, other), 'もう 1 人の 体力は かわらない').toBe(otherHp);
      expect(await damaOf(page, other), 'もう 1 人の ようかいダマは かわらない').toBe(oD);
    });
  }

  test('AC37・AC20 (1 人): かじや・やたい・食事の 画面を 開いて いる 間は 世界が 止まる（妖怪の 場所も ハートも かわらない）', async ({ page }) => {
    await openTown(page, { extra: `&seed=${WORLD_SEED}` });
    const info = await townInfo(page);
    const spot = await findEdgeSpot(page, info);
    await place1P(page, spot.player);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.dama.give(1, 20);
      h.duo.give(1, 'tomato', 10, 3);
    });
    await giveWornKatana(page, 1, 1, (m) => m - 1);
    const yPos = { x: spot.player.x + spot.out.x * 2, y: spot.player.y, z: spot.player.z + spot.out.z * 2 };
    const id = await page.evaluate((pos) => {
      const h = (window as any).__rikkun;
      h.time.set(70000);
      return h.yokai.spawn('karakasa', pos.x, pos.y, pos.z, { hp: 9999 }) as number;
    }, yPos);
    const where = (): Promise<P3> => page.evaluate((id) => (window as any).__rikkun.yokai.list().find((q: any) => q.id === id)?.position as P3, id);
    const pos0 = await where();
    const hp0 = await hpOf(page, 1);
    const opens: [Screen, string, unknown[]][] = [
      ['smith', 'smith', [1]],
      ['stall', 'stall', [1]],
      ['meal', 'food', [1, 'dango']],
    ];
    for (const [screen, group, args] of opens) {
      await hookCall(page, group, 'open', ...args);
      await stepN(page, 2);
      expect(await screenOpen(page, screen, 1), `${screen} の 画面が 開く`).toBe(true);
      await stepN(page, FREEZE_STEPS);
      expect(await where(), `${screen} を 開いて いる 間 妖怪の 場所が かわらない`).toEqual(pos0);
      expect(await hpOf(page, 1), `${screen}: 1P の ハートが へらない`).toBe(hp0);
      await page.keyboard.press('Escape');
      await stepN(page, 3);
      expect(await screenOpen(page, screen, 1), `${screen}: Esc で とじる`).toBe(false);
    }
  });

  for (const opener of [1, 2] as const) {
    test(`AC37・AC20 (2 人・${opener}P が 開く): 3 つの 画面とも 世界は 止まらず 画面は 開いた 人の 半分・当たると ハートが へって 開いた まま・やられたら とじる`, async ({ page }) => {
      const info = await duoWorld(page);
      const spot = await findEdgeSpot(page, info);
      const other: Who = opener === 1 ? 2 : 1;
      const plaza = { x: info.plaza.x + 0.5, y: info.plaza.y, z: info.plaza.z + 0.5 };
      await place(page, other, plaza);
      await place(page, opener, spot.player);
      await page.evaluate(([p]) => {
        const h = (window as any).__rikkun;
        h.dama.give(p, 20);
        h.duo.give(p, 'tomato', 10, 3);
      }, [opener] as const);
      await giveWornKatana(page, opener, 1, (m) => m - 1);
      const vw = await page.evaluate(() => innerWidth);
      const opens: [Screen, string, unknown[]][] = [
        ['smith', 'smith', [opener]],
        ['stall', 'stall', [opener]],
        ['meal', 'food', [opener, 'dango']],
      ];
      for (const [screen, group, args] of opens) {
        await hookCall(page, group, 'open', ...args);
        await stepN(page, 2);
        expect(await screenOpen(page, screen, opener), `${screen} の 画面が 開く`).toBe(true);
        const scr = (await rect(page, `${screen}-screen`))!;
        if (opener === 1) expect(scr.right, `${screen}: 1P の 画面は 左半分`).toBeLessThanOrEqual(vw / 2 + 1);
        else expect(scr.left, `${screen}: 2P の 画面は 右半分`).toBeGreaterThanOrEqual(vw / 2 - 1);
        expect(await page.evaluate(() => (window as any).__rikkun.duo.timeScale()), `${screen}: 世界は 止まらない`).toBe(1);
        if (screen !== 'meal') {
          await tid(page, `${screen}-close`).click();
          await stepN(page, 2);
          expect(await screenOpen(page, screen, opener), `${screen}: ✕ で とじる`).toBe(false);
        }
      }
      // 食事の 画面を 開いた まま 妖怪に ねらわれる
      const yPos = { x: spot.player.x + spot.out.x * 2, y: spot.player.y, z: spot.player.z + spot.out.z * 2 };
      await page.evaluate((pos) => {
        const h = (window as any).__rikkun;
        h.time.set(70000);
        h.yokai.spawn('karakasa', pos.x, pos.y, pos.z, { hp: 9999 });
      }, yPos);
      const c0 = await duoPos(page, opener);
      const hp0 = await hpOf(page, opener);
      let hit = false;
      for (let i = 0; i < 60 && !hit; i++) {
        await stepN(page, 20);
        hit = (await hpOf(page, opener)) < hp0;
      }
      expect(hit, '開いて いる 人にも 妖怪の こうげきが 当たる').toBe(true);
      expect(await screenOpen(page, 'meal', opener), '当たっても 画面は とじない').toBe(true);
      expect(near(await duoPos(page, opener), c0), '開いた 人は その場に 止まる').toBeLessThan(1.5);
      await test.info().attach(`meal-hit-${opener}P`, { body: await page.screenshot({ path: `test-shots/town1e-hit-${opener}P.png` }), contentType: 'image/png' });
      // やられたら とじる（当たった あとの 無敵時間 90 ステップを 妖怪を 消して 越える）
      await page.evaluate(() => (window as any).__rikkun.yokai.clear());
      await stepN(page, 120);
      await page.evaluate((w) => (window as any).__rikkun.duo.hurt(w, 999), opener);
      await stepN(page, 10);
      expect(await screenOpen(page, 'meal', opener), 'やられたら 画面が とじる').toBe(false);
    });
  }
});
