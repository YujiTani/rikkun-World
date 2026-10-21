import { expect, test, type Page } from '@playwright/test';
import { legendWorld, spawnAt } from './helpers/legend';
import { countRises, holdNiji, NIJI, pushCameraIn, runShining, type ShiningStep } from './helpers/niji';

/**
 * WEAPON-9 PR-2（虹）の E2E（docs/design/WEAPON-7.md 版 2.5 §11）。AC33（通し）と AC41・AC42・AC43（シャイニングの コマ送りを 記録して 判定）の 2 本。
 * 数は ゲームに 聞く（半径・ダメージ・カメラの きょり）。一人称 = 体の うしろに かべを 立てて カメラを 体に 近づけた 形（doll が 見えない。今の ゲームに 一人称の きりかえは ない）。
 * 順: ① 新しい ゲームの 最初の シャイニング（三人称・妖怪なし）→ ② AC33（妖怪あり）→ ③ 一人称。
 * 実装の 前は `inventory.add` の 3 つ目の 口・`legend.state().dome` が ないので 赤。
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });

let page: Page;
const errors: string[] = [];
const requests: string[] = [];
let floorY = 0;
let stand = { calls: 0, triangles: 0, programs: 0 };
let third: ShiningStep[] = [];
let firstP: ShiningStep[] = [];
let standFirst = { calls: 0, triangles: 0, programs: 0 };
let programsBeforeCharge = -1;
let reqFrom = 0;
let camDist = 0;

const standing = (p: Page) =>
  p.evaluate(() => {
    const h = window.__rikkun as any;
    h.step(1);
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(60);
    const rs = h.renderStats();
    return { calls: rs.drawCalls as number, triangles: rs.triangles as number, programs: h.thunder.programs() as number };
  });

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  floorY = await legendWorld(page, NIJI);
  await page.setViewportSize({ width: 1280, height: 720 });
});
test.afterAll(async () => {
  await page?.context().close();
});

test('記録 ①: 新しい ゲーム・三人称・妖怪なし・ひる。虹を 強さ 10 で わたし、ためて はなして F1〜260 を 読む（AC41・42・43 の もと）', async () => {
  await holdNiji(page, 10);
  await page.evaluate(() => (window.__rikkun as any).yokai.clear());
  camDist = await page.evaluate(() => (window.__rikkun as any).settings.get('shiningCamDistance') as number);
  stand = await standing(page);
  // ため いっぱいまで（はなす 前）の プログラム数
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.input.press('primary');
    h.step(150);
    h.renderStats();
  });
  programsBeforeCharge = await page.evaluate(() => (window.__rikkun as any).thunder.programs() as number);
  await page.evaluate(() => (window.__rikkun as any).input.release('primary'));
  // 150 は もう 押した ので、runShining には 押さない 形で わたす（ticks 0 → 押して すぐ はなす と ふつうの わざに なるので ここは 手で）
  third = [];
  reqFrom = requests.length;
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    // 押しなおしを さける: 上で release 済み。この 次の step が F1
    (window as any).__niSeen = h.legend.events().length - 0;
  });
  throw new Error('下の runShining を 使う 形に 直す');
});
