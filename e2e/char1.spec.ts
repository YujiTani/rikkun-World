import { expect, test, type Page } from '@playwright/test';
import { AI_CONST } from '../src/yokai/ai/config';

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
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(true)); // 絵の読みこみ中に 重い描画を走らせない
    await page.waitForFunction(() => (window.__rikkun! as any).player.doll().sprite.loaded === true, null, { timeout: 0 }); // 時間は テスト全体の上限にまかせる
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(false));
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
    expect(Math.abs(a.elevDeg - 48.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.tiltDeg)).toBeLessThanOrEqual(0.5);
    await page.screenshot({ path: `${SHOTS}/AC17-tier0-pitch-45.png` });

    const b = await look(page, 0, -65);
    expect(b.tier).toBe(1);
    expect(Math.abs(b.elevDeg - 66.9)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.tiltDeg - 66.9)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/AC17-tier1-pitch-65.png` });

    // 
    await page.evaluate(() => {
      const h = window.__rikkun! as any;
      // 高さ 10 の 1×1 の柱（x0 = 6・z0 = 6 の列）の上の うしろのふち (x0 + 0.5, 上面, z0 + 0.9)
      h.world.fill(6, 8, 6, 6, 18, 6, 'stone');
      h.player.set({ position: { x: 6.5, y: 19, z: 6.9 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, facing: 0 });
      h.step(3);
    });
    const c = await look(page, 0, 72);
    expect(c.tier).toBe(2);
    expect(Math.abs(c.elevDeg - -69.8)).toBeLessThanOrEqual(1);
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

  test('AC47: 通し（正面の妖怪・ねらい補助・「＋」の先の地面）', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(true)); // 絵の読みこみ中に 重い描画を走らせない
    await page.waitForFunction(() => (window.__rikkun! as any).player.doll().sprite.loaded === true, null, { timeout: 0 }); // 時間は テスト全体の上限にまかせる
    await page.evaluate(() => (window.__rikkun! as any).suspendRender(false));
    // キャラは (x0 + 0.5, G, z0 + 0.5) = (6.5, 9, 6.5)・yaw 0。pitch は さわらず はじめの −25 のまま
    const start = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.pause();
      h.settings.set('yokaiAutoSpawn', false);
      h.settings.set('yokaiWander', false);
      h.yokai.clear();
      h.world.fill(0, 8, 0, 40, 8, 40, 'stone');
      h.world.fill(0, 9, 0, 40, 40, 40, 'air');
      h.inventory.clear();
      h.player.set({ position: { x: 6.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, facing: 0 });
      h.step(40);
      return h.player.get().pitch;
    });
    expect(start).toBeCloseTo(-25, 2);

    // ① 正面 3 マス先（中心 z0 − 2.5）のからかさ: 線がそのまま当たる（補助ではない）
    const r1 = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      const id = h.yokai.spawn('karakasa', 6.5, 9, 3.5, { ai: false, yawDeg: 0 });
      h.step(3);
      const hp0 = h.yokai.list().find((y: any) => y.id === id).hp;
      return { id, focus: h.hud.yokaiFocus(), assist: h.aim.assist(), hp0, ticks: h.settings.get('punchTicks'), dmg: h.settings.get('punchDamage') };
    });
    expect(r1.focus).toBe(r1.id);
    expect(r1.assist).toBeNull();
    await page.screenshot({ path: `${SHOTS}/AC47-1-karakasa-front.png` });
    const hp1 = await page.evaluate((a) => {
      const h = window.__rikkun! as any;
      h.input.press('primary');
      h.step(a.ticks + 2);
      h.input.release('primary');
      return h.yokai.list().find((y: any) => y.id === a.id)?.hp ?? 0;
    }, r1);
    expect(r1.hp0 - hp1).toBe(r1.dmg);

    // ② pitch 0・からかさを 右へずらして、線には当たらないが 画面の角 2 度の所へ（箱の おくの面を カメラから 深さ L = 8 に）
    const r2 = await page.evaluate(
      ({ pad }) => {
        const h = window.__rikkun! as any;
        h.yokai.clear();
        h.player.set({ yaw: 0, pitch: 0 });
        h.step(3);
        const cam = h.camera.get();
        const lineX = cam.shoulder.x; // yaw 0 の線は x 一定
        const camZ = cam.position.z;
        const hx = 0.75 + pad;
        const L = 8;
        const e = L * Math.tan((2 * Math.PI) / 180);
        const id = h.yokai.spawn('karakasa', lineX + e + hx, 9, camZ - L + hx, { ai: false, yawDeg: 0 });
        h.step(3);
        return { id, assist: h.aim.assist(), focus: h.hud.yokaiFocus(), hit: h.yokai.raycast({ ...cam.shoulder }, { x: 0, y: 0, z: -1 }, 64) };
      },
      { pad: AI_CONST.hitPad },
    );
    expect(r2.hit).toBeNull();
    expect(r2.assist).toBe(r2.id);
    expect(r2.focus).toBe(r2.id);
    await page.screenshot({ path: `${SHOTS}/AC47-2-karakasa-assist.png` });

    // ③ pitch −25 に もどして からかさを消すと 「＋」は (x0 + 1, G − 1, z0 − 3) = (7, 8, 3) をねらう
    const r3 = await page.evaluate(() => {
      const h = window.__rikkun! as any;
      h.yokai.clear();
      h.world.setBlock(7, 8, 3, 'dirt');
      h.player.set({ yaw: 0, pitch: -25 });
      h.step(3);
      const target = h.target.get()?.block;
      const x = h.aim.point();
      h.input.press('primary');
      h.step(90); // 押しつづけると ひびが 入って ready になり、押し直すと こわれる（今のほる）
      h.input.release('primary');
      h.input.press('primary');
      h.step(3);
      h.input.release('primary');
      return { target, x, after: h.world.getBlock(7, 8, 3), dig: h.dig.get(), tool: h.tool.get?.() };
    });
    expect(r3.target).toEqual({ x: 7, y: 8, z: 3 });
    expect(Math.abs(r3.x.x - 7.134)).toBeLessThan(0.02);
    expect(Math.abs(r3.x.z - 3.498)).toBeLessThan(0.02);
    expect(r3.after, JSON.stringify(r3.dig)).toBe('air');
  });

  // AC48（UI 検査の分）: はじめの pitch −25 で、キャラのからだの箱の いちばん下が 画面の下の HUD（レベル・ハート・ホットバー）の上端より上
  for (const [w, hgt] of [[1280, 800], [1440, 900], [1024, 700]] as const) {
    test(`AC48: ${w}×${hgt} で キャラの足が HUD の上端より上`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: hgt });
      await page.goto('/?nosave=1');
      await page.waitForFunction(() => window.__rikkun?.ready === true);
      await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.achievements.mute(true);
        h.lock.simulate(true);
      });
      await flatGround(page);
      const r = await page.evaluate(() => {
        const h = window.__rikkun! as any;
        h.player.set({ yaw: 0, pitch: -25 });
        h.step(3);
        const cam = h.camera.get().position;
        const yaw = 0, pitch = (-25 * Math.PI) / 180;
        const f = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
        const right = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
        const up = { x: right.y * f.z - right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y - right.y * f.x };
        const W = window.innerWidth, H = window.innerHeight;
        const fpx = H / 2 / Math.tan((h.camera.fov() * Math.PI) / 360);
        const feet = h.player.get().position;
        let bottom = -Infinity;
        let rightmost = -Infinity;
        for (const dx of [-0.35, 0.35]) for (const dz of [-0.35, 0.35]) for (const dy of [0, 1.8]) {
          const v = { x: feet.x + dx - cam.x, y: feet.y + dy - cam.y, z: feet.z + dz - cam.z };
          const d = v.x * f.x + v.y * f.y + v.z * f.z;
          const sx = W / 2 + (fpx * (v.x * right.x + v.y * right.y + v.z * right.z)) / d;
          const sy = H / 2 - (fpx * (v.x * up.x + v.y * up.y + v.z * up.z)) / d;
          bottom = Math.max(bottom, sy);
          rightmost = Math.max(rightmost, sx);
        }
        let hudTop = Infinity;
        for (const sel of ['#hotbar', '#hud-self', '#hearts']) {
          const el = document.querySelector(sel);
          if (el) hudTop = Math.min(hudTop, el.getBoundingClientRect().top);
        }
        return { bottom, rightmost, hudTop, cx: W / 2 };
      });
      console.log('AC48', w, hgt, JSON.stringify(r));
      expect(r.bottom).toBeLessThan(r.hudTop);
      expect(r.cx - r.rightmost).toBeGreaterThanOrEqual(20);
    });
  }
});
