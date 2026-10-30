import { expect, test, type Page } from '@playwright/test';
import { aimAtYokaiInWater } from './helpers/aim';

/**
 * TAKO-1（docs/design/TAKO-1.md §6）の E2E: AC3・AC13・AC18・AC20。
 * 数・状態だけの確認（AC1・2・4〜12・14〜17・19）は ユニットテスト側（#311）。ここは 画面・入力・描画が いる物と 通しだけ。
 * 図鑑: 今の 図鑑は アイテム用。妖怪用の 窓口が できたら AC3 に 足す（今は 実績・メダルで 見る）。二つ名は ユニット AC1 で 見る（E2E では 見ない）。
 *
 * 開発に お願いする 窓口（新しく 足す物はない。今ある `window.__rikkun` だけで 足りる）:
 *  - `yokai.spawn('tako_hachimaki', x, y, z, { ai: false })`（YokaiKind に 登録表から 入る）。`yokai.list()` の `kind`・`hp`・`state`・`position`
 *  - `yokai.events()` の `defeat`・`drop`（`item: 'sumi'`・`added`）
 *  - `achievements.stats()['defeat:tako_hachimaki']`・`achievements.list()` の 実績 id `defeat.tako_hachimaki`（名前に タコはちまき）
 *  - `craft.list()` に id `fude`（出来る物 fude 1・入れる物 sumi 1 ＋ bamboo 2）・`craft.make('fude')`・`craft.tileClick('fude')`
 * 水の 池は テストが 自分で `world.fill` で 作る（水の マス = 'water'）。
 */

const POOL = { x0: 0, x1: 20, z0: 0, z1: 12, floor: 8, top: 14 }; // 水は y 9〜14（深さ 6）。水面 = y 15 の 面

async function open(page: Page) {
  await page.goto('/?nosave=1');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate((P) => {
    const h = (window as any).__rikkun;
    h.achievements.mute(true);
    h.pause();
    h.lock.simulate(true);
    h.input.releaseAll();
    h.settings.set('yokaiAutoSpawn', false);
    h.settings.set('yokaiWander', false);
    h.yokai.clear();
    h.player.set({ position: { x: 8.5, y: P.floor + 1, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 } }); // 池の そば（遠いと 妖怪が 消える）
    h.world.fill(P.x0, P.floor, P.z0, P.x1, P.floor, P.z1, 'stone');
    h.world.fill(P.x0, P.floor + 1, P.z0, P.x1, h.world.size().y - 1, P.z1, 'air');
    h.world.fill(P.x0, P.floor + 1, P.z0, P.x1, P.top, P.z1, 'water');
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.inventory.clear();
    h.armor.set(null, null, null, null);
    h.time.set(0);
    h.combat.setHp(20);
    h.step(5);
    h.yokai.events();
  }, POOL);
}

const spawnTako = (page: Page) =>
  page.evaluate(() => {
    const h = (window as any).__rikkun;
    // 体の いちばん 上が 水面（y 15）から 2 ブロック 下 に なる あたり（足もとは y 11〜12）
    const id = h.yokai.spawn('tako_hachimaki', 12, 11.5, 6.5, { ai: false, yawDeg: 270 });
    h.step(2);
    return id as number;
  }, undefined);

const info = (page: Page, id: number) => page.evaluate((id) => (window as any).__rikkun.yokai.list().find((e: any) => e.id === id) ?? null, id);

async function swing(page: Page) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.input.press('primary');
    h.step(1);
    h.input.release('primary');
    h.step(29);
    while (h.impact && h.impact.stopLeft() > 0) h.step(1);
  });
}

test.describe('TAKO-1 うみの タコはちまき', () => {
  test('AC13: 水の 中の タコはちまき を、同じ ふかさの りっくんが パンチ・かたなで たたける', async ({ page }) => {
    await open(page);
    const id = await spawnTako(page);
    const t0 = await info(page, id);
    expect(t0?.kind).toBe('tako_hachimaki');

    // パンチ
    expect(await aimAtYokaiInWater(page, id), 'ねらいの 線が 水で 止まらず たこに 当たる（パンチ）').toBe(true);
    await swing(page);
    const afterPunch = await info(page, id);
    expect(afterPunch.hp, 'パンチで 体力が へる').toBeLessThan(t0.hp);

    // かたな（ぼくとう）
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.setSlot(0, { item: 'bokuto', count: 1 });
      h.inventory.select(0);
      h.step(1);
      h.blade.setStance('chudan');
    });
    expect(await aimAtYokaiInWater(page, id), 'ねらいの 線が たこに 当たる（かたな）').toBe(true);
    await swing(page);
    const afterBlade = await info(page, id);
    expect(afterBlade.hp, 'かたなで さらに 体力が へる').toBeLessThan(afterPunch.hp);
  });

  test('AC3: たおすと 経験値・メダル・実績「タコはちまき」が 入る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const id = h.yokai.spawn('tako_hachimaki', 12, 11.5, 6.5, { ai: false, yawDeg: 270 });
      h.step(2);
      h.yokai.setHp(id, 0.5); // 1 回で たおれる
      return { id, lv: h.level.get(), medalsBefore: h.achievements.list().filter((a: any) => a.unlocked).length, stat: h.achievements.stats()['defeat:tako_hachimaki'] ?? 0 };
    });
    expect(await aimAtYokaiInWater(page, r.id)).toBe(true);
    await swing(page);
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(60);
      h.achievements.flush();
      const ev = h.yokai.events();
      const rows = h.achievements.list();
      return {
        defeats: ev.filter((e: any) => e.type === 'defeat'),
        xp: h.level.get(),
        medals: rows.filter((a: any) => a.unlocked).length,
        stat: h.achievements.stats()['defeat:tako_hachimaki'] ?? 0,
        named: rows.filter((a: any) => a.unlocked && /タコはちまき/.test(a.name ?? '')).length,
      };
    });
    expect(after.defeats.length, 'defeat 1 回').toBe(1);
    expect(after.stat, '実績の 数え').toBe(r.stat + 1);
    expect(after.medals, 'メダル（実績）が ふえる').toBeGreaterThan(r.medalsBefore);
    expect(after.named, '「タコはちまき」の 実績が 取れた').toBeGreaterThanOrEqual(1);
    expect(after.xp.xp + after.xp.level * 1e6, '経験値が ふえる').toBeGreaterThan(r.lv.xp + r.lv.level * 1e6);
  });

  test('AC18: 作業台の 画面で ふで の カードを おすと 持ち物に ふで 1・すみ と たけ が へる。たけ 1 では 作れない', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.add('sumi', 1);
      h.inventory.add('bamboo', 1);
      h.input.press('toggleInventory');
      h.input.release('toggleInventory');
      h.step(3);
    });
    const c = (item: string) => page.evaluate((i) => (window as any).__rikkun.inventory.count(i), item);
    const short = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const card = h.craft.list().find((r: any) => r.id === 'fude');
      return { card: card ? { works: card.works, station: card.station } : null, res: h.craft.tileClick('fude'), second: h.craft.tileClick('fude') };
    });
    expect(short.card, 'ふで の カードが ある').toMatchObject({ works: true, station: 'craft' });
    expect(short.second.ok, 'たけ 1 では 作れない').toBe(false);
    expect(await c('fude')).toBe(0);
    expect(await c('sumi')).toBe(1);
    expect(await c('bamboo')).toBe(1);

    await page.evaluate(() => (window as any).__rikkun.inventory.add('bamboo', 1));
    const made = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.craft.hover(null);
      const first = h.craft.ui().selected === 'fude' ? { action: 'keep', ok: true } : h.craft.tileClick('fude');
      const second = h.craft.tileClick('fude'); // えらんだ カードを もう 1 回 → つくる
      h.step(2);
      return { first, second };
    });
    expect(made.second, 'カードを おして つくる').toMatchObject({ action: 'make', ok: true });
    expect(await c('fude')).toBe(1);
    expect(await c('sumi')).toBe(0);
    expect(await c('bamboo')).toBe(0);
  });

  test('AC20: 通し 海の 中の タコはちまき を たおし、すみ を 拾い、たけ 2 と 合わせて ふで を 作る', async ({ page }) => {
    await open(page);
    const id = await spawnTako(page);
    await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      h.yokai.setHp(id, 0.5);
      h.yokai.events();
    }, id);
    expect(await aimAtYokaiInWater(page, id)).toBe(true);
    await swing(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(90);
      const drops = h.yokai.events().filter((e: any) => e.type === 'drop' && e.item === 'sumi');
      return { drops, sumi: h.inventory.count('sumi') };
    });
    expect(r.drops.length, 'すみ の ドロップ 1 回').toBe(1);
    expect(r.sumi, 'すみ 1〜2 こ が 持ち物に 入る').toBeGreaterThanOrEqual(1);
    expect(r.sumi).toBeLessThanOrEqual(2);
    const out = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.inventory.add('bamboo', 2);
      const m = h.craft.make('fude');
      h.step(2);
      return { m, fude: h.inventory.count('fude'), sumi: h.inventory.count('sumi'), bamboo: h.inventory.count('bamboo') };
    });
    expect(out.m.ok).toBe(true);
    expect(out.sumi, 'すみ は 1 こ へる').toBe(r.sumi - 1);
    expect(out.fude).toBe(1);
    expect(out.bamboo).toBe(0);
  });
});
