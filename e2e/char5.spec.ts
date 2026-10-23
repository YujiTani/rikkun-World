import { expect, test, type Page } from '@playwright/test';
import { standOnGround } from './helpers/aim';
import { BASE_SET, KATANA_SET, holdItems, settle, spawnAhead, toStance } from './helpers/blade';
import { openCharWorld, packedBytesOf, waitSpritesReady } from './helpers/char';

/**
 * CHAR-5（docs/design/CHAR-5.md §6 通し）: AC9 決まり方・おぼえる、AC10 男の子で 遊ぶ。
 * 数は ゲーム（window.__rikkun の char・player.doll().sprite・blade・bow）と 実物の atlas.json に 聞く。
 * 時間は 本当の時計で 決めず、status が 'ready' に なるのを 待つ。
 * スクショは test-shots/CHAR-5/（git に 入れない。#157）。
 */
const SHOTS = 'test-shots/CHAR-5';
const KEY = 'rikkun.char.v1';
test.describe.configure({ timeout: 240_000 });

const spr = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__rikkun! as any).player.doll().sprite;
    return { kind: s.kind as string, loaded: s.loaded as boolean, gpuBytes: s.gpuBytes as number, status: s.status as Record<string, string>, dir: s.dir as number, motion: s.motion as string, scene: s.scene as string };
  });
const charKind = (page: Page) => page.evaluate(() => (window.__rikkun! as any).char.get().kind as string);
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY);

test.describe('CHAR-5 通し', () => {
  test('AC9: 決まり方・おぼえる（?char=boy → char.set(girl) → 読み直し）', async ({ page }) => {
    // 空の localStorage で /?char=boy
    await openCharWorld(page, '?char=boy');
    expect(await stored(page)).toBe('boy');
    expect(await charKind(page)).toBe('boy');
    const boyBytes = await packedBytesOf(page, 'boy', BASE_SET);
    let s = await spr(page);
    expect(s).toMatchObject({ kind: 'boy', loaded: true, gpuBytes: boyBytes });
    for (const n of BASE_SET) expect(s.status[n]).toBe('ready');
    expect(boyBytes).toBeGreaterThan(0);

    // 男の子の 正面・うしろ・横（カメラの 向きを かえて 3 まい）
    const dirs: number[] = [];
    for (const [yaw, label] of [[0, 'back'], [180, 'front'], [90, 'side']] as const) {
      await page.evaluate((yaw) => {
        const h = window.__rikkun! as any;
        const p = h.player.get();
        h.player.set({ position: p.position, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, facing: 0 });
        h.step(2);
      }, yaw);
      dirs.push((await spr(page)).dir);
      await page.screenshot({ path: `${SHOTS}/AC9-boy-${label}.png` });
    }
    expect(new Set(dirs).size).toBe(3);

    // ページを 読み直さずに 女の子へ。体・カメラ・刀・パリィは かわらない
    await page.evaluate(() => {
      (window as any).__pageMark = 'same-page';
      const h = window.__rikkun! as any;
      h.player.set({ position: { x: 20.5, y: h.player.get().position.y, z: 20.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, facing: 0 });
      h.step(2);
    });
    const body = () =>
      page.evaluate(() => {
        const h = window.__rikkun! as any;
        const p = h.player.get();
        return { p: JSON.parse(JSON.stringify(p)), cam: JSON.parse(JSON.stringify(h.camera.get())), blade: JSON.parse(JSON.stringify(h.blade.state())), parry: JSON.parse(JSON.stringify(h.parry.state())), hp: h.combat.get().hp, held: h.player.doll().heldItem, facing: h.player.get().facing };
      });
    const before = await body();
    const sync = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.char.set('girl');
      const s = h.player.doll().sprite; // その ステップの おわり（まだ 読めていない）
      return { loaded: s.loaded, gpuBytes: s.gpuBytes, boy: ['idle', 'walk', 'run', 'jump'].map((n) => s.status[n]) };
    });
    expect(sync.loaded).toBe(false);
    expect(sync.gpuBytes).toBe(0);
    expect(sync.boy.every((x: string) => x !== 'ready')).toBe(true);
    await waitSpritesReady(page, BASE_SET);
    expect(await page.evaluate(() => (window as any).__pageMark)).toBe('same-page');
    expect(await charKind(page)).toBe('girl');
    s = await spr(page);
    expect(s).toMatchObject({ kind: 'girl', loaded: true, gpuBytes: await packedBytesOf(page, 'girl', BASE_SET) });
    expect(await stored(page)).toBe('girl');
    const after = await body();
    expect(after.blade).toEqual(before.blade);
    expect(after.parry).toEqual(before.parry);
    expect(after.hp).toBe(before.hp);
    expect(after.held).toEqual(before.held);
    expect(after.facing).toBe(before.facing);
    for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(after.p.position[k] - before.p.position[k])).toBeLessThanOrEqual(1e-4);
    expect(JSON.stringify(after.cam)).toBe(JSON.stringify(before.cam));

    // 読み直し: URL なし → 女の子（おぼえた値 girl）
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    expect(await charKind(page)).toBe('girl');
    // ?char=boy → boy（おぼえる）
    await page.goto('/?char=boy');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    expect(await charKind(page)).toBe('boy');
    expect(await stored(page)).toBe('boy');
    // ?char=girl&nosave=1 → その 起動だけ girl。おぼえた値は 書きかわらない
    await page.goto('/?char=girl&nosave=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    expect(await charKind(page)).toBe('girl');
    expect(await stored(page)).toBe('boy');
    // 同じ ページで char.set しても nosave では 書かない
    await page.evaluate(() => (window.__rikkun! as any).char.set('boy'));
    expect(await stored(page)).toBe('boy');
  });

  test('AC10: 男の子で 遊ぶ（歩く → 大けさぎり → 弓）', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/models/char/')) urls.push(r.url());
    });
    await openCharWorld(page, '?char=boy&nosave=1');
    const base = await spr(page);
    expect(base.kind).toBe('boy');
    const bytes0 = base.gpuBytes;
    expect(bytes0).toBe(await packedBytesOf(page, 'boy', BASE_SET));

    // W で 30 ステップ → walk
    const walk = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('moveForward');
      h.step(30);
      const s = h.player.doll().sprite;
      const r = { scene: s.scene as string, motion: s.motion as string };
      h.input.releaseAll();
      h.step(60);
      return r;
    });
    expect(walk).toEqual({ scene: 'walk', motion: 'walk' });

    // かたなを 持って 上段へ R。男の子は 刀の絵を 読まない
    await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
    await holdItems(page, [{ item: 'katana' }]);
    await toStance(page, 'jodan');
    await page.evaluate(() => (window.__rikkun! as any).step(20));
    const held = await spr(page);
    for (const n of KATANA_SET) expect(held.status[n]).toBe('none');
    expect(held.gpuBytes).toBe(bytes0);
    expect(held.motion).toBe('idle');

    /** 大けさぎり: from..to ステップめを 1 つずつ きろく（from = 1 のとき 押して はじめる） */
    const rec = (from: number, to: number) =>
      page.evaluate(
        ({ from, to }) => {
          const h = window.__rikkun! as any;
          const out: any[] = [];
          for (let f = from; f <= to; f++) {
            if (f === 1) {
              h.input.press('primary');
              h.step(1);
              h.input.release('primary');
            } else h.step(1);
            const sp = h.player.doll().sprite;
            const p = h.player.get().position;
            out.push({ f: h.blade.state().frame, motion: sp.motion, scene: sp.scene, gpu: sp.gpuBytes, trail: h.legend.slashes().length > 0, band: h.blade.trail().visible, z: p.z, x: p.x });
          }
          return out;
        },
        { from, to },
      );

    // (a) 何もない ひらけた所で 体の ふみこみと 刃の光
    const z0 = (await page.evaluate(() => (window.__rikkun! as any).player.get().position.z)) as number;
    const runA = [...(await rec(1, 106))];
    for (const [i, r] of runA.entries()) {
      expect(r.f, `F${i + 1}`).toBe(i + 1);
      expect(r.motion, `F${i + 1}`).toBe('idle');
      expect(r.gpu, `F${i + 1}`).toBe(bytes0);
    }
    // LEGEND-FX（#257）: 半月の 帯は 白い 斬撃に おきかえ。白い 斬撃が 出て、帯は 出ない
    expect(runA.some((r) => r.trail)).toBe(true);
    expect(runA.some((r) => r.band)).toBe(false);
    const distBoy = z0 - runA[105]!.z; // 女の子と 同じ 3.1（WEAPON-4 §2。あとで 女の子で はかって くらべる）
    expect(Math.abs(distBoy - 3.1)).toBeLessThanOrEqual(0.01);
    await settle(page);

    // (b) 目の前 2 の 妖怪: 1 回ぶん へる
    await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
    const id = await spawnAhead(page, 'nurikabe', 2, { hp: 40 });
    const hp0 = await page.evaluate((id) => (window.__rikkun! as any).yokai.list().find((y: any) => y.id === id).hp as number, id);
    await page.evaluate(() => (window.__rikkun! as any).blade.events());
    const b1 = await rec(1, 30);
    await page.screenshot({ path: `${SHOTS}/AC10-kesa-F30.png` });
    const b2 = await rec(31, 106);
    for (const r of [...b1, ...b2]) {
      expect(r.motion).toBe('idle');
      expect(r.gpu).toBe(bytes0);
    }
    const hit = await page.evaluate((id) => {
      const h = window.__rikkun! as any;
      return { hp: h.yokai.list().find((y: any) => y.id === id).hp as number, hits: h.blade.events().filter((e: any) => e.type === 'techHit').length };
    }, id);
    expect(hit.hits).toBe(1);
    expect(hit.hp).toBeLessThan(hp0);
    await settle(page);

    // 弓と 矢 5 本: 45 ステップ 引いて はなす → 矢が 1 本
    await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
    await page.evaluate(() => (window.__rikkun! as any).yokai.clear());
    await holdItems(page, [{ item: 'yumi' }, { item: 'ya', count: 5 }]);
    const arrow = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const motions = new Set<string>();
      h.input.press('primary');
      for (let i = 0; i < 45; i++) {
        h.step(1);
        motions.add(h.player.doll().sprite.motion);
      }
      h.input.release('primary');
      h.step(1);
      motions.add(h.player.doll().sprite.motion);
      const s = h.player.doll().sprite;
      return { arrows: h.bow.arrows().length as number, motions: [...motions], gpu: s.gpuBytes as number, status: s.status as Record<string, string> };
    });
    expect(arrow.arrows).toBe(1);
    expect(arrow.motions).toEqual(['idle']);
    expect(arrow.gpu).toBe(bytes0);
    for (const n of ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid', ...KATANA_SET, 'parry', 'parryKime']) expect(arrow.status[n]).toBe('none');

    // ネットワークの きろく: boy/ だけ（girl/ や 直下は 1 つも ない）
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((u) => !u.includes('/models/char/boy/'))).toEqual([]);
    const pngs = urls.filter((u) => u.endsWith('.png')).map((u) => /([A-Za-z_]+)\.png$/.exec(u)![1]!);
    expect([...new Set(pngs)].sort()).toEqual([...BASE_SET].sort());

    // 刃の光は 女の子と 同じ ステップで 出る・ふみこみも 同じ（ここから 女の子の 絵を 読んでよい）
    await page.evaluate(() => (window.__rikkun! as any).inventory.clear());
    await standOnGround(page, 20.5, 20.5, { yaw: 0, pitch: 0 });
    await holdItems(page, [{ item: 'katana' }]);
    await page.evaluate(() => (window.__rikkun! as any).char.set('girl'));
    await waitSpritesReady(page, [...BASE_SET, ...KATANA_SET]);
    await toStance(page, 'jodan');
    await settle(page, 30);
    const gz0 = (await page.evaluate(() => (window.__rikkun! as any).player.get().position.z)) as number;
    const runG = await rec(1, 106);
    // LEGEND-FX: 白い 斬撃の 出はじめは 同じ ステップ（長さは 振るごとに シード付きで ばらつく）。帯は どちらも 出ない
    expect(runG.findIndex((r) => r.trail)).toBe(runA.findIndex((r) => r.trail));
    expect(runG.some((r) => r.band)).toBe(false);
    const distGirl = gz0 - runG[105]!.z;
    expect(Math.abs(distGirl - 3.1)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(distGirl - distBoy)).toBeLessThanOrEqual(0.01);
    expect(runG.some((r) => r.motion !== 'idle')).toBe(true); // 女の子は わざの絵
  });
});
