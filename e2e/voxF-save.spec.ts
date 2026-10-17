import { expect, test, type Page } from '@playwright/test';

/**
 * VOX-F（docs/tickets/VOX-F.md）: さわった列だけ丸ごと IndexedDB に保存。
 * AC1 読みなおしで同じ / AC3 保存の時間（記録）/ AC5 pagehide の保険。
 */

async function boot(page: Page, query = '') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
}

/** IndexedDB の列を読む（DB rikkun-world 版 1、ストア chunks、キー [saveId, cx, cz]）。saveId は ゲームに聞く（VOX-B で 'main' から 変わる。聞けない今は 'main'） */
const idbGetChunk = (page: Page, cx: number, cz: number) =>
  page.evaluate(
    (k) =>
      new Promise<{ v: number; gen: number; h: number; len: number } | null>((ok, ng) => {
        const r = indexedDB.open('rikkun-world', 1);
        r.onerror = () => ng(r.error);
        r.onsuccess = () => {
          const sid: string = (window as any).__rikkun.save.info().saveId ?? 'main';
          const g = r.result.transaction('chunks', 'readonly').objectStore('chunks').get([sid, k[0], k[1]]);
          g.onsuccess = () => ok(g.result ? { v: g.result.v, gen: g.result.gen, h: g.result.h, len: g.result.data.length } : null);
          g.onerror = () => ng(g.error);
        };
      }),
    [cx, cz],
  );

test.describe('VOX-F 保存', () => {
  test('AC1: ほる・おく → 保存 → 読みなおしで、世界・列のハッシュ・持ち物が同じ', async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.world.setBlock(4, 10, 6, 'log');
      h.world.setBlock(100, 8, 60, 'sand');
      h.inventory.setSlot(3, { item: 'dirt', count: 5 });
      h.step(2);
      await h.world.settle({ full: true }); // VOX-D: 読みこんだ列の数が 毎回ちがうと 全体のハッシュが 比べられない
      await h.save.now();
      return { hash: h.world.hash(), c00: h.world.hash(0, 0), c63: h.world.hash(6, 3), info: h.save.info() };
    });
    expect(before.info.dirtyChunks).toBeGreaterThanOrEqual(2);
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      await h.world.settle({ full: true });
      return { hash: h.world.hash(), c00: h.world.hash(0, 0), c63: h.world.hash(6, 3), slot: h.inventory.get().slots[3], info: h.save.info() };
    });
    expect(after.hash).toBe(before.hash);
    expect(after.c00).toBe(before.c00);
    expect(after.c63).toBe(before.c63);
    expect(after.slot).toEqual({ item: 'dirt', count: 5 });
    expect(after.info.loadedColumns).toBeGreaterThanOrEqual(2);
    expect(after.info.corruptColumns).toBe(0);
  });

  test('SAVE-30 AC2: 版 1 の列（今のビルドの形のバイト列）が、同じブロックで読める', async ({ page }) => {
    await boot(page);
    // 正しい meta と列を作らせる
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.world.setBlock(4, 10, 6, 'log');
      await h.save.now();
    });
    const before = await idbGetChunk(page, 0, 0);
    expect(before).not.toBeNull();
    // 列 (0,0) を、版 1 のバイト列で作ったもので上書き（番号は blockTypes() の並び = 版 1 の番号）
    await page.evaluate(async () => {
      // 版 1 の id の表（凍らせた物。BLOCK_IDS_V1 と同じ。blockTypes() には頼らない）
      const ids: string[] = ['air','grass','dirt','stone','sand','log','leaves','coal_ore','iron_ore','water','bedrock','furnace','kawara','brick','torch','start_torch','tansu','farmland','farmland_wet','crop_onion','crop_tomato','crop_pumpkin','crop_eggplant','wild_onion','wild_tomato','wild_pumpkin','wild_eggplant','kakashi','kakashi_head','saku','sprinkler'];
      const n = (id: string) => ids.indexOf(id);
      const li = (lx: number, ly: number, lz: number) => (ly * 16 + lz) * 16 + lx;
      const db: IDBDatabase = await new Promise((ok, ng) => {
        const r = indexedDB.open('rikkun-world', 1);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ng(r.error);
      });
      const saveId: string = (window as any).__rikkun.save.info().saveId ?? 'main';
      const old: { h: number; gen: number } = await new Promise((ok) => {
        const g = db.transaction('chunks', 'readonly').objectStore('chunks').get([saveId, 0, 0]);
        g.onsuccess = () => ok(g.result);
      });
      const parts: number[] = [];
      // セクション 0 = full（stone いっぱい。(4,10,6) = log、(5,10,6) = sand）
      const full = new Uint8Array(4096).fill(n('stone'));
      full[li(4, 10, 6)] = n('log');
      full[li(5, 10, 6)] = n('sand');
      parts.push(2, ...full);
      // セクション 1 = palette [leaves, water]。マス 0 だけ water（4 ビット × 4096）
      const packed = new Uint8Array(2048);
      packed[0] = 0x00 | 1; // マス 0 = 添字 1（water）、マス 1 = 添字 0（leaves）
      parts.push(1, 2, n('leaves'), n('water'), ...packed);
      // 残りは uniform air
      for (let k = 2; k < old.h; k++) parts.push(0, n('air'));
      const raw = new Uint8Array(parts);
      const w = new CompressionStream('deflate-raw');
      const wr = w.writable.getWriter();
      void wr.write(raw);
      void wr.close();
      const data = new Uint8Array(await new Response(w.readable).arrayBuffer());
      await new Promise<void>((ok, ng) => {
        const tx = db.transaction('chunks', 'readwrite');
        tx.objectStore('chunks').put({ v: 1, gen: old.gen, h: old.h, data }, [saveId, 0, 0]);
        tx.oncomplete = () => ok();
        tx.onerror = () => ng(tx.error);
      });
      db.close();
    });
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return {
        log: h.world.getBlock(4, 10, 6),
        sand: h.world.getBlock(5, 10, 6),
        stone: h.world.getBlock(6, 10, 6),
        water: h.world.getBlock(0, 16, 0),
        leaves: h.world.getBlock(1, 16, 0),
        air: h.world.getBlock(4, 40, 6),
        info: h.save.info(),
      };
    });
    expect(r).toMatchObject({ log: 'log', sand: 'sand', stone: 'stone', water: 'water', leaves: 'leaves', air: 'air' });
    expect(r.info.corruptColumns).toBe(0);
    expect(r.info.loadedColumns).toBeGreaterThanOrEqual(1);
  });

  test('SAVE-30 AC3: 新しく書いた列は版 2（v === 2）', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.world.setBlock(4, 10, 6, 'log');
      h.world.setBlock(100, 8, 60, 'sand');
      await h.save.now();
    });
    const a = await idbGetChunk(page, 0, 0);
    const b = await idbGetChunk(page, 6, 3);
    expect(a?.v).toBe(2);
    expect(b?.v).toBe(2);
  });

  test('AC5(VOX-D 基準 14): pagehide の保険で、最後の保存のあとの変更が残る（スタートから 300 はなれた列もふくむ）。最初の保存のあと保険が消える', async ({ context }) => {
    test.setTimeout(120_000);
    const page = await context.newPage();
    await boot(page);
    const far = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      await h.world.settle({ full: true });
      h.world.setBlock(2, 25, 2, 'log'); // いし の上に いし では変化 0（VOX-B: 地下）なので log
      await h.save.now();
      // 最後の保存のあとの変更（近い所）
      h.world.setBlock(3, 25, 3, 'sand');
      h.world.setBlock(90, 12, 50, 'log');
      // スタートから 300 はなれた列へ（テレポート）。そこの空に 1 マス置いて そのまま閉じる（輪の外の 保険の列）
      const sp = h.world.spawn();
      const fx = Math.floor(sp.x) + 300;
      const fz = Math.floor(sp.z);
      h.world.teleport(fx, fz);
      await h.world.settle();
      const fy = h.world.groundHeight(fx, fz) + 40;
      if (!h.world.setBlock(fx, fy, fz, 'log')) throw new Error('far setBlock failed');
      // 閉じる途中に 保険が 置かれたかを 見張る
      window.addEventListener('pagehide', () => localStorage.setItem('__pendingSeen', localStorage.getItem('rikkun-world-pending') ?? 'none'));
      return { fx, fy, fz };
    });
    await page.close({ runBeforeUnload: true });
    const page2 = await context.newPage();
    await boot(page2);
    const r = await page2.evaluate(
      async (far) => {
        const h = (window as any).__rikkun;
        h.pause();
        // ready のあと すぐ: 保険の列（輪の外でも 開始の前に読みこんで当てる K6）
        const farAtReady = h.world.getBlock(far.fx, far.fy, far.fz);
        const near = { a: h.world.getBlock(2, 25, 2), b: h.world.getBlock(3, 25, 3), c: h.world.getBlock(90, 12, 50) };
        const seen = localStorage.getItem('__pendingSeen');
        await h.save.now();
        const pendingAfter = localStorage.getItem('rikkun-world-pending');
        await h.world.settle();
        h.world.teleport(far.fx, far.fz);
        await h.world.settle();
        const farAfterSave = h.world.getBlock(far.fx, far.fy, far.fz);
        return { farAtReady, near, seen, pendingAfter, farAfterSave };
      },
      far,
    );
    console.log('AC5', JSON.stringify(r));
    expect(r.seen).not.toBe('none');
    expect(r.near).toEqual({ a: 'log', b: 'sand', c: 'log' });
    expect(r.farAtReady).toBe('log');
    expect(r.pendingAfter).toBeNull();
    expect(r.farAfterSave).toBe('log');
  });

  test('AC3: 保存の時間（記録）: dirty 4 列 + meta', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await boot(page, '?seed=41');
    const r = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      await h.save.now(); // 準備
      const main: number[] = [];
      const done: number[] = [];
      const bytes: number[] = [];
      for (let k = 0; k < 15; k++) {
        for (const [cx, cz] of [[1, 1], [3, 1], [1, 3], [3, 3]]) {
          for (let i = 0; i < 60; i++) h.world.setBlock(cx * 16 + (i % 12), 14 + (i % 4), cz * 16 + 2 + k, i % 2 ? 'sand' : 'log');
        }
        const t = performance.now();
        const p = h.save.now();
        const syncMs = performance.now() - t;
        await p;
        const info = h.save.info();
        main.push(syncMs);
        done.push(info.doneMs);
        bytes.push(info.bytes);
        if (info.dirtyChunks !== 4) throw new Error('dirtyChunks ' + info.dirtyChunks);
      }
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const max = (a: number[]) => Math.max(...a);
      return { mainMedian: med(main), mainMax: max(main), doneMedian: med(done), doneMax: max(done), bytes: med(bytes), failures: h.save.info().failures };
    });
    console.log('AC3', JSON.stringify(r));
    testInfo.annotations.push({ type: 'AC3', description: JSON.stringify(r) });
    expect(r.failures).toBe(0);
    expect(r.mainMedian).toBeLessThan(25); // 目安。本当の数字は docs/perf-reports/VOX-F.md
  });
});
