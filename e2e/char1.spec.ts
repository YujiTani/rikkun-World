import { expect, test, type Page } from '@playwright/test';

/**
 * CHAR-1 第 5 版（docs/design/CHAR-1-v2-sprite.md）の E2E 3 本: AC17（段の切りかえ）・AC31（描画回数と重さ）・AC36（8 方向のスクショ）。
 * AC1 は e2e/m1.spec.ts に置いた。
 */
const SHOTS = 'docs/screenshots/CHAR-1-v2';

async function open(page: Page, query = '') {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.achievements.mute(true);
    h.lock.simulate(true);
  });
}

/** 平らな石の床（y = 8）の上、空は空気。絵の読みこみ（本当の時間）を待つ */
async function flatGround(page: Page, waitLoaded = true) {
  if (waitLoaded) {
    await expect.poll(() => page.evaluate(() => (window.__rikkun! as any).player.doll().sprite.loaded), { timeout: 5000 }).toBe(true);
  }
  await page.evaluate(() => {
    const h = window.__rikkun! as any;
    h.pause();
    h.world.fill(0, 8, 0, 40, 8, 40, 'stone');
    h.world.fill(0, 9, 0, 40, 40, 40, 'air');
    h.player.set({ position: { x: 6.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, facing: 0 });
    h.step(3);
  });
}

const look = (page: Page, yaw: number, pitch: number) =>
  page.evaluate(
    ([y, p]) => {
      const h = window.__rikkun! as any;
      h.player.set({ yaw: y, pitch: p });
      h.step(2);
      const s = h.player.doll().sprite;
      return { dir: s.dir, tier: s.tier, elevDeg: s.elevDeg, tiltDeg: s.tiltDeg, upDeg: s.upDeg, visible: s.visible };
    },
    [yaw, pitch] as const,
  );

test.describe('CHAR-1 キャラの板', () => {
  test('AC17: 段の切りかえ（水平・見下ろし・見上げ）', async ({ page }) => {
    await open(page);
    await flatGround(page);

    const a = await look(page, 0, -45);
    expect(a.tier).toBe(0);
    expect(Math.abs(a.tiltDeg)).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: `${SHOTS}/AC17-tier0-pitch-45.png` });

    const b = await look(page, 0, -65);
    expect(b.tier).toBe(1);
    expect(Math.abs(b.elevDeg - 70.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.tiltDeg - 70.4)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/AC17-tier1-pitch-65.png` });

    // 高さ 10 の柱の上（yaw 0）で pitch +72: 下から見上げる
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.world.fill(20, 8, 20, 20, 18, 20, 'stone');
      h.player.set({ position: { x: 20.5, y: 19, z: 20.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, facing: 0 });
      h.step(3);
    });
    const c = await look(page, 0, 72);
    expect(c.tier).toBe(2);
    expect(Math.abs(c.elevDeg - -65.3)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/AC17-tier2-pitch+72-pillar.png` });
  });

  test('AC31: 重さ（GPU メモリ 64 MB 以下・箱人形より描画回数が少ない）', async ({ page }) => {
    await open(page);
    await flatGround(page);
    const sprite = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.step(2);
      return { gpuBytes: h.player.doll().sprite.gpuBytes, stats: h.renderStats(), visible: h.player.doll().sprite.visible };
    });
    expect(sprite.visible).toBe(true);
    expect(sprite.gpuBytes).toBeGreaterThan(0);
    expect(sprite.gpuBytes).toBeLessThanOrEqual(67_108_864);

    const box = await page.evaluate(() => 0).then(async () => {
      await page.goto('/?char=block');
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.achievements.mute(true);
        h.lock.simulate(true);
        h.pause();
        h.world.fill(0, 8, 0, 40, 8, 40, 'stone');
        h.world.fill(0, 9, 0, 40, 40, 40, 'air');
        h.player.set({ position: { x: 6.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, facing: 0 });
        h.step(5);
      });
      return page.evaluate(() => {
        const h = window.__rikkun! as any;
        return { stats: h.renderStats(), parts: h.player.doll().parts, sprite: h.player.doll().sprite };
      });
    });
    expect(box.sprite.visible).toBe(false);
    expect(box.parts.body).toBe(true);
    expect(sprite.stats.drawCalls).toBeLessThan(box.stats.drawCalls);
    console.log('drawCalls sprite/box', sprite.stats.drawCalls, box.stats.drawCalls, 'triangles', sprite.stats.triangles, box.stats.triangles);
  });

  test('AC29/AC36: 箱人形の部品は見えない。カメラで 1 周 8 方向のスクショ', async ({ page }) => {
    await open(page);
    await flatGround(page);
    const parts = await page.evaluate(() => (window.__rikkun! as any).player.doll().parts);
    expect(parts).toEqual({ head: false, body: false, arms: false, legs: false });
    // キャラは北向き（facing 0）で立つ。カメラの yaw を 45 度ずつ回す → 方向 4,5,6,7,0,1,2,3
    const expected = [4, 5, 6, 7, 0, 1, 2, 3];
    for (let i = 0; i < 8; i++) {
      const r = await look(page, i * 45, -10);
      expect(r.dir).toBe(expected[i]);
      expect(r.tier).toBe(0);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${SHOTS}/AC36-yaw${String(i * 45).padStart(3, '0')}-dir${expected[i]}.png` });
    }
  });
});
