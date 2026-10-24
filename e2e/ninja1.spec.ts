import { test, expect, type Page } from '@playwright/test';
import { openGasha, installGirlTools, setupBoss } from './helpers/gasha';
import { openBladeWorld, stage, spawnAhead } from './helpers/blade';
import { ITEM_TYPES } from '../src/inventory/items';
import { withRuby } from '../src/ui/text';

/**
 * NINJA-1（#299）E2E: AC20（通し・がしゃどくろ）・AC21（つなぎ・力）。仕様: docs/design/NINJA-1.md。
 * 時間（ms）では 合否を 決めず、window.__rikkun の コマ送りと 窓口で 見る。数は ゲームに 聞く。
 * 窓口: armor.set / yokai.spawn・list（state）/ combat.events（kodachiHit）/ combat.bags / ui.topBand / achievements.list / inventory.count。
 * AC22（画面）・AC25 の 見た目は UI 検査（npm run check:ui）、AC23・AC24 は オーナー確認 なので ここでは 見ない。
 */
test.describe.configure({ timeout: 300_000 });

const NINJA = ['ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'];
const plain = (name: string) => withRuby(name).replace(/<[^>]*>/g, '');
const nameOf = (id: string) => ITEM_TYPES.find((t) => t.id === id)!.name;

// ---------------------------------------------------------------- AC20 通し（がしゃどくろ）
const untilPhase = (page: Page, phase: string, max = 1500) =>
  page.evaluate(({ phase, max }) => { const w = window as any, gt = w.__gt; return gt.until(() => w.__gashaBig.finishInfo().phase === phase, max, () => gt.heal()) as number; }, { phase, max });

/** がしゃどくろを 出して たおし、コアを こわして 袋を ばらまく まで。出た 袋の うち 忍者装備の 袋と、上の 帯の テロップ（文・item）を 返す */
async function killAndCollect(page: Page) {
  await setupBoss(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__gashaBig.tune({ attack: { gapSec: [1e6, 1e6], firstGapSec: 1e6 } });
    const c = w.__rikkun.gasha.bigTune.finish.core;
    c.hits = 1;
    c.hitGapSec = 0.1;
    w.__rikkun.gasha.defeat();
  });
  expect(await untilPhase(page, 'lie'), '倒れきる').toBeGreaterThanOrEqual(0);
  return page.evaluate(() => {
    const w = window as any, h = w.__rikkun, gt = w.__gt;
    const NINJA = ['ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'];
    h.combat.events();
    w.__gashaBig.damage('core', 1e6);
    const telops = new Map<string, { item: string | null; text: string }>();
    const watch = (n: number) => {
      for (let i = 0; i < n; i++) {
        h.step(1);
        gt.heal();
        const b = h.ui.topBand();
        if (b.kind === 'telop') {
          const el = document.querySelector('[data-band="telop"]');
          const text = (el?.textContent ?? '').trim();
          telops.set(`${b.item}|${text}`, { item: b.item, text });
        }
      }
    };
    watch(60);
    const ninja = (h.combat.bags() as { id: number; slots: { item: string; count: number }[]; rarity: string; position: { x: number; y: number; z: number } }[])
      .filter((b) => b.slots.some((s) => NINJA.includes(s.item)))
      .map((b) => ({ id: b.id, item: b.slots[0]!.item, count: b.slots[0]!.count, rarity: b.rarity }));
    watch(700); // テロップが おわるまで
    return { ninja, telops: [...telops.values()] };
  });
}

/** 忍者装備の 袋を ひろう（袋の 上に 立つ） */
async function pickUp(page: Page, item: string): Promise<number> {
  return page.evaluate((item) => {
    const w = window as any, h = w.__rikkun, gt = w.__gt;
    for (let i = 0; i < 900; i++) {
      const bag = (h.combat.bags() as { slots: { item: string }[]; position: { x: number; y: number; z: number }; pickupDelay: number }[]).find((b) => b.slots.some((s) => s.item === item));
      if (!bag) break;
      if (bag.pickupDelay <= 0) h.player.set({ position: { ...bag.position }, velocity: { x: 0, y: 0, z: 0 } });
      h.step(1);
      gt.heal();
      if (h.inventory.count(item) > 0) break;
    }
    return h.inventory.count(item) as number;
  }, item);
}

test.describe('AC20 通し: がしゃどくろ → 忍者装備の 袋', () => {
  test('たおして 大きな 袋から 忍者装備 1 つ（legendary）・テロップ「がしゃどくろ が 〜 を おとした！」・ひろうと 実績 ninja.first.1。もう 1 回で 別の 忍者装備', async ({ page }) => {
    const errs = await openGasha(page);
    await installGirlTools(page);
    await page.evaluate(() => (window as any).__rikkun.achievements.mute?.(false));
    const before = await page.evaluate(() => ({ kinds: (window as any).__rikkun.achievements.stats()['ninjaKinds'] ?? 0, first: (window as any).__rikkun.achievements.list().find((a: any) => a.id === 'ninja.first.1')?.unlocked }));
    expect(before.kinds).toBe(0);
    expect(before.first, 'ninja.first.1 が 実績の 表に ある').toBe(false);

    const a = await killAndCollect(page);
    expect(a.ninja, '忍者装備の 袋は ちょうど 1 つ').toHaveLength(1);
    const first = a.ninja[0]!;
    expect(NINJA).toContain(first.item);
    expect(first.count).toBe(1);
    expect(first.rarity).toBe('legendary');
    // 上の 帯の テロップは 1 回だけ。出どころは がしゃどくろ
    expect(a.telops, 'テロップは 1 回').toHaveLength(1);
    expect(a.telops[0]!.item).toBe(first.item);
    expect(a.telops[0]!.text.startsWith('がしゃどくろ が'), a.telops[0]!.text).toBe(true);
    expect(a.telops[0]!.text).toContain(plain(nameOf(first.item)));

    // ひろう → 実績
    expect(await pickUp(page, first.item), 'ひろって もちものに 入った').toBeGreaterThan(0);
    await page.evaluate(() => { const h = (window as any).__rikkun; h.achievements.flush(); h.step(2); });
    const got = await page.evaluate(() => { const h = (window as any).__rikkun; return { first: h.achievements.list().find((x: any) => x.id === 'ninja.first.1')?.unlocked as boolean, kinds: h.achievements.stats()['ninjaKinds'] as number, legend: h.achievements.stats()['legendKinds'] ?? 0 }; });
    expect(got.first).toBe(true);
    expect(got.kinds).toBe(1);
    expect(got.legend, '忍者装備は legend.kinds に 入れない').toBe(0);

    // もう 1 回 たおす → 別の 忍者装備
    await page.evaluate(async () => { const w = window as any; await w.__gt.until(() => w.__rikkun.gasha.state() === 'idle', 1500, () => w.__gt.heal()); });
    const b = await killAndCollect(page);
    expect(b.ninja, '2 回目も 1 つ').toHaveLength(1);
    expect(NINJA).toContain(b.ninja[0]!.item);
    expect(b.ninja[0]!.item, '別の 忍者装備').not.toBe(first.item);
    expect(b.telops).toHaveLength(1);
    expect(b.telops[0]!.text.startsWith('がしゃどくろ が')).toBe(true);
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------- AC21 つなぎ・力
async function world(page: Page): Promise<void> {
  await openBladeWorld(page);
  await stage(page);
}

const wear = (page: Page, slot: 'head' | 'body' | 'arms' | 'legs' | null, item?: string) =>
  page.evaluate(({ slot, item }) => {
    const h = (window as any).__rikkun;
    h.armor.set(slot === 'head' ? item : null, slot === 'body' ? item : null, slot === 'arms' ? item : null, slot === 'legs' ? item : null);
    h.step(1);
  }, { slot, item });

test.describe('AC21 つなぎ・力', () => {
  test('忍び装束: うろうろ なしの からかさを 12 ブロックに 置いて 60 ステップ → 追って こない。ぬぐと 60 ステップ 以内に 追う', async ({ page }) => {
    await world(page);
    await wear(page, 'body', 'ninja_shozoku');
    const id = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      h.settings.set('yokaiWander', false);
      return h.yokai.spawn('karakasa', p.x, p.y, p.z - 12) as number; // ai は ふつう（追う）
    });
    const state = () => page.evaluate((id) => (window as any).__rikkun.yokai.list().find((y: any) => y.id === id)?.state as string, id);
    const seen = await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      const s = new Set<string>();
      for (let i = 0; i < 60; i++) { h.step(1); h.combat.setHp(h.combat.get().maxHp); s.add(h.yokai.list().find((y: any) => y.id === id).state); }
      return [...s];
    }, id);
    expect(seen.some((s) => ['chase', 'attack', 'retreat'].includes(s)), `装束を 着て いる 間の ようす ${seen}`).toBe(false);
    expect(await state()).toBe('idle');
    // ぬぐ → 60 ステップ以内に 追う（装束を ぬぐと 気づく 距離が もとに もどる）
    await wear(page, null);
    const n = await page.evaluate((id) => {
      const h = (window as any).__rikkun;
      for (let i = 1; i <= 60; i++) {
        h.step(1);
        h.combat.setHp(h.combat.get().maxHp);
        if (['chase', 'attack', 'retreat'].includes(h.yokai.list().find((y: any) => y.id === id).state)) return i;
      }
      return -1;
    }, id);
    expect(n, '60 ステップ以内に 追い はじめる').toBeGreaterThan(0);
  });

  test('忍びの手甲: からかさを パンチ → 当たった 12 ステップ後に kodachiHit（damage 5）1 回・体力が 5 へる。手甲なしでは 出ない', async ({ page }) => {
    await world(page);
    for (const tekko of [false, true]) {
      await stage(page);
      if (tekko) await wear(page, 'arms', 'ninja_tekko'); else await wear(page, null);
      const id = await spawnAhead(page, 'karakasa', 1.8, { hp: 60 });
      await page.evaluate(() => { const h = (window as any).__rikkun; h.inventory.clear(); h.inventory.select(0); h.combat.events(); h.step(1); });
      const r = await page.evaluate((id) => {
        const h = (window as any).__rikkun;
        const hpOf = () => h.yokai.list().find((y: any) => y.id === id).hp as number;
        const out: { punchTick: number | null; kodachi: { tick: number; yokaiId: number; damage: number }[]; hpAtPunch: number; hpAtKodachi: number | null; hits: number } = { punchTick: null, kodachi: [], hpAtPunch: 0, hpAtKodachi: null, hits: 0 };
        h.input.press('primary');
        h.step(1);
        h.input.release('primary');
        let t0 = h.tick() as number;
        for (let i = 0; i < 400; i++) {
          h.step(1);
          for (const e of h.combat.events() as any[]) {
            if (e.type === 'punchHit' && out.punchTick === null) { out.punchTick = h.tick(); out.hpAtPunch = hpOf(); }
            if (e.type === 'kodachiHit') { out.kodachi.push({ tick: h.tick(), yokaiId: e.yokaiId, damage: e.damage }); out.hpAtKodachi = hpOf(); }
          }
          if (out.punchTick !== null && h.tick() - out.punchTick > 40) break;
        }
        void t0;
        return out;
      }, id);
      expect(r.punchTick, 'パンチが 当たる').not.toBeNull();
      if (!tekko) {
        expect(r.kodachi, '手甲なしは kodachiHit なし').toEqual([]);
      } else {
        expect(r.kodachi, 'kodachiHit は 1 回').toHaveLength(1);
        expect(r.kodachi[0]!.yokaiId).toBe(id);
        expect(r.kodachi[0]!.damage).toBe(5);
        expect(r.kodachi[0]!.tick - r.punchTick!, '当たってから 12 ステップ後').toBe(12);
        expect(r.hpAtPunch - r.hpAtKodachi!, '体力が 5 へる').toBe(5);
      }
    }
  });

  test('忍びの足袋: 高さ 30 から 落ちても 体力 そのまま（ぬぐと へる）', async ({ page }) => {
    await world(page);
    const fall = (tabi: boolean, up: number) =>
      page.evaluate(({ tabi, up }) => {
        const h = (window as any).__rikkun;
        h.armor.set(null, null, null, tabi ? 'ninja_tabi' : null);
        h.combat.setHp(h.combat.get().maxHp);
        h.step(2);
        const p = h.player.get().position;
        const hp0 = h.combat.get().hp as number;
        h.player.set({ position: { x: p.x, y: p.y + up, z: p.z }, velocity: { x: 0, y: 0, z: 0 } });
        for (let i = 0; i < 400; i++) {
          h.step(1);
          if (h.player.get().onGround && h.player.get().position.y <= p.y + 0.01) break;
        }
        h.step(2);
        return { hp0, hp: h.combat.get().hp as number, landed: h.player.get().onGround as boolean };
      }, { tabi, up });
    const without = await fall(false, 8); // 足袋なしで 死なない 高さ（高さ 30 では たおれて しまう）
    expect(without.landed).toBe(true);
    expect(without.hp, '足袋なしでは 落下で へる（この テストが 本当に 落ちて いる 証拠）').toBeLessThan(without.hp0);
    await page.evaluate(() => { const h = (window as any).__rikkun; h.step(200); });
    const withTabi = await fall(true, 30);
    expect(withTabi.landed).toBe(true);
    expect(withTabi.hp).toBe(withTabi.hp0);
  });
});
