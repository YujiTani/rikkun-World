import { test, expect, type Page } from '@playwright/test';
import { legendWorld, spawnNushiAhead, tapUntil, markLegend } from './helpers/legend';
import { holdItems, openBladeWorld, runTech, settle, spawnAhead, stage, takeKatana } from './helpers/blade';
import { calmDown, hpOf, parryAtF, parryEvents, parryWorld, place, playerPos, probeHit } from './helpers/parry';
import { ITEM_TYPES } from '../src/inventory/items';
import { withRuby } from '../src/ui/text';

/**
 * SAMURAI-1（#300）E2E: AC20（通し・ヌシ → 侍装備の 袋）・AC21（つなぎ・力: 陣笠 / 羽織 / 下駄）＋ 手甲の つなぎ（AC10 の 実際の ゲームでの 確かめ）。
 * 仕様: docs/design/SAMURAI-1.md。時間（ms）では 合否を 決めず、window.__rikkun の コマ送りと 窓口で 見る。数は ゲームに 聞く。
 * 窓口（NINJA-1 と 同じ 形）: `ninja.tune`（調整表の 上書き）・`samurai.book`（侍帳 `{ got(), set(items) }`）・`armor.set` / `parry.events` / `combat.sounds()`（`getaStep`）/ `ui.topBand` / `achievements.list`。
 * AC22（画面）は UI 検査（npm run check:ui の samurai1-*）、AC23・AC24 は オーナー確認 なので ここでは 見ない。
 */
test.describe.configure({ timeout: 300_000 });

const SAMURAI = ['samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta'];
const plain = (name: string) => withRuby(name).replace(/<[^>]*>/g, '');
const nameOf = (id: string) => ITEM_TYPES.find((t) => t.id === id)!.name;

// ---------------------------------------------------------------- AC20 通し（ヌシ）
/** 袋の 上に 立って ひろう */
async function pickUp(page: Page, item: string): Promise<number> {
  return page.evaluate((item) => {
    const h = (window as any).__rikkun, gt = (window as any).__gt;
    for (let i = 0; i < 900; i++) {
      const bag = (h.combat.bags() as { slots: { item: string }[]; position: { x: number; y: number; z: number }; pickupDelay: number }[]).find((b) => b.slots.some((s) => s.item === item));
      if (!bag) break;
      if (bag.pickupDelay <= 0) h.player.set({ position: { ...bag.position }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      gt?.heal?.();
      if (h.inventory.count(item) > 0) break;
    }
    return h.inventory.count(item) as number;
  }, item);
}

/** ヌシを 出して たおす。侍装備の drop が 出た ステップの 帯（telop）と、出た 袋（rarity）を 返す */
async function killNushi(page: Page) {
  await spawnNushiAhead(page, 1.5, 1);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.achievements.mute(false);
    h.step(190); // 「あらわれた」が おわるまで
    h.yokai.events();
    h.combat.sounds();
  });
  const r = await tapUntil(
    page,
    `(h) => { const ev = h.yokai.events(); const d = ev.find((e) => e.type === 'drop' && ${JSON.stringify(SAMURAI)}.includes(e.item)); return d ? { item: d.item, band: h.ui.topBand(), sounds: [...h.combat.sounds()] } : null; }`,
  );
  expect(r.found, 'ヌシから 侍装備が 出る').toBe(true);
  const text = await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.step(3);
    return (document.querySelector('[data-band="telop"]')?.textContent ?? '').trim();
  });
  const bag = await page.evaluate((item) => {
    const b = ((window as any).__rikkun.combat.bags() as { slots: { item: string; count: number }[]; rarity: string }[]).filter((x) => x.slots.some((s) => s.item === item));
    return { n: b.length, rarity: b[0]?.rarity as string, count: b[0]?.slots[0]?.count as number };
  }, r.value.item as string);
  return { item: r.value.item as string, band: r.value.band as { kind: string | null; item: string | null; source?: string }, sounds: r.value.sounds as string[], text, bag };
}

test.describe('AC20 通し: ヌシ → 侍装備の 袋', () => {
  test('表を 侍装備だけに して ヌシを たおす → 侍装備 1 つが 袋（legendary）・テロップ「ヌシ が 〜 を おとした！」・ひろうと 実績 samurai.first.1。2 回目は 別の 侍装備', async ({ page }) => {
    await legendWorld(page, 'katana');
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.evaluate((rows) => {
      const h = (window as any).__rikkun;
      h.settings.set('nushiDrops', rows);
      h.samurai.book.set([]);
      h.step(1);
    }, SAMURAI.map((item) => ({ item, weight: 1 })));
    const before = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { first: h.achievements.list().find((a: any) => a.id === 'samurai.first.1')?.unlocked as boolean | undefined, kinds: (h.achievements.stats()['samuraiKinds'] ?? 0) as number };
    });
    expect(before.first, 'samurai.first.1 が 実績の 表に ある').toBe(false);
    expect(before.kinds).toBe(0);

    const a = await killNushi(page);
    expect(SAMURAI).toContain(a.item);
    expect(a.bag.n, '侍装備の 袋は 1 つ').toBe(1);
    expect(a.bag.count).toBe(1);
    expect(a.bag.rarity).toBe('legendary');
    expect(a.band.kind).toBe('telop');
    expect(a.band.item).toBe(a.item);
    expect(a.text.startsWith('ヌシ が'), a.text).toBe(true);
    expect(a.text).toContain(plain(nameOf(a.item)));
    expect(a.sounds).toContain('legendDrop');

    // ひろう → 実績・侍帳
    expect(await pickUp(page, a.item), 'ひろって もちものに 入った').toBeGreaterThan(0);
    const got = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.flush();
      h.step(2);
      return { first: h.achievements.list().find((x: any) => x.id === 'samurai.first.1')?.unlocked as boolean, kinds: h.achievements.stats()['samuraiKinds'] as number, legend: (h.achievements.stats()['legendKinds'] ?? 0) as number, ninja: (h.achievements.stats()['ninjaKinds'] ?? 0) as number, book: h.samurai.book.got() as string[] };
    });
    expect(got.first).toBe(true);
    expect(got.kinds).toBe(1);
    expect(got.legend, '侍装備は legend.kinds に 入れない').toBe(0);
    expect(got.ninja, '忍者の 実績は かわらない').toBe(0);
    expect(got.book).toEqual([a.item]);

    // もう 1 回 たおす → 別の 侍装備（まだの 物から）
    await page.evaluate(() => { const h = (window as any).__rikkun; h.input.releaseAll(); h.step(120); });
    await stage(page);
    await markLegend(page);
    await page.evaluate((rows) => (window as any).__rikkun.settings.set('nushiDrops', rows), SAMURAI.map((item) => ({ item, weight: 1 })));
    // 1 回目の 拾いの 実績の 通知が 閉じる（帯が あくまで）待つ。時間では なく ゲームに 聞く（開いている 間は テロップが 後ろに 並ぶ）
    const drained = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      for (let i = 0; i < 3000; i++) {
        const t = h.ui.topBand();
        if (t.kind === null && t.queue.length === 0) return true;
        h.step(1);
      }
      return false;
    });
    expect(drained, '実績の 通知が 閉じた').toBe(true);
    const b = await killNushi(page);
    expect(b.item, '別の 侍装備').not.toBe(a.item);
    expect(SAMURAI).toContain(b.item);
    expect(b.band.item).toBe(b.item);
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC21 つなぎ・力
const wear = (page: Page, slot: 'head' | 'body' | 'arms' | 'legs' | null, item?: string) =>
  page.evaluate(({ slot, item }) => {
    const h = (window as any).__rikkun;
    h.armor.set(slot === 'head' ? item : null, slot === 'body' ? item : null, slot === 'arms' ? item : null, slot === 'legs' ? item : null);
    h.step(1);
  }, { slot, item });

test.describe('AC21 つなぎ・力', () => {
  test('陣笠: かたなを 持って、からかさの 攻撃が 当たる 25 ステップ 前に パリィ → 成功（陣笠が ないと おしい）', async ({ page }) => {
    await parryWorld(page);
    const hit = await probeHit(page, 'karakasa', 1.5);
    expect(hit).toBeGreaterThan(0);
    // 当たる 25 ステップ前に 押す → 当たる ときの F = 26（受けは F3〜32 まで 陣笠。陣笠 なしは F21〜32 が おしい）
    const F = 26;
    const result: Record<string, string> = {};
    for (const jingasa of [false, true]) {
      await calmDown(page);
      await stage(page);
      await page.evaluate(() => { const h = (window as any).__rikkun; h.combat.setHp(h.combat.get().maxHp); });
      await wear(page, jingasa ? 'head' : null, 'samurai_jingasa');
      const id = await place(page, 'karakasa', 1.5);
      const hp0 = await hpOf(page);
      await parryAtF(page, id, hit, F);
      const ev = await parryEvents(page);
      const kinds = ev.filter((e) => ['parrySuccess', 'parryEarly', 'parryFail'].includes(e.type));
      expect(kinds, `陣笠 ${jingasa} の 当たり`).toHaveLength(1);
      expect(kinds[0]!.frame, '当たった F').toBe(F);
      result[String(jingasa)] = kinds[0]!.type;
      if (jingasa) expect(await hpOf(page), '成功は ダメージ 0').toBe(hp0);
      else expect(await hpOf(page), 'おしいは 半分').toBeLessThan(hp0);
    }
    expect(result['false']).toBe('parryEarly');
    expect(result['true']).toBe('parrySuccess');
  });

  test('羽織: からかさに 当たる → 横に 動いた のが 0.8 より 小さい（羽織なしは それより ずっと 大きい）', async ({ page }) => {
    await parryWorld(page);
    const hit = await probeHit(page, 'karakasa', 1.5);
    const moved: Record<string, number> = {};
    for (const haori of [false, true]) {
      await calmDown(page);
      await stage(page);
      await page.evaluate(() => { const h = (window as any).__rikkun; h.combat.setHp(h.combat.get().maxHp); });
      await wear(page, haori ? 'body' : null, 'samurai_haori');
      await page.evaluate(() => { const h = (window as any).__rikkun; h.inventory.clear(); h.inventory.select(0); h.step(1); }); // 刀を 持たない（パリィしない）
      const id = await place(page, 'karakasa', 1.5);
      const p0 = await playerPos(page);
      await page.evaluate(({ id, hit }) => {
        const h = (window as any).__rikkun;
        h.yokai.attackNow(id);
        h.step(hit + 20); // 当たって 押しが おわるまで
      }, { id, hit });
      const p1 = await playerPos(page);
      moved[String(haori)] = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      expect(await hpOf(page), `羽織 ${haori}: 当たった`).toBeLessThan(20);
    }
    expect(moved['false'], '羽織なしは 押される').toBeGreaterThan(1.0);
    expect(moved['true'], '羽織で とばされにくい').toBeLessThan(0.8);
  });

  test('下駄: 平らな 所を 135 ステップ 走る → getaStep ちょうど 4 回（30 ステップごと）。歩くと 0 回', async ({ page }) => {
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    await stage(page, { z: 41.5, floorY }); // 北へ 走って も 平らな 所に とどまる ように 南の はしから
    const run = (geta: boolean, running: boolean, steps: number) =>
      page.evaluate(({ geta, running, steps }) => {
        const h = (window as any).__rikkun;
        h.armor.set(null, null, null, geta ? 'samurai_geta' : null);
        h.input.releaseAll();
        h.step(10);
        h.combat.sounds();
        if (running) h.input.press('run');
        h.input.press('moveForward');
        const at: number[] = [];
        let grounded = true;
        for (let i = 1; i <= steps; i++) {
          h.step(1);
          grounded = grounded && h.player.get().onGround;
          if ((h.combat.sounds() as string[]).includes('getaStep')) at.push(i);
        }
        h.input.releaseAll();
        h.step(30);
        return { at, grounded };
      }, { geta, running, steps });
    const r = await run(true, true, 135);
    expect(r.grounded, '走っている あいだ ずっと 地面').toBe(true);
    expect(r.at, `鳴った ステップ ${r.at}`).toHaveLength(4);
    expect(r.at[0]!, '1 歩目').toBeGreaterThanOrEqual(30);
    expect(r.at[0]!, '1 歩目').toBeLessThanOrEqual(32);
    for (let i = 1; i < r.at.length; i++) expect(r.at[i]! - r.at[i - 1]!, '間は 30 ステップ').toBe(30);
    await stage(page, { z: 41.5, floorY });
    const w = await run(true, false, 135);
    expect(w.at, '歩く（Shift なし）と 0 回').toEqual([]);
    await stage(page, { z: 41.5, floorY });
    const n = await run(false, true, 135);
    expect(n.at, '下駄 なしは 0 回').toEqual([]);
  });

  test('手甲: かたなの けさぎり → 手甲なしで 4 × 2.5、手甲で その 1.5 倍（体力の へりを ゲームに 聞く）', async ({ page }) => {
    await openBladeWorld(page);
    await takeKatana(page, 'jodan');
    const { floorY } = await stage(page);
    const dealt: Record<string, number> = {};
    for (const tekko of [false, true]) {
      await settle(page);
      await stage(page, { floorY });
      await wear(page, tekko ? 'arms' : null, 'samurai_tekko');
      await holdItems(page, [{ item: 'katana' }]);
      const id = await spawnAhead(page, 'karakasa', 1.5, { hp: 400 });
      const hp0 = await page.evaluate((id) => (window as any).__rikkun.yokai.list().find((y: any) => y.id === id).hp as number, id);
      const steps = await runTech(page, 60);
      const hits = steps.flatMap((s) => s.events).filter((e) => e.type === 'techHit');
      expect(hits, `手甲 ${tekko}: けさぎりが 1 回 当たる`).toHaveLength(1);
      const hp1 = await page.evaluate((id) => (window as any).__rikkun.yokai.list().find((y: any) => y.id === id).hp as number, id);
      dealt[String(tekko)] = hp0 - hp1;
      expect(hits[0]!.damage, '出来事の ダメージ = へった 体力').toBeCloseTo(hp0 - hp1, 6);
    }
    const mul = await page.evaluate(() => (window as any).__rikkun.ninja.tune.tekkoBladeMul as number);
    expect(mul).toBe(1.5);
    expect(dealt['true']!).toBeCloseTo(dealt['false']! * mul, 2);
    expect(dealt['false']!, '手甲なしの けさぎりは 強さ × 倍率').toBeGreaterThan(0);
  });

  test('手甲の 対象外: 素手の パンチは 手甲でも 同じ ダメージ', async ({ page }) => {
    expect(ITEM_TYPES.some((t) => t.id === 'samurai_tekko'), '明珍手甲が もちものの 表に ある').toBe(true);
    await openBladeWorld(page);
    const { floorY } = await stage(page);
    const dealt: Record<string, number> = {};
    for (const tekko of [false, true]) {
      await stage(page, { floorY });
      await wear(page, tekko ? 'arms' : null, 'samurai_tekko');
      await page.evaluate(() => { const h = (window as any).__rikkun; h.inventory.clear(); h.inventory.select(0); h.step(1); });
      const id = await spawnAhead(page, 'karakasa', 1.2, { hp: 400 });
      const hp0 = await page.evaluate((id) => (window as any).__rikkun.yokai.list().find((y: any) => y.id === id).hp as number, id);
      const hp1 = await page.evaluate((id) => {
        const h = (window as any).__rikkun;
        h.combat.events();
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        for (let i = 0; i < 40; i++) {
          h.step(1);
          if ((h.combat.events() as any[]).some((e) => e.type === 'punchHit')) break;
        }
        return h.yokai.list().find((y: any) => y.id === id).hp as number;
      }, id);
      dealt[String(tekko)] = hp0 - hp1;
    }
    expect(dealt['false']!, 'パンチが 当たる').toBeGreaterThan(0);
    expect(dealt['true']).toBe(dealt['false']);
  });
});
