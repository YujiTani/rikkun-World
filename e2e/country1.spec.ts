import { expect, test, type Page } from '@playwright/test';
import { openBiome } from './helpers/biome';
import { waitToastGone } from './helpers/toast';

/**
 * #291 COUNTRY-1 国の土台（docs/design/COUNTRY-1.md 2.1 版 §8・§9）の E2E。ユニット（AC1〜8・11〜19）は developer。
 *   AC9  新しい世界で found() = [harappa]・実績はしずかに取れている。mori に 179 コマでは かわらず、180 コマで入る。
 *   AC10 11 国 setFound → 12 こ目に 180 コマ → visit.countries.12 と その国の実績・おしらせの ids に 2 つ・主役 1 ＋ ほか 1 こ。
 *        あとから ほかの国に入っても・ロードしても 実績の数は かわらない。
 *   窓口の形（§8）: biome.countries()・country()・yokai.spawnWeights()。
 * 場所は biome.find に聞く。待つのは step の数（時間の ms では 合否を決めない）。
 * 国への運びこみ中の step を 数えに入れないため、運ぶあいだは biome.quiet(true)（§4.3）。
 * 実装の前は window.__rikkun.biome.found などが 無いので 赤になる。
 */

const KINDS = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji', 'yuki'];
const WEIGHT_KEYS = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];

/** しずかモードで 国へ運び、読みこみを待つ。quiet は 呼ぶ がわが 決める（戻さない） */
const goQuiet = (page: Page, kind: string) =>
  page.evaluate((k) => {
    const h = (window as any).__rikkun;
    h.biome.quiet(true);
    const g = (window as any).__biomeT.goTo(k);
    return { loaded: g.loaded as boolean, here: g.here as string };
  }, kind);

/** 国の実績だけ（visit.country.* と visit.countries.12）。peak・sea・古い visit.* は 混ぜない */
const visitIds = (page: Page) =>
  page.evaluate(() =>
    (window as any).__rikkun.achievements
      .list()
      .filter((a: any) => a.unlocked && (a.id.startsWith('visit.country.') || a.id === 'visit.countries.12'))
      .map((a: any) => a.id as string)
      .sort(),
  );

test.describe('#291 COUNTRY-1 国の土台', () => {
  test('AC9: 新しい世界は harappa がしずかに入っている。mori は 179 コマで かわらず 180 コマで 入る', async ({ page }) => {
    test.setTimeout(120_000);
    await openBiome(page);
    const start = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(false); // 実績の係が 動く（mute 中は update が 呼ばれない）
      h.step(2);
      return {
        found: h.biome.found() as string[],
        harappa: !!h.achievements.list().find((a: any) => a.id === 'visit.country.harappa.1')?.unlocked,
        pending: h.achievements.pending() as string[],
        sounds: h.achievements.sounds() as string[],
      };
    });
    expect(start.found).toEqual(['harappa']);
    expect(start.harappa).toBe(true);
    expect(start.pending).not.toContain('visit.country.harappa.1');
    expect(start.sounds).toHaveLength(0);

    const g = await goQuiet(page, 'mori');
    expect(g.loaded).toBe(true);
    expect(g.here).toBe('mori');
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.biome.quiet(false);
      h.achievements.mute(false);
      h.achievements.sounds(); // 運んだ間の音を すてる
      h.step(179);
      const at179 = {
        sounds: h.achievements.sounds() as string[],
        found: h.biome.found() as string[],
        mori: !!h.achievements.list().find((a: any) => a.id === 'visit.country.mori.1')?.unlocked,
      };
      h.step(1);
      return {
        at179,
        found: h.biome.found() as string[],
        current: h.biome.current() as string | null,
        mori: !!h.achievements.list().find((a: any) => a.id === 'visit.country.mori.1')?.unlocked,
        pending: [...h.achievements.pending(), ...h.achievements.modal().ids] as string[],
      };
    });
    expect(r.at179.sounds).toHaveLength(0);
    expect(r.at179.found).toEqual(['harappa']);
    expect(r.at179.mori).toBe(false);
    expect(r.found).toEqual(['harappa', 'mori']);
    expect(r.current).toBe('mori');
    expect(r.mori).toBe(true);
    expect(r.pending).toContain('visit.country.mori.1');
  });

  test('AC10: 12 こ目で visit.countries.12 と その国の実績。おしらせは 主役 1 ＋ ほか 1 こ。あとで入っても・ロードしても かわらない', async ({ page }) => {
    test.setTimeout(180_000);
    await openBiome(page, ''); // 保存あり（ロードを 確かめる）
    const last = 'yuki';
    const others = KINDS.filter((k) => k !== last);
    await page.evaluate((o) => {
      const h = (window as any).__rikkun;
      h.biome.setFound(o);
    }, others);
    // setFound は しずか: 実績は取れる・まだ見せていない列に 入らない
    const afterSet = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { found: h.biome.found() as string[], pending: h.achievements.pending() as string[] };
    });
    expect(afterSet.found).toEqual(others);
    expect(afterSet.pending.filter((id) => id.startsWith('visit.'))).toHaveLength(0);
    expect(await visitIds(page)).toContain('visit.country.mori.1');
    expect(await visitIds(page)).not.toContain('visit.countries.12');

    const g = await goQuiet(page, last);
    expect(g.loaded).toBe(true);
    expect(g.here).toBe(last);
    const before = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.biome.quiet(false);
      h.achievements.mute(false);
      h.step(179);
      return h.biome.found().length as number;
    });
    expect(before).toBe(11);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.step(1);
      const found = h.biome.found() as string[];
      const pending = [...h.achievements.pending(), ...h.achievements.modal().ids] as string[];
      h.achievements.flush();
      const m = h.achievements.modal();
      return { found, pending, modal: { open: m.open as boolean, ids: m.ids as string[], mainId: m.mainId as string | null, more: m.more as number } };
    });
    expect(r.found).toHaveLength(12);
    expect(r.found[11]).toBe(last);
    expect(r.pending).toEqual(expect.arrayContaining([`visit.country.${last}.1`, 'visit.countries.12']));
    expect(r.modal.open).toBe(true);
    expect(r.modal.ids).toEqual(expect.arrayContaining([`visit.country.${last}.1`, 'visit.countries.12']));
    const mine = r.modal.ids.filter((id) => id.startsWith('visit.country.') || id === 'visit.countries.12');
    expect(mine).toHaveLength(2); // 国の 2 つ（ほかの visit.* が 混ざっても ゆれない）
    expect(r.modal.more).toBe(r.modal.ids.length - 1);
    expect(r.modal.ids).toContain(r.modal.mainId);
    await waitToastGone(page);

    const ids1 = await visitIds(page);
    expect(ids1).toContain('visit.countries.12');
    expect(ids1).toContain(`visit.country.${last}.1`);
    // もう一度 ほかの国に入っても 何もふえない
    await goQuiet(page, 'mori');
    const again = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.biome.quiet(false);
      h.step(200);
      return { found: h.biome.found() as string[], pending: [...h.achievements.pending(), ...h.achievements.modal().ids] as string[] };
    });
    expect(again.found).toHaveLength(12);
    expect(again.pending).toHaveLength(0);
    expect(await visitIds(page)).toEqual(ids1);

    // ロードしても かわらない
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const loaded = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.achievements.mute(true);
      h.pause();
      h.step(2);
      return h.biome.found() as string[];
    });
    expect(loaded).toHaveLength(12);
    expect(new Set(loaded).size).toBe(12);
    expect(await visitIds(page)).toEqual(ids1);
  });

  test('§8 窓口: biome.countries() 12 行・country(kind)・yokai.spawnWeights(x, z)（行 × 倍率。合計 100）', async ({ page }) => {
    test.setTimeout(60_000);
    await openBiome(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const rows = h.biome.countries() as { kind: string; name: string; yomi: string; boss: string; yokai: Record<string, number> }[];
      const one = h.biome.country('iwayama');
      const p = h.biome.find('iwayama');
      const w = h.yokai.spawnWeights(p.x, p.z);
      return { rows, one, w, at: h.biome.at(p.x, p.z).kind as string };
    });
    expect(r.rows.map((x) => x.kind)).toEqual(KINDS);
    for (const row of r.rows) {
      expect(typeof row.name).toBe('string');
      expect(row.yomi.length).toBeGreaterThan(0);
      const sum = WEIGHT_KEYS.reduce((s, k) => s + (row.yokai[k] ?? 0), 0);
      expect(sum, `${row.kind}: 重みの合計`).toBe(100);
    }
    expect(r.one.kind).toBe('iwayama');
    expect(r.w.country).toBe(r.at);
    expect(r.w.country).toBe('iwayama');
    expect(r.w.weights).toEqual(expect.objectContaining(r.rows.find((x) => x.kind === 'iwayama')!.yokai));
    // 4 大は ちょうど 3 国ずつ
    const bosses = ['tsuchigumo', 'omukade', 'itsumade', 'byakko'];
    for (const b of bosses) expect(r.rows.filter((x) => x.boss === b), b).toHaveLength(3);
  });
});
