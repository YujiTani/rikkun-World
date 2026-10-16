import { expect, test, type Page } from '@playwright/test';
import { installArena } from './helpers/arena';

/**
 * VOX-B（docs/tickets/VOX-B.md）: どこまでも続く地形（高さ 352・海面 144）の E2E。
 * 受け入れ基準 4・8・12〜19（23 は e2e/m7.spec.ts の今のテストが受け持つ）。
 * hook（seaY・terrainAt・spawnInfo・startTorch・startFeatures・caveMouths・loadedChunks・isLoaded・genHash）は
 * タスク票「テストが使う hook」のとおり。実装の前は hook が無いので、ここは赤になる。
 * 進めるのは step の数で、時間（ms）では合否を決めない（rule #130）。
 */

const SEEDS = [null, 1, 2, 3, 4, 5]; // null = ふだんのシード
const label = (s: number | null) => `seed=${s ?? '既定'}`;

async function open(page: Page, query = '?nosave=1') {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
  await installArena(page);
}
const q = (seed: number | null) => (seed === null ? '?nosave=1' : `?nosave=1&seed=${seed}`);

test.describe('VOX-B 地形（つないだ後）', () => {
  test('AC15: 高さ 352・海面 144。y=352 と 読みこみ範囲の外は outside、setBlock は false', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      const w = h.world;
      const hash0 = w.hash();
      const size = w.size();
      const out = [
        w.getBlock(10, 352, 10),
        w.getBlock(10, 353, 10),
        w.getBlock(-1, 100, 10),
        w.getBlock(128, 100, 10),
        w.getBlock(10, 100, 128),
        w.getBlock(10, 100, -1),
      ];
      const set = [w.setBlock(5, 352, 5, 'stone'), w.setBlock(-1, 100, 5, 'stone'), w.setBlock(128, 100, 5, 'stone'), w.setBlock(5, 100, 128, 'stone')];
      return { size, sea: w.seaY?.(), out, set, hashSame: w.hash() === hash0, top: w.getBlock(10, 351, 10), area: w.testArea() };
    });
    expect(r.size).toEqual({ x: 128, y: 352, z: 128 });
    expect(r.sea).toBe(144);
    expect(r.out).toEqual(['outside', 'outside', 'outside', 'outside', 'outside', 'outside']);
    expect(r.set).toEqual([false, false, false, false]);
    expect(r.hashSame).toBe(true);
    expect(r.top).not.toBe('outside'); // y=351 は世界の中
    expect(r.area).toEqual({ x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 351 });
  });

  test('AC16: 読みこむ列は cx, cz = 0〜7 の 64 列。はしの e ≤ 3 の列は 地面 ≤ seaY−4 で、その上 seaY まで水', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const w = h.world;
      const chunks: { cx: number; cz: number }[] = w.loadedChunks();
      const keys = new Set(chunks.map((c) => `${c.cx},${c.cz}`));
      const inRange = chunks.every((c) => c.cx >= 0 && c.cx <= 7 && c.cz >= 0 && c.cz <= 7);
      const loadedOk = [w.isLoaded(0, 0), w.isLoaded(127, 127), w.isLoaded(64, 64)];
      const loadedOut = [w.isLoaded(-1, 0), w.isLoaded(128, 0), w.isLoaded(0, 128), w.isLoaded(0, -1)];
      const sea: number = w.seaY();
      const bad: string[] = [];
      let n = 0;
      for (let x = 0; x < 128; x += 3)
        for (let z = 0; z < 128; z += 3) {
          const e = Math.min(x, z, 127 - x, 127 - z);
          if (e > 3) continue;
          n++;
          const g = w.groundHeight(x, z);
          if (g > sea - 4) bad.push(`ground ${x},${z} ${g}`);
          for (let y = g + 1; y <= sea; y++) if (w.getBlock(x, y, z) !== 'water') bad.push(`water ${x},${y},${z}`);
        }
      return { count: chunks.length, unique: keys.size, inRange, loadedOk, loadedOut, n, bad: bad.slice(0, 5), nBad: bad.length };
    });
    expect(r.count).toBe(64);
    expect(r.unique).toBe(64);
    expect(r.inRange).toBe(true);
    expect(r.loadedOk).toEqual([true, true, true]);
    expect(r.loadedOut).toEqual([false, false, false, false]);
    expect(r.n).toBeGreaterThan(100);
    expect(r.nBad, JSON.stringify(r.bad)).toBe(0);
  });

  for (const seed of SEEDS) {
    test(`AC12: スタートは 草原・5×5 が同じ高さの くさ・上 3 段は空気・たいまつ（${label(seed)}）`, async ({ page }) => {
      await open(page, q(seed));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.pause();
        const w = h.world;
        const sp = w.spawn();
        const cx = Math.floor(sp.x);
        const cz = Math.floor(sp.z);
        const g = w.groundHeight(cx, cz);
        const sea: number = w.seaY();
        const bad: string[] = [];
        for (let x = cx - 2; x <= cx + 2; x++)
          for (let z = cz - 2; z <= cz + 2; z++) {
            if (w.getBlock(x, g, z) !== 'grass') bad.push(`grass ${x},${z}`);
            if (w.groundHeight(x, z) !== g) bad.push(`flat ${x},${z}`);
            for (let y = g + 1; y <= g + 3; y++) {
              const b = w.getBlock(x, y, z);
              if (b !== 'air' && b !== 'start_torch') bad.push(`air ${x},${y},${z} ${b}`);
            }
          }
        const torch = w.startTorch();
        const types = w.blockTypes();
        return {
          sp, cx, cz, g, sea, bad: bad.slice(0, 5), nBad: bad.length,
          biome: w.terrainAt(cx, cz).biome,
          info: w.spawnInfo(),
          torch,
          torchBlock: w.getBlock(torch.x, torch.y, torch.z),
          torchBreakable: types.find((t: any) => t.id === 'start_torch').breakable,
          torchSet: w.setBlock(torch.x, torch.y, torch.z, 'start_torch'),
        };
      });
      expect(r.biome).toBe('grassland');
      expect(r.nBad, JSON.stringify(r.bad)).toBe(0);
      expect(r.g).toBeGreaterThanOrEqual(r.sea + 2);
      expect(r.g).toBeLessThanOrEqual(r.sea + 12);
      expect(r.info.fallback).toBe(false);
      expect(Math.abs(r.cx - 64)).toBeLessThanOrEqual(16); // さがし始めは (64,64) から 16 以内（基準 11）
      expect(Math.abs(r.cz - 64)).toBeLessThanOrEqual(16);
      expect(r.torch).toEqual({ x: r.cx + 2, y: r.g + 1, z: r.cz - 1 }); // P5: (x+2, Hs+1, z−1)
      expect(r.torchBlock).toBe('start_torch');
      expect(r.torchBreakable).toBe(false);
    });
  }

  test('AC12(ほる): たいまつ をねらって ほり続けても こわれない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const T = h.world.startTorch();
      // たいまつ の 西がわ 2 マスから 東を向いて ほる
      const gy = h.world.groundHeight(T.x - 2, T.z);
      h.player.set({ position: { x: T.x - 1.5, y: gy + 1, z: T.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(2);
      h.input.press('primary');
      h.step(300);
      h.input.release('primary');
      return { after: h.world.getBlock(T.x, T.y, T.z) };
    });
    expect(r.after).toBe('start_torch');
  });

  test('AC4: スタートから 8 以内の陸の列の地層（くさ・つち・つち か いし・その下は いし か 鉱石）。y=0 は そこいし', async ({ page }) => {
    for (const seed of [null, 2]) {
      await open(page, q(seed));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        const w = h.world;
        const sp = w.spawn();
        const sx = Math.floor(sp.x);
        const sz = Math.floor(sp.z);
        const sea: number = w.seaY();
        const rock = w.startFeatures().rock;
        const bad: string[] = [];
        let land = 0;
        for (let x = sx - 8; x <= sx + 8; x++)
          for (let z = sz - 8; z <= sz + 8; z++) {
            if (w.getBlock(x, 0, z) !== 'bedrock') bad.push(`y0 ${x},${z}`);
            const H = w.groundHeight(x, z);
            if (H < sea + 2) continue;
            if (Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + 1) continue; // はじまりの岩山の円の中はのぞく
            if (['farmland', 'farmland_wet', 'tansu'].includes(h.world.getBlock(x, H, z))) continue; // ふるい畑の列は 畑の きまり（F1）
            land++;
            const at = (d: number) => w.getBlock(x, H - d, z);
            if (at(0) !== 'grass') bad.push(`top ${x},${z} ${at(0)}`);
            if (at(1) !== 'dirt') bad.push(`dirt ${x},${z} ${at(1)}`);
            if (at(2) !== 'dirt' && at(2) !== 'stone') bad.push(`dirt2 ${x},${z} ${at(2)}`);
            for (let d = 3; d <= 7; d++) {
              const b = at(d);
              if (b !== 'stone' && b !== 'coal_ore' && b !== 'iron_ore') bad.push(`under ${x},${H - d},${z} ${b}`);
            }
          }
        return { land, bad: bad.slice(0, 5), n: bad.length };
      });
      expect(r.land, label(seed)).toBeGreaterThan(50);
      expect(r.n, `${label(seed)} ${JSON.stringify(r.bad)}`).toBe(0);
    }
  });

  test('AC13: スタートから 4 方向へ 90 step 歩くと、どれも広場の外（チェビシェフ 3 以上）へ出る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const sp = h.world.spawn();
      const out: { yaw: number; dist: number; y: number }[] = [];
      for (const yaw of [0, 90, 180, 270]) {
        h.input.releaseAll();
        h.player.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
        h.step(2);
        h.input.press('moveForward');
        h.step(90);
        h.input.release('moveForward');
        const p = h.player.get().position;
        out.push({ yaw, dist: Math.max(Math.abs(Math.floor(p.x) - Math.floor(sp.x)), Math.abs(Math.floor(p.z) - Math.floor(sp.z))), y: p.y });
      }
      return out;
    });
    for (const o of r) expect(o.dist, `yaw ${o.yaw}`).toBeGreaterThanOrEqual(3);
  });

  for (const seed of SEEDS) {
    test(`AC14: はじまりの木 3 本・北 ±45° に 見える 1 本・岩山に せきたん（${label(seed)}）`, async ({ page }) => {
      await open(page, q(seed));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.pause();
        const w = h.world;
        const sp = w.spawn();
        const sx = Math.floor(sp.x);
        const sz = Math.floor(sp.z);
        const f = w.startFeatures();
        const solid = new Set<string>(w.blockTypes().filter((t: any) => t.solid).map((t: any) => t.id));
        const eye = { x: sp.x, y: sp.y + 1.6, z: sp.z };
        // 目から (tx,ty,tz) へ 0.25 刻みで 線を引き、最初に当たる固いブロックを返す
        const firstHit = (tx: number, ty: number, tz: number) => {
          const dx = tx - eye.x, dy = ty - eye.y, dz = tz - eye.z;
          const len = Math.hypot(dx, dy, dz);
          const n = Math.ceil(len / 0.25);
          for (let i = 1; i <= n; i++) {
            const x = Math.floor(eye.x + (dx * i) / n), y = Math.floor(eye.y + (dy * i) / n), z = Math.floor(eye.z + (dz * i) / n);
            const b = w.getBlock(x, y, z);
            if (solid.has(b)) return b as string;
          }
          return null;
        };
        const trees = f.trees.map((t: any) => {
          const cheb = Math.max(Math.abs(t.x - sx), Math.abs(t.z - sz));
          // 北（−z）からの角度
          const ang = (Math.atan2(t.x + 0.5 - sp.x, -(t.z + 0.5 - sp.z)) * 180) / Math.PI;
          let visible = false;
          const hits: (string | null)[] = [];
          for (let k = 0; k < 4; k++) {
            const b = firstHit(t.x + 0.5, t.y + k + 0.5, t.z + 0.5);
            hits.push(b);
            if (b === 'log' || b === 'leaves') visible = true;
          }
          return { t, cheb, ang, visible, trunk: [0, 1, 2, 3].map((k) => w.getBlock(t.x, t.y + k, t.z)) };
        });
        // 岩山: 円の中の せきたん で 空気に面したもの
        const rock = f.rock;
        let coal = 0;
        let south = 0;
        const R = Math.ceil(rock.r) + 1;
        for (let x = rock.cx - R; x <= rock.cx + R; x++)
          for (let z = rock.cz - R; z <= rock.cz + R; z++) {
            if (Math.hypot(x - rock.cx, z - rock.cz) > rock.r + 1) continue;
            for (let y = Math.max(1, rock.peakY - 12); y <= rock.peakY; y++) {
              if (w.getBlock(x, y, z) !== 'coal_ore') continue;
              const airAt = (dx: number, dy: number, dz: number) => w.getBlock(x + dx, y + dy, z + dz) === 'air';
              if (airAt(1, 0, 0) || airAt(-1, 0, 0) || airAt(0, 1, 0) || airAt(0, -1, 0) || airAt(0, 0, 1) || airAt(0, 0, -1)) coal++;
              if (airAt(0, 0, 1)) south++; // 南 = +z = スタートがわ
            }
          }
        return { trees, coal, south, rock };
      });
      expect(r.trees).toHaveLength(3);
      for (const t of r.trees) {
        expect(t.cheb).toBeGreaterThanOrEqual(5);
        expect(t.cheb).toBeLessThanOrEqual(12);
        expect(t.trunk[0], 'みき').toBe('log');
      }
      const northSeen = r.trees.filter((t: any) => Math.abs(t.ang) <= 45 && t.visible);
      expect(northSeen.length, JSON.stringify(r.trees.map((t: any) => ({ a: Math.round(t.ang), v: t.visible })))).toBeGreaterThanOrEqual(1);
      expect(r.coal).toBeGreaterThanOrEqual(6);
      expect(r.south).toBeGreaterThanOrEqual(3);
    });
  }

  for (const seed of SEEDS) {
    test(`AC8: 洞くつの口が 1 つ以上。入り口から さかみちを歩いて へやまで行き、もどる（${label(seed)}）`, async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, q(seed));
      const r = await page.evaluate(() => {
        const h = (window as any).__rikkun;
        h.pause();
        h.lock.simulate(true);
        h.settings.set('yokaiAutoSpawn', false);
        h.yokai.clear();
        const w = h.world;
        const mouths: any[] = w.caveMouths();
        const sp = w.spawn();
        const far = mouths.every((m) => Math.max(Math.abs(m.x - Math.floor(sp.x)), Math.abs(m.z - Math.floor(sp.z))) > 40);
        if (mouths.length === 0) return { n: 0, far };
        const m = mouths[0];
        // 入り口の足もと: 空気の下が固いところまで下げる（y は 入り口の床でも 床の上でも 同じに立てる）
        let fy = m.y + 2;
        while (fy > 1 && !(w.getBlock(m.x, fy - 1, m.z) !== 'air' && w.getBlock(m.x, fy - 1, m.z) !== 'water')) fy--;
        const start = { x: m.x + 0.5, y: fy, z: m.z + 0.5 };
        h.input.releaseAll();
        h.player.set({ position: start, velocity: { x: 0, y: 0, z: 0 }, yaw: m.dir * 90, pitch: 0 });
        h.step(2);
        const horiz = (p: any, x: number, z: number) => Math.hypot(p.x - x, p.z - z);
        // 行き
        h.input.press('moveForward');
        let inSteps = -1;
        for (let i = 0; i < 600; i++) {
          h.step(1);
          const p = h.player.get();
          if (horiz(p.position, m.room.x + 0.5, m.room.z + 0.5) < 2) { inSteps = i + 1; break; }
        }
        h.input.release('moveForward');
        const atRoom = h.player.get().position;
        // もどり
        h.player.set({ yaw: (m.dir * 90 + 180) % 360 });
        h.input.press('moveForward');
        let backSteps = -1;
        for (let i = 0; i < 600; i++) {
          h.step(1);
          const p = h.player.get();
          if (horiz(p.position, start.x, start.z) < 2 && p.position.y >= start.y - 0.5) { backSteps = i + 1; break; }
        }
        h.input.release('moveForward');
        return { n: mouths.length, far, inSteps, backSteps, start, atRoom, end: h.player.get().position, mouth: m };
      });
      expect(r.n, '洞くつの口が 0 こ（0 なら C4 の割合を上げる案をデザインへ差し戻し）').toBeGreaterThanOrEqual(1);
      expect(r.far).toBe(true);
      if (seed !== null && seed !== 1) return; // 歩いて確かめるのは 既定と 1（時間を使うため）
      expect(r.inSteps, `行き ${JSON.stringify(r)}`).toBeGreaterThan(0);
      expect(r.backSteps, `帰り ${JSON.stringify(r)}`).toBeGreaterThan(0);
    });
  }

  test('AC17: 遠くの生成: genHash(−313,−313) は 2 回の起動で同じ・seed でちがう。terrainAt(−5000,−5000).h は 114〜270', async ({ page }) => {
    const get = async (query: string) => {
      await open(page, query);
      return page.evaluate(() => {
        const w = (window as any).__rikkun.world;
        return { hash: w.genHash(-313, -313) as string, t: w.terrainAt(-5000, -5000) };
      });
    };
    const a1 = await get('?nosave=1');
    const a2 = await get('?nosave=1');
    const s1 = await get('?nosave=1&seed=1');
    const s2 = await get('?nosave=1&seed=2');
    expect(a1.hash).toBe(a2.hash);
    expect(a1.hash).toMatch(/\S/);
    expect(s1.hash).not.toBe(s2.hash);
    for (const x of [a1, s1, s2]) {
      expect(x.t.h).toBeGreaterThanOrEqual(114);
      expect(x.t.h).toBeLessThanOrEqual(270);
      expect(['grassland', 'forest']).toContain(x.t.biome);
    }
  });

  test('AC18: スタートの足もとから 20 段 ほる → 光とメッシュの順番待ちが 0 → 穴のかべに メッシュ。保存 → 読みなおしで hash が同じ', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, '?reset=1');
    const r = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      h.pause();
      h.lock.simulate(true);
      h.settings.set('yokaiAutoSpawn', false);
      h.yokai.clear();
      const w = h.world;
      const sp = w.spawn();
      const cx = Math.floor(sp.x);
      const cz = Math.floor(sp.z);
      const g = w.groundHeight(cx, cz);
      // キャラは 穴から はなれた所に置く
      h.player.set({ position: { x: sp.x + 4, y: sp.y, z: sp.z + 4 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 });
      let dug = 0;
      for (let k = 0; k < 20; k++) if (w.setBlock(cx, g - k, cz, 'air')) dug++;
      let steps = 0;
      while ((w.lightPending() > 0 || w.meshStats().pending > 0) && steps < 3000) {
        h.step(5);
        steps += 5;
      }
      h.step(2);
      const secs = new Set<string>();
      for (let k = 0; k < 20; k++) secs.add(`${Math.floor(cx / 16)},${Math.floor((g - k) / 16)},${Math.floor(cz / 16)}`);
      const tiers = [...secs].map((s) => {
        const [a, b, c] = s.split(',').map(Number);
        return { s, tier: w.sectionInfo(a, b, c).tier };
      });
      await h.save.now();
      return { dug, steps, pending: w.lightPending() + w.meshStats().pending, tiers, hash: w.hash(), g };
    });
    expect(r.dug).toBe(20);
    expect(r.steps).toBeLessThan(3000);
    expect(r.pending).toBe(0);
    for (const t of r.tiers) expect(t.tier, t.s).not.toBe('none');
    await page.reload();
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const hash2 = await page.evaluate(() => (window as any).__rikkun.world.hash());
    expect(hash2).toBe(r.hash);
    await page.evaluate(() => (window as any).__rikkun.save.clear());
  });

  test('AC19: 今のセーブは 読まない・消さない（main の IndexedDB の列 ＋ 古い localStorage のセーブ）', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // 1 回 ふつうに起動して IndexedDB（rikkun-world）を作らせる
    await page.goto('/?reset=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const seed: number = await page.evaluate(() => (window as any).__rikkun.world.seed());
    // 今のセーブを置く: IndexedDB に 'main' の列 1 つ、localStorage に 古い形のセーブ
    const key = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const sand = h.world.blockTypes().findIndex((t: any) => t.id === 'sand');
      const db: IDBDatabase = await new Promise((ok, ng) => {
        const r = indexedDB.open('rikkun-world', 1);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ng(r.error);
      });
      await new Promise<void>((ok, ng) => {
        const tx = db.transaction('chunks', 'readwrite');
        tx.objectStore('chunks').put({ v: 2, gen: 2, h: 3, data: new Uint8Array([1, 2, 3]) }, ['main', 6, 3]);
        tx.oncomplete = () => ok();
        tx.onerror = () => ng(tx.error);
      });
      db.close();
      const k = `rikkun-world-save-v1-${h.world.seed()}`;
      localStorage.setItem(
        k,
        JSON.stringify({ version: 1, gen: 2, size: [128, 48, 128], seed: h.world.seed(), blocks: [(8 * 128 + 60) * 128 + 100, sand], inventory: null, player: null, bags: [], tick: 0 }),
      );
      return k;
    });
    // 置いたあとの起動 A
    await page.goto('/');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const a = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { hash: h.world.hash(), saveId: h.save.info().saveId, sand: h.world.getBlock(100, 8, 60) };
    });
    // ?reset=1 の起動 B（新しい saveId だけを消す）
    await page.goto('/?reset=1');
    await page.waitForFunction(() => window.__rikkun?.ready === true);
    const b = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      return { hash: h.world.hash(), saveId: h.save.info().saveId };
    });
    // 置いた物が 残っている
    const kept = await page.evaluate(
      async (k) => {
        const db: IDBDatabase = await new Promise((ok, ng) => {
          const r = indexedDB.open('rikkun-world', 1);
          r.onsuccess = () => ok(r.result);
          r.onerror = () => ng(r.error);
        });
        const col = await new Promise<any>((ok) => {
          const g = db.transaction('chunks', 'readonly').objectStore('chunks').get(['main', 6, 3]);
          g.onsuccess = () => ok(g.result);
        });
        db.close();
        return { col: !!col, ls: localStorage.getItem(k) !== null };
      },
      key,
    );
    console.log('AC19', JSON.stringify({ seed, a, b, kept }));
    expect(typeof a.saveId).toBe('string');
    expect(a.saveId).not.toBe('main');
    expect(a.hash).toBe(b.hash);
    expect(a.sand).not.toBe('sand');
    expect(kept.col).toBe(true);
    expect(kept.ls).toBe(true);
    await ctx.close();
  });
});
