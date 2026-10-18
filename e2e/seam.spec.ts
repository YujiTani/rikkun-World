import { expect, test, type Page } from '@playwright/test';
import { IS_SKY_SRC, blobsSrc } from './helpers/skyBlobs';

/**
 * SEAM（docs/tickets/SEAM.md、issue #143）受け入れ基準 4:
 * `?microR=16` で 高い所（石の柱の上）から 小ブロックの段と箱の段の境目を見た絵に、空の色のかたまりが無い。
 * 試作のときの数: 東の絵で 水色 1,845 ピクセル（直すと 0）、南 407 → 0。実装前は赤。
 *
 * 判定式は seethru.spec.ts と同じ（共通は e2e/helpers/skyBlobs.ts）。絵の y 300 より下だけを見る。
 * 陽性対照（E0）で、判定式が昼の空の色を水色と見つけることと、空を見上げた絵で大きなかたまりが見つかることを確かめる。
 * 落ちつくまでは ゲームの時間を進めて待つ（本当の時間では待たない）。
 */

test.describe.configure({ timeout: 300_000 });

const Y0 = 300;
/** 左のはし（x 0〜139）は見ない: 北を向いた絵では 遠くの島のはしと空が ここに写る（境目ではない） */
const X0 = 140;
const MAX_STEPS = 30_000;

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(`window.__isSky = ${IS_SKY_SRC}; window.__blobs = ${blobsSrc(Y0, X0)};`);
  await page.goto('/?nosave=1&microR=16');
  await page.waitForFunction(() => window.__rikkun?.ready === true);
  await page.evaluate(() => {
    const h = (window as any).__rikkun;
    h.pause();
    h.lock.simulate(true);
    h.settings.set('yokaiAutoSpawn', false);
    h.yokai.clear();
    h.time.set(1000);
    h.step(12);
  });
  await page.addStyleTag({ content: '#hud{display:none !important}' });
}

/** 光とメッシュの順番待ちが 0 になるまで 進める。おめでとう画面が出たら とじる。上限を超えたら 理由つきで失敗 */
async function settle(page: Page) {
  const r = await page.evaluate((max) => {
    const h = (window as any).__rikkun;
    let n = 0;
    const pending = () => (h.world.lightPending() + h.world.meshStats().pending) as number;
    const stepOnce = (k: number) => {
      h.step(k);
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps)); // 自動で きえる（WEAPON-7 O8）
    };
    while (pending() > 0 && n < max) {
      stepOnce(5);
      n += 5;
    }
    stepOnce(2);
    return { steps: n, light: h.world.lightPending() as number, mesh: h.world.meshStats().pending as number, locked: h.lock.get().locked as boolean };
  }, MAX_STEPS);
  expect(r.light + r.mesh, `落ちつかない: ${MAX_STEPS} コマ進めても lightPending=${r.light} meshPending=${r.mesh}`).toBe(0);
  expect(r.locked, 'ゲームがロックを失った（カメラが動かないので テストにならない）').toBe(true);
  return r.steps;
}

/** (x, z) の地面に 石の柱を 8 ブロック立てて、そのてっぺんにプレイヤーを置く */
async function stand(page: Page, x: number, z: number, yaw: number, pitch: number) {
  await page.evaluate(
    ([x, z, yaw, pitch]) => {
      const h = (window as any).__rikkun;
      const bx = Math.floor(x);
      const bz = Math.floor(z);
      const g = h.world.groundHeight(bx, bz) as number;
      h.world.fill(bx, g + 1, bz, bx, g + 8, bz, 'stone');
      h.player.set({ position: { x, y: g + 9, z }, velocity: { x: 0, y: 0, z: 0 }, yaw, pitch });
      h.step(30);
      for (let i = 0; i < 20 && h.achievements.modal().open; i++) h.step(Math.max(1, h.achievements.modal().leftSteps)); // 自動で きえる（WEAPON-7 O8）
    },
    [x, z, yaw, pitch],
  );
}

const VIEWS: [string, number, number, number][] = [
  ['east', 77.5, 64.5, 90],
  ['south', 64.5, 77.5, 0],
  ['north', 64.5, 51.5, 180],
];

test.describe('SEAM: 小ブロックの段と箱の段の境目に 空の色のすき間が無い（#143）', () => {
  test('E0（陽性対照）: 判定式は 昼の空の色を 水色と判定し、地面などは 水色と判定しない。空を見上げた絵で 大きなかたまりが見つかる', async ({ page }) => {
    await open(page);
    await settle(page);
    const r = await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const isSky = (window as any).__isSky as (r: number, g: number, b: number) => boolean;
      const hex = h.time.get().skyColor as string;
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const notSky = { 草: [86, 166, 58], 土: [134, 86, 56], 石: [136, 133, 128], れんが: [176, 78, 62], 白: [255, 255, 255] };
      return { hex, rgb, sky: isSky(rgb[0], rgb[1], rgb[2]), notSky: Object.entries(notSky).filter(([, c]) => isSky(c[0], c[1], c[2])).map(([k]) => k) };
    });
    expect(r.hex, '昼の空の色が 変わった（判定式を見直す）').toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(r.sky, `昼の空の色 ${r.hex}（${r.rgb}）が 水色の判定式を通らない`).toBe(true);
    expect(r.notSky, '地面などの色が 水色と判定された').toEqual([]);
    await page.evaluate(() => {
      const h = (window as any).__rikkun;
      const p = h.player.get().position;
      h.player.set({ position: { x: p.x, y: p.y, z: p.z }, velocity: { x: 0, y: 0, z: 0 }, yaw: 90, pitch: 60 });
      h.step(40);
    });
    const buf = await page.screenshot();
    const blobs = (await page.evaluate(`(window.__blobs)("${buf.toString('base64')}")`)) as { largest: number };
    console.log('E0 空を見上げた絵', JSON.stringify(blobs));
    expect(blobs.largest, '空を見上げた絵で 水色のかたまりが 見つからない（かたまり数えが動いていない）').toBeGreaterThan(100_000);
  });

  test('E4: 高い所から 東・南・北の境目を見た絵に 空の色のかたまり（25 ピクセル以上）が無い', async ({ page }) => {
    await open(page);
    const out: string[] = [];
    let worst = 0;
    let bigs = 0;
    for (const [name, x, z, yaw] of VIEWS) {
      await stand(page, x, z, yaw, -30);
      const steps = await settle(page);
      const buf = await page.screenshot({ path: `test-shots/seam/${name}.png` });
      const r = (await page.evaluate(`(window.__blobs)("${buf.toString('base64')}")`)) as { largest: number; big: number; total: number };
      out.push(`${name}: 最大${r.largest}px 大${r.big}こ 合計${r.total}px（落ちつくまで ${steps} コマ）`);
      worst = Math.max(worst, r.largest);
      bigs += r.big;
    }
    console.log('SEAM', out.join(' | '));
    expect(worst, `空の色のかたまり 最大 ${worst}px（境目にすき間がある）。${out.join(' | ')}`).toBeLessThan(25);
    expect(bigs, out.join(' | ')).toBe(0);
  });
});
