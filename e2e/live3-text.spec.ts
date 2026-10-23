import { expect, test } from '@playwright/test';
import { checkLayout } from './helpers/layoutRules';
import { BAD_WORDS, openLive3 } from './helpers/live3';

/**
 * LIVE-3 E2E その 4（docs/design/LIVE-3.md 版 1.1 §3.1・§3.4・§6 AC16）: 文字と 大きさ（DOM）。
 * 3 つ の 大きさ（1280×800・1440×900・1024×700）で、メニュー 3 ページ・演出 の 一言・合図 rawMeat・やく タブ 5 まい。
 * 漢字 は ふりがな（ruby）の 外 に 0・禁止語 0・はみ出し 0px・パネル は 画面 の 下 45% の 中・ボタン の 高さ 64px 以上・字 24px 以上。
 * 案内画面（本）の 1 行・説明の 表 の 本文 は 週一 の 本の まとめ（ルールブック）で 足す ので ここでは 見ない
 * （説明の 表・ツールチップ の 中身 は src/ui/live3Items.test.ts）。
 */
const SIZES = [[1280, 800], [1440, 900], [1024, 700]] as const;
const squash = (t: string) => t.replace(/\s+/g, '');

test.describe('LIVE-3 文字', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC16 メニュー 3 ページ（3 つ の 大きさ）: 見出し・ボタン の 文・漢字 0・禁止語 0・パネル は 下 45%・ボタン 64px 以上 字 24px 以上・ページ 3 は 2 行 まで・やめる と いただきます は はなれて いる', async ({ page }) => {
    for (const [w, hgt] of SIZES) {
      await page.setViewportSize({ width: w, height: hgt });
      await openLive3(page);
      const rows = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const L = (window as any).__L;
        const { c, f } = L.farm(2);
        const sv = h.animals.serialize();
        for (const cc of sv.coops) cc.nest = { egg: 2, gold: 0 };
        h.animals.deserialize(sv);
        h.step(2);
        const out: any[] = [];
        L.rc(c, f);
        out.push({ page: 'top', ...L.panel(), menu: L.menu() });
        L.press('meat');
        out.push({ page: 'pick', ...L.panel(), menu: L.menu() });
        L.press('card', h.animals.coops()[0].kids[0]);
        out.push({ page: 'confirm', ...L.panel(), menu: L.menu() });
        return out;
      });
      const tag = (p: string) => `${w}x${hgt} ${p}`;
      const want: Record<string, string[]> = {
        top: ['とりごや', 'たまごをあつめる', 'おにくにする'],
        pick: ['どのこにする？', 'もどる'],
        confirm: ['ほんとうにいい？', 'このこのいのちをいただきます。いい？', 'やめる', 'いただきます'],
      };
      for (const row of rows) {
        expect(row.text, tag(row.page)).toBeTruthy();
        expect(row.menu.page, tag(row.page)).toBe(row.page);
        for (const t of want[row.page]) expect(row.text, `${tag(row.page)} ${t}`).toContain(t);
        expect(row.bare, `${tag(row.page)} 漢字`).toEqual([]);
        for (const bad of BAD_WORDS) expect(row.text, `${tag(row.page)} ${bad}`).not.toContain(bad);
        // パネル: 画面の 下 がわ（高さ 45% まで）・はみ出し 0px・スクロール なし
        expect(row.panel.h, `${tag(row.page)} 高さ`).toBeLessThanOrEqual(row.vh * 0.45 + 1);
        expect(row.panel.t, `${tag(row.page)} 下 がわ`).toBeGreaterThanOrEqual(row.vh * 0.55 - 1);
        expect(row.panel.b, `${tag(row.page)} 画面 の 中`).toBeLessThanOrEqual(row.vh + 0.5);
        expect(row.panel.l).toBeGreaterThanOrEqual(-0.5);
        expect(row.panel.r).toBeLessThanOrEqual(row.vw + 0.5);
        expect(row.scrollY, `${tag(row.page)} スクロール`).toBeLessThanOrEqual(1);
        expect(row.scrollX).toBeLessThanOrEqual(1);
        // ボタン: 64px 以上・字 24px 以上
        expect(row.buttons.length, tag(row.page)).toBeGreaterThanOrEqual(1);
        for (const b of row.buttons) {
          expect(b.h, `${tag(row.page)} ボタン ${b.text} の 高さ`).toBeGreaterThanOrEqual(63.5);
          expect(b.fs, `${tag(row.page)} ボタン ${b.text} の 字`).toBeGreaterThanOrEqual(24);
        }
      }
      const conf = rows.find((x: any) => x.page === 'confirm');
      const cancel = conf.buttons.find((b: any) => b.text.includes('やめる'));
      const ok = conf.buttons.find((b: any) => b.text.includes('いただきます'));
      expect(cancel, `${w} やめる`).toBeTruthy();
      expect(ok, `${w} いただきます`).toBeTruthy();
      expect(cancel.l, 'やめる は 左').toBeLessThan(ok.l);
      expect(ok.l - cancel.r, `${w}x${hgt} 2 つ の ボタン の あいだ は ボタン 1 つ 分 以上`).toBeGreaterThanOrEqual(Math.min(cancel.w, ok.w) - 0.5);
      // 文 だけ の 行 の 数（文を ふくむ いちばん 小さい 要素）
      const sentenceLines = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="coop-menu"]');
        if (!el) return -1;
        const L = (window as any).__L;
        let best: Element | null = null;
        for (const e of Array.from(el.querySelectorAll('*'))) {
          if (e.closest('button')) continue;
          if (!(e as HTMLElement).innerText?.replace(/\s+/g, '').includes('このこのいのちをいただきます。いい？')) continue;
          if (!best || (e.textContent ?? '').length < (best.textContent ?? '').length) best = e;
        }
        return best ? L.lines(best) : -1;
      });
      expect(sentenceLines, `${w}x${hgt} ページ 3 の 文 は 2 行 まで`).toBeGreaterThanOrEqual(1);
      expect(sentenceLines).toBeLessThanOrEqual(2);
      // 画面の くずれ（はみ出し）
      const bad = (await checkLayout(page, ['[data-testid="coop-menu"]'])).filter((i) => i.kind === 'offscreen' || i.kind === 'spill' || i.kind === 'clipped');
      expect(bad, `${w}x${hgt} くずれ`).toEqual([]);
    }
  });

  test('AC16b カード 6 まい（3×2）: パネル の 中 に ぜんぶ 入る（スクロール なし・はみ出し 0px）・ボタン 64px（3 つ の 大きさ）', async ({ page }) => {
    for (const [w, hgt] of SIZES) {
      await page.setViewportSize({ width: w, height: hgt });
      await openLive3(page);
      const row = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const L = (window as any).__L;
        const { c, f } = L.farm(6, { macho: [1, 4] });
        L.rc(c, f);
        L.press('meat');
        return { ...L.panel(), menu: L.menu(), listed: h.animals.meatList(h.animals.coops()[0].id).length };
      });
      const tag = `${w}x${hgt}`;
      expect(row.listed).toBe(6);
      expect(row.menu).toMatchObject({ page: 'pick' });
      expect(row.cards, `${tag} カード`).toHaveLength(6);
      for (const k of row.cards) {
        expect(k.l, tag).toBeGreaterThanOrEqual(row.panel.l - 0.5);
        expect(k.r, tag).toBeLessThanOrEqual(row.panel.r + 0.5);
        expect(k.t, tag).toBeGreaterThanOrEqual(row.panel.t - 0.5);
        expect(k.b, tag).toBeLessThanOrEqual(row.panel.b + 0.5);
      }
      // 3×2: 上の 段 3 まい・下の 段 3 まい
      const tops = [...new Set(row.cards.map((k: any) => Math.round(k.t)))];
      expect(tops.length, `${tag} 2 だん`).toBe(2);
      expect(row.scrollY, `${tag} スクロール なし`).toBeLessThanOrEqual(1);
      expect(row.panel.h).toBeLessThanOrEqual(row.vh * 0.45 + 1);
      for (const b of row.buttons) expect(b.h, `${tag} ${b.text}`).toBeGreaterThanOrEqual(63.5);
      const bad = (await checkLayout(page, ['[data-testid="coop-menu"]'])).filter((i) => i.kind === 'offscreen' || i.kind === 'spill' || i.kind === 'clipped');
      expect(bad, `${tag} くずれ`).toEqual([]);
    }
  });

  test('AC16c 演出 の 一言 と 合図 rawMeat（3 つ の 大きさ）: 一言 は 1 行・漢字 0・禁止語 0・はみ出し 0px・押せない。rawMeat は 2 行 まで', async ({ page }) => {
    for (const [w, hgt] of SIZES) {
      await page.setViewportSize({ width: w, height: hgt });
      await openLive3(page);
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        const L = (window as any).__L;
        const { c, f, ids } = L.farm(1);
        const o: any = {};
        L.choose(c, f, ids[0]);
        L.go(60);
        o.at60 = L.text('#itadakimasu');
        L.go(30);
        o.say = L.text('#itadakimasu');
        o.meatText = h.ui.meatText();
        L.go(150);
        // なま
        A.base();
        (window as any).__aim.standForS(2.5, 6.5, 270, 30, 9);
        A.hold('momo_nama', 1);
        A.tap();
        h.step(2);
        o.raw = { ...A.chip(), lines: L.text('#animal-hint') };
        const el = document.querySelector('#animal-hint') as HTMLElement | null;
        const b = el?.getBoundingClientRect();
        o.rawOver = b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999;
        return o;
      });
      const tag = `${w}x${hgt}`;
      expect(r.at60, `${tag} 60 では 一言 なし`).toBeNull();
      expect(r.say, `${tag} 一言`).toBeTruthy();
      expect(r.say.text).toContain(squash('いのち を いただきます'));
      expect(r.meatText.replace(/\s+/g, '')).toContain('いのちをいただきます');
      expect(r.say.bare, `${tag} 漢字`).toEqual([]);
      for (const bad of BAD_WORDS) expect(r.say.text, `${tag} ${bad}`).not.toContain(bad);
      expect(r.say.lines, `${tag} 一言 は 1 行`).toBe(1);
      expect(r.say.over, `${tag} はみ出し`).toBeLessThanOrEqual(0.5);
      expect(r.say.pe, `${tag} 押せない`).toBe('none');
      expect(squash(r.raw.text)).toBe('なまはたべられないよ。かまどでやこう');
      expect(r.raw.bare, `${tag} rawMeat 漢字`).toEqual([]);
      for (const bad of BAD_WORDS) expect(r.raw.text, `${tag} ${bad}`).not.toContain(bad);
      expect(r.raw.lines.lines, `${tag} rawMeat は 2 行 まで`).toBeLessThanOrEqual(2);
      expect(r.rawOver, `${tag} rawMeat はみ出し`).toBeLessThanOrEqual(0.5);
    }
  });

  test('AC16d やく タブ 5 まい（3 つ の 大きさ）: カード が 5 まい・はみ出し 0px（2 だん でも 入る）', async ({ page }) => {
    for (const [w, hgt] of SIZES) {
      await page.setViewportSize({ width: w, height: hgt });
      await openLive3(page);
      await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base();
        h.world.setBlock(11, 9, 12, 'furnace');
        h.step(2);
        h.inventory.clear();
        h.inventory.add('momo_nama', 2);
        h.inventory.add('coal_ore', 2);
        h.inventory.add('clay', 4);
        h.inventory.add('iron_ore', 2);
        h.craft.openFurnace(11, 9, 12);
        h.input.press('toggleInventory');
        h.input.release('toggleInventory');
        h.step(3);
      });
      await page.locator('.craft-tabs .rk-tab', { hasText: 'やく' }).click();
      const n = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.step(3);
        return h.craft.ui().tiles.length;
      });
      expect(n, `${w}x${hgt} やく 5 まい`).toBe(5);
      const bad = (await checkLayout(page, ['#inventory-screen'])).filter((i) => i.kind === 'offscreen');
      expect(bad, `${w}x${hgt} やく タブ の はみ出し`).toEqual([]);
    }
  });
});
