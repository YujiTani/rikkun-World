import { expect, test, type Page } from '@playwright/test';
import { fine } from './helpers/fine';

/**
 * #147: 洞くつの かべと 水のふちで、小ブロックのつぎ目に 1 画素の空色の点が出ない。
 * 面のつなぎ目（T 字）は、画面で約 1 画素ぶん面を外へ出してふさぐ。
 * ここは「実際の絵」で、孤立した空色の点を数える（#142 の 25 画素のかたまりより小さい点）。
 */

const ASSETS = 'test-shots/seam147';
test.describe.configure({ timeout: 180_000 });

const QUIET_SRC = `(h) => {
  let n = 0;
  while (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) {
    if (n >= 4000) throw new Error('QUIET_TIMEOUT light=' + h.world.lightPending() + ' mesh=' + h.world.meshStats().pending);
    h.step(5); n += 5;
  }
  h.step(8);
}`;

/** 昼の空 #8FD3FF に近い色。水 #3A7BD5 や石の灰色は外す */
const IS_SKY_SRC = `(r, g, b) => g >= 175 && b >= 220 && r >= 90 && r <= 200 && g > r + 15 && b + 5 >= g`;

/**
 * 絵の中の空色。大きな空（空を見上げたとき）と、孤立した点（つぎ目の穴）を分ける。
 * y0 より下だけ数える（水のふちでは上の本当の空を外す）。
 */
const COUNT_SRC = `async (b64, y0) => {
  const blob = await (await fetch('data:image/png;base64,' + b64)).blob();
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const sky = new Uint8Array(W * H);
  const isSky = window.__isSky;
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (isSky(d[i], d[i + 1], d[i + 2])) sky[y * W + x] = 1;
  }
  let dots = 0, dotPx = 0, large = 0, largePx = 0, stoneHoles = 0, groundHoles = 0;
  const stack = [];
  const gray = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < 28 && r > 40 && r < 190;
  const ground = (r, g, b) => (g > r + 20 && g > 80) || (Math.abs(r - g) < 30 && r > 70 && b < r);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (sky[y * W + x] !== 1) continue;
    let skyN = 0, stoneN = 0, groundN = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = ((y + dy) * W + (x + dx)) * 4;
      const r = d[n], g = d[n + 1], b = d[n + 2];
      if (isSky(r, g, b)) skyN++;
      else if (gray(r, g, b)) stoneN++;
      else if (ground(r, g, b)) groundN++;
    }
    // 8 近傍が空色でない。石に囲まれた穴 = かべの中。地面に囲まれた穴は木の下（y>=280。上の はっぱのすきまを外す）
    if (skyN !== 0) continue;
    if (stoneN >= 6) stoneHoles++;
    if (y >= 280 && groundN >= 6) groundHoles++;
  }
  for (let p = y0 * W; p < W * H; p++) {
    if (sky[p] !== 1) continue;
    let size = 0; sky[p] = 2; stack.push(p);
    while (stack.length) {
      const q = stack.pop(); size++;
      const qx = q % W, qy = (q - qx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < y0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (sky[n] === 1) { sky[n] = 2; stack.push(n); }
      }
    }
    if (size <= 8) { dots++; dotPx += size; }
    else { large++; largePx += size; }
  }
  return { dots, dotPx, large, largePx, stoneHoles, groundHoles, w: W, h: H };
}`;

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(`window.__quiet = ${QUIET_SRC}; window.__isSky = ${IS_SKY_SRC}; window.__countSky = ${COUNT_SRC};`);
  await page.goto('/' + fine('?nosave=1'));
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.addStyleTag({ content: '#hud{display:none !important}' });
}

async function prep(page: Page) {
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(12);
  });
}

async function settle(page: Page) {
  await page.evaluate(() => (window as any).__quiet((window as any).__rikkun));
}

async function shot(page: Page, name: string, y0: number) {
  const buf = await page.screenshot({ path: `${ASSETS}/${name}.png` });
  const r = (await page.evaluate(`(window.__countSky)("${buf.toString('base64')}", ${y0})`)) as {
    dots: number; dotPx: number; large: number; largePx: number; stoneHoles: number; groundHoles: number; w: number; h: number;
  };
  console.log(name, JSON.stringify(r));
  return r;
}

test.describe('SEAM-147: 小ブロックのつぎ目に空色の点がない（#147）', () => {
  test('E0: 空を見上げた絵では、判定式が大きな空色のかたまりを見つける', async ({ page }) => {
    await open(page);
    await prep(page);
    const top = await page.evaluate(() => (window as any).__rikkun.world.groundHeight(64, 64) as number);
    await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: 64.5, y: top + 2, z: 64.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 70 });
      h.step(30);
    }, top);
    const r = await shot(page, 'e0-sky', 0);
    expect(r.largePx, '空を見上げても空色が見つからない。判定式を見直す').toBeGreaterThan(500);
  });

  test('E1: 洞くつの石のかべに、孤立した空色の点がない', async ({ page }) => {
    await open(page);
    await prep(page);
    const top = await page.evaluate(() => (window as any).__rikkun.world.groundHeight(64, 64) as number);
    await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      const W = h.world;
      const y0 = top - 2;
      // 厚み 1 の石のかべ。向こうは空（うしろの面は向かないので描かない。つぎ目の穴は空色になる）
      W.fill(40, y0 - 4, 48, 90, top + 10, 80, 'air');
      W.fill(72, y0, 52, 72, top + 6, 76, 'stone');
      W.setBlock(70, y0 + 2, 64, 'torch');
      h.player.set({ position: { x: 62, y: y0 + 2, z: 64 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(20);
    }, top);
    await settle(page);
    await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      const y0 = top - 2;
      h.player.set({ position: { x: 62, y: y0 + 2, z: 64 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 0 });
      h.step(10);
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps));
    }, top);
    const info = await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      const y = top + 1;
      return h.world.sectionInfo(Math.floor(72 / 16), Math.floor(y / 16), Math.floor(64 / 16));
    }, top);
    expect(info.tier, 'かべが小ブロックの段').toBe('micro');
    const r = await shot(page, 'cave-wall', 0);
    expect(r.stoneHoles, `石のかべの中に、まわりが石の空色の点が ${r.stoneHoles} こ`).toBe(0);
  });

  test('E2: 水のふちの地面に、孤立した空色の点がない', async ({ page }) => {
    await open(page);
    await prep(page);
    const top = await page.evaluate(() => (window as any).__rikkun.world.groundHeight(40, 64) as number);
    await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      const W = h.world;
      W.fill(24, 1, 48, 56, top - 1, 80, 'dirt');
      W.fill(24, top, 48, 56, top, 80, 'grass');
      W.fill(24, top + 1, 48, 56, W.size().y - 1, 80, 'air');
      // 池。東が岸
      W.fill(28, top - 2, 56, 40, top - 1, 72, 'dirt');
      W.fill(28, top, 56, 40, top, 72, 'water');
      h.player.set({ position: { x: 46, y: top + 2, z: 64 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: -42 });
      h.step(20);
    }, top);
    await settle(page);
    await page.evaluate((top) => {
      const h = (window as any).__rikkun;
      h.player.set({ position: { x: 46, y: top + 2, z: 64 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 270, pitch: -42 });
      h.step(10);
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps));
    }, top);
    // 上半分は本当の空。下半分（岸・水面の近く）だけ点を数える
    const r = await shot(page, 'water-edge', 0);
    expect(r.groundHoles, `水のふちの地面の中に、まわりが地面の空色の点が ${r.groundHoles} こ`).toBe(0);
  });

  test('E3: 炭鉱の坑道の石のかべに、まわりが石の空色の点がない', async ({ page }) => {
    await open(page);
    await prep(page);
    const spot = await page.evaluate(async () => {
      const h = (window as any).__rikkun;
      const shaft = h.mine.startShaft();
      const ent = shaft.entrance as { x: number; y: number; z: number; dir: number };
      const path = h.mine.shaftPath(shaft.id) as { x: number; y: number; z: number; part: string }[];
      const deep = path.filter((p) => (p.part === 'ramp' || p.part === 'landing') && p.y <= ent.y - 6);
      const cell = deep[Math.min(10, deep.length - 1)] ?? path[Math.floor(path.length / 3)]!;
      const nxt = path[Math.min(path.indexOf(cell) + 3, path.length - 1)] ?? cell;
      const dx = nxt.x - cell.x;
      const dz = nxt.z - cell.z;
      const yaw = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 90 : 270) : dz >= 0 ? 180 : 0;
      await h.world.teleport(cell.x, cell.z);
      await h.world.settle({});
      h.player.set({ position: { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: -6 });
      const sx = Math.floor(cell.x / 16);
      const sy = Math.floor(cell.y / 16);
      const sz = Math.floor(cell.z / 16);
      let tier = '';
      for (let i = 0; i < 80; i++) {
        h.step(5);
        tier = h.world.sectionInfo(sx, sy, sz).tier as string;
        if (tier === 'micro' && h.world.meshStats().pending === 0 && h.world.lightPending() === 0) break;
      }
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps));
      return { x: cell.x, y: cell.y, z: cell.z, yaw, part: cell.part, cave: h.mine.caveAt(cell.x, cell.y, cell.z), tier };
    });
    expect(spot.cave, `坑道の中に立てなかった ${JSON.stringify(spot)}`).toBe('kodo');
    expect(spot.tier, '坑道が小ブロックの段').toBe('micro');
    const r = await shot(page, 'mine-tunnel', 0);
    expect(r.stoneHoles, `坑道のかべの中に、まわりが石の空色の点が ${r.stoneHoles} こ`).toBe(0);
  });
});
