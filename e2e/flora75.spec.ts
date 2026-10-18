import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fine, wide } from './helpers/fine';
import { measureCountry, measureStart, openFlora } from './helpers/flora';

/**
 * #75 FLORA-75（docs/design/FLORA-75.md 1.3 版）の E2E。AC10・AC11・AC17b（【E2E】と書いた物）。
 * ユニットで見る物（AC1〜9・14〜16・18・19）は src/world/gen/*.test.ts（developer が書く）。
 * 窓口 `biome.plants`・`biome.flora`・`biome.spacing`・`biome.findSpacing`（§9）と ブロック `kusa`・`nobana`（id は 仮。変わったら ここを直す）は
 * 実装の前は 無いので、ここは赤になる。場所・高さは ゲームに聞く。進めるのは step の数（時間では待たない。rule #130）。
 */

type Plant = { type: string; x: number; y: number; z: number };

test.describe('#75 くさ・のばな・間隔のきまり', () => {
  test('AC10: はらっぱで くさ を こわす → 持ち物 ふえない／のばな を こわす → ＋1 → くさ ブロックの上に置ける／くわ で くさ を たがやす（1 本の通し）', async ({ page }) => {
    test.setTimeout(240_000);
    await openFlora(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const B = (window as any).__biomeT;
      const F = (window as any).__floraT;
      const out: any = { steps: [] as string[] };
      const total = (): number => h.inventory.get().slots.reduce((n: number, s: any) => n + (s ? s.count : 0), 0);
      const tap = (a: string) => {
        h.input.release(a);
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(2);
      };
      /** 板 p に 立ってねらえる所まで 行く。だめなら false */
      const reach = (p: Plant): boolean => {
        const g = B.goToPoint({ x: p.x, z: p.z });
        if (!g.loaded) return false;
        if (h.world.getBlock(p.x, p.y, p.z) !== p.type) return false; // plants が 返した所に 本当に その板があるか
        return F.bestSpot(p.x, p.y, p.z);
      };
      /** 左ボタンを 押し続けて こわす（step の上限つき）。こわれたら true */
      const dig = (p: Plant): boolean => {
        h.input.press('primary');
        let n = 0;
        while (h.world.getBlock(p.x, p.y, p.z) === p.type && n < 120) {
          h.step(1);
          n++;
        }
        h.input.release('primary');
        h.step(10);
        return h.world.getBlock(p.x, p.y, p.z) === 'air';
      };
      const start = B.goTo('harappa').point;
      const all: Plant[] = h.biome.plants(start.x - 96, start.z - 96, start.x + 96, start.z + 96);
      out.counts = { kusa: all.filter((p) => p.type === 'kusa').length, nobana: all.filter((p) => p.type === 'nobana').length };
      const pick = (type: string, skip = 0): Plant | null => {
        let seen = 0;
        for (const p of all.filter((q) => q.type === type)) {
          if (!reach(p)) continue;
          if (seen++ < skip) continue;
          return p;
        }
        return null;
      };
      h.inventory.clear();
      // 1) くさ を こわす → 持ち物が ふえない
      const k1 = pick('kusa');
      out.k1 = k1;
      if (k1) {
        const before = total();
        out.k1Gone = dig(k1);
        out.k1Delta = total() - before;
      }
      // 2) のばな を こわす → のばな ＋1
      const n1 = pick('nobana');
      out.n1 = n1;
      if (n1) {
        out.nBefore = h.inventory.count('nobana');
        out.n1Gone = dig(n1);
        out.nAfter = h.inventory.count('nobana');
      }
      // 3) のばな を くさ ブロックの上に 置く（くさ の板を こわした あとの その下の くさ ブロック）
      const k2 = pick('kusa');
      out.k2 = k2;
      if (k2 && out.nAfter >= 1) {
        out.k2Gone = dig(k2);
        const slot = h.inventory.get().slots.findIndex((s: any) => s && s.item === 'nobana');
        h.inventory.select(slot);
        h.step(1);
        out.k2Under = h.world.getBlock(k2.x, k2.y - 1, k2.z);
        F.bestSpot(k2.x, k2.y - 1, k2.z); // 下の くさ ブロックを ねらえる所
        (window as any).__aim.solve(k2.x, k2.y - 1, k2.z, 1);
        h.step(1);
        out.placeTarget = h.target.get()?.place ?? null;
        tap('secondary');
        out.placed = h.world.getBlock(k2.x, k2.y, k2.z);
        out.nLeft = h.inventory.count('nobana');
      }
      // 4) くわ で くさ（板）を たがやす → 下が はたけ・上は くうき
      const k3 = pick('kusa');
      out.k3 = k3;
      if (k3) {
        h.inventory.clear();
        h.inventory.add('kuwa', 1);
        h.inventory.select(0);
        h.step(1);
        F.aimAt(k3.x, k3.y, k3.z);
        out.k3Target = h.target.get()?.block ?? null;
        tap('secondary');
        out.k3Soil = h.world.getBlock(k3.x, k3.y - 1, k3.z);
        out.k3Above = h.world.getBlock(k3.x, k3.y, k3.z);
      }
      return out;
    });
    const ctx = JSON.stringify(r);
    expect(r.counts.kusa, `はらっぱに くさ（biome.plants）${ctx}`).toBeGreaterThanOrEqual(3);
    expect(r.counts.nobana, `はらっぱに のばな ${ctx}`).toBeGreaterThanOrEqual(1);
    expect(r.k1, `ねらえる くさ ${ctx}`).not.toBeNull();
    expect(r.k1Gone, `くさ が 1 回で 消える ${ctx}`).toBe(true);
    expect(r.k1Delta, `くさ は 持ち物が ふえない ${ctx}`).toBe(0);
    expect(r.n1, `ねらえる のばな ${ctx}`).not.toBeNull();
    expect(r.n1Gone, `のばな が 消える ${ctx}`).toBe(true);
    expect(r.nAfter - r.nBefore, `のばな ＋1 ${ctx}`).toBe(1);
    expect(r.k2, `2 本目の くさ ${ctx}`).not.toBeNull();
    expect(r.k2Under, `下は くさ ブロック ${ctx}`).toBe('grass');
    expect(r.placed, `のばな を 置けた ${ctx}`).toBe('nobana');
    expect(r.nLeft, `置いたぶん へる ${ctx}`).toBe(0);
    expect(r.k3, `3 本目の くさ ${ctx}`).not.toBeNull();
    expect(r.k3Target, `くさ（板）を ねらえている ${ctx}`).toMatchObject({ x: r.k3.x, y: r.k3.y, z: r.k3.z });
    expect(['farmland', 'farmland_wet'], `くわ で 下が はたけ ${ctx}`).toContain(r.k3Soil);
    expect(r.k3Above, `上は くうき ${ctx}`).toBe('air');
  });

  test('AC11: スタートの 描画回数が ゴールデンと 同じ・三角形の ふえ ≤ 36,864。12 の国の 三角形 ≤ 903,036（くさ・のばな の 窓口つき）', async ({ page }) => {
    test.setTimeout(580_000);
    // ゴールデン = 今の main（FLORA-75 の前）で 同じやり方で 記録した値（e2e/golden/flora75-main.json）
    const golden = JSON.parse(readFileSync('e2e/golden/flora75-main.json', 'utf8')) as {
      start: { drawCalls: number; triangles: number };
      countries: Record<string, { triangles: number }>;
    };
    await openFlora(page, fine(wide('?nosave=1')));
    const start = await measureStart(page);
    // くさ・のばな が 本当に 生えて 描かれている（何も生やさない実装で 通らないように）
    const flora = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const sp = h.world.spawn();
      const cx0 = Math.floor(sp.x / 16);
      const cz0 = Math.floor(sp.z / 16);
      let kusa = 0;
      let nobana = 0;
      let maxTris = 0;
      for (let cz = cz0 - 6; cz <= cz0 + 6; cz++)
        for (let cx = cx0 - 6; cx <= cx0 + 6; cx++) {
          const f = h.biome.flora(cx, cz);
          kusa += f.kusa;
          nobana += f.nobana;
          maxTris = Math.max(maxTris, f.tris);
        }
      return { kusa, nobana, maxTris };
    });
    expect(flora.kusa, JSON.stringify(flora)).toBeGreaterThan(0);
    expect(flora.nobana, JSON.stringify(flora)).toBeGreaterThan(0);
    expect(flora.maxTris, '1 列の くさ＋のばな の三角形').toBeLessThanOrEqual(256);
    expect(start.drawCalls, `描画回数は ふえない（ゴールデン ${golden.start.drawCalls}）`).toBe(golden.start.drawCalls);
    expect(start.triangles - golden.start.triangles, `三角形の ふえ（ゴールデン ${golden.start.triangles}）`).toBeLessThanOrEqual(36_864);
    const kinds = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji', 'yuki'];
    const worst: Record<string, number> = {};
    for (const k of kinds) {
      const s = await measureCountry(page, k);
      expect(s.here, `${k}: 足もとの国`).toBe(k);
      worst[k] = s.triangles;
      const before = golden.countries[k]!.triangles;
      // ふえは 36,864 まで。上限 903,036 は 前から 超えていた国（momiji。この 5 か所の取り方で 988,080）をのぞいて 見る
      expect(s.triangles - before, `${k}: 三角形の ふえ（前 ${before}）`).toBeLessThanOrEqual(36_864);
      if (before <= 903_036) expect(s.triangles, `${k}: 1 コマの三角形（おおきな きの もり は とくに）${JSON.stringify(worst)}`).toBeLessThanOrEqual(903_036);
    }
  });

  test('AC17b: はらっぱの せまい 場所は ひろい 場所より 木＋草花が 2 倍以上（findSpacing で 行って 立てる）', async ({ page }) => {
    test.setTimeout(300_000);
    // シードを 決め打ちしない。findSpacing が null なら 次のシード（§9）
    const seeds: (number | null)[] = [null, 1, 2, 3, 4, 5];
    let report = '';
    let done = false;
    for (const seed of seeds) {
      await openFlora(page, seed === null ? '?nosave=1' : `?nosave=1&seed=${seed}`);
      const found = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        return {
          narrow: h.biome.findSpacing('narrow', { kind: 'harappa' }) as { x: number; z: number } | null,
          wide: h.biome.findSpacing('wide', { kind: 'harappa' }) as { x: number; z: number } | null,
        };
      });
      if (!found.narrow || !found.wide) {
        report += ` seed=${seed}: findSpacing が null(${JSON.stringify(found)})`;
        continue;
      }
      const r = await page.evaluate((f) => {
        const h = (window as any).__rikkun;
        const B = (window as any).__biomeT;
        /** まわり 3×3 列（48×48）の 木＋草花の 数（biome.plants の ぜんぶの種類） */
        const around = (p: { x: number; z: number }): number => {
          const cx = Math.floor(p.x / 16);
          const cz = Math.floor(p.z / 16);
          return (h.biome.plants((cx - 1) * 16, (cz - 1) * 16, (cx + 2) * 16 - 1, (cz + 2) * 16 - 1) as unknown[]).length;
        };
        const stand = (p: { x: number; z: number }) => {
          const g = B.goToPoint(p);
          h.step(30);
          const pos = h.player.get().position;
          const gy = h.world.groundHeight(Math.floor(pos.x), Math.floor(pos.z));
          return { loaded: g.loaded as boolean, here: g.here as string, dy: pos.y - (gy + 1) };
        };
        return {
          nNarrow: around(f.narrow),
          nWide: around(f.wide),
          sNarrow: stand(f.narrow),
          sWide: stand(f.wide),
          levelN: h.biome.spacing(f.narrow.x, f.narrow.z).level,
          levelW: h.biome.spacing(f.wide.x, f.wide.z).level,
        };
      }, found as { narrow: { x: number; z: number }; wide: { x: number; z: number } });
      const ctx = JSON.stringify({ seed, found, r });
      expect(r.levelN, ctx).toBe('narrow');
      expect(r.levelW, ctx).toBe('wide');
      for (const s of [r.sNarrow, r.sWide]) {
        expect(s.loaded, `立てる場所が 読みこまれる ${ctx}`).toBe(true);
        expect(s.here, `はらっぱ ${ctx}`).toBe('harappa');
        expect(Math.abs(s.dy), `地面の上に 立っている ${ctx}`).toBeLessThan(0.5);
      }
      expect(r.nWide, `ひろい にも 何か 生える ${ctx}`).toBeGreaterThan(0);
      expect(r.nNarrow, `せまい ≥ ひろい × 2 ${ctx}`).toBeGreaterThanOrEqual(r.nWide * 2);
      done = true;
      break;
    }
    expect(done, `どのシードでも findSpacing が null:${report}`).toBe(true);
  });
});
