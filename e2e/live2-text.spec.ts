import { expect, test } from '@playwright/test';
import { openAnimals } from './helpers/animals';

/**
 * LIVE-2 文字（docs/design/LIVE-2.md §6 AC25）の 残り 5 つ: 合図 kitMax・kitWait・coopMax・coopFull・sleepHint。
 * （LIVE-2.1 で kitFull を 足した。合図 10 の 文の 中身は live21-text.spec.ts）
 * （kitNeedEgg・coopNoRoom・coopNoEgg・coopNotEmpty は live2-gold.spec.ts の AC25。合わせて 9 つ）
 * チップ `#animal-hint` が 漢字 0（ルビの 外）・禁止語 0・3 つの 大きさで はみ出し 0px・2 行まで。
 * 案内画面（本）の 3 行・説明の 表は この PR では 作らない（指示: 本の 中身は 別 PR）ので ここでは 見ない。
 */
test.describe('LIVE-2 文字（合図 5 つ）', () => {
  test.describe.configure({ timeout: 150_000 });

  test('AC25b 合図 kitFull・kitMax・kitWait・coopMax・coopFull・sleepHint: 漢字 0・禁止語 0・はみ出し 0px・2 行まで（3 つの 大きさ）', async ({ page }) => {
    await openAnimals(page);
    const sizes = [[1280, 800], [1440, 900], [1024, 700]] as const;
    for (const [w, hgt] of sizes) {
      await page.setViewportSize({ width: w, height: hgt });
      await openAnimals(page); // 小屋・こたつは clear() で 消えない ので 大きさごとに 読み直す
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
          // 行の 数は、文字の 箱（ふりがな rt は のぞく）の 上の 位置が はなれて いる 数で 数える（line-height: normal は 数に ならない）
          let lines = 0;
          if (el && cs) {
            const tops: number[] = [];
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let n: Node | null;
            while ((n = w.nextNode())) {
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
          out.push({
            name,
            hint: h.animals.lastHint(),
            chip: A.chip(),
            over: b ? Math.max(0, b.right - innerWidth, b.bottom - innerHeight, -b.left, -b.top) : 999,
            lines,
            body: document.body.innerText,
          });
        };
        // kitFull（LIVE-2.1: 1 台 に 3 こ。4 こ目）
        const kf = A.kit(8, 2);
        A.putEgg(kf, 'egg', 1);
        A.putEgg(kf, 'egg', 1);
        A.putEgg(kf, 'egg', 1);
        A.putEgg(kf, 'egg', 1);
        grab('kitFull');
        // kitWait（LIVE-2.1: 入って いる 台 に トマト）/ kitMax（たまご 6 こ。ここまで 3 こ）
        const k1 = A.kit(8, 6);
        A.putEgg(k1, 'egg', 1);
        A.putEgg(k1, 'tomato', 1);
        grab('kitWait');
        A.putEgg(A.kit(8, 10), 'egg', 2);
        A.putEgg(A.kit(8, 14), 'egg', 1);
        const k7 = A.kit(8, 30);
        A.putEgg(k7, 'egg', 2);
        grab('kitMax');
        // coopMax（3 つ 置いて 4 つ目）
        for (const z of [8, 20, 32]) A.coop(30, z);
        A.hold('toriya', 1);
        (window as any).__aim.standForS(52.5, 20.5, 90, 0, 9);
        h.step(1);
        (window as any).__aim.solve(56, 8, 20, 1);
        h.step(1);
        A.tap();
        grab('coopMax');
        // coopFull（6 わの 小屋に だっこで おろす）
        h.animals.clear();
        // clear() は 小屋を 消さない（すでに 3 つ）ので、1 つ目を つかう
        const cid = h.animals.coops()[0].id;
        const c = A.cinfo(cid);
        for (let i = 0; i < 6; i++) A.kid(A.cinfo(cid), { stage: 'adult' }, (i % 3) - 1, Math.floor(i / 3) - 1);
        const id = A.friend(c.x + 6.5, c.z + 6.5);
        A.stand(id);
        A.lift(id);
        h.player.set({ position: { x: c.x + 0.5, y: 9, z: c.z + 0.5 }, yaw: 90, pitch: -30 });
        h.step(2);
        A.tap();
        grab('coopFull');
        // sleepHint（夜 小屋の 子に むし）
        h.animals.clear();
        const c2 = A.cinfo(h.animals.coops()[1].id);
        const kid = A.kid(c2, { stage: 'adult' });
        h.player.set({ position: { x: c2.x + 0.5 - 1.5, y: 9, z: c2.z + 0.5 }, yaw: 90 });
        A.night();
        h.step(120);
        A.hold('mushi', 3);
        A.aim(kid);
        A.tap();
        grab('sleepHint');
        return out;
      });
      for (const row of rows) {
        const tag = `${w}x${hgt} ${row.name}`;
        expect(row.hint, tag).toBe(row.name);
        expect(row.chip.text.length, `${tag} チップに 文`).toBeGreaterThan(0);
        expect(row.chip.bare, `${tag} 漢字`).toEqual([]);
        expect(row.over, `${tag} はみ出し`).toBeLessThanOrEqual(0.5);
        expect(row.lines, `${tag} 2 行まで`).toBeLessThanOrEqual(2);
        for (const bad of ['ぬくぬく', '育成', 'たまご こたつ', 'きん の ひよこ', 'きん の にわとり', '小屋', '大人']) {
          expect(row.body.includes(bad), `${tag} 「${bad}」`).toBe(false);
        }
      }
      const byName = Object.fromEntries(rows.map((r: any) => [r.name, r.chip.text as string]));
      expect(byName.kitMax).toContain('あたためる');
      expect(byName.kitFull, 'LIVE-2.1 の 新しい 合図').toContain('いっぱい');
      expect(byName.kitWait).toContain('まってね');
      expect(byName.coopMax).toContain('とりごや');
      expect(byName.coopFull).toContain('いっぱい');
      expect(byName.sleepHint).toContain('ねてる');
    }
  });
});
