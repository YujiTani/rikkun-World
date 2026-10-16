import { expect, test, type Page } from '@playwright/test';

/**
 * M5（広い世界）の受け入れ基準 docs/design/M5-world.md のうち、実際のゲームでしか確かめられないもの。
 * 20 シードの地形（AC2〜AC13）・保存（AC20/AC21）・妖怪（AC18）の細かい所はユニットテストが受け持つ。
 * ここでは「つないだ後の実ゲーム」で AC1・AC15・AC18・AC20・AC21 と、見た目（AC22）を確かめる。
 */
const ASSETS = 'docs/test-reports/assets';
test.describe.configure({ timeout: 180_000 });

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
}

test.describe('M5 広い世界', () => {
  test('AC1/AC13: 大きさ 128×48×128・見えないかべ・テスト場所', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      const out: any = { size: h.world.size(), area: h.world.testArea() };
      // 床の列
      out.col = [] as string[];
      for (const [x, z] of [[0, 0], [12, 12], [6, 6]]) {
        out.col.push([0, 5, 6, 7, 8, 47].map((y) => h.world.getBlock(x, y, z)).join(','));
      }
      return out;
    });
    expect(r.size).toEqual({ x: 128, y: 48, z: 128 });
    expect(r.area).toEqual({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 47 });
    console.log('AC1', JSON.stringify(r));
  });

  test('AC1(歩き): 西・東へ歩き続けても足もとの中央は 0.3〜127.7', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      const res: any = {};
      for (const [name, x, z, yaw] of [['west', 3.5, 40.5, 270], ['east', 124.5, 40.5, 90], ['north', 40.5, 3.5, 0], ['south', 40.5, 124.5, 180]] as const) {
        h.player.set({ position: { x, y: 12, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
        h.input.releaseAll();
        h.input.press('moveForward');
        h.step(240);
        h.input.releaseAll();
        res[name] = h.player.get().position;
      }
      return res;
    });
    console.log('AC1 walk', JSON.stringify(r));
    expect(r.west.x).toBeCloseTo(0.3, 1);
    expect(r.east.x).toBeCloseTo(127.7, 1);
    expect(r.north.z).toBeCloseTo(0.3, 1);
    expect(r.south.z).toBeCloseTo(127.7, 1);
    for (const p of Object.values<any>(r)) {
      expect(p.x).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(127.7 + 1e-6);
      expect(p.z).toBeGreaterThanOrEqual(0.3 - 1e-6);
      expect(p.z).toBeLessThanOrEqual(127.7 + 1e-6);
    }
  });

  test('AC6/AC19: スタートの たいまつ は掘ってもこわれない・夜、4 マス以内の地面の上は強い明かり', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const H0 = h.world.regions().startH0;
      const torch = h.world.getBlock(66, H0 + 1, 63);
      // たいまつ の前（西がわ）に立って、たいまつ をねらって 300 ステップほる
      h.player.set({ position: { x: 64.5, y: H0 + 1, z: 63.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(2);
      const tgt = h.target.get();
      h.input.press('primary');
      h.step(300);
      h.input.release('primary');
      const after = h.world.getBlock(66, H0 + 1, 63);
      h.time.set(59400);
      h.step(3);
      const levels: number[] = [];
      let min = 99;
      for (let dx = -4; dx <= 4; dx++)
        for (let dz = -4; dz <= 4; dz++) {
          const x = 66 + dx, z = 63 + dz;
          if (Math.abs(dx) + Math.abs(dz) > 4 || h.world.groundHeight(x, z) !== H0) continue;
          const l = h.world.lightAt(x, H0 + 1, z);
          levels.push(l.level);
          min = Math.min(min, l.level);
        }
      const far = h.world.lightAt(66 + 20, h.world.groundHeight(86, 63) + 1, 63);
      return { H0, torch, after, tgt: JSON.stringify(tgt).slice(0, 120), n: levels.length, min, far, sample: levels.slice(0, 12) };
    });
    console.log('AC6/19', JSON.stringify(r));
    expect(r.torch).toBe('start_torch');
    expect(r.after).toBe('start_torch');
    expect(r.n).toBeGreaterThan(10);
    expect(r.min).toBeGreaterThanOrEqual(8); // 強い明かり（遠くの夜より はっきり明るい）
    expect(r.far.level).toBeLessThan(r.min);
  });

  test('AC13: 北西のすみ（テスト場所）の地層', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const bad: string[] = [];
      for (let x = 0; x <= 12; x++)
        for (let z = 0; z <= 12; z++) {
          if (h.world.getBlock(x, 0, z) !== 'bedrock') bad.push(`y0 ${x},${z}`);
          for (const y of [5, 6]) if (h.world.getBlock(x, y, z) !== 'sand') bad.push(`sand ${x},${y},${z}`);
          if (h.world.getBlock(x, 7, z) !== 'water') bad.push(`water ${x},${z}`);
          for (let y = 8; y <= 47; y++) if (h.world.getBlock(x, y, z) !== 'air') bad.push(`air ${x},${y},${z}`);
        }
      return { bad: bad.slice(0, 5), n: bad.length, y0: h.world.getBlock(0, 0, 0) };
    });
    console.log('AC13', JSON.stringify(r));
    expect(r.n).toBe(0);
  });

  test('AC15: かすみ 40〜80・88 より遠いチャンクは描かない（スタートと かど）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      const near = (cx: number, cz: number, px: number, pz: number) => {
        const dx = Math.max(cx * 16 - px, 0, px - (cx * 16 + 16));
        const dz = Math.max(cz * 16 - pz, 0, pz - (cz * 16 + 16));
        return Math.hypot(dx, dz);
      };
      const calc = (px: number, pz: number) => {
        let n = 0;
        for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) if (near(cx, cz, px, pz) <= 88) n++;
        return n;
      };
      const out: any = {};
      const spawn = h.world.spawn();
      h.step(2);
      // 描く距離は 見ている人 = カメラの位置から（三人称だけになり、カメラは キャラの 4 うしろ）
      const cam = () => h.camera.get().position;
      out.start = { stats: h.render.chunks(), calc: calc(cam().x, cam().z), at: h.player.get().position };
      for (const [name, x, z] of [['nw', 1.5, 1.5], ['se', 126.5, 126.5], ['ne', 126.5, 1.5]] as const) {
        h.player.set({ position: { x, y: 12, z }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(3);
        out[name] = { stats: h.render.chunks(), calc: calc(cam().x, cam().z) };
      }
      out.spawn = spawn;
      return out;
    });
    console.log('AC15', JSON.stringify(r));
    expect(r.start.stats.total).toBe(64);
    expect(r.start.stats.drawn).toBe(r.start.calc);
    for (const k of ['nw', 'se', 'ne']) {
      expect(r[k].stats.drawn).toBe(r[k].calc);
      expect(r[k].stats.drawn).toBeLessThan(64);
    }
  });

  test('AC18: 夜、ひらちの真ん中で 3,000 ステップ: 妖怪が出る・12〜28・みずの列でない。65 の所に動かすと消える', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      const reg = h.world.regions();
      const cx = Math.floor((reg.flat.x0 + reg.flat.x1) / 2);
      const cz = Math.floor((reg.flat.z0 + reg.flat.z1) / 2);
      const P = { x: cx + 0.5, z: cz + 0.5 };
      h.settings.set('yokaiAutoSpawn', true);
      h.settings.set('yokaiWander', false);
      h.time.set(59400);
      h.yokai.clear();
      h.player.set({ position: { x: P.x, y: 9, z: P.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      h.step(1);
      h.yokai.events();
      const spawns: any[] = [];
      for (let i = 0; i < 3000; i += 10) {
        h.combat.setHp(20);
        h.player.set({ position: { x: P.x, y: h.player.get().position.y, z: P.z }, velocity: { x: 0, y: 0, z: 0 } });
        h.step(10);
        for (const e of h.yokai.events()) if (e.type === 'spawn') spawns.push(e);
      }
      const below = spawns.map((e) => h.world.getBlock(Math.floor(e.position.x), Math.floor(e.position.y - 0.5), Math.floor(e.position.z)));
      const colWater = spawns.map((e) => h.world.getBlock(Math.floor(e.position.x), 7, Math.floor(e.position.z)) === 'water');
      // 遠くの妖怪
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      h.yokai.events();
      const id = h.yokai.spawn('karakasa', P.x + 20, 9, P.z, { ai: false });
      const before = h.yokai.list().some((y: any) => y.id === id);
      const items0 = h.drops ? 0 : 0;
      h.yokai.events();
      const moved = h.yokai.spawn('karakasa', P.x - 10, 9, P.z, { ai: false });
      // 65 の所は世界の中（x=cx+65 は外）→ 西へ 65
      const farId = h.yokai.spawn('karakasa', P.x - 65, 9, P.z, { ai: false });
      h.step(1);
      const ids = h.yokai.list().map((y: any) => y.id);
      const ev = h.yokai.events();
      return { P, n: spawns.length, spawns: spawns.map((e) => ({ k: e.kind, x: e.position.x, z: e.position.z })), below, colWater, before, farGone: !ids.includes(farId), nearKept: ids.includes(moved), defeat: ev.filter((e: any) => e.type === 'defeat' || e.type === 'drop').length, evTypes: ev.map((e: any) => e.type), items0 };
    });
    console.log('AC18', JSON.stringify(r));
    expect(r.n).toBeGreaterThanOrEqual(1);
    for (const s of r.spawns) {
      const d = Math.hypot(s.x - r.P.x, s.z - r.P.z);
      expect(d).toBeGreaterThanOrEqual(11.5);
      expect(d).toBeLessThanOrEqual(28.5);
    }
    expect(r.colWater.filter(Boolean)).toEqual([]);
    expect(r.farGone).toBe(true);
    expect(r.nearKept).toBe(true);
    expect(r.defeat).toBe(0);
  });

  test('AC20: gen=1・gen なし・size ちがいの保存は使わない。そのあとの保存は gen=2・size=[128,48,128]', async ({ page }) => {
    await open(page, '?nosave=1');
    const key = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return `rikkun-world-save-v1-${h.world.seed()}`;
    });
    // 実際の保存を 1 回作って形を見る
    await page.goto('/?reset=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => window.__rikkun!.achievements.mute(true));
    const base = await page.evaluate((k) => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.world.setBlock(100, 8, 60, 'sand');
      h.save.now();
      const raw = localStorage.getItem(k);
      return raw;
    }, key);
    expect(base).not.toBeNull();
    const parsed = JSON.parse(base!);
    expect(parsed.gen).toBe(2);
    expect(parsed.size).toEqual([128, 48, 128]);

    const variants: Record<string, (d: any) => any> = {
      gen1: (d) => ({ ...d, gen: 1 }),
      noGen: (d) => {
        const c = { ...d };
        delete c.gen;
        return c;
      },
      size64: (d) => ({ ...d, size: [64, 32, 64] }),
    };
    for (const [name, f] of Object.entries(variants)) {
      const text = JSON.stringify(f(parsed));
      await page.evaluate(([k, t]) => localStorage.setItem(k, t), [key, text]);
      await page.goto('/');
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      await page.evaluate(() => window.__rikkun!.achievements.mute(true));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.pause();
        const sp = h.world.spawn();
        const pos = h.player.get().position;
        const inv = h.inventory.get ? h.inventory.get() : null;
        const total = inv ? JSON.stringify(inv).length : 0;
        return { sandChanged: h.world.getBlock(100, 8, 60), pos, sp, inv: inv ? JSON.stringify(inv).slice(0, 200) : null, total };
      });
      console.log('AC20', name, JSON.stringify(r));
      expect(r.sandChanged).not.toBe('sand');
      expect(Math.abs(r.pos.x - r.sp.x)).toBeLessThan(0.01);
      expect(Math.abs(r.pos.z - r.sp.z)).toBeLessThan(0.01);
      // そのあとの保存
      const after = await page.evaluate((k) => {
        const h = (window as any).__rikkun;
        h.world.setBlock(101, 8, 60, 'sand');
        h.save.now();
        const d = JSON.parse(localStorage.getItem(k)!);
        return { gen: d.gen, size: d.size };
      }, key);
      expect(after).toEqual({ gen: 2, size: [128, 48, 128] });
    }
    await page.evaluate((k) => localStorage.removeItem(k), key);
  });

  test('AC21: ひらち (100,8,60) とやま (64,25,28) の変更を保存して読み直すと同じ', async ({ page }) => {
    await page.goto('/?reset=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => window.__rikkun!.achievements.mute(true));
    const a = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      const r1 = h.world.setBlock(100, 8, 60, 'log');
      const r2 = h.world.setBlock(64, 25, 28, 'sand');
      const r3 = h.world.setBlock(65, 30, 28, 'log'); // 空中
      h.step(2);
      h.save.now();
      return { r1, r2, r3, hash: h.world.hash() };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    await page.evaluate(() => window.__rikkun!.achievements.mute(true));
    const b = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { hash: h.world.hash(), a: h.world.getBlock(100, 8, 60), b: h.world.getBlock(64, 25, 28), c: h.world.getBlock(65, 30, 28) };
    });
    console.log('AC21', JSON.stringify({ a, b }));
    expect(b.hash).toBe(a.hash);
    expect(b.a).toBe('log');
    expect(b.b).toBe('sand');
    await page.evaluate(() => (window as any).__rikkun.save.clear());
  });
});

async function shot(page: Page, name: string, spot: { x: number; z: number; y?: number; yaw: number; pitch?: number }) {
  await page.evaluate((s) => {
    const h = (window as any).__rikkun;
    const gy = h.world.groundHeight(Math.floor(s.x), Math.floor(s.z));
    h.player.set({ position: { x: s.x + 0.5, y: s.y ?? gy + 1, z: s.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: s.yaw, pitch: s.pitch ?? 0 });
    h.step(4);
  }, spot);
  await page.screenshot({ path: `${ASSETS}/${name}` });
}

test.describe('M5 見た目（スクショ）', () => {
  test('AC22: 地形の見どころ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    const reg = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      h.time.set(1000);
      return h.world.regions();
    });
    console.log('regions', JSON.stringify(reg));
    // スタートで北を見る
    await shot(page, 'M5-01-start-north.png', { x: 64, z: 64, yaw: 0, pitch: 0 });
    // やま: 山の南がわの中ほどから見上げる
    await shot(page, 'M5-02-mountain-slope.png', { x: reg.mountain.peak.x, z: reg.mountain.peak.z + 10, yaw: 0, pitch: 0.2 });
    // 頂上から南をのぞむ
    await shot(page, 'M5-03-mountain-peak-south.png', { x: reg.mountain.peak.x, z: reg.mountain.peak.z, yaw: 180, pitch: 0 });
    // 岩山
    await shot(page, 'M5-04-rock-hill.png', { x: reg.rock.cx, z: reg.rock.cz + 9, yaw: 0, pitch: 0.1 });
    // もり（西）
    await shot(page, 'M5-05-forest.png', { x: reg.forest.cx + 8, z: reg.forest.cz, yaw: -90, pitch: 0 });
    await shot(page, 'M5-05b-forest-inside.png', { x: reg.forest.cx, z: reg.forest.cz, yaw: -90, pitch: 0 });
    // ひらち（東）と かわ
    await shot(page, 'M5-06-flat.png', { x: Math.floor((reg.flat.x0 + reg.flat.x1) / 2), z: Math.floor((reg.flat.z0 + reg.flat.z1) / 2), yaw: 90, pitch: 0 });
    await shot(page, 'M5-07-river.png', { x: reg.flat.x0 + 2, z: reg.flat.z0 + 8, yaw: -90, pitch: 0 });
    // くさはら と いけ（南）
    await shot(page, 'M5-08-meadow.png', { x: reg.meadow.cx, z: reg.meadow.cz - 10, yaw: 180, pitch: 0 });
    await shot(page, 'M5-09-pond.png', { x: reg.pond.cx + 7, z: reg.pond.cz, yaw: -90, pitch: 0 });
    // 上から
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.camera.overview(true);
      h.step(2);
    });
    await page.screenshot({ path: `${ASSETS}/M5-10-overview.png` });
    await page.evaluate(() => (window as any).__rikkun.camera.overview(false));
    // 見下ろしカメラは 64 の島向けのまま（北西の 1/4 しか写らない）。全体は真下を向いて 4 か所ずつ撮る
    for (const [n, x, z] of [['nw', 32, 32], ['ne', 96, 32], ['sw', 32, 96], ['se', 96, 96], ['center', 64, 64]] as const) {
      await shot(page, `M5-11-top-${n}.png`, { x, z, y: 50, yaw: 0, pitch: -89 });
    }
  });
});
