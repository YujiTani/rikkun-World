import { expect, test, type Page } from '@playwright/test';
import { installArena } from './helpers/arena';
import { WORLD_SIZE } from '../src/contracts';
import { findUnrubiedKanji } from '../src/ui/text';
import { waitCharLoaded } from './helpers/char';
import { waitFrames } from './helpers/anim';
import { fine } from './helpers/fine';

/**
 * M1 の受け入れ基準のうち、つないだ後の実際のゲームでしか確かめられないもの。
 * M1-01 = docs/design/M1-01-world.md、M1-02 = docs/design/M1-02-movement.md。
 * ユニットテストで確かめ済みの基準は docs/test-reports/M1.md に書いてある。
 */

const SEEDS = [null, 1, 2, 3, 4, 5]; // null = ふだんのシード
const ASSETS = 'test-shots/assets';

/** microR32 = true: 細かいメッシュ（小ブロック）のまま開く。E2E のサーバーは ふつう 作らない（#180。docs/tickets/E2E-180.md） */
async function open(page: Page, seed: number | null = null, microR32 = false) {
  const q = seed === null ? '' : `?seed=${seed}`;
  await page.goto('/' + (microR32 ? fine(q) : q));
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
  await installArena(page);
}

test.describe('M1-01 世界（つないだ後）', () => {
  test('AC1/AC16: 大きさ・範囲外・ブロックの種類', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const w = window.__rikkun!.world;
      return {
        size: w.size(),
        out: [w.getBlock(-100000, 10, 10), w.getBlock(100000, 10, 10), w.getBlock(10, w.size().y, 10)], // 外 = 壁の外・読みこんでいない遠い列（VOX-D: 128 の決め打ちをやめた）・y = size().y（VOX-B: 高さ 352）
        types: w.blockTypes(),
      };
    });
    expect(r.size.y).toBe(WORLD_SIZE.y); // x・z は 読みこんでいる範囲（動く）。使わない（VOX-D）
    expect(r.out).toEqual(['outside', 'outside', 'outside']);
    // 数は ブロックを足すたびに変わるので、M1 で決めた種類が そろっていることだけを見る（#37）
    const ids = r.types.map((t) => t.id);
    for (const id of ['air', 'grass', 'dirt', 'stone', 'sand', 'water', 'log', 'leaves', 'bedrock']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    const by = Object.fromEntries(r.types.map((t) => [t.id, t]));
    expect(by.bedrock.breakable).toBe(false);
    expect(by.water.breakable).toBe(false);
    expect(by.water.solid).toBe(false);
    expect(by.air.solid).toBe(false);
  });

  test('AC2: 同じシードは同じ世界（2 回起動）、ちがうシードはちがう世界', async ({ page }) => {
    test.setTimeout(180_000); // 4 回の起動 + 輪を全部そろえる
    const hashes: Record<string, string> = {};
    for (const [key, seed] of [['a1', null], ['a2', null], ['s1', 1], ['s2', 2]] as const) {
      await open(page, seed);
      // VOX-D: 読みこんだ列の数が そろってから（ready は半径 6 まで）全体の hash を比べる
      hashes[key] = await page.evaluate(async () => {
        const w = (window.__rikkun! as any).world;
        await w.settle({ full: true });
        return w.hash() as string;
      });
    }
    expect(hashes.a1).toBe(hashes.a2);
    expect(hashes.s1).not.toBe(hashes.s2);
    expect(hashes.s1).not.toBe(hashes.a1);
  });

  for (const seed of SEEDS) {
    test(`AC10/11/17/18/20: スタート地点・立っている・生成時間・描画量（seed=${seed ?? '既定'}）`, async ({ page }) => {
      await open(page, seed, true); // (b) 描画回数・三角形の上限を見る
      const r = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.pause();
        const spawn = h.world.spawn();
        const p0 = h.player.get();
        const tick0 = h.tick();
        h.step(120);
        const p1 = h.player.get();
        const tick1 = h.tick();
        h.player.set({ position: { x: spawn.x, y: spawn.y, z: spawn.z }, yaw: 0, pitch: 0, velocity: { x: 0, y: 0, z: 0 } });
        h.step(2);
        const stats = h.renderStats();
        const cx = Math.floor(spawn.x);
        const cz = Math.floor(spawn.z);
        const g = h.world.groundHeight(cx, cz);
        // VOX-B 基準 12: 海面と 草原は ゲームに聞く（hook は必須）
        const seaY: number = h.world.seaY();
        const biome: string = h.world.terrainAt(cx, cz).biome;
        const fallback: boolean = h.world.spawnInfo().fallback;
        const torch = h.world.startTorch();
        const torchBlock = h.world.getBlock(torch.x, torch.y, torch.z);
        // 5x5 が草で同じ高さ、上 3 段は固くない
        let flat = true;
        for (let x = cx - 2; x <= cx + 2; x++)
          for (let z = cz - 2; z <= cz + 2; z++) {
            if (h.world.getBlock(x, g, z) !== 'grass') flat = false;
            if (h.world.groundHeight(x, z) !== g) flat = false;
            for (let y = g + 1; y <= g + 3; y++) {
              const b = h.world.getBlock(x, y, z);
              if (b !== 'air' && b !== 'start_torch') flat = false; // M4: こわれない たいまつ はあってよい
            }
          }
        // 基準 12: たいまつ は ほっても こわれない（目の前で 1 回ほって 確かめる代わりに 種類の「こわれない」を見る）
        const torchBreakable = h.world.blockTypes().find((t: any) => t.id === 'start_torch')?.breakable;
        // テスト場所（AC20）: 床を敷いた あと、床は いし・その上は空まで空気・空の光が床まで届く
        const ta = h.world.testArea();
        (window as any).__arena.floor(ta.x0, ta.z0, ta.x1, ta.z1, { y: ta.y0 });
        h.step(2);
        let testAreaOk = ta.y1 === h.world.size().y - 1;
        for (let x = ta.x0; x <= ta.x1; x++)
          for (let z = ta.z0; z <= ta.z1; z++) {
            if (h.world.getBlock(x, ta.y0, z) !== 'stone') testAreaOk = false;
            if (h.world.groundHeight(x, z) !== ta.y0) testAreaOk = false;
            for (const y of [ta.y0 + 1, ta.y0 + 20, ta.y1]) if (h.world.getBlock(x, y, z) !== 'air') testAreaOk = false;
          }
        const sky = h.world.lightAt(6, ta.y0 + 1, 6).sky;
        return { spawn, p0, p1, tick0, tick1, stats, g, flat, testAreaOk, sky, seaY, biome, fallback, torch, torchBlock, torchBreakable, gen: h.world.genTimeMs() };
      });
      // AC10
      // VOX-B 基準 12: スタートの場所は ゲームに聞く（島の中心とは限らない）。列の まん中・地面は 海面 +2〜+12
      expect(r.spawn.x - Math.floor(r.spawn.x)).toBeCloseTo(0.5, 3);
      expect(r.spawn.z - Math.floor(r.spawn.z)).toBeCloseTo(0.5, 3);
      expect(r.spawn.y).toBeCloseTo(r.g + 1, 3);
      expect(r.g).toBeGreaterThanOrEqual(r.seaY + 2);
      expect(r.g).toBeLessThanOrEqual(r.seaY + 12);
      expect(r.biome).toBe('harappa'); // #184: 12 の国。スタートは はじまりの はらっぱ
      expect(r.fallback).toBe(false);
      expect(r.torchBlock).toBe('start_torch');
      expect(r.torch.x).toBe(Math.floor(r.spawn.x) + 2);
      expect(r.torch.z).toBe(Math.floor(r.spawn.z) - 1);
      expect(r.torch.y).toBe(r.g + 1);
      expect(r.torchBreakable).toBe(false);
      expect(r.spawn.yawDeg).toBeCloseTo(0, 3);
      expect(r.spawn.pitchDeg).toBeCloseTo(0, 3);
      expect(r.flat).toBe(true);
      expect(r.p0.position.x).toBeCloseTo(r.spawn.x, 3);
      expect(r.p0.position.y).toBeCloseTo(r.spawn.y, 3);
      expect(r.p0.position.z).toBeCloseTo(r.spawn.z, 3);
      expect(r.p0.yaw).toBeCloseTo(0, 3);
      expect(r.p0.pitch).toBeCloseTo(-25, 3); // はじめの pitch（CHAR-1 第 5.2 版 §4.1）
      // AC11
      expect(r.tick1 - r.tick0).toBe(120);
      expect(Math.abs(r.p1.position.y - r.spawn.y)).toBeLessThan(0.05);
      expect(r.p1.onGround).toBe(true);
      // AC17 / AC18
      expect(r.gen).toBeLessThanOrEqual(2500); // M5: 世界が広くなった（仕様 §4-7）
      // VOX-E: 世界が 9×9×9 の小ブロックになり、メッシュがセクションごとになった（チケット 基準 5: 描画回数 スタート 300・三角形 r=32 で 120 万）
      expect(r.stats.drawCalls).toBeLessThanOrEqual(300);
      expect(r.stats.triangles).toBeLessThanOrEqual(1_200_000);
      // AC20（VOX-B: 床を敷いた テスト場所は 空まで空気・空の光 15）
      expect(r.testAreaOk).toBe(true);
      expect(r.sky).toBe(15);
    });
  }

  test('AC12: 4 方向へ 300 ステップ歩いても、いつも読みこまれた列の上で 地面か水の中（世界のはしで落ちない）', async ({ page }) => {
    // VOX-D: 仮の海のふち（はしの海）が無くなった。壁は ±30,000 で遠い。見るのは「歩く先の列がいつも読みこまれている」こと
    test.setTimeout(90_000);
    await open(page);
    await page.evaluate(() => {
      window.__rikkun!.pause();
      window.__rikkun!.lock.simulate(true);
    });
    for (const c of [{ name: '西', yaw: 270 }, { name: '東', yaw: 90 }, { name: '北', yaw: 0 }, { name: '南', yaw: 180 }]) {
      const r = await page.evaluate((c) => {
        const h = window.__rikkun! as any;
        h.input.releaseAll();
        const sp = h.world.spawn();
        const sx = Math.floor(sp.x);
        const sz = Math.floor(sp.z);
        h.player.set({ position: { x: sp.x, y: h.world.groundHeight(sx, sz) + 1, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: c.yaw, pitch: 0 });
        h.step(1);
        h.input.press('moveForward');
        let allLoaded = true;
        let minY = 1e9;
        for (let i = 0; i < 300; i++) {
          h.step(1);
          const p = h.player.get().position;
          if (!h.world.isLoaded(Math.floor(p.x), Math.floor(p.z))) allLoaded = false;
          minY = Math.min(minY, p.y);
        }
        h.input.release('moveForward');
        h.step(60);
        const p = h.player.get();
        const g = h.world.groundHeight(Math.floor(p.position.x), Math.floor(p.position.z));
        return { allLoaded, minY, y: p.position.y, g, onGround: p.onGround, sea: h.world.seaY() };
      }, c);
      expect(r.allLoaded, c.name).toBe(true);
      expect(r.minY, c.name).toBeGreaterThan(0);
      // 地面の上に立っている（onGround）か、水の中（足もとが海面より下で 地面の上）
      expect(r.onGround || r.y <= r.sea + 1, c.name).toBe(true);
      expect(r.y, c.name).toBeGreaterThanOrEqual(r.g + 1 - 0.05);
    }
  });

  test('AC13: 下に落ちたらスタートへ戻る（速さ 0・向き北）。スタート列に石を置いたら上に戻る', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      const sp0 = h.world.spawn();
      const cx = Math.floor(sp0.x);
      const cz = Math.floor(sp0.z);
      const set = () => h.player.set({ position: { x: cx + 0.5, y: -11, z: cz + 0.5 }, velocity: { x: 1, y: -5, z: 0 }, yaw: 90, pitch: 30 });
      set();
      h.step(1);
      const a = { p: h.player.get(), s: h.world.spawn() };
      const g = h.world.groundHeight(cx, cz);
      h.world.setBlock(cx, g + 1, cz, 'stone');
      set();
      h.step(1);
      const b = { p: h.player.get(), s: h.world.spawn(), g };
      return { a, b };
    });
    for (const k of ['a', 'b'] as const) {
      const { p, s } = r[k];
      expect(p.position.x).toBeCloseTo(s.x, 1);
      expect(p.position.z).toBeCloseTo(s.z, 1);
      // VOX-D: spawn() は 地形だけで決まる（ブロックを置いても 変わらない）。石を置いた b は 下の g + 2 で見る
      if (k === 'a') expect(p.position.y).toBeCloseTo(s.y, 1);
      expect(p.velocity.x).toBeCloseTo(0, 5);
      expect(p.velocity.y).toBeCloseTo(0, 5);
      expect(p.velocity.z).toBeCloseTo(0, 5);
      expect(p.yaw).toBeCloseTo(0, 3);
      expect(p.pitch).toBeCloseTo(-25, 3);
    }
    expect(r.b.p.position.y).toBeCloseTo(r.b.g + 2, 1);
  });

  test('AC14: 海の底に立つ → スタートへ向かって歩いて浜に上がる', async ({ page }) => {
    // VOX-D: はしの海が無い。スタートの R（±64）の中に 海は無い（seed 既定で いちばん近い海は 約 226 ブロック先）ので、
    // terrainAt で 近い海の列をさがして teleport で 立ち、スタートへ向かって歩く（歩く先の列は ストリーミングで 読みこまれる）
    test.setTimeout(180_000);
    await open(page);
    const pick = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      const sp = h.world.spawn();
      const seaY: number = h.world.seaY();
      let best: { x: number; z: number; d: number } | null = null;
      for (let dx = -400; dx <= 400; dx += 4)
        for (let dz = -400; dz <= 400; dz += 4) {
          const x = Math.floor(sp.x) + dx;
          const z = Math.floor(sp.z) + dz;
          const t = h.world.terrainAt(x, z);
          if (!t.sea || t.h > seaY - 3) continue;
          const d = Math.hypot(dx, dz);
          if (!best || d < best.d) best = { x, z, d };
        }
      return best ? { x: best.x + 0.5, z: best.z + 0.5, sp: { x: sp.x, z: sp.z } } : null;
    });
    expect(pick, '400 ブロック以内に 海の列が無い（デザインへ）').not.toBeNull();
    await page.evaluate(async (pick) => {
      const h = window.__rikkun! as any;
      h.world.setStreamWork(4);
      h.world.teleport(pick!.x, pick!.z);
      await h.world.settle();
    }, pick);
    const r = await page.evaluate((pick) => {
      const h = window.__rikkun! as any;
      const seaY: number = h.world.seaY();
      h.step(60);
      const p0 = h.player.get().position;
      const gy = h.world.groundHeight(Math.floor(pick!.x), Math.floor(pick!.z)) + 1;
      const yaw = (Math.atan2(pick!.sp.x - p0.x, -(pick!.sp.z - p0.z)) * 180) / Math.PI;
      h.player.set({ yaw, pitch: 0 });
      h.lock.simulate(true);
      h.input.press('run');
      h.input.press('moveForward');
      let up = false;
      for (let i = 0; i < 6000 && !up; i++) {
        h.step(1);
        const p = h.player.get();
        if (p.position.y >= seaY + 1 && p.onGround) up = true;
      }
      return { y0: p0.y, gy, seaY, up };
    }, pick);
    expect(r.gy).toBeLessThanOrEqual(r.seaY); // 海の底（足もとが 海面より下）
    expect(r.y0).toBeGreaterThan(r.gy - 0.05);
    expect(r.y0).toBeLessThan(r.gy + 0.05);
    expect(r.up).toBe(true);
  });

  test('AC15: 掘ると次のコマで見た目が変わる。範囲外の setBlock は false でハッシュ不変', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const h = window.__rikkun! as any;
      h.pause();
      await h.world.settle({ full: true }); // VOX-D: 起動直後は 輪が そろっていない（メッシュの待ちが のこる）
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n += 5) h.step(5);
      h.step(1);
      const t0 = h.renderStats().triangles;
      const sp = h.world.spawn();
      const cx = Math.floor(sp.x);
      const cz = Math.floor(sp.z);
      const g = h.world.groundHeight(cx, cz);
      const hash0 = h.world.hash();
      const outRes = [h.world.setBlock(-100000, 5, 5, 'stone'), h.world.setBlock(5, h.world.size().y, 5, 'stone'), h.world.setBlock(100000, 5, 5, 'stone')];
      const hashSame = h.world.hash() === hash0;
      h.world.setBlock(cx, g, cz, 'air');
      const got = h.world.getBlock(cx, g, cz);
      // VOX-D: 見た目が変わるのは 3 コマ以内（VOX-E の基準 3 と同じ。光の見直しが 先に 1 コマ入る）
      let t1 = t0;
      for (let i = 0; i < 3 && t1 === t0; i++) {
        h.step(1);
        t1 = h.renderStats().triangles;
      }
      return { t0, t1, got, outRes, hashSame };
    });
    expect(r.got).toBe('air');
    expect(r.t1).not.toBe(r.t0);
    expect(r.outRes).toEqual([false, false, false]);
    expect(r.hashSame).toBe(true);
  });

  test('AC19: ブロックを変えたあとの見た目の作り直し時間（20 か所）', async ({ page }, testInfo) => {
    await open(page, null, true); // (b) 小ブロックのメッシュの作り直し時間を記録する
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.step(2);
      // d <= 18 の陸の列から、決まった 20 か所（座標一覧はここで固定）
      const cols: [number, number][] = [];
      const offs = [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [6, 2], [-6, 2], [2, 6], [2, -6], [9, 4], [-9, 4], [4, 9], [4, -9], [12, 0], [-12, 0], [0, 12], [0, -12], [8, 8], [-8, 8], [8, -8]];
      const sp = h.world.spawn();
      for (const [dx, dz] of offs) cols.push([Math.floor(sp.x) + dx, Math.floor(sp.z) + dz]);
      const ms: number[] = [];
      for (const [x, z] of cols) {
        const g = h.world.groundHeight(x, z);
        h.world.setBlock(x, g, z, 'air');
        h.step(1);
        ms.push(h.world.rebuildStats().lastMs);
      }
      const sorted = [...ms].sort((a, b) => a - b);
      return { median: (sorted[9] + sorted[10]) / 2, max: sorted[19], count: h.world.rebuildStats().count };
    });
    testInfo.annotations.push({ type: 'rebuild', description: JSON.stringify(r) });
    console.log('REBUILD', JSON.stringify(r));
    // 目標は記録のみ（目安）。作り直しが実際に動いていることだけを確かめる
    expect(r.count).toBeGreaterThanOrEqual(20);
    expect(r.max).toBeGreaterThan(0);
  });

  for (const seed of [null, 1, 3]) {
    test(`AC21: スタート地点のスクショ（seed=${seed ?? '既定'}）`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await open(page, seed, true); // (d) スタート地点の景色のスクショ
      const overlayVisible = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.pause();
        h.lock.simulate(true);
        const v = h.lock.get().overlayVisible;
        h.step(1);
        return v;
      });
      expect(overlayVisible).toBe(false);
      await expect(page.locator('.play-overlay').first()).toBeHidden();
      const name = seed === null ? 'M1-01-AC21-start.png' : `M1-01-AC21-start-seed${seed}.png`;
      await page.screenshot({ path: `${ASSETS}/${name}` });
      await testInfo.attach(name, { path: `${ASSETS}/${name}`, contentType: 'image/png' });
    });
  }

  test('AC22: 上から見たスクショ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, null, true); // (d) 地形を上から見るスクショ
    const v = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      const vis = h.lock.get().overlayVisible;
      h.camera.overview(true);
      h.step(1);
      return vis;
    });
    expect(v).toBe(false);
    await page.screenshot({ path: `${ASSETS}/M1-01-AC22-overview.png` });
    await page.evaluate(() => window.__rikkun!.camera.overview(false));
  });
});

test.describe('M1-02 動き・視点・ロック（つないだ後）', () => {
  test('AC1/AC10/AC11: 実ゲームで 60 ステップ歩く・段に乗る・壁は越えない', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      (window as any).__arena.floor(0, 0, 12, 12);
      const P = () => h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      P();
      h.step(2);
      const x0 = h.player.get().position.x;
      h.input.press('moveForward');
      h.step(60);
      const walk = h.player.get().position.x - x0;
      h.input.releaseAll();
      // 段 1 + autoJump
      h.world.fill(3, 9, 5, 10, 9, 7, 'stone');
      P();
      h.step(2);
      h.input.press('moveForward');
      h.step(60);
      const step1 = h.player.get();
      h.input.releaseAll();
      // 壁 2
      h.world.fill(3, 9, 5, 10, 10, 7, 'stone');
      P();
      h.step(2);
      h.input.press('moveForward');
      h.input.press('jump');
      let maxX = 0;
      for (let i = 0; i < 240; i++) {
        h.step(1);
        maxX = Math.max(maxX, h.player.get().position.x);
      }
      h.input.releaseAll();
      return { walk, step1y: step1.position.y, step1g: step1.onGround, maxX };
    });
    expect(r.walk).toBeGreaterThan(3.75);
    expect(r.walk).toBeLessThan(4.05);
    expect(r.step1y).toBeCloseTo(10, 1);
    expect(r.step1g).toBe(true);
    expect(r.maxX).toBeLessThanOrEqual(2.71);
  });

  test('AC4/AC20/AC21/AC22: 向き（マウス）', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.player.set({ yaw: 0, pitch: 0 });
      const f0 = h.player.get().forward;
      h.input.look(100, 0);
      h.step(1);
      const y1 = h.player.get().yaw;
      h.input.look(-200, 0);
      h.step(1);
      const y2 = h.player.get().yaw;
      h.player.set({ yaw: 0, pitch: 0 });
      h.input.look(0, -100);
      h.step(1);
      const p1 = h.player.get().pitch;
      h.input.look(0, -100000);
      h.step(1);
      const p2 = h.player.get().pitch;
      h.input.look(0, 100000);
      h.step(1);
      const p3 = h.player.get().pitch;
      return { f0, y1, y2, p1, p2, p3 };
    });
    expect(r.f0.x).toBeCloseTo(0, 3);
    expect(r.f0.z).toBeCloseTo(-1, 3);
    expect(r.y1).toBeCloseTo(12, 0);
    expect(r.y2).toBeCloseTo(348, 0);
    expect(r.p1).toBeCloseTo(12, 0);
    expect(r.p2).toBeCloseTo(89, 1);
    expect(r.p3).toBeCloseTo(-89, 1);
  });

  // CHAR-1 第 5 版で 一人称をなくしたため、旧 AC23/AC24/AC41（V での切りかえ）を AC1 に置きかえた
  test('CHAR-1 AC1: はじめから三人称。キャラの板が出る。V を押しても変わらない', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.lock.simulate(true);
    });
    // 絵の読みこみは 本当の時間で進む（時間は テスト全体の上限にまかせる）
    await waitCharLoaded(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.player.set({ pitch: 0 });
      h.step(2);
      const before = h.camera.get();
      return { view: before.view, pos: before.position, sprite: h.player.doll().sprite };
    });
    expect(r.view).toBe('third');
    expect(r.sprite.visible).toBe(true);
    await page.keyboard.press('KeyV');
    const after = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.step(1);
      const c = h.camera.get();
      return { view: c.view, pos: c.position };
    });
    expect(after.view).toBe('third');
    expect(Math.abs(after.pos.x - r.pos.x)).toBeLessThan(0.001);
    expect(Math.abs(after.pos.y - r.pos.y)).toBeLessThan(0.001);
    expect(Math.abs(after.pos.z - r.pos.z)).toBeLessThan(0.001);
  });

  test('AC25/AC27/AC28: 三人称のカメラ（開けた場所・後ろが壁 2.0・壁 0.5）を実ゲームで', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      (window as any).__arena.floor(0, 0, 12, 12);
      h.step(2);
      const open = () => {
        h.player.set({ position: { x: 10.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
        h.step(2);
        return { cam: h.camera.get(), vis: h.player.doll().visible };
      };
      const a = open();
      h.world.fill(4, 9, 0, 4, 11, 12, 'stone');
      h.player.set({ position: { x: 7.0, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(2);
      const b = { cam: h.camera.get(), vis: h.player.doll().visible, block: h.world.getBlock(Math.floor(h.camera.get().position.x), Math.floor(h.camera.get().position.y), Math.floor(h.camera.get().position.z)) };
      h.world.fill(4, 9, 0, 4, 11, 12, 'air');
      h.world.fill(5, 9, 0, 5, 11, 12, 'stone');
      h.player.set({ position: { x: 6.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(2);
      const c = { vis: h.player.doll().visible, hide: h.camera.get().hideChar, dist: h.camera.get().distanceToEye };
      return { a, b, c };
    });
    expect(r.a.cam.view).toBe('third');
    expect(r.a.cam.distanceToEye).toBeGreaterThan(4.0);
    expect(r.a.cam.distanceToEye).toBeLessThan(4.1);
    expect(r.a.cam.position.y - r.a.cam.eye.y).toBeCloseTo(-0.22, 1); // カメラは 肩の点 S（足もと + 1.40）から 4.0
    expect(r.a.cam.eye.x - r.a.cam.position.x).toBeCloseTo(4.0, 1);
    expect(r.a.vis).toBe(true);
    expect(r.b.cam.distanceToEye).toBeLessThanOrEqual(2.0);
    expect(['air', 'water']).toContain(r.b.block);
    // からだの中心から 1.2 未満のときだけ かくす（CHAR-1 §4.1。P の高さのぶん 目より遠くなる）
    expect(r.c.vis).toBe(!r.c.hide);
  });

  test('AC30: 起動直後は案内画面で時間が止まる。step は進む', async ({ page }) => {
    await open(page);
    const lock = await page.evaluate(() => window.__rikkun!.lock.get());
    expect(lock).toMatchObject({ locked: false, overlayVisible: true, overlayText: 'クリックして あそぼう！' });
    const t0 = await page.evaluate(() => window.__rikkun!.tick());
    await waitFrames(page, 5);
    expect(await page.evaluate(() => window.__rikkun!.tick())).toBe(t0);
    const t1 = await page.evaluate(() => {
      window.__rikkun!.step(30);
      return window.__rikkun!.tick();
    });
    expect(t1).toBe(t0 + 30);
  });

  test('AC31: ロックすると案内が消えて時間が進む', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__rikkun!.lock.simulate(true));
    expect((await page.evaluate(() => window.__rikkun!.lock.get())).overlayVisible).toBe(false);
    const t0 = await page.evaluate(() => window.__rikkun!.tick());
    // 速さにたよらない: 「止まっていない（tick が進む）」だけを、ゲームに聞いて見る（何コマ進むかは数えない）
    await expect.poll(async () => page.evaluate(() => window.__rikkun!.tick()), { timeout: 0 }).toBeGreaterThan(t0);
  });

  test('AC32/AC33/AC34: ロックが外れる → 入力が止まり、戻ると続きから', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const h = window.__rikkun! as any;
      h.lock.simulate(true);
      (window as any).__arena.floor(0, 0, 12, 12);
      h.player.set({ position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.pause();
      h.step(2);
      h.input.press('moveForward');
      h.lock.simulate(false);
      const l = h.lock.get();
      const held = h.input.held();
      const p0 = h.player.get();
      const t0 = h.tick();
      h.resume();
      await new Promise<void>((r) => {
        let n = 5;
        const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      });
      const t1 = h.tick();
      h.pause();
      h.input.press('moveForward');
      h.input.look(100, 0);
      h.step(60);
      const p1 = h.player.get();
      const view = h.camera.get().view;
      const t2 = h.tick();
      h.input.releaseAll();
      h.lock.simulate(true);
      const l2 = h.lock.get();
      const held2 = h.input.held();
      const p2 = h.player.get();
      const x0 = p2.position.x;
      h.input.press('moveForward');
      h.step(60);
      const moved = h.player.get().position.x - x0;
      return { l, held, t0, t1, t2, p0, p1, p2, view, l2, held2, moved };
    });
    expect(r.l.overlayVisible).toBe(true);
    expect(r.l.overlayText).toBe('クリックして つづきを あそぼう！');
    expect(r.held).toEqual([]);
    expect(r.t1).toBe(r.t0);
    expect(r.t2 - r.t1).toBe(60);
    expect(Math.abs(r.p1.position.z - r.p0.position.z)).toBeLessThan(0.01);
    expect(Math.abs(r.p1.position.x - r.p0.position.x)).toBeLessThan(0.01);
    expect(Math.abs(r.p1.yaw - r.p0.yaw)).toBeLessThan(0.01);
    expect(r.view).toBe('third');
    expect(r.l2.overlayVisible).toBe(false);
    expect(r.held2).toEqual([]);
    expect(Math.abs(r.p2.position.x - r.p0.position.x)).toBeLessThan(0.01);
    expect(r.moved).toBeGreaterThan(3.75);
    expect(r.moved).toBeLessThan(4.05);
  });

  test('AC35: pause/resume とロックの組み合わせ', async ({ page }) => {
    await open(page);
    const tick = () => page.evaluate(() => window.__rikkun!.tick());
    // ロックなしで resume しても増えない
    await page.evaluate(() => window.__rikkun!.resume());
    let a = await tick();
    await waitFrames(page, 5);
    expect(await tick()).toBe(a);
    await page.evaluate(() => window.__rikkun!.lock.simulate(true));
    await page.evaluate(() => window.__rikkun!.pause());
    a = await tick();
    await waitFrames(page, 5);
    expect(await tick()).toBe(a);
    await page.evaluate(() => window.__rikkun!.resume());
    await expect.poll(tick, { timeout: 0 }).toBeGreaterThan(a);
  });

  test('AC36: 案内画面の間でも F3 が効く', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => window.__rikkun!.perfOverlayVisible());
    await page.keyboard.press('F3');
    await page.waitForFunction((b) => window.__rikkun!.perfOverlayVisible() !== b, before, { timeout: 0 });
  });

  test('AC37/AC38: 案内画面のボタンの大きさと漢字', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    const btn = page.locator('.po-button').first();
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    const fs = await page.locator('.po-text').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    console.log('BUTTON', JSON.stringify({ box, fs }));
    expect(box!.width).toBeGreaterThanOrEqual(512);
    expect(box!.height).toBeGreaterThanOrEqual(96);
    expect(fs).toBeGreaterThanOrEqual(32);
    const html = await page.locator('#hud').innerHTML();
    const withoutDebug = html.replace(/<div id="perf-overlay"[\s\S]*?<\/div>/, '');
    expect(findUnrubiedKanji(withoutDebug)).toEqual([]);
  });

  test('AC39: 案内画面のスクショ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await page.evaluate(() => {
      window.__rikkun!.pause();
      window.__rikkun!.step(1);
    });
    await page.screenshot({ path: `${ASSETS}/M1-02-AC39-overlay.png` });
  });

  test('AC40: 三人称のスクショ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, null, true); // (d) スタートの景色の中の三人称
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.step(3);
    });
    expect(await page.evaluate(() => window.__rikkun!.player.doll().visible)).toBe(true);
    await page.screenshot({ path: `${ASSETS}/M1-02-AC40-third.png` });
  });
});
