import { expect, test, type Page } from '@playwright/test';
import { flat, openBladeWorld, spawnAhead, stage } from './helpers/blade';
import { allSounds, comboWorld, hitsOf, holdDown, idle, mash, run, startList, starts, weaponPower, type ComboStep } from './helpers/combo';

/**
 * WEAPON-6（docs/design/WEAPON-6.md §6 通し）: AC12〜AC22・AC24（AC23 は 既存 spec が §6.1 の直しだけで 通ること）。
 * 数は ゲーム（window.__rikkun）に 聞く: 押す ステップは `blade.state().combo`、段は `blade.events()` の `step`、星は `blade.trail().stars`、
 * 強さは `settings.weaponDamage`、妖怪は `yokai.list()`。角度・座標は 決め打ちしない（前 = 北、立つ場所は 地面の高さを 聞く）。
 * 実装の 前は `combo`・`step`・`combo2`/`combo3` の 音・実績・新しい レシピが ないので 赤になる。
 */
test.describe.configure({ timeout: 180_000 });

const sumDamage = (rec: ComboStep[]) => hitsOf(rec).reduce((a, e) => a + (e.damage ?? 0), 0);
/** 2 回目以降の techStart の 位置（rec の 添え字）。step = 見たい 段 */
const idxOfStart = (rec: ComboStep[], step: number) => rec.findIndex((s) => s.events.some((e) => e.type === 'techStart' && e.step === step));

test.describe('WEAPON-6 通し', () => {
  test('AC12: 中段 3 段（毎ステップ 押す）。thrust → kiriage(+20) → kesa(+47) → thrust(+145)・音 combo2/combo3 が 1 回ずつ', async ({ page }) => {
    await comboWorld(page, 'chudan');
    const rec = await mash(page, 160);
    expect(startList(rec)).toEqual([
      [0, 1, 'thrust'],
      [20, 2, 'kiriage'],
      [47, 3, 'kesa'],
      [145, 1, 'thrust'],
    ]);
    const snd = allSounds(rec);
    expect(snd.filter((s) => s === 'combo2')).toHaveLength(1);
    expect(snd.filter((s) => s === 'combo3')).toHaveLength(1);
    expect(rec.findIndex((s) => s.sounds.includes('combo2')), 'combo2 は 2 段目を 始めた ステップ').toBe(idxOfStart(rec, 2));
    expect(rec.findIndex((s) => s.sounds.includes('combo3')), 'combo3 は 3 段目を 始めた ステップ').toBe(idxOfStart(rec, 3));
  });

  test('AC13: 下段 3 段。kiriage → thrust(+34) → kesa(+54) → kiriage(+152)', async ({ page }) => {
    await comboWorld(page, 'gedan');
    const rec = await mash(page, 165);
    expect(startList(rec)).toEqual([
      [0, 1, 'kiriage'],
      [34, 2, 'thrust'],
      [54, 3, 'kesa'],
      [152, 1, 'kiriage'],
    ]);
  });

  test('AC14: 3 段 ぜんぶ 当たる（ぬりかべ 前 1.5）。techHit は step 1・2・3 で 1 つずつ・damage 合計 = 強さ × 4.4・手前で止まる・実績', async ({ page }) => {
    await comboWorld(page, 'chudan');
    const id = await spawnAhead(page, 'nurikabe', 1.5, { hp: 99 });
    const P = await weaponPower(page, 'crystal_katana');
    const rec = await mash(page, 150);
    const hits = hitsOf(rec);
    expect(hits.map((e) => e.step)).toEqual([1, 2, 3]);
    expect(sumDamage(rec)).toBeCloseTo(P * 4.4, 2);
    for (const s of rec) {
      const y = s.yokai[id]!;
      expect(flat(s.pos, y), 'ぬりかべの 中心との きょり').toBeGreaterThanOrEqual(1.29);
    }
    const got = await page.evaluate(() => (window.__rikkun! as any).achievements.list().find((a: any) => a.id === 'blade.combo3.1'));
    expect(got, '実績 blade.combo3.1 が ある').toBeTruthy();
    expect(got.unlocked, '手に入る').toBe(true);
  });

  test('AC14b: 2 段目が とどく（O4）。中段・前 2.5 → step 2 の きりあげ F13〜15 と step 3 で 当たる。下段・前 1.9 → step 2 の つき F5〜6', async ({ page }) => {
    await comboWorld(page, 'chudan');
    await spawnAhead(page, 'karakasa', 2.5, { hp: 99 });
    let rec = await mash(page, 150);
    let hits = hitsOf(rec);
    expect(hits.map((e) => e.step)).toEqual([1, 2, 3]);
    const t2 = starts(rec).find((e) => e.step === 2)!.tick;
    const h2 = hits.find((e) => e.step === 2)!;
    expect(h2.tech).toBe('kiriage');
    expect(h2.tick - t2 + 1, '2 段目の F').toBeGreaterThanOrEqual(13);
    expect(h2.tick - t2 + 1).toBeLessThanOrEqual(15);
    expect(hits.find((e) => e.step === 3)!.tech).toBe('kesa');

    await comboWorld(page, 'gedan');
    await spawnAhead(page, 'karakasa', 1.9, { hp: 99 });
    rec = await mash(page, 160);
    hits = hitsOf(rec);
    expect(hits.map((e) => e.step)).toEqual([1, 2, 3]);
    const g2 = starts(rec).find((e) => e.step === 2)!.tick;
    const gh = hits.find((e) => e.step === 2)!;
    expect(gh.tech).toBe('thrust');
    expect(gh.tick - g2 + 1, '2 段目 つきの F').toBeGreaterThanOrEqual(5);
    expect(gh.tick - g2 + 1).toBeLessThanOrEqual(6);
  });

  test('AC14c: 2 段目の ふみこみ 1.4（きりあげ F14〜F45・つき F6〜）。2 段の かべ・3 段の がけで 止まる', async ({ page }) => {
    const floorY = await comboWorld(page, 'chudan');
    let rec = await mash(page, 120);
    let i2 = idxOfStart(rec, 2);
    expect(i2, '2 段目が 出た').toBeGreaterThan(0);
    const adv = (k: number) => flat(rec[i2 + k]!.pos, rec[i2]!.pos);
    expect(adv(13), 'F14').toBeCloseTo(1.4, 1);
    expect(Math.abs(adv(13) - 1.4)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(adv(44) - 1.4), 'F45').toBeLessThanOrEqual(0.01);

    await comboWorld(page, 'gedan');
    rec = await mash(page, 120);
    i2 = idxOfStart(rec, 2);
    expect(i2).toBeGreaterThan(0);
    expect(Math.abs(flat(rec[i2 + 5]!.pos, rec[i2]!.pos) - 1.4), 'つき 2 段目 F6').toBeLessThanOrEqual(0.01);

    // かべ: 前 1.0 の 面に 2 段（立つ場所を 21.0 に して かべは z 19 の 列 = 面 z 20.0）
    await stage(page, { floorY, z: 21.0 });
    const wallFace = 20.0;
    await page.evaluate((floorY) => {
      const h = window.__rikkun! as any;
      h.world.fill(14, floorY + 1, 19, 26, floorY + 2, 19, 'stone');
      // ＋マークを 空へ（かべに 向けると 左クリックが「ほる」に なる）
      h.player.set({ pitch: 40 });
      h.step(2);
    }, floorY);
    rec = await mash(page, 120);
    expect(idxOfStart(rec, 2), '2 段目が 出た').toBeGreaterThan(0);
    expect(Math.min(...rec.map((s) => s.pos.z)), 'かべの 中に 入らない').toBeGreaterThanOrEqual(wallFace + 0.3 - 0.01);
    expect(rec[rec.length - 1]!.pos.z, 'かべの 手前で 止まった').toBeLessThanOrEqual(wallFace + 0.3 + 0.1);

    // がけ: 前の 3 段を 空気に
    await comboWorld(page, 'chudan');
    await page.evaluate((floorY) => {
      const h = window.__rikkun! as any;
      const p = h.player.get().position;
      h.world.fill(Math.floor(p.x) - 6, floorY - 3, Math.floor(p.z) - 10, Math.floor(p.x) + 6, floorY, Math.floor(p.z) - 2, 'air');
      h.step(1);
    }, floorY);
    rec = await mash(page, 120);
    expect(idxOfStart(rec, 2), '2 段目が 出た').toBeGreaterThan(0);
    expect(Math.min(...rec.map((s) => s.pos.y)), '落ちない').toBeGreaterThan(floorY + 0.5);
  });

  test('AC15: ほかの刀（かたな）は 今のまま。thrust だけが 42 ステップごと・step は いつも 1・combo は null', async ({ page }) => {
    await comboWorld(page, 'chudan', 'katana');
    const rec = await mash(page, 120);
    expect(startList(rec)).toEqual([
      [0, 1, 'thrust'],
      [41, 1, 'thrust'],
      [82, 1, 'thrust'],
    ]);
    for (const s of rec) expect(s.combo, 'combo は null').toBeNull();
  });

  test('AC16: 長押しでは つながらない。きらめく カタナ・中段・120 ステップ → thrust が +41・+82（step 1 だけ）', async ({ page }) => {
    await comboWorld(page, 'chudan');
    const rec = await holdDown(page, 120);
    expect(startList(rec)).toEqual([
      [0, 1, 'thrust'],
      [41, 1, 'thrust'],
      [82, 1, 'thrust'],
    ]);
  });

  test('AC17: 窓を すぎたら 1 段目。つき 1 段目だけ → F41 で おわり・F42 から 何も出ない。そのあと 押すと step 1', async ({ page }) => {
    await comboWorld(page, 'chudan');
    const rec = await run(page, 60, { before: '(h, i) => { if (i === 0) h.input.press("primary"); if (i === 1) h.input.release("primary"); }' });
    expect(rec[4]!.combo?.open, 'F5 から 窓が ひらく').toBe(true);
    expect(rec[40]!.combo?.open, 'F41 まで ひらいている').toBe(true);
    expect(rec[40]!.f, 'F41').toBe(41);
    expect(rec[41]!.f, 'F42 は idle').toBe(0);
    expect(rec[41]!.tech).toBeNull();
    expect(starts(rec)).toHaveLength(1);
    expect(rec[41]!.combo, 'F42 は combo なし').toBeNull();
    const again = await mash(page, 3);
    expect(starts(again)[0]!.step).toBe(1);
  });

  test('AC18: かまえ変えと つなぎ。(1) F35 に R だけ → F42 に かまえ変え・2 段目 なし (2) F35 に R・F37 に 押す → F38 に 2 段目 kiriage・かまえ 中段・buffered null', async ({ page }) => {
    await comboWorld(page, 'chudan');
    await markNow0(page);
    const only = '(h, i) => { if (i === 0) h.input.press("primary"); if (i === 1) h.input.release("primary"); if (i === 34) h.input.press("stanceNext"); if (i === 35) h.input.release("stanceNext"); }';
    let rec = await run(page, 60, { before: only });
    const t0 = starts(rec)[0]!.tick;
    expect(starts(rec), '2 段目は 出ない').toHaveLength(1);
    const sw = rec.flatMap((s) => s.events).find((e: any) => e.type === 'stance') as any;
    expect(sw, 'かまえ変えの 出来事').toBeTruthy();
    expect(sw.tick - t0, 'F42 に かまえ変え').toBe(41);
    expect(sw.to).toBe('jodan');

    await idle(page, 130);
    await comboWorld(page, 'chudan');
    const both = '(h, i) => { if (i === 0) h.input.press("primary"); if (i === 1) h.input.release("primary"); if (i === 34) h.input.press("stanceNext"); if (i === 35) h.input.release("stanceNext"); if (i === 36) h.input.press("primary"); if (i === 37) h.input.release("primary"); }';
    await markNow0(page);
    rec = await run(page, 50, { before: both });
    const st = starts(rec);
    expect(st.map((e) => [e.tick - st[0]!.tick, e.step, e.tech])).toEqual([
      [0, 1, 'thrust'],
      [37, 2, 'kiriage'],
    ]);
    const i2 = idxOfStart(rec, 2);
    expect(rec[i2]!.stance, 'かまえは 中段のまま').toBe('chudan');
    expect(rec[i2]!.buffered, 'おぼえた R は すてる').toBeNull();
  });

  test('AC19: パリィ。つき 1 段目の F10 に Shift＋押す → F21 に parryStart・2 段目は 出ない。そのあとの わざは step 1', async ({ page }) => {
    await comboWorld(page, 'chudan');
    await markNow0(page);
    const base = await page.evaluate(() => (window.__rikkun! as any).parry.events().length as number);
    const script =
      '(h, i) => { if (i === 0) h.input.press("primary"); if (i === 1) h.input.release("primary"); if (i === 9) { h.input.press("run"); h.input.press("primary"); } if (i === 10) h.input.release("primary"); }';
    const rec = await run(page, 60, { before: script });
    const t0 = starts(rec)[0]!.tick;
    expect(starts(rec), '2 段目は 出ない').toHaveLength(1);
    const ps = await page.evaluate((base) => (window.__rikkun! as any).parry.events().slice(base).filter((e: any) => e.type === 'parryStart') as { tick: number }[], base);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.tick - t0, 'F21 に parryStart').toBe(20);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.releaseAll();
      h.step(130);
    });
    const next = await mash(page, 3);
    expect(starts(next)[0]!.step, 'パリィの あとは step 1').toBe(1);
  });

  test('AC20: 段の印。中段 3 段の 軌跡の 星が 1・2・3 こ。上段の おおげさぎりは 1 こ。かたなは 0', async ({ page }) => {
    const starsPerStep = (rec: ComboStep[]) => {
      let cur = 0;
      const byStep: Record<number, number[]> = { 1: [], 2: [], 3: [] };
      for (const s of rec) {
        const e = s.events.filter((x) => x.type === 'techStart').pop();
        if (e) cur = e.step ?? 0;
        if (s.trailVisible && cur) (byStep[cur] ??= []).push(s.stars);
      }
      return byStep;
    };
    await comboWorld(page, 'chudan');
    let by = starsPerStep(await mash(page, 140));
    for (const n of [1, 2, 3]) {
      expect(by[n]!.length, `${n} 段目の 軌跡が 見える`).toBeGreaterThan(0);
      expect(Math.max(...by[n]!), `${n} 段目の 星の 数`).toBe(n);
    }
    await comboWorld(page, 'jodan');
    by = starsPerStep(await mash(page, 110));
    expect(Math.max(...by[1]!), '上段の 1 発').toBe(1);
    expect(by[2]!.length, '上段は つながらない').toBe(0);
    await comboWorld(page, 'chudan', 'katana');
    const rec = await mash(page, 100);
    expect(Math.max(...rec.map((s) => s.stars)), 'かたなは 星なし').toBe(0);
  });

  test('AC21: 向きは 段ごと。2 段目を 始める ステップに 右キー → 2 段目の dirDeg が 1 段目と ちがう。3 段目は 少し 斜めの 妖怪へ むく', async ({ page }) => {
    await comboWorld(page, 'chudan');
    await page.evaluate(() => {
      delete (window as any).__c0;
    });
    await markNow0(page);
    const script = `(h, i, last) => {
      if (i === 0) h.input.press("primary");
      if (i === 1) h.input.release("primary");
      if (i === 4) h.input.press("primary");
      if (i === 5) h.input.release("primary");
      const c = h.blade.state().combo;
      if (c && c.cancelAt && !window.__c0) window.__c0 = c.cancelAt;
      if (window.__c0 && last && last.f === window.__c0 - 1) h.input.press("moveRight");
    }`;
    let rec = await run(page, 40, { before: script });
    const i2 = idxOfStart(rec, 2);
    expect(i2, '2 段目が 出た').toBeGreaterThan(0);
    const d1 = rec[0]!.dirDeg!;
    const d2 = rec[i2]!.dirDeg!;
    expect(Math.abs(d2 - d1), '右の 向き').toBeGreaterThan(5);
    const rightSign = Math.sign(d2 - d1);

    await comboWorld(page, 'chudan');
    await markNow0(page);
    const assist = `(h, i, last) => {
      if (last && last.combo && last.combo.step === 2 && last.combo.cancelAt && last.f === last.combo.cancelAt - 1 && !window.__sp) {
        window.__sp = true;
        h.yokai.spawn("karakasa", last.pos.x + 1.5, last.pos.y, last.pos.z - 4.0, { ai: false });
      }
    }`;
    await page.evaluate(() => {
      delete (window as any).__sp;
    });
    rec = await mash(page, 70, assist);
    const i3 = idxOfStart(rec, 3);
    expect(i3, '3 段目が 出た').toBeGreaterThan(0);
    const turn = rec[i3]!.dirDeg! - rec[0]!.dirDeg!;
    expect(Math.sign(turn), '右の 妖怪の ほうへ（右キーと 同じ 側）').toBe(rightSign);
    const want = (Math.atan2(1.5, 4.0) * 180) / Math.PI; // 妖怪への 角度
    expect(Math.abs(Math.abs(turn) - want), '妖怪の ほうを むく').toBeLessThanOrEqual(8);
  });

  test('AC22: 見直し。てつ 2・き 2・すいしょう 2 で つくれる（材料 0）・てつ 1 本 たりないと つくれない・たいきゅう 400', async ({ page }) => {
    await openBladeWorld(page);
    const give = (iron: number, log: number, crystal: number) =>
      page.evaluate(
        ({ iron, log, crystal }) => {
          const h = window.__rikkun! as any;
          h.inventory.clear();
          if (iron) h.inventory.add('iron_ingot', iron);
          if (log) h.inventory.add('log', log);
          if (crystal) h.inventory.add('crystal', crystal);
        },
        { iron, log, crystal },
      );
    await give(1, 2, 2);
    const no = await page.evaluate(() => (window.__rikkun! as any).craft.make('crystal_katana'));
    expect(no.ok, 'てつ 1 本 たりない').toBe(false);

    await give(2, 2, 2);
    const ok = await page.evaluate(() => (window.__rikkun! as any).craft.make('crystal_katana'));
    expect(ok.ok).toBe(true);
    const after = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      let dur: unknown = null;
      for (let i = 0; i < 36; i++) {
        const d = h.inventory.durability(i);
        if (d) dur = d;
      }
      return { iron: h.inventory.count('iron_ingot'), log: h.inventory.count('log'), crystal: h.inventory.count('crystal'), katana: h.inventory.count('crystal_katana'), dur };
    });
    expect(after).toMatchObject({ iron: 0, log: 0, crystal: 0, katana: 1, dur: { max: 400, left: 400 } });
  });

  test('AC24 smoke: きらめく カタナで 中段 3 段を 1 回 出し、エラーなし', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await comboWorld(page, 'chudan');
    const rec = await mash(page, 120);
    expect(starts(rec).map((e) => e.step)).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  });
});

/** 出来事の 起点を 今に そろえる（`run` を 直接 使う とき） */
async function markNow0(page: Page): Promise<void> {
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    (window as any).__comboSeen = h.blade.events().length;
    h.combat.sounds();
  });
}
