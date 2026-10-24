import { expect, test } from '@playwright/test';
import { openLive4 } from './helpers/live4';

/**
 * LIVE-4 E2E その 3（docs/design/LIVE-4.md 版 2 §3.2・§4.3・§6 AC17・AC19）: 保存・見た目 の しるし（窓口 `animals.fx().marks`）。
 * 保存 の 形（v 4 の まま・新しい 項目 なし・SAVE_GEN）は ユニット（src/animals/live4.test.ts）。ここ では 読み直し の あと の ふるまい。
 * 文字・案内画面 の 1 行（AC18）は ユニット（src/achievements/live4.test.ts・src/ui/book/live4Book.test.ts）。
 */
test.describe('LIVE-4 保存・しるし', () => {
  test.describe.configure({ timeout: 170_000 });

  test('AC17 保存: ねらい 中・2 回 当てた あと に save.now() → 読み直す と target null・hits 0・animals v 4・次 の ねらい の 3 回目 が きりあげ（数 は のこらない）', async ({ page }) => {
    await openLive4(page, '?');
    const before = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(11.5, 6.5);
      const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      M.faceTo(yid, 2);
      M.hit(yid, { m: mid });
      h.yokai.setHp(yid, 9999);
      const rows = M.rec(140, { m: mid, y: yid }, (r: any) => r.aev.filter((e: any) => e.type === 'machoPunch' && e.hit).length >= 0 && r.m?.hits === 2);
      const row = M.one(mid);
      const sv = h.animals.serialize();
      await h.save.now();
      return { mid, target: row.target ?? null, hits: row.hits ?? null, rows: rows.length, v: sv.v, keys: Object.keys(sv).sort(), friendKeys: Object.keys(sv.friends[0] ?? {}).sort() };
    });
    expect(before.target, '読み直す 前 は ねらって いる').not.toBeNull();
    expect(before.hits, '2 回 当てた').toBe(2);
    expect(before.v).toBe(4);
    expect(before.keys).toEqual(['coops', 'friends', 'kits', 'machoMiss', 'v']);
    for (const k of ['target', 'hits', 'punch']) expect(before.friendKeys, `保存 に ${k} は 入れない`).not.toContain(k);
    // 読み直し（同じ ブラウザ・同じ 保存）
    await openLive4(page, '?');
    const r = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const A = (window as any).__A;
      const M = (window as any).__M;
      h.pause();
      h.settings.set('animalAutoSpawn', false);
      h.settings.set('yokaiAutoSpawn', false);
      h.settings.set('yokaiWander', false);
      h.lock.simulate(true);
      await h.world.settle({ full: true });
      h.yokai.clear();
      const list = h.animals.list().filter((a: any) => a.friend);
      const o: any = { n: list.length, macho: list.filter((a: any) => a.breed === 'macho').length, target: list.map((a: any) => a.target ?? null), hits: list.map((a: any) => a.hits ?? 0), state: list.map((a: any) => a.state) };
      const m = list.find((a: any) => a.breed === 'macho');
      // 次 の ねらい: 3 回目 が きりあげ
      h.inventory.setSlot(0, { item: 'bokuto', count: 1 });
      h.inventory.select(0);
      h.step(1);
      h.blade.setStance('chudan');
      const p = h.player.get().position;
      const yid = M.yokai('karakasa', p.x + 4, p.z, { hp: 9999 });
      h.player.set({ position: { x: p.x, y: p.y, z: p.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      M.faceTo(yid, 2);
      const trig = M.hit(yid, { m: m.id });
      h.yokai.setHp(yid, 9999);
      const rows = M.rec(260, { m: m.id, y: yid });
      const hits = rows.flatMap((x: any) => x.aev).filter((e: any) => e.type === 'machoPunch' && e.hit);
      o.trigK = trig.k;
      o.upper = hits.slice(0, 3).map((e: any) => e.upper);
      o.sv = h.animals.serialize().v;
      void A;
      return o;
    });
    expect(r.macho, 'マッチョ は のこる').toBe(1);
    expect(r.target.every((t: unknown) => t === null), '読み直す と target null').toBe(true);
    expect(r.hits.every((n: number) => n === 0), 'hits 0').toBe(true);
    expect(r.trigK).toBeGreaterThanOrEqual(0);
    expect(r.upper, '数 は のこらない: 次 の ねらい の 3 回目 が きりあげ').toEqual([false, false, true]);
    expect(r.sv).toBe(4);
  });

  test('AC19 しるし: macho の「！」は 20 ステップ・妖怪 1 体 だけ に machoTarget・ねらい が おわる と 消える', async ({ page }) => {
    await openLive4(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const M = (window as any).__M;
      M.base();
      const mid = M.macho(11.5, 6.5);
      const yid = M.yokai('karakasa', 6.5, 6.5, { hp: 9999 });
      const other = M.yokai('karakasa', 6.5, 9.5, { hp: 9999 });
      const marks = () => {
        const m = (h.animals.fx() as any).marks as any[];
        return {
          bang: m.filter((x) => x.bang).map((x) => x.id),
          target: m.filter((x) => x.machoTarget).map((x) => x.id),
        };
      };
      const before = marks();
      M.faceTo(yid, 2);
      const trig = M.hit(yid, { m: mid });
      h.yokai.setHp(yid, 9999);
      const series: any[] = [{ ...marks(), n: 0, frozen: false }];
      for (let i = 0; i < 60; i++) {
        const fz = M.frozenNow();
        h.step(1);
        series.push({ ...marks(), n: i + 1, frozen: fz });
      }
      // おわり: 妖怪 を たおす（defeat）
      h.yokai.setHp(yid, 0);
      h.step(2);
      const afterKill = marks();
      return { mid, yid, other, before, series, afterKill, trigK: trig.k };
    });
    expect(r.before, 'ねらい の 前').toEqual({ bang: [], target: [] });
    const bangSteps = r.series.filter((s: any) => s.bang.includes(r.mid) && !s.frozen).length; // ヒットストップ中 は 数えない
    expect(bangSteps, '「！」は 20 ステップ（trigger の ステップ から 数える ため ±1）').toBeGreaterThanOrEqual(19);
    expect(bangSteps).toBeLessThanOrEqual(21);
    expect(r.series[r.series.length - 1].bang, '40 ステップ後 は 消えて いる').toEqual([]);
    for (const s of r.series) {
      expect(s.target.length, 'しるし は 同時 に 1 つ').toBeLessThanOrEqual(1);
      for (const id of s.target) expect(id, 'ねらい の 妖怪 の id').toBe(r.yid);
    }
    expect(r.series[r.series.length - 1].target, 'ねらい の あいだ は つづく').toEqual([r.yid]);
    expect(r.afterKill.target, 'ねらい が おわる と 消える').toEqual([]);
  });
});
