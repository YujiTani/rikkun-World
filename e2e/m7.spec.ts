import { expect, test, type Page } from '@playwright/test';

/**
 * M7 農業 フェーズ 1 の つなぎ込みの確認（docs/design/M7-farm.md §6 の AC のうち、E2E でしか見えないもの）。
 * 場所は テスト用の場所（床 stone y=8、うえは くうき）。プレイヤー (2.5,9,6.5) が +x を向き、ななめ下の (4,9,6) をねらう。
 * スクショは docs/screenshots/m7-*.png。
 */
const OUT = 'docs/screenshots';
const NOON = 20000;
const MIDNIGHT = 70000;

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => (window.__rikkun as any).achievements.mute(true));
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    const T: any = {
      base() {
        h.pause();
        h.lock.simulate(true);
        h.input.releaseAll();
        h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
        h.world.fill(0, 9, 0, 12, 20, 12, 'air');
        h.inventory.clear();
        h.time.set(12000);
        T.look();
        h.step(10);
        h.farm.events();
      },
      look() {
        h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -30 });
        h.step(1);
      },
      /** ボタンを 1 ステップだけ 押す */
      tap(a = 'secondary') {
        h.input.release(a);
        h.input.press(a);
        h.step(1);
        h.input.release(a);
        h.step(1);
      },
      hold(item: string) {
        h.inventory.clear();
        h.inventory.add(item, 1);
        h.inventory.select(0);
        h.step(1);
      },
      /** 作物のマスを 1 つ そだてる */
      grow(x: number, y: number, z: number, stage: number) {
        h.farm.setStage(x, y, z, stage);
        h.step(1);
      },
    };
    (window as any).T = T;
  });
}

test.describe('M7 農業', () => {
  test('たがやす → まく → そだつ → しゅうかく → たべる（AC1・AC5・AC11・AC19・AC31）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const out: any = {};
      h.world.setBlock(4, 9, 6, 'dirt');
      h.step(1);
      // くわ
      h.inventory.add('stone', 1);
      h.inventory.add('log', 2);
      T.hold('kuwa');
      h.farm.events();
      T.tap('secondary');
      out.soil = h.farm.soil(4, 9, 6);
      out.block = h.world.getBlock(4, 9, 6);
      out.tillEvents = h.farm.events().filter((e: any) => e.type === 'till').length;
      // たね
      T.hold('seed_tomato');
      T.tap('secondary');
      out.crop0 = h.farm.crop(4, 10, 6);
      out.seedLeft = h.inventory.count('seed_tomato');
      out.plantEvents = h.farm.events().filter((e: any) => e.type === 'plant').length;
      // そだつ（ひる・たいまつ。farmGrowDays を 1/1000 に）
      h.settings.set('farmGrowDays', { dry: { onion: 0.00125, tomato: 0.00075, pumpkin: 0.002, eggplant: 0.00125 } });
      h.time.set(20000);
      h.world.setBlock(4, 10, 7, 'torch');
      h.step(2);
      out.litBefore = h.farm.crop(4, 10, 6)?.lit;
      h.step(600);
      out.crop3 = h.farm.crop(4, 10, 6);
      out.look3 = h.farm.look(4, 10, 6);
      out.hud3 = h.farm.hud();
      // しゅうかく
      T.hold('stone');
      h.inventory.clear();
      h.input.press('primary');
      h.step(2);
      h.input.release('primary');
      out.after = h.world.getBlock(4, 10, 6);
      out.soilAfter = h.farm.soil(4, 9, 6);
      out.tomato = h.inventory.count('tomato');
      out.seeds = h.inventory.count('seed_tomato');
      out.progress = h.dig.get().progress;
      out.harvestEvents = h.farm.events().filter((e: any) => e.type === 'harvest').length;
      // たべる
      h.combat.setHp(10);
      h.inventory.clear();
      h.inventory.add('tomato', 2);
      h.inventory.select(0);
      h.step(1);
      T.tap('secondary');
      out.hpAfter = h.combat.get().hp;
      out.tomatoLeft = h.inventory.count('tomato');
      return out;
    });
    expect(r.soil).toEqual({ wet: false });
    expect(r.block).toBe('farmland');
    expect(r.tillEvents).toBe(1);
    expect(r.crop0).toMatchObject({ kind: 'tomato', stage: 0, stageTicks: 0 });
    expect(r.seedLeft).toBe(0);
    expect(r.plantEvents).toBe(1);
    expect(r.litBefore).toBe(true);
    expect(r.crop3).toMatchObject({ kind: 'tomato', stage: 3, ripe: true });
    expect(r.look3.brightness).toBeGreaterThanOrEqual(0.7);
    expect(r.hud3).toMatchObject({ dots: 4, ripe: true });
    expect(r.after).toBe('air');
    expect(r.soilAfter).not.toBeNull();
    expect(r.tomato).toBeGreaterThanOrEqual(1);
    expect(r.tomato).toBeLessThanOrEqual(2);
    expect(r.seeds).toBeGreaterThanOrEqual(1);
    expect(r.seeds).toBeLessThanOrEqual(2);
    expect(r.progress).toBe(0);
    expect(r.harvestEvents).toBe(1);
    expect(r.hpAfter).toBe(12);
    expect(r.tomatoLeft).toBe(1);
  });

  test('すでで 3 回おすと たがやす・上がふさがっていたら たがやさない（AC2）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 9, 6, 'dirt');
      h.step(1);
      const out: any = {};
      T.tap('secondary');
      out.one = h.farm.soil(4, 9, 6);
      T.tap('secondary');
      out.two = h.farm.soil(4, 9, 6);
      out.press = h.farm.events().filter((e: any) => e.type === 'tillPress').map((e: any) => e.count);
      T.tap('secondary');
      out.three = h.farm.soil(4, 9, 6);
      // 2 回おして 121 ステップ まつと 数は 0 にもどる
      h.world.setBlock(4, 9, 6, 'dirt');
      h.step(1);
      T.tap('secondary');
      T.tap('secondary');
      h.step(121);
      T.tap('secondary');
      out.reset = h.farm.soil(4, 9, 6);
      // 上が くうき でない つち は たがやさない
      h.world.setBlock(4, 9, 6, 'dirt');
      h.world.setBlock(4, 10, 6, 'stone');
      h.step(1);
      for (let i = 0; i < 4; i++) T.tap('secondary');
      out.covered = h.farm.soil(4, 9, 6);
      // 石は 何回でも かわらない
      h.world.setBlock(4, 10, 6, 'air');
      h.world.setBlock(4, 9, 6, 'stone');
      h.step(1);
      for (let i = 0; i < 4; i++) T.tap('secondary');
      out.stone = h.world.getBlock(4, 9, 6);
      return out;
    });
    expect(r.one).toBeNull();
    expect(r.two).toBeNull();
    expect(r.press).toEqual([1, 2]);
    expect(r.three).toEqual({ wet: false });
    expect(r.reset).toBeNull();
    expect(r.covered).toBeNull();
    expect(r.stone).toBe('stone');
  });

  test('くらいと そだたない・たいまつで そだつ・月の しるし（AC31）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 9, 6, 'dirt');
      h.step(1);
      h.farm.till(4, 9, 6);
      h.farm.plant(4, 9, 6, 'tomato');
      h.settings.set('farmGrowDays', { dry: { tomato: 0.00075, onion: 0.001, pumpkin: 0.002, eggplant: 0.001 } });
      h.time.set(70000);
      // 上を ふさいで 明るさ 0 にする
      h.world.fill(0, 14, 0, 12, 14, 12, 'stone');
      h.step(5);
      const out: any = {};
      out.level = h.world.lightAt(4, 10, 6).level;
      h.step(3000);
      out.dark = h.farm.crop(4, 10, 6);
      out.hud = h.farm.hud();
      out.darkDom = document.querySelector('#farm-aim-dark')?.textContent ?? null;
      out.moon = !!document.querySelector('#farm-aim-moon');
      // たいまつ を となりに
      h.world.setBlock(4, 10, 7, 'torch');
      h.step(2);
      out.hudLit = h.farm.hud();
      out.darkDomLit = !!document.querySelector('#farm-aim-dark')?.textContent;
      h.step(600);
      out.lit = h.farm.crop(4, 10, 6);
      return out;
    });
    expect(r.level).toBeLessThanOrEqual(8);
    expect(r.dark).toMatchObject({ stage: 0, stageTicks: 0, lit: false });
    expect(r.hud.dark).toBe(true);
    expect(r.darkDom).toContain('くらい');
    expect(r.moon).toBe(true);
    expect(r.hudLit.dark).toBe(false);
    expect(r.darkDomLit).toBe(false);
    expect(r.lit.stage).toBe(3);
  });

  test('夜でも みのった作物は少し光る（AC25）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.fill(0, 14, 0, 12, 14, 12, 'stone');
      for (const [x, kind] of [[4, 'tomato'], [6, 'onion']] as const) {
        h.world.setBlock(x, 9, 6, 'dirt');
        h.farm.till(x, 9, 6);
        h.farm.plant(x, 9, 6, kind);
      }
      h.time.set(70000);
      h.step(5);
      const out: any = {};
      const lvl = h.world.lightAt(5, 10, 6).level;
      h.farm.setStage(4, 10, 6, 3);
      h.farm.setStage(6, 10, 6, 2);
      h.step(2);
      out.ripe = h.farm.look(4, 10, 6);
      out.mid = h.farm.look(6, 10, 6);
      out.lvlSame = h.world.lightAt(5, 10, 6).level === lvl;
      return out;
    });
    expect(r.ripe.brightness).toBeGreaterThanOrEqual(0.7);
    expect(r.mid.brightness).toBeLessThan(0.7);
    expect(r.lvlSame).toBe(true);
  });

  test('ふるい はたけ と たんす の たね・かかし（AC33・AC22）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const o = h.farm.oldFarm();
      const out: any = { placed: h.farm.placedM7(), o: o && { soil: o.farmland.length, saku: o.saku.length, kakashi: o.kakashi, tansu: o.tansu } };
      if (o) {
        out.dry = o.farmland.every((p: any) => h.farm.soil(p.x, p.y, p.z)?.wet === false);
        out.contents = h.storage.get(o.tansu.x, o.tansu.y, o.tansu.z);
        out.kakashiBlock = h.world.getBlock(o.kakashi.x, o.kakashi.y, o.kakashi.z);
        out.headBlock = h.world.getBlock(o.kakashi.x, o.kakashi.y + 1, o.kakashi.z);
      }
      out.seedCount = ['seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant'].map((i) => h.inventory.count(i));
      return out;
    });
    expect(r.placed).toBe(true);
    expect(r.o).not.toBeNull();
    expect(r.o.soil).toBe(12);
    expect(r.o.saku).toBeGreaterThanOrEqual(6);
    expect(r.o.saku).toBeLessThanOrEqual(8);
    expect(r.dry).toBe(true);
    expect(r.kakashiBlock).toBe('kakashi');
    expect(r.headBlock).toBe('kakashi_head');
    expect(r.seedCount).toEqual([0, 0, 0, 0]);
    const slots = JSON.stringify(r.contents);
    for (const [item, n] of [['seed_onion', 2], ['seed_tomato', 3], ['seed_eggplant', 2], ['seed_pumpkin', 1]] as const) {
      expect(slots).toContain(item);
      expect(slots).toContain(`"count":${n}`);
    }
  });

  test('ふるい たんす から たね を とると 実績 / かかし は こわれない（AC22・AC33）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      h.pause();
      h.lock.simulate(true);
      h.achievements.mute(false);
      const o = h.farm.oldFarm();
      // かかし の そばに 行く（横 4 以内）
      h.player.set({ position: { x: o.kakashi.x + 0.5, y: o.kakashi.y + 3, z: o.kakashi.z + 3.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(5);
      const out: any = {};
      out.visit = h.achievements.list().find((a: any) => a.id === 'find.oldfarm.1')?.done ?? null;
      // たんす を 開いて ぜんぶ とる
      h.inventory.clear();
      h.storage.open(o.tansu.x, o.tansu.y, o.tansu.z);
      h.step(1);
      h.storage.takeAll();
      h.step(5);
      out.seeds = ['seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant'].map((i) => h.inventory.count(i));
      out.seedFound = h.farm.events().filter((e: any) => e.type === 'seedFound' && e.from === 'oldfarm').length;
      out.seedAch = h.achievements.list().find((a: any) => a.id === 'find.oldfarmSeed.1')?.done ?? null;
      h.storage.close?.();
      return out;
    });
    expect(r.seeds.reduce((a: number, b: number) => a + b, 0)).toBe(8);
    expect(r.seedFound).toBeGreaterThanOrEqual(1);
    expect(r.visit).not.toBe(false);
    expect(r.seedAch).not.toBe(false);
  });

  test('やせいの やさい（AC32）: 4 しゅるい 4〜6 こ・とると やさい と たね', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      const wild = h.farm.wild();
      const count: Record<string, number> = { onion: 0, tomato: 0, pumpkin: 0, eggplant: 0 };
      for (const w of wild) count[w.kind]++;
      const p = h.farm.placement(h.world.seed());
      const same = JSON.stringify(wild.map((w: any) => [w.x, w.y, w.z, w.kind]).sort()) === JSON.stringify(p.wild.map((w: any) => [w.x, w.y, w.z, w.kind]).sort());
      // 1 こ とる
      const w0 = wild.find((w: any) => w.kind === 'tomato');
      const out: any = { count, same, tex: h.farm.texture('wild_tomato').join() !== h.farm.texture('crop_tomato_3').join() };
      h.pause();
      h.lock.simulate(true);
      h.inventory.clear();
      h.player.set({ position: { x: w0.x - 1.5, y: w0.y + 1, z: w0.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -35 });
      h.step(3);
      out.target = h.target.get()?.id;
      h.input.press('primary');
      h.step(2);
      h.input.release('primary');
      out.after = h.world.getBlock(w0.x, w0.y, w0.z);
      out.veg = h.inventory.count('tomato');
      out.seeds = h.inventory.count('seed_tomato');
      out.events = h.farm.events().filter((e: any) => e.type === 'wild').length;
      out.wildCount = h.farm.wild().length;
      out.total = wild.length;
      return out;
    });
    for (const k of ['onion', 'tomato', 'pumpkin', 'eggplant']) {
      expect(r.count[k]).toBeGreaterThanOrEqual(4);
      expect(r.count[k]).toBeLessThanOrEqual(6);
    }
    expect(r.same).toBe(true);
    expect(r.tex).toBe(true);
    expect(r.target).toBe('wild_tomato');
    expect(r.after).toBe('air');
    expect(r.veg).toBeGreaterThanOrEqual(1);
    expect(r.seeds).toBeGreaterThanOrEqual(1);
    expect(r.events).toBe(1);
    expect(r.wildCount).toBe(r.total - 1);
  });

  test('保存: 作物と はたけ が 読み直しても 同じ。やせい を とったあとも もどらない（AC20）', async ({ page }) => {
    await open(page, '?reset=1');
    const before = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      const kinds = ['onion', 'tomato', 'pumpkin', 'eggplant'];
      for (let i = 0; i < 4; i++) {
        h.world.setBlock(2 + i, 9, 3, 'dirt');
        h.farm.till(2 + i, 9, 3);
        h.farm.plant(2 + i, 9, 3, kinds[i]);
        h.farm.setStage(2 + i, 10, 3, i);
      }
      h.step(300);
      const w = h.farm.wild()[0];
      h.world.setBlock(w.x, w.y, w.z, 'air');
      h.save.now();
      return { crops: h.farm.crops(), wild: h.farm.wild().length, w };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { crops: h.farm.crops(), wild: h.farm.wild().length, placed: h.farm.placedM7(), soil: h.farm.soil(2, 9, 3) };
    });
    const key = (c: any) => `${c.x},${c.y},${c.z},${c.kind},${c.stage},${c.stageTicks},${c.wet}`;
    expect(after.crops.map(key).sort()).toEqual(before.crops.map(key).sort());
    expect(after.crops.length).toBe(4);
    expect(after.wild).toBe(before.wild);
    expect(after.placed).toBe(true);
    expect(after.soil).not.toBeNull();
  });

  test('前の保存: M6 までの保存を 読むと 置きものを あとから 置く。2 回は 置かない（AC35）', async ({ page }) => {
    await open(page, '?nosave=1');
    const seed = await page.evaluate(() => (window as any).__rikkun.world.seed());
    const ref = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { wild: h.farm.wild().length, o: h.farm.oldFarm() };
    });
    // 保存の場所に 前の保存を書く（?nosave=1 では store が無い）
    await page.goto('/?reset=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const wrote = await page.evaluate((s) => (window as any).__rikkun.farm.makeLegacySave(s, []), seed);
    expect(wrote).toBe(true);
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      return { wild: h.farm.wild().length, o: h.farm.oldFarm(), placed: h.farm.placedM7(), counts: h.world.countBlocks() };
    });
    expect(r.placed).toBe(true);
    expect(r.wild).toBe(ref.wild);
    expect(r.o).toEqual(ref.o);
    // 保存して 読み直しても ふえない
    await page.evaluate(() => (window as any).__rikkun.save.now());
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const r2 = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { wild: h.farm.wild().length, counts: h.world.countBlocks() };
    });
    expect(r2.wild).toBe(r.wild);
    expect(r2.counts).toEqual(r.counts);
  });

  test('案内画面の「そだてる」タブ・合図・ふりがな（AC6・AC24）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.world.setBlock(4, 9, 6, 'grass');
      T.hold('seed_tomato');
      h.step(1);
      T.tap('secondary');
      h.step(5);
    });
    const hint = await page.evaluate(() => ({ last: (window as any).__rikkun.farm.lastHint(), dom: document.querySelector('#farm-hint')?.textContent ?? null }));
    expect(hint.last).toBe('till');
    expect(hint.dom).toBeTruthy();
    await page.screenshot({ path: `${OUT}/m7-hint.png` });
    // ふりがな
    const bad = await page.evaluate(() => {
      const re = /[一-鿿]/;
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('#farm-hint, #farm-aim'))) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = w.nextNode())) {
          if (re.test(n.textContent ?? '') && !(n.parentElement?.closest('ruby'))) out.push(n.textContent!);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
    // 案内画面の そだてる タブ
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.lock.simulate(false);
      h.step(2);
      h.lock.tab('grow');
      h.step(2);
    });
    const guide = await page.evaluate(() => (window as any).__rikkun.lock.get());
    expect(guide.guideTabs.length).toBe(5);
    expect(guide.guideTab).toBe('grow');
    await page.screenshot({ path: `${OUT}/m7-guide-grow.png` });
  });

  test('スクショ: ふるい はたけ・作物 4 段階・ねらった作物・暗い月・やせいの やさい', async ({ page }) => {
    await open(page);
    // ふるい はたけ と かかし
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const o = h.farm.oldFarm();
      h.pause();
      h.lock.simulate(true);
      h.time.set(20000);
      h.player.set({ position: { x: o.kakashi.x - 5.5, y: o.kakashi.y + 2, z: o.kakashi.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -15 });
      h.step(10);
    });
    await page.screenshot({ path: `${OUT}/m7-oldfarm.png` });
    // 作物 4 段階（4 しゅるい × 4 だん を ならべる）
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const T = (window as any).T;
      T.base();
      h.time.set(20000);
      const kinds = ['onion', 'tomato', 'pumpkin', 'eggplant'];
      for (let k = 0; k < 4; k++)
        for (let s = 0; s < 4; s++) {
          const x = 4 + s;
          const z = 4 + k;
          h.world.setBlock(x, 9, z, 'dirt');
          h.farm.till(x, 9, z);
          h.farm.plant(x, 9, z, kinds[k]);
          h.farm.setStage(x, 10, z, s);
        }
      h.player.set({ position: { x: 5.5, y: 12.5, z: 1.6 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: -50 });
      h.step(10);
    });
    await page.screenshot({ path: `${OUT}/m7-stages.png` });
    // ねらった作物の まる
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: 5.5, y: 9, z: 4.5 + 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -30 });
      h.step(1);
      h.player.set({ position: { x: 2.5, y: 9, z: 5.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -30 });
      h.step(3);
    });
    const aim = await page.evaluate(() => ({ t: (window as any).__rikkun.target.get(), hud: (window as any).__rikkun.farm.hud() }));
    console.log('aim', JSON.stringify(aim));
    await page.screenshot({ path: `${OUT}/m7-aim.png` });
    // 暗い 月
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.time.set(70000);
      h.world.fill(0, 14, 0, 12, 14, 12, 'stone');
      h.world.setBlock(4, 9, 6, 'dirt');
      h.farm.till(4, 9, 6);
      h.farm.plant(4, 9, 6, 'tomato');
      h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -30 });
      h.step(5);
    });
    await page.screenshot({ path: `${OUT}/m7-dark.png` });
    // やせいの やさい
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const w = h.farm.wild().find((q: any) => q.kind === 'pumpkin') ?? h.farm.wild()[0];
      h.time.set(20000);
      h.player.set({ position: { x: w.x - 2.5, y: w.y + 1, z: w.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: -25 });
      h.step(10);
    });
    await page.screenshot({ path: `${OUT}/m7-wild.png` });
  });
});
