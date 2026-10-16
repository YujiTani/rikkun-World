import { expect, test, type Page } from '@playwright/test';
import { WORLD_CENTER, WORLD_SIZE } from '../src/contracts';
import { findUnrubiedKanji } from '../src/ui/text';

/**
 * M1 の受け入れ基準のうち、つないだ後の実際のゲームでしか確かめられないもの。
 * M1-01 = docs/design/M1-01-world.md、M1-02 = docs/design/M1-02-movement.md。
 * ユニットテストで確かめ済みの基準は docs/test-reports/M1.md に書いてある。
 */

const SEEDS = [null, 1, 2, 3, 4, 5]; // null = ふだんのシード
const ASSETS = 'docs/test-reports/assets';

async function open(page: Page, seed: number | null = null) {
  await page.goto(seed === null ? '/' : `/?seed=${seed}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => window.__rikkun!.achievements.mute(true));
}

test.describe('M1-01 世界（つないだ後）', () => {
  test('AC1/AC16: 大きさ・範囲外・ブロックの種類', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const w = window.__rikkun!.world;
      return {
        size: w.size(),
        out: [w.getBlock(-1, 10, 10), w.getBlock(128, 10, 10), w.getBlock(10, 48, 10)],
        types: w.blockTypes(),
      };
    });
    expect(r.size).toEqual({ x: WORLD_SIZE.x, y: WORLD_SIZE.y, z: WORLD_SIZE.z });
    expect(r.out).toEqual(['outside', 'outside', 'outside']);
    expect(r.types.length).toBe(31); // M4: かまど・かわら・レンガ・たいまつ・こわれない たいまつ、M6: たんす、M7: はたけ・作物・やせい・かかし・さく 13 こ、M7-2: スプリンクラー を足した
    const by = Object.fromEntries(r.types.map((t) => [t.id, t]));
    expect(by.bedrock.breakable).toBe(false);
    expect(by.water.breakable).toBe(false);
    expect(by.water.solid).toBe(false);
    expect(by.air.solid).toBe(false);
  });

  test('AC2: 同じシードは同じ世界（2 回起動）、ちがうシードはちがう世界', async ({ page }) => {
    const hashes: Record<string, string> = {};
    for (const [key, seed] of [['a1', null], ['a2', null], ['s1', 1], ['s2', 2]] as const) {
      await open(page, seed);
      hashes[key] = await page.evaluate(() => window.__rikkun!.world.hash());
    }
    expect(hashes.a1).toBe(hashes.a2);
    expect(hashes.s1).not.toBe(hashes.s2);
    expect(hashes.s1).not.toBe(hashes.a1);
  });

  for (const seed of SEEDS) {
    test(`AC10/11/17/18/20: スタート地点・立っている・生成時間・描画量（seed=${seed ?? '既定'}）`, async ({ page }) => {
      await open(page, seed);
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
        // テスト地形の場所
        let testAreaOk = true;
        for (let x = 0; x <= 12; x++)
          for (let z = 0; z <= 12; z++) {
            if (h.world.groundHeight(x, z) !== 6 || h.world.getBlock(x, 7, z) !== 'water') testAreaOk = false;
            for (let y = 8; y <= 47; y++) if (h.world.getBlock(x, y, z) !== 'air') testAreaOk = false;
          }
        return { spawn, p0, p1, tick0, tick1, stats, g, flat, testAreaOk, gen: h.world.genTimeMs() };
      });
      // AC10
      expect(r.spawn.x).toBeCloseTo(WORLD_CENTER.x + 0.5, 3);
      expect(r.spawn.z).toBeCloseTo(WORLD_CENTER.z + 0.5, 3);
      expect(r.spawn.y).toBeCloseTo(r.g + 1, 3);
      expect(r.g).toBeGreaterThanOrEqual(10);
      expect(r.g).toBeLessThanOrEqual(12);
      expect(r.spawn.yawDeg).toBeCloseTo(0, 3);
      expect(r.spawn.pitchDeg).toBeCloseTo(0, 3);
      expect(r.flat).toBe(true);
      expect(r.p0.position.x).toBeCloseTo(r.spawn.x, 3);
      expect(r.p0.position.y).toBeCloseTo(r.spawn.y, 3);
      expect(r.p0.position.z).toBeCloseTo(r.spawn.z, 3);
      expect(r.p0.yaw).toBeCloseTo(0, 3);
      expect(r.p0.pitch).toBeCloseTo(0, 3);
      // AC11
      expect(r.tick1 - r.tick0).toBe(120);
      expect(Math.abs(r.p1.position.y - r.spawn.y)).toBeLessThan(0.05);
      expect(r.p1.onGround).toBe(true);
      // AC17 / AC18
      expect(r.gen).toBeLessThanOrEqual(2500); // M5: 世界が広くなった（仕様 §4-7）
      expect(r.stats.drawCalls).toBeLessThanOrEqual(100);
      expect(r.stats.triangles).toBeLessThanOrEqual(300_000);
      // AC20
      expect(r.testAreaOk).toBe(true);
    });
  }

  test('AC12: 世界の端（海の中を 4 方向へ 300 ステップ）で体が外に出ない', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    const cases = [
      { name: '西', x: 2.5, z: WORLD_CENTER.z + 0.5, yaw: 270, axis: 'x', want: 0.3 },
      { name: '東', x: WORLD_SIZE.x - 2.5, z: WORLD_CENTER.z + 0.5, yaw: 90, axis: 'x', want: WORLD_SIZE.x - 0.3 },
      { name: '北', x: WORLD_CENTER.x + 0.5, z: 2.5, yaw: 0, axis: 'z', want: 0.3 },
      { name: '南', x: WORLD_CENTER.x + 0.5, z: WORLD_SIZE.z - 2.5, yaw: 180, axis: 'z', want: WORLD_SIZE.z - 0.3 },
    ];
    await page.evaluate(() => {
      window.__rikkun!.pause();
      window.__rikkun!.lock.simulate(true);
    });
    for (const c of cases) {
      const r = await page.evaluate((c) => {
        const h = window.__rikkun! as any;
        h.input.releaseAll();
        h.player.set({ position: { x: c.x, y: 7, z: c.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: c.yaw, pitch: 0 });
        h.step(1);
        h.input.press('moveForward');
        let min = 99;
        let max = -99;
        for (let i = 0; i < 300; i++) {
          h.step(1);
          const p = h.player.get().position;
          for (const v of [p.x, p.z]) {
            min = Math.min(min, v);
            max = Math.max(max, v);
          }
        }
        h.input.release('moveForward');
        return { min, max, end: h.player.get().position };
      }, c);
      expect(r.min, c.name).toBeGreaterThanOrEqual(0.29);
      expect(r.max, c.name).toBeLessThanOrEqual(WORLD_SIZE.x - 0.29);
      expect((r.end as any)[c.axis], c.name).toBeCloseTo(c.want, 1);
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
      expect(p.position.y).toBeCloseTo(s.y, 1);
      expect(p.velocity.x).toBeCloseTo(0, 5);
      expect(p.velocity.y).toBeCloseTo(0, 5);
      expect(p.velocity.z).toBeCloseTo(0, 5);
      expect(p.yaw).toBeCloseTo(0, 3);
      expect(p.pitch).toBeCloseTo(0, 3);
    }
    expect(r.b.p.position.y).toBeCloseTo(r.b.g + 2, 1);
  });

  test('AC14: 海の底に立つ → 中心へ向かって歩いて浜に上がる', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      // M5: 北西のすみ（うみ）から、世界の中心（スタート）の向きへ歩く
      const sp = h.world.spawn();
      const sx = 6.5;
      const sz = 6.5;
      const yaw = (Math.atan2(sp.x - sx, -(sp.z - sz)) * 180) / Math.PI;
      h.player.set({ position: { x: sx, y: 7, z: sz }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0 });
      h.step(120);
      const y0 = h.player.get().position.y;
      h.lock.simulate(true);
      h.input.press('moveForward');
      let up = false;
      for (let i = 0; i < 3000 && !up; i++) {
        h.step(1);
        const p = h.player.get();
        if (p.position.y >= 8 && p.onGround) up = true;
      }
      return { y0, up };
    });
    expect(r.y0).toBeGreaterThan(6.95);
    expect(r.y0).toBeLessThan(7.05);
    expect(r.up).toBe(true);
  });

  test('AC15: 掘ると次のコマで見た目が変わる。範囲外の setBlock は false でハッシュ不変', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.step(1);
      const t0 = h.renderStats().triangles;
      const sp = h.world.spawn();
      const cx = Math.floor(sp.x);
      const cz = Math.floor(sp.z);
      const g = h.world.groundHeight(cx, cz);
      const hash0 = h.world.hash();
      const outRes = [h.world.setBlock(-1, 5, 5, 'stone'), h.world.setBlock(5, 48, 5, 'stone'), h.world.setBlock(128, 5, 5, 'stone')];
      const hashSame = h.world.hash() === hash0;
      h.world.setBlock(cx, g, cz, 'air');
      const got = h.world.getBlock(cx, g, cz);
      h.step(1);
      const t1 = h.renderStats().triangles;
      return { t0, t1, got, outRes, hashSame };
    });
    expect(r.got).toBe('air');
    expect(r.t1).not.toBe(r.t0);
    expect(r.outRes).toEqual([false, false, false]);
    expect(r.hashSame).toBe(true);
  });

  test('AC19: ブロックを変えたあとの見た目の作り直し時間（20 か所）', async ({ page }, testInfo) => {
    await open(page);
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
      await open(page, seed);
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
    await open(page);
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
      h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
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

  test('AC23/AC24/AC41: 視点の切り替え（V）と人形', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.step(1);
      const first = h.camera.get();
      const doll1 = h.player.doll().visible;
      const eyeDy = first.position.y - h.player.get().position.y;
      h.input.press('toggleView');
      h.step(60);
      const third = h.camera.get().view;
      h.input.release('toggleView');
      h.step(1);
      h.input.press('toggleView');
      h.step(1);
      h.input.release('toggleView');
      h.step(1);
      const back = h.camera.get().view;
      return { view0: first.view, doll1, eyeDy, third, back };
    });
    expect(r.view0).toBe('first');
    expect(r.doll1).toBe(false);
    expect(r.eyeDy).toBeCloseTo(1.62, 1);
    expect(r.third).toBe('third');
    expect(r.back).toBe('first');
  });

  test('AC25/AC27/AC28: 三人称のカメラ（開けた場所・後ろが壁 2.0・壁 0.5）を実ゲームで', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
      h.input.press('toggleView');
      h.step(1);
      h.input.release('toggleView');
      h.step(1);
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
      const c = { vis: h.player.doll().visible, dist: h.camera.get().distanceToEye };
      return { a, b, c };
    });
    expect(r.a.cam.view).toBe('third');
    expect(r.a.cam.distanceToEye).toBeGreaterThan(4.0);
    expect(r.a.cam.distanceToEye).toBeLessThan(4.1);
    expect(r.a.cam.position.y - r.a.cam.eye.y).toBeCloseTo(0.5, 1);
    expect(r.a.cam.eye.x - r.a.cam.position.x).toBeCloseTo(4.0, 1);
    expect(r.a.vis).toBe(true);
    expect(r.b.cam.distanceToEye).toBeLessThanOrEqual(2.0);
    expect(['air', 'water']).toContain(r.b.block);
    expect(r.c.vis).toBe(false);
  });

  test('AC30: 起動直後は案内画面で時間が止まる。step は進む', async ({ page }) => {
    await open(page);
    const lock = await page.evaluate(() => window.__rikkun!.lock.get());
    expect(lock).toMatchObject({ locked: false, overlayVisible: true, overlayText: 'クリックして あそぼう！' });
    const t0 = await page.evaluate(() => window.__rikkun!.tick());
    await page.waitForTimeout(1000);
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
    // 実時間で進むかを見る。CI の遅い機械では 1 秒で 30 ステップに届かないことがある（13 だった）ので、届くまで最大 5 秒 まつ
    await expect
      .poll(async () => (await page.evaluate(() => window.__rikkun!.tick())) - t0, { timeout: 5000 })
      .toBeGreaterThanOrEqual(30);
  });

  test('AC32/AC33/AC34: ロックが外れる → 入力が止まり、戻ると続きから', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const h = window.__rikkun! as any;
      h.lock.simulate(true);
      h.world.fill(0, 8, 0, 12, 8, 12, 'stone');
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
      await new Promise((r) => setTimeout(r, 1000));
      const t1 = h.tick();
      h.pause();
      h.input.press('moveForward');
      h.input.look(100, 0);
      h.input.press('toggleView');
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
    expect(r.view).toBe('first');
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
    await page.waitForTimeout(700);
    expect(await tick()).toBe(a);
    await page.evaluate(() => window.__rikkun!.lock.simulate(true));
    await page.evaluate(() => window.__rikkun!.pause());
    a = await tick();
    await page.waitForTimeout(700);
    expect(await tick()).toBe(a);
    await page.evaluate(() => window.__rikkun!.resume());
    await page.waitForTimeout(700);
    expect(await tick()).toBeGreaterThan(a);
  });

  test('AC36: 案内画面の間でも F3 が効く', async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => window.__rikkun!.perfOverlayVisible());
    await page.keyboard.press('F3');
    await page.waitForFunction((b) => window.__rikkun!.perfOverlayVisible() !== b, before, { timeout: 500 });
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

  test('AC40/AC41: 三人称・一人称のスクショ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await open(page);
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.lock.simulate(true);
      h.step(1);
    });
    await page.screenshot({ path: `${ASSETS}/M1-02-AC41-first.png` });
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.input.press('toggleView');
      h.step(1);
      h.input.release('toggleView');
      h.step(2);
    });
    expect(await page.evaluate(() => window.__rikkun!.player.doll().visible)).toBe(true);
    await page.screenshot({ path: `${ASSETS}/M1-02-AC40-third.png` });
  });
});
