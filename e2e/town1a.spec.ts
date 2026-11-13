import { expect, test, type Page } from '@playwright/test';
import { openBal } from './helpers/bal';
import { installFakePads, setFakePad } from './helpers/duoUi';

/**
 * TOWN-1 区切り 1A（docs/design/TOWN-1.md §2.3・§2.4・§4.1・§6.1・§6.2 の AC1・AC2・AC4・AC28）の E2E。実装の 前に 書いた 赤の テスト。
 * 口（仕様 §6.1）: `dama.count(p)`・`dama.give(p, n)`（p ＝ 1 | 2。まだ 無い。実装で `window.__rikkun.dama` に 置く）。
 * 数は 決め打ちせず ゲームに 聞く。ただし ダマの 数の 表（§4.1）は まだ コードに 無いので、実績の メダルごとの 数だけ
 * このファイルの 先頭の `ACH_DAMA` 1 か所に 書く（実装で 表の 置き場が 決まったら、ここを その 表の import に 置きかえる）。
 * 進めるのは step の 数。時間（ms）では 合否を 決めない（#255）。
 * ユニットに 回した 物（AC3 いっぱいの とき・AC5 あずかり・AC6 宝箱・AC50 文）は src/**\/*.test.ts（developer が 書く）。
 * 見た目（おめでとう画面の「もらった 数」・図鑑の 文）は UI 検査と オーナー確認。
 */

/** 実績の メダルごとの ようかいダマ（仕様 §4.1 の PO 案の 値。表の 1 か所へ 置きかえる 前の 写し） */
const ACH_DAMA: Record<string, number> = { bronze: 2, silver: 5, gold: 10, rainbow: 20 };
const PAD_R2 = 7;

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const dama = (page: Page, p: 1 | 2): Promise<number | null> => page.evaluate((p) => (window as any).__rikkun.dama.count(p) as number | null, p);

/** 石の ゆかを しいて 妖怪を 1 ひき 置く（うごかない）。id を 返す。1P は ゆかの 西はし（妖怪から とおい） */
async function setupFloor(page: Page, kind: string, opts: Record<string, unknown> = {}): Promise<number> {
  return page.evaluate(
    ({ kind, opts }) => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      return h.yokai.spawn(kind, 14.5, 9, 6.5, { ai: false, hp: 9999, ...opts }) as number;
    },
    { kind, opts },
  );
}

test.describe('TOWN-1 1A ようかいダマ', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC1: からかさを 1P が たおすと dama.count(1) が 1 以上 3 以下 ふえる（場所の 倍率 M ＝ 3 でも 同じ）', async ({ page }) => {
    await openBal(page);
    for (const m of [1, 3]) {
      const id = await setupFloor(page, 'karakasa', { m });
      const r = await page.evaluate(
        (id) => {
          const h = (window as any).__rikkun;
          const T = (window as any).T;
          const before = h.dama.count(1) as number;
          const y = T.one(id);
          T.place(y.position.x - 1.5, y.position.y, y.position.z);
          h.yokai.setHp(id, 1);
          T.faceTo(id, 1.5);
          for (let n = 0; n < 6 && T.one(id); n++) T.punch();
          return { before, after: h.dama.count(1) as number, gone: !T.one(id) };
        },
        id,
      );
      await stepN(page, 120); // きえるまで・すいこまれるまで
      const after = await dama(page, 1);
      expect(r.gone, `M=${m}: たおした`).toBe(true);
      expect(after! - r.before, `M=${m}: ふえた 数は 1〜3`).toBeGreaterThanOrEqual(1);
      expect(after! - r.before, `M=${m}: ふえた 数は 1〜3`).toBeLessThanOrEqual(3);
    }
  });

  test('AC4: 実績を とると メダルごとの 数が 1P に ふえる。しずかに とる（reset）は 0', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.reset(); // しずかに とる 実績だけ（はじまりの はらっぱ）
      h.achievements.events();
    });
    expect(await dama(page, 1), 'しずかに とった 実績は +0').toBe(0);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.record('break:dirt', 100); // どう（1）・ぎん（10）・きん（100）が いっぺんに
      h.step(10);
      const ids = h.achievements.events().filter((e: any) => e.type === 'unlock' && !e.silent).map((e: any) => e.id as string);
      const medals = h.achievements.list().filter((a: any) => ids.includes(a.id)).map((a: any) => a.medal as string);
      return { medals, count: h.dama.count(1) as number };
    });
    expect(r.medals.length, '3 だん とれた').toBeGreaterThanOrEqual(3);
    expect(r.count, '合計 ＝ メダルごとの 数の 和').toBe(r.medals.reduce((s: number, m: string) => s + ACH_DAMA[m]!, 0));
  });
});

test.describe('TOWN-1 1A 2 人あそび', () => {
  test.describe.configure({ timeout: 240_000 });

  async function openDuo(page: Page): Promise<void> {
    await openBal(page, '?nosave=1&duo=dev');
    await page.evaluate(() => (window as any).T.base());
    await installFakePads(page, 2);
    expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
    await stepN(page, 30);
  }

  /** 1P を 妖怪から とおくへ（2P の 刀も 1P の ぱんちも とどかない） */
  const park1P = (page: Page) => page.evaluate(() => (window as any).T.place(2.5, 9, 6.5));

  /** 2P の 刀で 1 回 ふる（妖怪の 手前 1.5 マスに 立って ねらう）。ふる たびに おきなおす */
  async function swing2P(page: Page, id: number): Promise<void> {
    await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      const y = h.yokai.list().find((q: any) => q.id === id);
      if (!y) return;
      h.duo.place(2, { x: y.position.x - 1.5, y: y.position.y, z: y.position.z });
      h.duo.aimAt(2, { x: Math.floor(y.position.x), y: Math.floor(y.position.y + 0.5), z: Math.floor(y.position.z) });
    }, id);
    await setFakePad(page, 1, { buttons: [PAD_R2] });
    await stepN(page, 3);
    await setFakePad(page, 1, {});
    await stepN(page, 40);
  }
  const alive = (page: Page, id: number) => page.evaluate((id) => (window as any).__rikkun.yokai.list().some((q: any) => q.id === id), id);

  test('AC2: 2 人とも 当てた 妖怪を たおすと 2 人とも 同じ 数（1 以上 3 以下）。1P だけ 当てた とき 2P は 0・2P だけ 当てた とき 1P は 0', async ({ page }) => {
    await openDuo(page);
    const base = [await dama(page, 1), await dama(page, 2)];
    expect(base, 'はじめは 2 人とも 0').toEqual([0, 0]);

    // ---- 2 人とも 当てる: 1P が ぱんちで 1 回 → 2P の 刀で とどめ
    let id = await setupFloor(page, 'karakasa');
    await page.evaluate((id) => {
      const T = (window as any).T;
      const y = T.one(id);
      T.place(y.position.x - 1.5, y.position.y, y.position.z);
      T.faceTo(id, 1.5);
      T.punch(); // 体力 9999 なので たおれない。1P は 当てた
    }, id);
    await park1P(page);
    await page.evaluate(() => (window as any).__rikkun.duo.give(2, 'katana', 1));
    await page.evaluate((id) => (window as any).__rikkun.yokai.setHp(id, 1), id);
    for (let k = 0; k < 8 && (await alive(page, id)); k++) await swing2P(page, id);
    await stepN(page, 120);
    expect(await alive(page, id), '2P が たおした').toBe(false);
    const both = [await dama(page, 1), await dama(page, 2)];
    expect(both[0], '2 人 同じ 数').toBe(both[1]);
    expect(both[0]!, '1 以上').toBeGreaterThanOrEqual(1);
    expect(both[0]!, '3 以下').toBeLessThanOrEqual(3);

    // ---- 2P だけ 当てる: 1P は ふえない
    id = await setupFloor(page, 'karakasa');
    await park1P(page);
    await page.evaluate((id) => (window as any).__rikkun.yokai.setHp(id, 1), id);
    for (let k = 0; k < 8 && (await alive(page, id)); k++) await swing2P(page, id);
    await stepN(page, 120);
    expect(await alive(page, id), '2P が たおした').toBe(false);
    expect(await dama(page, 1), '1P は 当てて いない → ふえない').toBe(both[0]);
    expect((await dama(page, 2))! - both[1]!, '2P は ふえる').toBeGreaterThanOrEqual(1);
  });

  test('AC4: 2P が 参加中に 実績を とると 2 人とも 同じ 数 ふえる', async ({ page }) => {
    await openDuo(page);
    await page.evaluate(() => (window as any).__rikkun.achievements.events());
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.record('break:dirt', 10); // どう・ぎん
      h.step(10);
      const ids = h.achievements.events().filter((e: any) => e.type === 'unlock' && !e.silent).map((e: any) => e.id as string);
      const medals = h.achievements.list().filter((a: any) => ids.includes(a.id)).map((a: any) => a.medal as string);
      return { medals, p1: h.dama.count(1) as number, p2: h.dama.count(2) as number };
    });
    const want = r.medals.reduce((s: number, m: string) => s + ACH_DAMA[m]!, 0);
    expect(r.medals.length).toBeGreaterThanOrEqual(2);
    expect(r.p1, '1P').toBe(want);
    expect(r.p2, '2P も 同じ').toBe(want);
  });

  test('AC28: ようかいダマは 1P・2P とも セーブして 開きなおすと 同じ', async ({ page }) => {
    await page.goto('/?reset=1&seed=7&duo=dev');
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
    await installFakePads(page, 2);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(true);
      h.duo.join();
      h.step(30);
      h.dama.give(1, 7);
      h.dama.give(2, 5);
      h.step(5);
    });
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await page.goto('/?seed=7&duo=dev'); // ?nosave=1 を つけない
    await page.waitForFunction(() => (window as any).__rikkun?.ready === true);
    await installFakePads(page, 2);
    expect(await dama(page, 1), '1P').toBe(7);
    await page.evaluate(() => (window as any).__rikkun.duo.join());
    await stepN(page, 30);
    expect(await dama(page, 2), '2P').toBe(5);
  });
});
