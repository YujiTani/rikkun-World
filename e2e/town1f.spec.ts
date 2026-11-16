import { expect, test, type Page } from '@playwright/test';
import { openBal } from './helpers/bal';
import { installFakePads } from './helpers/duoUi';
import { tapE } from './helpers/duoInv';
import { DAMA } from '../src/dama/damaTuning';

/**
 * TOWN-1 区切り 1F（docs/design/TOWN-1.md 1.6 版。§2.3b・§3.4・§4.6・§4.12・§6.1・AC3・AC62〜AC70）の E2E。実装の 前に 書いた 赤の テスト。
 * 【E2E】の 基準: AC3 の 通し（もちもの いっぱいで からかさを たおす）と AC68 の「＋」が 出る 所 まで。
 * ほかに 画面・入口が いる 物だけ（もちものへ 入ろうと した yokai_orb が さいふへ 行く・やられても へらない・もちもの画面の 帯の 数）。
 * 数・「＋」の 長さ・上限・うつしかえ・お店の 計算は ユニット（src/dama/dama.test.ts・src/town/**）。
 *
 * 口（仕様 §6.1）: `dama.count(p)`・`dama.give(p, n)` → { added, over }・`dama.max()`・`dama.hud(p)`・`dama.invChip(p)`。
 * ★ まだ ない 口（実装で 足す。仕様 §6.1 の「地面の 落とし物は 今の 落とし物の フック」は 今の コードに 見つからない ため、
 *    テストが 頼る 形を ここで 決めた）: `window.__rikkun.drops.list()` → { item, count, x, y, z }[]（地面の 落とし物ぜんぶ）・
 *    `window.__rikkun.drops.place(at: {x,y,z}, stacks: {item,count}[])`（足もとの 落とし物を 置く。DropField.scatter と 同じ）。
 * 時間（ms）では 合否を 決めない（#255）。進めるのは step の 数。
 */

const stepN = (page: Page, n: number) => page.evaluate((n) => (window as any).__rikkun.step(n), n);
const dama = (page: Page, p: 1 | 2): Promise<number | null> => page.evaluate((p) => (window as any).__rikkun.dama.count(p) as number | null, p);
const hud = (page: Page, p: 1 | 2) =>
  page.evaluate((p) => (window as any).__rikkun.dama.hud(p) as { shown: boolean; total: number; text: string; plus: number | null; plusText: string | null; left: number } | null, p);

/** 前に 呼んでから とれた 実績（しずかでない 物）の ようかいダマの 合計（表 DAMA.medal から）。呼ぶと 出来事が 空に なる */
const achDama = (page: Page): Promise<number> =>
  page.evaluate((medal) => {
    const h = (window as any).__rikkun;
    const ids = h.achievements.events().filter((e: any) => e.type === 'unlock' && !e.silent).map((e: any) => e.id as string);
    return h.achievements.list().filter((a: any) => ids.includes(a.id)).reduce((s: number, a: any) => s + ((medal as Record<string, number>)[a.medal] as number), 0);
  }, DAMA.medal);

/** 地面の 落とし物の うち ようかいダマの 数（口 drops.list。まだ 無ければ 分かりやすく 落とす） */
async function groundOrbs(page: Page): Promise<number> {
  const r = await page.evaluate(() => {
    const d = (window as any).__rikkun.drops;
    if (typeof d?.list !== 'function') return null;
    return (d.list() as { item: string; count: number }[]).filter((x) => x.item === 'yokai_orb').reduce((s, x) => s + x.count, 0);
  });
  expect(r, 'window.__rikkun.drops.list()（1F の テスト用 口。この ファイルの 頭）が まだ ない').not.toBeNull();
  return r as number;
}

/** もちものを 全部 ほかの 物（dirt）で うめる。マスの 数は ゲームに 聞く */
const fillInventory = (page: Page) =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    const n = h.inventory.get().slots.length as number;
    for (let i = 0; i < n; i++) h.inventory.setSlot(i, { item: 'dirt', count: 1 });
  });
const invJson = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__rikkun.inventory.get().slots));

test.describe('TOWN-1 1F ようかいダマの さいふ', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC3（1.6）・AC68: もちものが いっぱいで からかさを たおす → さいふが 1〜3 ふえ・もちものは かわらず・足もとに ダマなし・「＋」が 出る', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      T.base();
      h.yokai.spawn('karakasa', 14.5, 9, 6.5, { ai: false, hp: 9999 });
    });
    await fillInventory(page);
    const inv0 = await invJson(page);
    await achDama(page); // 出来事を 空に する
    const before = (await dama(page, 1))!;
    expect((await hud(page, 1))!.plus, 'はじめは「＋」なし').toBeNull();
    await page.evaluate(() => {
      const T = (window as any).T;
      const h = (window as any).__rikkun;
      const id = h.yokai.list()[0].id as number;
      const y = T.one(id);
      T.place(y.position.x - 1.5, y.position.y, y.position.z);
      h.yokai.setHp(id, 1);
      T.faceTo(id, 1.5);
      for (let n = 0; n < 6 && T.one(id); n++) T.punch();
    });
    await stepN(page, 10); // 倒した 直後（「＋」が 消える 前）に 読む
    const ach = await achDama(page);
    const gain = (await dama(page, 1))! - before;
    expect(gain - ach, '妖怪の 分は 1〜3（実績の 分を ひく）').toBeGreaterThanOrEqual(DAMA.normal.min);
    expect(gain - ach, '妖怪の 分は 1〜3（実績の 分を ひく）').toBeLessThanOrEqual(DAMA.normal.max);
    expect(await invJson(page), 'もちものは 1 マスも かわらない（ようかいダマも 入らない）').toBe(inv0);
    expect(await groundOrbs(page), '足もとに 落ちない').toBe(0);
    const h = (await hud(page, 1))!;
    expect(h.shown).toBe(true);
    expect(h.text).toBe((await dama(page, 1))!.toLocaleString('en-US'));
    expect(h.plus, '「＋」＝ ふえた 数').toBe(gain);
    expect(h.plusText).toBe('+' + gain.toLocaleString('en-US'));
  });

  test('AC68: give → 「＋」が 出て、のこりの ステップが すぎると きえる（数は のこる）。こうかんで へる 時は 「＋」なし', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => (window as any).T.base());
    const r = await page.evaluate(() => (window as any).__rikkun.dama.give(1, 5) as { added: number; over: number });
    expect(r).toEqual({ added: 5, over: 0 });
    const h0 = (await hud(page, 1))!;
    expect(h0).toMatchObject({ plus: 5, plusText: '+5', text: '5' });
    expect(h0.left, '表（§4.12）の 長さ').toBeGreaterThan(1);
    await stepN(page, h0.left - 1);
    expect((await hud(page, 1))!.plus, 'のこり 1 ステップ まで 出る').toBe(5);
    await stepN(page, 1);
    expect(await hud(page, 1)).toMatchObject({ shown: true, plus: null, plusText: null, left: 0, text: '5' });
  });

  test('AC62: もちものへ yokai_orb を 入れようと すると さいふへ（マスには 入らない）。やられても さいふは へらず おとしもの ぶくろに ダマなし', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => (window as any).T.base());
    await fillInventory(page);
    const inv0 = await invJson(page);
    await page.evaluate(() => (window as any).__rikkun.inventory.add('yokai_orb', 5));
    await page.evaluate(() => (window as any).__rikkun.dama.give(1, 45));
    const ach = await achDama(page); // 実績（やられた など）の ダマが 入る ことが ある
    const base = 50 + ach;
    expect(await dama(page, 1), 'add（5）＋ give（45）').toBe(base);
    expect(await invJson(page), 'マスには 入らない').toBe(inv0);
    await page.evaluate(() => (window as any).__rikkun.combat.damage(20));
    await stepN(page, 200);
    const ach2 = await achDama(page); // やられて はじめて とれる 実績（death.all.1）の 分
    expect(await dama(page, 1), 'やられても へらない（実績の 分は ふえる）').toBe(base + ach2);
    const bags = await page.evaluate(() => (window as any).__rikkun.combat.bags() as { slots: { item: string }[] }[]);
    expect(bags.length, 'おとしもの ぶくろは ある（ほかの 物）').toBeGreaterThan(0);
    expect(bags.some((b) => b.slots.some((s) => s.item === 'yokai_orb')), 'ぶくろに ようかいダマは 入らない').toBe(false);
    expect(await groundOrbs(page)).toBe(0);
  });

  test('AC65: 足もとの yokai_orb を ひろう → さいふ ＋4（もちものは いっぱいの まま かわらない）', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => (window as any).T.base());
    await fillInventory(page);
    const inv0 = await invJson(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      h.drops.place({ x: p.x, y: p.y, z: p.z }, [{ item: 'yokai_orb', count: 4 }]);
    });
    await stepN(page, 120);
    expect(await dama(page, 1), 'ひろって さいふへ').toBe(4);
    expect(await groundOrbs(page), '落とし物は きえた').toBe(0);
    expect(await invJson(page)).toBe(inv0);
  });

  test('AC69・AC70: もちもの画面を 開くと すみの 札は かくれ、invChip が 出る（1 人は「ようかいダマ 1,234」）。とじると もどる', async ({ page }) => {
    await openBal(page);
    await page.evaluate(() => (window as any).T.base());
    await page.evaluate(() => (window as any).__rikkun.dama.give(1, 1234));
    expect(await page.evaluate(() => (window as any).__rikkun.dama.invChip(1)), '開いて いない とき null').toBeNull();
    await tapE(page);
    const chip = await page.evaluate(() => (window as any).__rikkun.dama.invChip(1) as { text: string; count: number } | null);
    expect(chip).toEqual({ text: 'ようかいダマ 1,234', count: 1234 });
    expect((await hud(page, 1))!.shown, '開いて いる 間は すみの 札は かくれる').toBe(false);
    await tapE(page);
    expect((await hud(page, 1))!.shown).toBe(true);
  });
});

test.describe('TOWN-1 1F 2 人あそび', () => {
  test.describe.configure({ timeout: 200_000 });

  test('AC68・AC70: 2 人で give(1, 5) → 2P の「＋」は なし。1P だけ もちもの画面を 開く → 1P の 札だけ かくれる・invChip は 数だけ', async ({ page }) => {
    await openBal(page, '?nosave=1&duo=dev');
    await page.evaluate(() => (window as any).T.base());
    await installFakePads(page, 2);
    expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
    await stepN(page, 30);
    await page.evaluate(() => (window as any).__rikkun.dama.give(1, 5));
    expect((await hud(page, 1))!.plus).toBe(5);
    expect((await hud(page, 2))!.plus, '2P の 札に 1P の「＋」は 出ない').toBeNull();
    await tapE(page);
    expect((await hud(page, 1))!.shown).toBe(false);
    expect((await hud(page, 2))!.shown).toBe(true);
    const chip = await page.evaluate(() => (window as any).__rikkun.dama.invChip(1) as { text: string; count: number } | null);
    expect(chip, '2 人の ときは 数 だけ（字「ようかいダマ」は はぶく）').toEqual({ text: '5', count: 5 });
    expect(await page.evaluate(() => (window as any).__rikkun.dama.invChip(2)), '2P は 開いて いない').toBeNull();
  });
  test('AC65: 2P の 足もとの yokai_orb は 2P が ＋4（1P は かわらない。もちものに 入らない）', async ({ page }) => {
    await openBal(page, '?nosave=1&duo=dev');
    await page.evaluate(() => (window as any).T.base());
    await installFakePads(page, 2);
    expect(await page.evaluate(() => (window as any).__rikkun.duo.join())).toBe(true);
    await stepN(page, 30);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(1);
      h.duo.place(2, { x: p.x + 8, y: p.y, z: p.z });
    });
    await stepN(page, 30);
    const apart = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const a = h.duo.pos(1);
      const b = h.duo.pos(2);
      return Math.hypot(a.x - b.x, a.z - b.z);
    });
    expect(apart, '1P と 2P が 重なって いると どちらが ひろうか 決まらない').toBeGreaterThan(3);
    const inv2 = await page.evaluate(() => JSON.stringify((window as any).__rikkun.duo.inv(2)));
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.duo.pos(2);
      h.drops.place({ x: p.x, y: p.y, z: p.z }, [{ item: 'yokai_orb', count: 4 }]);
    });
    await stepN(page, 120);
    expect(await dama(page, 2)).toBe(4);
    expect(await dama(page, 1), '1P は かわらない').toBe(0);
    expect(await groundOrbs(page)).toBe(0);
    expect(await page.evaluate(() => JSON.stringify((window as any).__rikkun.duo.inv(2)))).toBe(inv2);
  });
});
