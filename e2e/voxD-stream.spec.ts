import { expect, test } from '@playwright/test';
import { wide } from './helpers/fine';
import { PREP, drainRebuilds, findLand, flatNearStart, openBooting, openStream, settleWorld } from './helpers/stream';

/**
 * VOX-D（docs/tickets/VOX-D.md）: ストリーミングと起動。受け入れ基準の【E2E】= 5〜10・13・15〜18・20〜25。
 * （14 は e2e/voxF-save.spec.ts の「AC5」・ユニットの 1〜4・11・12・19 は src/ の *.test.ts・26 は e2e/ui-gate.spec.ts・22 の grep はユニット側）
 * 窓口（world.teleport / stream / settle / setStreamWork / chunkStage / wall、save.hasChunk、player.respawn）は 実装の前は無いので、ここは赤になる。
 * 進めるのは step の数と world.settle() で、時間（ms）では合否を決めない（rule #130）。1 コマの仕事の数は ?streamWork=<n> で固定する（B4）。
 */
test.describe.configure({ timeout: 240_000 });

const SEEDS = [null, 1, 3]; // 基準 5
const SEEDS_20 = [null, 1, 2, 3, 4, 5]; // 基準 20
const label = (s: number | null) => `seed=${s ?? '既定'}`;
const q = (seed: number | null, extra = '') => `?nosave=1${seed === null ? '' : `&seed=${seed}`}${extra}`;


test.describe('VOX-D ストリーミング', () => {
  for (const seed of SEEDS) {
    test(`基準 5: 起動 ready のとき 25 列は 小ブロックか箱の絵・81 列は meshed（${label(seed)}）`, async ({ page }) => {
      await openStream(page, wide(q(seed)));
      const r = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        const w = h.world;
        const s = w.stream();
        const { cx, cz } = s.center;
        const bad: string[] = [];
        let n25 = 0;
        let n81 = 0;
        for (let dz = -4; dz <= 4; dz++)
          for (let dx = -4; dx <= 4; dx++) {
            const x = cx + dx;
            const z = cz + dz;
            n81++;
            if (w.chunkStage(x, z) !== 'meshed') bad.push(`stage ${x},${z} ${w.chunkStage(x, z)}`);
            const near = Math.max(Math.abs(dx), Math.abs(dz)) <= 2;
            if (near) n25++;
            // K1（2026-10-17 変更）: 半径 2 の 25 列は「何かの絵（小ブロックか箱）」を出していればよい。小ブロックへの差しかえは開始のあと
            // （細かいメッシュなしの E2E でも成り立つ。段の名前は micro か box のどちらでもよい）
            let drawn = 0;
            for (let sy = 0; sy < 22; sy++) {
              const i = w.sectionInfo(x, sy, z);
              if (i.tier === 'none') {
                if (i.reason === 'unlit') bad.push(`unlit ${x},${sy},${z}`);
                continue;
              }
              if (near && (i.tier === 'micro' || i.tier === 'box') && i.meshes > 0) drawn++;
            }
            if (near && drawn === 0) bad.push(`25列 ${x},${z}: 小ブロックか箱の絵が無い`);
          }
        return { s, readyFlag: h.ready, n25, n81, bad: bad.slice(0, 8), nBad: bad.length };
      });
      expect(r.readyFlag).toBe(true);
      expect(r.s.ready).toBe(true);
      expect(r.n25).toBe(25);
      expect(r.n81).toBe(81);
      expect(r.nBad, JSON.stringify(r.bad)).toBe(0);
    });
  }

  test('基準 5(起動中): ?streamWork=1 で起動 → ready になるまで 1 step ずつ プレイヤーの位置が変わらない（落ちない）', async ({ page }) => {
    await openBooting(page, wide('?nosave=1&streamWork=1'));
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const first = h.player.get().position;
      let moved = 0;
      let steps = 0;
      let lastP = -1;
      let backward = 0;
      let readyAtOnce = h.world.stream().ready;
      while (!h.world.stream().ready && steps < 3000) {
        h.step(1);
        steps++;
        const p = h.player.get().position;
        if (p.x !== first.x || p.y !== first.y || p.z !== first.z) moved++;
        const pr = h.world.stream().progress;
        if (pr < lastP - 1e-9) backward++;
        lastP = pr;
      }
      const s = h.world.stream();
      return { moved, steps, backward, readyAtOnce, ready: s.ready, phaseAfter: s.phase, p: s.progress };
    });
    expect(r.readyAtOnce).toBe(false);
    expect(r.ready).toBe(true);
    expect(r.steps).toBeGreaterThanOrEqual(371); // n = 1: 開始の仕事は 371 こ以上（B5）
    expect(r.moved).toBe(0);
    expect(r.backward).toBe(0); // 基準 4: p は ふえるだけ
    expect(r.p).toBeCloseTo(1, 9); // p = 1 と ready は同じとき
    await page.evaluate(() => (window.__rikkun! as any).step(2));
    expect(await page.evaluate(() => (window.__rikkun! as any).ready)).toBe(true);
  });

  test('基準 6: 動かないままの起動 → settle({ full }) のあと 289 列・meshed 169・lit 以上 225', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    const s = await settleWorld(page, true);
    const r = await page.evaluate(() => {
      const w = (window.__rikkun! as any).world;
      const { cx, cz } = w.stream().center;
      const chunks: { cx: number; cz: number }[] = w.loadedChunks();
      let meshed = 0;
      let litUp = 0;
      let gen = 0;
      for (let dz = -10; dz <= 10; dz++)
        for (let dx = -10; dx <= 10; dx++) {
          const st = w.chunkStage(cx + dx, cz + dz);
          if (st === 'meshed') meshed++;
          if (st === 'meshed' || st === 'lit') litUp++;
          if (st !== 'none' && st !== 'loading') gen++;
        }
      return { n: chunks.length, meshed, litUp, gen };
    });
    expect(r.n).toBe(289);
    expect(r.gen).toBe(289);
    expect(r.meshed).toBe(169);
    expect(r.litUp).toBe(225);
    expect(s.columns.meshed).toBe(169);
  });

  test('基準 7: 歩く: 北へ 1,200 step（setStreamWork(4)）毎 step 北 7 列先まで読みこみ済み・持つ列 441 以下・止まって 10 以内だけ', async ({ page }) => {
    test.setTimeout(300_000);
    await openStream(page, wide('?nosave=1'));
    await settleWorld(page, true); // ready は半径 6 まで。歩く前に 輪を全部そろえる
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      w.setStreamWork(4);
      h.lock.simulate(true);
      const sp = w.spawn();
      h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.input.releaseAll();
      h.input.press('run');
      h.input.press('moveForward');
      const startZ = h.player.get().position.z;
      let maxCols = 0;
      const miss: string[] = [];
      for (let i = 0; i < 1200; i++) {
        h.step(1);
        const p = h.player.get().position;
        for (let k = 0; k <= 7; k++) {
          if (!w.isLoaded(Math.floor(p.x), Math.floor(p.z) - 16 * k)) {
            miss.push(`step ${i} k=${k}`);
            break;
          }
        }
        maxCols = Math.max(maxCols, w.loadedChunks().length);
      }
      h.input.releaseAll();
      const walked = startZ - h.player.get().position.z;
      return { miss: miss.slice(0, 5), nMiss: miss.length, maxCols, walked };
    });
    console.log('基準 7', JSON.stringify(r));
    expect(r.nMiss, JSON.stringify(r.miss)).toBe(0);
    expect(r.maxCols).toBeLessThanOrEqual(441);
    await settleWorld(page, true);
    const after = await page.evaluate(() => {
      const w = (window.__rikkun! as any).world;
      const { cx, cz } = w.stream().center;
      const chunks: { cx: number; cz: number }[] = w.loadedChunks();
      const far = chunks.filter((c) => Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) > 10).length;
      let missing8 = 0;
      for (let dz = -8; dz <= 8; dz++)
        for (let dx = -8; dx <= 8; dx++) if (!chunks.some((c) => c.cx === cx + dx && c.cz === cz + dz)) missing8++;
      return { n: chunks.length, far, missing8 };
    });
    expect(after.far).toBe(0);
    expect(after.missing8).toBe(0);
    expect(after.n).toBeLessThanOrEqual(441);
  });

  for (const seed of [null, 2]) {
    test(`基準 8: テレポート: P へ → 60 step で onGround・足の高さ = groundHeight + 1。スタートの列は捨てる。さわっていない列は hash === genHash（${label(seed)}）`, async ({ page }) => {
      await openStream(page, wide(q(seed)));
      const P = await findLand(page);
      const r = await page.evaluate((P) => {
        const h = window.__rikkun! as any;
        const sp = h.world.spawn();
        h.world.teleport(P.x, P.z);
        return { sx: Math.floor(sp.x), sz: Math.floor(sp.z) };
      }, P);
      await settleWorld(page, true);
      const after = await page.evaluate(
        ({ P, sx, sz }) => {
          const h = window.__rikkun! as any;
          const w = h.world;
          h.step(60);
          const p = h.player.get();
          const g = w.groundHeight(Math.floor(P.x), Math.floor(P.z));
          const chunks: { cx: number; cz: number }[] = w.loadedChunks();
          const diff = chunks.filter((c) => w.hash(c.cx, c.cz) !== w.genHash(c.cx, c.cz)).length;
          return { onGround: p.onGround, y: p.position.y, g, startLoaded: w.isLoaded(sx, sz), diff, n: chunks.length, center: w.stream().center };
        },
        { P, ...r },
      );
      expect(after.onGround).toBe(true);
      expect(Math.abs(after.y - (after.g + 1))).toBeLessThanOrEqual(0.01);
      expect(after.startLoaded).toBe(false);
      expect(after.center).toEqual({ cx: P.cx, cz: P.cz });
      expect(after.n).toBe(289);
      expect(after.diff).toBe(0);
    });
  }

  test('基準 9: さわった列は保存してから捨てる: 3 マス置く → P へ → hasChunk・writes ふえる → スタートへ もどると hash が同じ', async ({ page }) => {
    await openStream(page, wide('?'));
    const P = await findLand(page);
    const b = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      const sp = w.spawn();
      const sx = Math.floor(sp.x);
      const sz = Math.floor(sp.z);
      const g = w.groundHeight(sx, sz);
      // 空の高い所に 3 マス（木・崖に関係なく 置ける）
      const set = [0, 1, 2].map((k) => w.setBlock(sx + k, g + 30, sz, 'log'));
      h.step(2);
      const cx = sx >> 4;
      const cz = sz >> 4;
      return { set, sx, sz, cx, cz, hash: w.hash(cx, cz), writes: h.save.info().writes };
    });
    expect(b.set).toEqual([true, true, true]);
    await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
    await settleWorld(page);
    const mid = await page.evaluate((b) => {
      const h = window.__rikkun! as any;
      return { loaded: h.world.isLoaded(b.sx, b.sz), has: h.save.hasChunk(b.cx, b.cz), writes: h.save.info().writes };
    }, b);
    expect(mid.loaded).toBe(false);
    expect(mid.has).toBe(true);
    expect(mid.writes).toBeGreaterThanOrEqual(b.writes + 1);
    await page.evaluate((b) => (window.__rikkun! as any).world.teleport(b.sx + 0.5, b.sz + 0.5), b);
    await settleWorld(page);
    const hash2 = await page.evaluate((b) => (window.__rikkun! as any).world.hash(b.cx, b.cz), b);
    expect(hash2).toBe(b.hash);
  });

  test('基準 10: P で 20 段たてに ほる → 穴のかべにメッシュ → 保存 → 読みなおし: 中心が P・位置と hash が同じ（畑も もどる）', async ({ page }) => {
    await openStream(page, wide('?'));
    const P = await findLand(page);
    await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
    await settleWorld(page);
    const r = await page.evaluate(
      ({ P }) => {
        const h = window.__rikkun! as any;
        const w = h.world;
        // 穴は 列のまんなか。立つ所は 列のすみ（穴に落ちない）
        const hx = P.cx * 16 + 8;
        const hz = P.cz * 16 + 8;
        const px = P.cx * 16 + 2;
        const pz = P.cz * 16 + 2;
        const g = w.groundHeight(hx, hz);
        const gp = w.groundHeight(px, pz);
        h.player.set({ position: { x: px + 0.5, y: gp + 1, z: pz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        h.step(60);
        // 畑: すみの 地面を つちにして たがやす・うえる
        const fx = P.cx * 16 + 4;
        const fz = P.cz * 16 + 4;
        const gf = w.groundHeight(fx, fz);
        w.setBlock(fx, gf, fz, 'dirt');
        w.fill(fx, gf + 1, fz, fx, gf + 3, fz, 'air');
        const tilled = h.farm.till(fx, gf, fz);
        const planted = h.farm.plant(fx, gf, fz, 'onion');
        let dug = 0;
        for (let k = 0; k < 20; k++) if (w.setBlock(hx, g - k, hz, 'air')) dug++;
        return { hx, hz, g, fx, gf, fz, tilled, planted, dug };
      },
      { P },
    );
    expect(r.dug).toBe(20);
    expect(r.tilled).toBe(true);
    expect(r.planted).toBe(true);
    const steps = await drainRebuilds(page, 3000);
    expect(steps).toBeLessThan(3000);
    const before = await page.evaluate(
      async (r) => {
        const h = window.__rikkun! as any;
        const w = h.world;
        const secs = new Set<string>();
        for (let k = 0; k < 20; k++) secs.add(`${Math.floor(r.hx / 16)},${Math.floor((r.g - k) / 16)},${Math.floor(r.hz / 16)}`);
        const tiers = [...secs].map((s) => {
          const [a, b, c] = s.split(',').map(Number);
          return { s, tier: w.sectionInfo(a, b, c).tier };
        });
        await h.save.now();
        const p = h.player.get().position;
        const s = w.stream();
        return { tiers, pos: { x: p.x, y: p.y, z: p.z }, hash: w.hash(s.center.cx, s.center.cz), center: s.center, crop: h.farm.crop(r.fx, r.gf + 1, r.fz) !== null };
      },
      r,
    );
    for (const t of before.tiers) expect(t.tier, t.s).not.toBe('none');
    expect(before.center).toEqual({ cx: P.cx, cz: P.cz });
    expect(before.crop).toBe(true);
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate((r) => {
      const h = window.__rikkun! as any;
      const w = h.world;
      const s = w.stream();
      const p = h.player.get().position;
      return { center: s.center, pos: { x: p.x, y: p.y, z: p.z }, hash: w.hash(s.center.cx, s.center.cz), crop: h.farm.crop(r.fx, r.gf + 1, r.fz) !== null, block: w.getBlock(r.fx, r.gf + 1, r.fz) };
    }, r);
    expect(after.center).toEqual({ cx: P.cx, cz: P.cz });
    expect(Math.abs(after.pos.x - before.pos.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(after.pos.y - before.pos.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(after.pos.z - before.pos.z)).toBeLessThanOrEqual(0.01);
    expect(after.hash).toBe(before.hash);
    expect(after.block).toBe('crop_onion');
    expect(after.crop).toBe(true);
  });

  test('基準 13: 保存できないとき（?nosave=1）: 基準 9 と同じ手順でもどったとき hash が同じ。読みなおすと genHash と同じ', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    const P = await findLand(page);
    const b = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      const sp = w.spawn();
      const sx = Math.floor(sp.x);
      const sz = Math.floor(sp.z);
      const g = w.groundHeight(sx, sz);
      const set = [0, 1, 2].map((k) => w.setBlock(sx + k, g + 30, sz, 'log'));
      h.step(2);
      return { set, sx, sz, cx: sx >> 4, cz: sz >> 4, hash: w.hash(sx >> 4, sz >> 4), gen: w.genHash(sx >> 4, sz >> 4) };
    });
    expect(b.set).toEqual([true, true, true]);
    expect(b.hash).not.toBe(b.gen);
    await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
    await settleWorld(page);
    expect(await page.evaluate((b) => (window.__rikkun! as any).world.isLoaded(b.sx, b.sz), b)).toBe(false);
    await page.evaluate((b) => (window.__rikkun! as any).world.teleport(b.sx + 0.5, b.sz + 0.5), b);
    await settleWorld(page);
    expect(await page.evaluate((b) => (window.__rikkun! as any).world.hash(b.cx, b.cz), b)).toBe(b.hash);
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const after = await page.evaluate((b) => {
      const w = (window.__rikkun! as any).world;
      return { hash: w.hash(b.cx, b.cz), gen: w.genHash(b.cx, b.cz) };
    }, b);
    expect(after.hash).toBe(after.gen);
  });

  test('基準 15〜18（1 本の流れ）: 妖怪・ふくろ・たんす・かまど・畑 → P へ 捨てる → 15 → 1,200 step → もどる → 16〜18', async ({ page }) => {
    const W = 1200;
    await openStream(page, wide('?nosave=1'));
    const P = await findLand(page);
    // ふくろ: 広場の すみで やられて ばらまく（もどり先の スタートから はなれた所。ひろわれない）
    const base = await flatNearStart(page);
    const { sx, sz, g } = base;
    await page.evaluate(
      ({ sx, sz, g }) => {
        const h = window.__rikkun! as any;
        h.lock.simulate(true);
        h.inventory.clear();
        for (let i = 0; i < 36; i++) h.inventory.setSlot(i, { item: 'dirt', count: 1 });
        h.player.set({ position: { x: sx + 12.5, y: g + 1, z: sz + 12.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(1);
        h.combat.damage(20);
        h.step(125 + 185); // 復活まで・むてきが切れるまで
        h.inventory.clear();
      },
      { sx, sz, g },
    );
    const setup = await page.evaluate(
      ({ sx, sz, g }) => {
        const h = window.__rikkun! as any;
        const w = h.world;
        h.player.set({ position: { x: sx + 0.5, y: g + 1, z: sz + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
        // 妖怪 2 体（その場で動かない）
        h.yokai.clear();
        h.yokai.spawn('karakasa', sx + 5.5, g + 1, sz + 4.5, { ai: false });
        h.yokai.spawn('karakasa', sx - 4.5, g + 1, sz + 4.5, { ai: false });
        // たんす（3 しゅるい）
        const t = { x: sx + 3, y: g + 1, z: sz };
        w.setBlock(t.x, t.y, t.z, 'tansu');
        h.storage.set(t.x, t.y, t.z, 0, { item: 'iron_ingot', count: 5 });
        h.storage.set(t.x, t.y, t.z, 1, { item: 'katana', count: 1 });
        h.storage.set(t.x, t.y, t.z, 2, { item: 'crystal', count: 2 });
        // かまど（焼く物を入れる）
        const f = { x: sx + 3, y: g + 1, z: sz + 2 };
        w.setBlock(f.x, f.y, f.z, 'furnace');
        h.inventory.add('iron_ore', 1);
        h.inventory.add('log', 3);
        h.furnace.bake('iron_ingot', f.x, f.y, f.z);
        // 持ち物を いっぱいにする（焼けた物は 持ち物に空きがあると 持ち物へ入る。かまどに たまるのは 満杯のとき）
        for (let i = 0; i < h.inventory.get().slots.length; i++) h.inventory.setSlot(i, { item: 'dirt', count: 64 });
        // 畑: つち + 水 → ぬれた はたけ → 作物（段 1）
        const c = { x: sx - 3, y: g, z: sz };
        w.setBlock(c.x, c.y, c.z, 'dirt');
        h.water.pause(true); // WATER-1: 水を 置いて 動かさない
        w.setBlock(c.x + 1, c.y, c.z, 'water');
        const tilled = h.farm.till(c.x, c.y, c.z);
        const planted = h.farm.plant(c.x, c.y, c.z, 'onion');
        const staged = h.farm.setStage(c.x, c.y + 1, c.z, 1);
        h.step(2);
        h.yokai.events();
        return {
          t, f, c, tilled, planted, staged,
          soil: w.getBlock(c.x, c.y, c.z),
          nYokai: h.yokai.list().length,
          tansu: JSON.stringify(h.storage.get(t.x, t.y, t.z)),
          bags: h.combat.bags().map((b: any) => ({ x: b.position.x, y: b.position.y, z: b.position.z, slots: JSON.stringify(b.slots), ticksLeft: b.ticksLeft })),
          cx: sx >> 4,
          cz: sz >> 4,
          tick: h.tick(),
        };
      },
      { sx, sz, g },
    );
    expect(setup.tilled).toBe(true);
    expect(setup.planted).toBe(true);
    expect(setup.staged).toBe(true);
    expect(setup.soil, '準備: 水の となりの はたけは ぬれる').toBe('farmland_wet');
    expect(setup.nYokai).toBe(2);
    expect(setup.bags.length).toBeGreaterThan(0);

    // ---- P へ。15
    await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
    await settleWorld(page);
    const away = await page.evaluate((s) => {
      const h = window.__rikkun! as any;
      const drops = h.yokai.events().filter((e: any) => e.type === 'drop').length;
      return { nYokai: h.yokai.list().length, drops, startLoaded: h.world.isLoaded(s.sx, s.sz) };
    }, { sx, sz });
    expect(away.startLoaded).toBe(false);
    expect(away.nYokai).toBe(0); // 基準 15: 妖怪は 静かに消える
    expect(away.drops).toBe(0); // 落とし物は ふえない
    await page.evaluate((W) => (window.__rikkun! as any).step(W), W);

    // ---- スタートへ もどる。16〜18
    await page.evaluate((s) => (window.__rikkun! as any).world.teleport(s.sx + 0.5, s.sz + 0.5), { sx, sz });
    await settleWorld(page);
    const back = await page.evaluate(
      ({ t, f, c, sx }) => {
        const h = window.__rikkun! as any;
        const w = h.world;
        const tick = h.tick();
        const bags = h.combat.bags().map((b: any) => ({ x: b.position.x, y: b.position.y, z: b.position.z, slots: JSON.stringify(b.slots), ticksLeft: b.ticksLeft }));
        const furnace = h.furnace.get(f.x, f.y, f.z);
        const tansu = JSON.stringify(h.storage.get(t.x, t.y, t.z));
        const stage = h.farm.crop(c.x, c.y + 1, c.z)?.stage ?? null;
        const cropBlock = w.getBlock(c.x, c.y + 1, c.z);
        // 近くの水を消す → 見直しが また動いて かわく
        w.setBlock(c.x + 1, c.y, c.z, 'stone');
        h.step(65);
        const soilAfter = w.getBlock(c.x, c.y, c.z);
        return { tick, bags, furnaceDone: furnace?.done ?? null, tansu, stage, cropBlock, soilAfter, sx };
      },
      { t: setup.t, f: setup.f, c: setup.c, sx },
    );
    // 16: ふくろは 同じ場所・同じ中身。のこり時間は 進んだ tick ぶん へっている
    const elapsed = back.tick - setup.tick;
    expect(back.bags.length).toBe(setup.bags.length);
    for (const b of setup.bags) {
      const m = back.bags.find((x: any) => x.slots === b.slots && Math.abs(x.x - b.x) <= 0.01 && Math.abs(x.y - b.y) <= 0.01 && Math.abs(x.z - b.z) <= 0.01);
      expect(m, `ふくろが同じ場所に無い ${JSON.stringify(b)}`).toBeTruthy();
      expect(Math.abs(b.ticksLeft - m.ticksLeft - elapsed), 'のこり時間').toBeLessThanOrEqual(2);
    }
    expect(elapsed).toBeGreaterThanOrEqual(W);
    // 17: たんす・かまど
    expect(back.tansu).toBe(setup.tansu);
    expect(back.furnaceDone, 'かまどが 焼けた物を たくわえている').not.toBeNull();
    expect(back.furnaceDone.length).toBeGreaterThanOrEqual(1);
    // 18: 畑
    expect(back.cropBlock).toBe('crop_onion');
    expect(back.stage).toBe(1);
    expect(back.soilAfter).toBe('farmland');
  });

  test('基準 15(出る場所): 妖怪は 描く輪（スタートの列から 6 以内の meshed）の外の列には出ない', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    await settleWorld(page, true);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      h.settings.set('yokaiAutoSpawn', true);
      h.time.set(20000); // 夜
      h.world.setStreamWork(null);
      const out: string[] = [];
      let seen = 0;
      for (let i = 0; i < 1500; i++) {
        h.step(1);
        if (i % 25 !== 0) continue;
        const c = w.stream().center;
        for (const y of h.yokai.list()) {
          seen++;
          const cx = Math.floor(y.position.x) >> 4;
          const cz = Math.floor(y.position.z) >> 4;
          if (Math.max(Math.abs(cx - c.cx), Math.abs(cz - c.cz)) > 6 || w.chunkStage(cx, cz) !== 'meshed') out.push(`${cx},${cz} ${w.chunkStage(cx, cz)}`);
        }
      }
      return { seen, out: out.slice(0, 5), n: out.length };
    });
    expect(r.n, JSON.stringify(r.out)).toBe(0);
  });

  for (const seed of SEEDS_20) {
    test(`基準 20: regions・置きもの・洞くつの口は 起動・テレポート・読みなおしのあとで同じ。どれも R の中（${label(seed)}）`, async ({ page }) => {
      await openStream(page, wide(q(seed)));
      const snap = () =>
        page.evaluate(() => {
          const h = window.__rikkun! as any;
          const w = h.world;
          const sp = w.spawn();
          return {
            sx: Math.floor(sp.x),
            sz: Math.floor(sp.z),
            seed: w.seed(),
            regions: w.regions(),
            placement: h.farm.placement(w.seed()),
            mouths: w.caveMouths(),
          };
        });
      const a = await snap();
      // R（G1）の中
      const inR = (x: number, z: number) => x >= a.sx - 64 && x <= a.sx + 63 && z >= a.sz - 64 && z <= a.sz + 63;
      const bad: string[] = [];
      const R = a.regions as any;
      let nChecked = 0;
      const circle = (name: string, o: any) => {
        nChecked++;
        if (!(typeof o?.cx === 'number' && typeof o?.cz === 'number' && typeof o?.r === 'number')) bad.push(`${name} 形`);
        else if (!inR(o.cx, o.cz)) bad.push(`${name} circle ${o.cx},${o.cz}`);
      };
      const rect = (name: string, o: any) => {
        nChecked++;
        if (!['x0', 'z0', 'x1', 'z1'].every((k) => typeof o?.[k] === 'number')) bad.push(`${name} 形`);
        else if (!(inR(o.x0, o.z0) && inR(o.x1, o.z1))) bad.push(`${name} rect`);
      };
      for (const n of ['mountain', 'rock', 'forest', 'spring', 'meadow', 'pond']) circle(n, R[n]);
      rect('flat', R.flat);
      expect(Array.isArray(R.river), 'river').toBe(true); // 空のこともある（今の seed 既定は []）
      R.river.forEach((o: any, i: number) => rect(`river${i}`, o));
      if (!inR(R.center.x, R.center.z)) bad.push('center');
      if (!inR(R.mountain.peak.x, R.mountain.peak.z)) bad.push('peak');
      expect(nChecked).toBeGreaterThanOrEqual(7);
      for (const m of a.mouths) if (!inR(m.x, m.z) || !inR(m.room.x, m.room.z)) bad.push(`mouth ${m.x},${m.z}`);
      for (const k of a.placement.wild) if (!inR(k.x, k.z)) bad.push(`wild ${k.x},${k.z}`);
      for (const k of a.placement.oldFarm?.blocks ?? []) if (!inR(k.x, k.z)) bad.push(`oldFarm ${k.x},${k.z}`);
      expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
      expect(a.mouths.length, '洞くつの口 1 つ以上').toBeGreaterThanOrEqual(1);
      // テレポートのあと
      const P = await findLand(page);
      await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
      await settleWorld(page);
      const b = await snap();
      expect(b).toEqual(a);
      // 読みなおしのあと
      await page.reload();
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      expect(await snap()).toEqual(a);
    });
  }

  for (const seed of [null, 1]) {
    test(`基準 21: 置きものは開始の前: ready で ふるい畑・やせいの やさい が全部ある。ready のあと置きもので作り直したセクションがない（${label(seed)}）`, async ({ page }) => {
      await page.goto('/' + wide(q(seed)));
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      const r = await page.evaluate(async () => {
        const h = window.__rikkun! as any;
        h.pause();
        const w = h.world;
        const pl = h.farm.placement(w.seed());
        const missing: string[] = [];
        for (const k of pl.wild) if (w.getBlock(k.x, k.y, k.z) !== `wild_${k.kind}`) missing.push(`wild ${k.x},${k.y},${k.z} ${w.getBlock(k.x, k.y, k.z)}`);
        const of = pl.oldFarm;
        // ふるい畑: 置く マス ぜんぶ（かかし・たんす・はたけ・さく）が そのとおりに ある
        for (const k of of?.blocks ?? []) if (w.getBlock(k.x, k.y, k.z) !== k.id) missing.push(`oldFarm ${k.id} ${k.x},${k.y},${k.z} ${w.getBlock(k.x, k.y, k.z)}`);
        if (of && w.getBlock(of.tansu.x, of.tansu.y, of.tansu.z) !== 'tansu') missing.push('tansu');
        // 箱 → 小ブロックの差しかえ（開始のあと、予算の中で進む）を 先に終わらせてから 記録を空にして見る
        await w.settle({ full: true });
        for (let n = 0; (h.world.lightPending() > 0 || w.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
        w.rebuildLog(true);
        h.step(60);
        const secs = new Set<string>();
        const add = (x: number, y: number, z: number) => secs.add(`${x >> 4},${y >> 4},${z >> 4}`);
        for (const k of pl.wild) add(k.x, k.y, k.z);
        for (const k of of?.blocks ?? []) add(k.x, k.y, k.z);
        const rebuilt = (w.rebuildLog() as { x: number; y: number; z: number }[]).filter((e) => secs.has(`${e.x},${e.y},${e.z}`));
        return { nWild: pl.wild.length, hasOld: !!of, missing: missing.slice(0, 5), nMissing: missing.length, rebuilt: rebuilt.slice(0, 5), nRebuilt: rebuilt.length };
      });
      expect(r.nWild + (r.hasOld ? 1 : 0), '置きものが 1 つも無い').toBeGreaterThan(0);
      expect(r.nMissing, JSON.stringify(r.missing)).toBe(0);
      expect(r.nRebuilt, JSON.stringify(r.rebuilt)).toBe(0);
    });
  }

  test('基準 22: 仮の海のふちが無い: スタートから 4〜6 列の列（置きものの無い 10 列）で hash === genHash', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    await settleWorld(page, true);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      const pl = h.farm.placement(w.seed());
      const sp = w.spawn();
      const pcx = Math.floor(sp.x) >> 4;
      const pcz = Math.floor(sp.z) >> 4;
      const used = new Set<string>();
      const mark = (x: number, z: number) => used.add(`${x >> 4},${z >> 4}`);
      for (const k of pl.wild) mark(k.x, k.z);
      for (const k of pl.oldFarm?.blocks ?? []) mark(k.x, k.z);
      const picks: { cx: number; cz: number }[] = [];
      for (let dz = -6; dz <= 6 && picks.length < 10; dz++)
        for (let dx = -6; dx <= 6 && picks.length < 10; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dz));
          if (d < 4 || d > 6) continue;
          if (used.has(`${pcx + dx},${pcz + dz}`)) continue;
          picks.push({ cx: pcx + dx, cz: pcz + dz });
        }
      const bad = picks.filter((c) => w.hash(c.cx, c.cz) !== w.genHash(c.cx, c.cz));
      return { n: picks.length, bad };
    });
    expect(r.n).toBe(10);
    expect(r.bad).toEqual([]);
  });

  test('基準 23: 壁: x = 29,999.7 で止まり z には動ける。壁の外のマス（x = 30000）は ほれない・おけない', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    const wall = await page.evaluate(() => (window.__rikkun! as any).world.wall());
    expect(wall).toBe(30000);
    await page.evaluate(() => (window.__rikkun! as any).world.teleport(29990.5, 100.5));
    await settleWorld(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const w = h.world;
      const g: number = w.groundHeight(29990, 100); // 足もとの高さ g（立つ所）の 下が 床
      const floor = g - 1;
      // 木・崖で止まらないように 床と 空気をつくる
      w.fill(29985, floor, 98, 29999, floor, 102, 'stone');
      w.fill(29985, floor + 1, 98, 29999, floor + 4, 102, 'air');
      h.lock.simulate(true);
      h.input.releaseAll();
      h.player.set({ position: { x: 29990.5, y: floor + 1, z: 100.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(1);
      h.input.press('moveForward');
      h.step(600);
      const east = h.player.get().position;
      // かべに おしつけたまま ななめ（東 + 南）→ z には すべって動ける
      const z0 = east.z;
      h.player.set({ yaw: 135 });
      h.step(20);
      const slide = h.player.get().position;
      h.input.releaseAll();
      const outSet = [w.setBlock(30000, floor + 1, 100, 'stone'), w.setBlock(30000, floor + 1, 101, 'log')];
      const outBlock = w.getBlock(30000, floor + 1, 100);
      const inSet = w.setBlock(29999, floor + 2, 100, 'stone');
      return { floor, east: { x: east.x, z: east.z }, z0, slide: { x: slide.x, z: slide.z }, outSet, outBlock, inSet };
    });
    expect(Math.abs(r.east.x - 29999.7)).toBeLessThanOrEqual(0.01);
    expect(r.slide.z - r.z0).toBeGreaterThan(0.5);
    expect(Math.abs(r.slide.x - 29999.7)).toBeLessThanOrEqual(0.01);
    expect(r.outSet).toEqual([false, false]);
    expect(r.outBlock).not.toBe('stone');
    expect(r.inSet).toBe(true);
  });

  test('基準 24: じゅんびちゅう（起動）: ことば・ブロック 5 こ・できた数 = floor(progress × 5)。押してもロックしない・タブは切りかわる。ready の次のコマで字がもどる', async ({ page }) => {
    await openBooting(page, wide('?nosave=1&streamWork=1'));
    const snapDom = () =>
      page.evaluate(
        (PREP) => {
          const h = window.__rikkun! as any;
          h.step(1);
          const s = h.world.stream();
          const text = document.querySelector(PREP.button + ' ' + PREP.text)?.textContent ?? document.querySelector(PREP.button)?.textContent ?? '';
          return {
            ready: s.ready,
            phase: s.phase,
            progress: s.progress as number,
            text,
            blocks: document.querySelectorAll(PREP.button + ' ' + PREP.block).length,
            done: document.querySelectorAll(PREP.button + ' ' + PREP.done).length,
            locked: h.lock.get().locked as boolean,
            overlayVisible: h.lock.get().overlayVisible as boolean,
          };
        },
        PREP,
      );
    const seen: number[] = [];
    let s = await snapDom();
    for (let i = 0; i < 3000 && !s.ready; i++) {
      expect(s.phase).toBe('boot');
      expect(s.text.startsWith('じゅんびちゅう'), `ことば: ${s.text}`).toBe(true);
      expect(s.blocks).toBe(5);
      expect(s.done).toBe(Math.floor(s.progress * 5));
      expect(s.overlayVisible).toBe(true);
      if (!seen.includes(s.done)) seen.push(s.done);
      // 半分すぎで 押す: ロックしない・本が 開く
      if (i === 200) {
        await page.locator(PREP.button).click({ force: true });
        expect(await page.evaluate(() => (window.__rikkun! as any).lock.get().locked)).toBe(false);
        // BOOK-1: 本も 開ける（ロックしない）。しめて もどす
        await page.locator('[data-book-open]').click({ force: true });
        expect(await page.evaluate(() => (window.__rikkun! as any).lock.get().bookOpen)).toBe(true);
        expect(await page.evaluate(() => (window.__rikkun! as any).lock.get().locked)).toBe(false);
        await page.locator('[data-book-btn="close"]').dispatchEvent('click');
        await page.evaluate(() => {
          const h = window.__rikkun! as any;
          for (let n = 0; n < 1200 && h.lock.get().bookOpen; n++) h.step(1);
        });
        expect(await page.evaluate(() => (window.__rikkun! as any).lock.get().bookOpen)).toBe(false);
      }
      // 速く進める（1 step ずつ見るのは 序盤と終盤だけ）
      if (i > 20 && i < 360 && i % 3 !== 0) await page.evaluate(() => (window.__rikkun! as any).step(2));
      s = await snapDom();
    }
    expect(s.ready).toBe(true);
    expect(seen.length, `できた数の移り変わり ${seen}`).toBeGreaterThanOrEqual(3);
    // ready の次のコマ
    await page.evaluate(() => (window.__rikkun! as any).step(1));
    const after = await page.evaluate((PREP) => {
      const h = window.__rikkun! as any;
      return {
        text: document.querySelector(PREP.button + ' .po-text')?.textContent ?? '',
        want: h.lock.get().overlayText as string,
        blocks: document.querySelectorAll(PREP.button + ' ' + PREP.block).length,
      };
    }, PREP);
    expect(after.text).toBe(after.want);
    expect(after.blocks).toBe(0);
  });

  test('基準 25: じゅんびちゅう（遠くへもどる）: 29 step では カード無し・31 step では有り。待つ間 動かない・落ちない・ダメージ 0。そろったら スタートの地面の上。近くのもどりは カード無し', async ({ page }) => {
    await openStream(page, wide('?nosave=1'));
    const P = await findLand(page);
    await page.evaluate((P) => (window.__rikkun! as any).world.teleport(P.x, P.z), P);
    await settleWorld(page);
    const cardCount = () => page.locator(PREP.card).filter({ visible: true }).count();
    const start = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.world.setStreamWork(1);
      h.player.respawn();
      const p = h.player.get().position;
      return { phase: h.world.stream().phase, pos: { x: p.x, y: p.y, z: p.z }, hp: h.combat.get().hp };
    });
    expect(start.phase).toBe('wait');
    const watch = (n: number) =>
      page.evaluate((n) => {
        const h = window.__rikkun! as any;
        let moved = 0;
        const p0 = h.player.get().position;
        let minHp = h.combat.get().hp;
        for (let i = 0; i < n; i++) {
          h.step(1);
          const p = h.player.get().position;
          if (p.x !== p0.x || p.y !== p0.y || p.z !== p0.z) moved++;
          minHp = Math.min(minHp, h.combat.get().hp);
        }
        return { moved, minHp, ready: h.world.stream().ready, phase: h.world.stream().phase };
      }, n);
    const w1 = await watch(29);
    expect(await cardCount(), '29 step では カードは出ていない').toBe(0);
    const w2 = await watch(2);
    expect(await cardCount(), '31 step では カードが出ている').toBe(1);
    const text = await page.locator(PREP.card + ' ' + PREP.text).first().textContent();
    expect(text?.startsWith('じゅんびちゅう')).toBe(true);
    expect(await page.locator(PREP.card + ' ' + PREP.block).count()).toBe(5);
    expect(w1.moved + w2.moved).toBe(0);
    expect(w1.phase).toBe('wait');
    // そろうまで（n = 1 なら 371 こ以上）
    const w3 = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const p0 = h.player.get().position;
      let moved = 0;
      let steps = 0;
      let minHp = h.combat.get().hp;
      const hp0 = minHp;
      while (!h.world.stream().ready && steps < 5000) {
        h.step(1);
        steps++;
        const p = h.player.get().position;
        if (p.x !== p0.x || p.y !== p0.y || p.z !== p0.z) moved++;
        minHp = Math.min(minHp, h.combat.get().hp);
      }
      h.step(2);
      const sp = h.world.spawn();
      const q = h.player.get();
      return { moved, steps, hp0, minHp, ready: h.world.stream().ready, y: q.position.y, x: q.position.x, z: q.position.z, g: h.world.groundHeight(Math.floor(sp.x), Math.floor(sp.z)), sp: { x: sp.x, z: sp.z }, onGround: q.onGround };
    });
    expect(w3.ready).toBe(true);
    expect(w3.steps).toBeGreaterThanOrEqual(371 - 31); // 371 こ以上 ＞ すでに進めた 31 step のあと
    expect(w3.moved).toBe(0);
    expect(w3.minHp).toBe(w3.hp0);
    expect(Math.abs(w3.y - (w3.g + 1))).toBeLessThanOrEqual(0.05);
    expect(Math.abs(w3.x - w3.sp.x)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(w3.z - w3.sp.z)).toBeLessThanOrEqual(0.05);
    expect(await cardCount(), 'そろったら カードが消える').toBe(0);
    // スタートの近くで もどすときは カードが出ない
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.world.setStreamWork(null);
      const sp = h.world.spawn();
      h.player.set({ position: { x: sp.x + 30, y: sp.y + 30, z: sp.z }, velocity: { x: 0, y: 0, z: 0 } });
      h.player.respawn();
    });
    const near = await watch(45);
    expect(await cardCount()).toBe(0);
    expect(near.phase).not.toBe('wait');
  });
});

