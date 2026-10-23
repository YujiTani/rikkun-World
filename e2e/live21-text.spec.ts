import { expect, test } from '@playwright/test';
import { BOOK_ITEMS } from '../src/ui/book/bookData';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2.1 E2E その 5（docs/design/LIVE-2.1.md 版 1.1 §3.1・§3.4・§6 AC16）: 文字。
 * 合図 `coopNoRoom`・`kitMax`・`kitFull` の 文、案内画面「そだてる」の 2 行（1 行目 = こたつ 3 こ、2 行目 = なげる で とりごや の こ）。
 * 漢字は ふりがな（rt）の 外に 0。チップは 3 つの 大きさで はみ出し 0px・1 行。案内画面の 長い 2 行目は 1024×700 で 3 行まで・はみ出し 0px。
 * 空白は くらべる ときに すべて とる（`ここ には おけない よ` と `ここにはおけないよ` を 同じ ものと 見る）。
 */
const squash = (t: string) => t.replace(/\s+/g, '');

test.describe('LIVE-2.1 文字', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC16 合図 coopNoRoom・kitMax・kitFull の 文と 大きさ（3 つの 大きさ）: 文が そのまま・漢字 0・禁止語 0・はみ出し 0px・1 行', async ({ page }) => {
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await openAnimals(page);
      const rows = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(60);
        const out: any[] = [];
        const grab = (name: string) => {
          h.step(2);
          const el = document.querySelector('#animal-hint') as HTMLElement | null;
          const b = el?.getBoundingClientRect();
          const cs = el ? getComputedStyle(el) : null;
          let lines = 0;
          if (el && cs) {
            const tops: number[] = [];
            const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            while ((n = tw.nextNode())) {
              if (!(n.textContent ?? '').trim() || n.parentElement?.closest('rt')) continue;
              const rg = document.createRange();
              rg.selectNodeContents(n);
              for (const r of Array.from(rg.getClientRects())) if (r.width > 0) tops.push(r.top);
            }
            tops.sort((x, y) => x - y);
            const gap = parseFloat(cs.fontSize) * 0.6;
            lines = tops.length ? 1 : 0;
            for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > gap) lines++;
          }
          out.push({ name, hint: h.animals.lastHint(), chip: A.chip(), over: b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999, lines, body: document.body.innerText });
        };
        // kitFull（3 こ 入りの 台 に 4 こ目）
        const kf = A.kit(8, 2);
        for (let i = 0; i < 4; i++) A.putEgg(kf, 'egg', 1);
        grab('kitFull');
        // kitMax（たまご 6 こ。ここまで 3 こ → あと 3 こ。7 こ目）
        for (let i = 0; i < 3; i++) A.putEgg(A.kit(8, 6 + i * 4), 'egg', 1);
        A.putEgg(A.kit(8, 20), 'egg', 1);
        grab('kitMax');
        // coopNoRoom（深さ 3 の あな。まわり 3 か所）
        for (const [x, z] of [[44, 44], [46, 44], [45, 46]]) for (const y of [8, 7, 6]) h.world.setBlock(x, y, z, 'air');
        h.step(2);
        A.hold('toriya', 1);
        (window as any).__aim.standForS(42.5, 45.5, 90, 0, 9);
        h.step(1);
        (window as any).__aim.solve(45, 8, 45, 1);
        h.step(1);
        A.tap();
        grab('coopNoRoom');
        return out;
      });
      const want: Record<string, string> = {
        kitFull: 'このこたつはいっぱい',
        kitMax: 'あたためるたまごは6こまで',
        coopNoRoom: 'ここにはおけないよ',
      };
      for (const row of rows) {
        const tag = `${w}x${hgt} ${row.name}`;
        expect(row.hint, tag).toBe(row.name);
        expect(squash(row.chip.text), `${tag} 文`).toBe(want[row.name]);
        expect(row.chip.bare, `${tag} 漢字`).toEqual([]);
        expect(row.over, `${tag} はみ出し`).toBeLessThanOrEqual(0.5);
        expect(row.lines, `${tag} 1 行`).toBeLessThanOrEqual(1);
        for (const bad of ['ぬくぬく', '育成', 'たまご こたつ', 'きん の ひよこ', '小屋', '大人']) {
          expect(row.body.includes(bad), `${tag} 「${bad}」`).toBe(false);
        }
      }
    }
  });

  test('AC16b 案内画面「そだてる」の 2 行: こたつ に 3 こ・だっこ して なげる と とりごや の こ。漢字は ルビの 中・1024×700 で 3 行まで・はみ出し 0px', async ({ page }) => {
    // ルビ を とった 文字（空白も とる）
    const plain = (html: string) => squash(html.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, ''));
    const bareKanji = (html: string) => /[一-鿿]/.test(html.replace(/<ruby>.*?<\/ruby>/g, ''));
    const grow = BOOK_ITEMS.filter((i) => i.chapter === 'grow');
    const kit = grow.find((i) => plain(i.caption).includes('たまごをこたつに3こまで'));
    const toss = grow.find((i) => plain(i.caption).includes('だっこしてとりごやのなかへなげるととりごやのこ'));
    expect(kit, '1 行目: たまご を こたつ に 3 こ まで いれられる。ひよこ が すそ から でて くる').toBeTruthy();
    expect(toss, '2 行目: ひよこ を だっこ して とりごや の なか へ なげる と とりごや の こ。つれて はいって も なる。あさ を 2 かい むかえる と おとな に なる').toBeTruthy();
    for (const it of [kit!, toss!]) expect(bareKanji(it.caption), `${it.id} 漢字は ルビの 中`).toBe(false);
    expect(plain(kit!.caption)).toContain('ひよこがすそからでてくる');
    expect(plain(toss!.caption)).toContain('つれてはいってもなる');
    expect(plain(toss!.caption)).toContain('あさを2かいむかえるとおとなになる');
    // 古い 文 が のこって いない
    expect(grow.some((i) => plain(i.caption).includes('つれていって')), '古い 2 行目').toBe(false);

    await page.setViewportSize({ width: 1024, height: 700 });
    await openAnimals(page);
    for (const it of [kit!, toss!]) {
      const m = await page.evaluate(async (id) => {
        const h = (window as any).__rikkun;
        const A = (window as any).__A;
        A.base(30);
        h.lock.simulate(false);
        h.step(2);
        h.lock.book(id);
        for (let i = 0; i < 1200 && h.lock.get().bookAnim !== 'none'; i++) h.step(1);
        h.step(3);
        const el = document.querySelector(`[data-item-id="${id}"]`) as HTMLElement | null;
        if (!el) return { found: false } as any;
        const cap = (el.querySelector('.bk-cap') ?? el) as HTMLElement;
        const b = el.getBoundingClientRect();
        const tops: number[] = [];
        const tw = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = tw.nextNode())) {
          if (!(n.textContent ?? '').trim() || n.parentElement?.closest('rt')) continue;
          const rg = document.createRange();
          rg.selectNodeContents(n);
          for (const r of Array.from(rg.getClientRects())) if (r.width > 0) tops.push(Math.round(r.top));
        }
        const fs = parseFloat(getComputedStyle(cap).fontSize);
        tops.sort((x, y) => x - y);
        let lines = tops.length ? 1 : 0;
        for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > fs * 0.6) lines++;
        return { found: true, cut: el.scrollHeight - el.clientHeight, lines, over: Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top), caption: h.lock.get().bookCaption };
      }, it.id);
      expect(m.found, `${it.id} が 案内画面 に 出る`).toBe(true);
      expect(m.cut, `${it.id} 切れていない`).toBeLessThanOrEqual(1);
      expect(m.lines, `${it.id} 3 行まで`).toBeLessThanOrEqual(3);
      expect(m.over, `${it.id} はみ出し 0px`).toBeLessThanOrEqual(0.5);
    }
  });
});
