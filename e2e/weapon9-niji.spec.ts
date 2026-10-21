import { expect, test, type Page } from '@playwright/test';
import { legendWorld, spawnAt } from './helpers/legend';
import { countRises, holdNiji, meanRgb, NIJI, pushCameraIn, runShining, type ShiningStep } from './helpers/niji';

/**
 * WEAPON-9 PR-2（虹）の E2E（docs/design/WEAPON-7.md 版 2.5 §11）。AC33（通し）と AC41・AC42・AC43（シャイニングの コマ送りを 記録して 判定）の 2 本。
 * 数は ゲームに 聞く（半径・ダメージ・カメラの きょり）。一人称 = 体の うしろに かべを 立てて カメラを 体に 近づけた 形
 * （doll が 見えない。今の ゲームに 一人称の きりかえは ない。仕様の「一人称」の 作り方は 要確認）。
 * 順: ① 新しい ゲームの 最初の シャイニング（三人称・妖怪なし）→ ② AC33（妖怪あり）→ ③ 休み 600 の あと 一人称。
 * 実装の 前は `inventory.add` の 3 つ目の 口・`legend.state().dome` が ないので 赤。
 */
test.describe.configure({ mode: 'serial', timeout: 900_000 });

let page: Page;
const errors: string[] = [];
const requests: string[] = [];
let stand = { calls: 0, triangles: 0, programs: 0 };
let standFirst = { calls: 0, triangles: 0, programs: 0 };
let third: ShiningStep[] = [];
let firstP: ShiningStep[] = [];
let programsBefore = -1;
let reqCount = 0;
let camDist = 0;
let beforeRgb = { r: 0, g: 0, b: 0 };

const standing = (p: Page) =>
  p.evaluate(() => {
    const h = window.__rikkun as any;
    h.step(1);
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    h.step(60);
    const rs = h.renderStats();
    return { calls: rs.drawCalls as number, triangles: rs.triangles as number, programs: h.thunder.programs() as number };
  });

const rest = (p: Page, n = 700) => p.evaluate((n) => (window.__rikkun as any).step(n), n); // 休み 600 を こえる

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await legendWorld(page, NIJI);
  await page.setViewportSize({ width: 1280, height: 720 });
});
test.afterAll(async () => {
  await page?.context().close();
});

test('記録 ①: 新しい ゲーム・三人称・妖怪なし・ひる。虹を 強さ 10 で わたし、F1〜260 を 読む（AC41・42・43 の もと）', async () => {
  await holdNiji(page, 10);
  await page.evaluate(() => (window.__rikkun as any).yokai.clear());
  camDist = await page.evaluate(() => (window.__rikkun as any).settings.get('shiningCamDistance') as number);
  stand = await standing(page);
  const reqFrom = requests.length;
  const r = await runShining(page, { ticks: 150, shots: true });
  third = r.steps;
  programsBefore = r.programsBefore;
  reqCount = requests.length - reqFrom;
  expect(third).toHaveLength(260);
});

test('AC33: 通し（強さ 10・前 5 の からかさ 体力 99）: F1 shiningStart と 最初の domeHit 25・F240 dome null・F260 shiningEnd・たいきゅう 1 へる・実績', async () => {
  await rest(page);
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.yokai.clear();
    h.inventory.clear();
    h.achievements.mute(false);
    h.achievements.reset();
    h.step(1);
    h.inventory.add('niji', 1, { power: 10 });
    h.inventory.select(0);
    h.step(1);
  });
  const p = await page.evaluate(() => (window.__rikkun as any).player.get().position as { x: number; y: number; z: number });
  const yid = await spawnAt(page, 'karakasa', p.x, p.y, p.z - 5, 99);
  const before = await page.evaluate(() => (window.__rikkun as any).inventory.durability(0) as { max: number; left: number });
  const { steps } = await runShining(page, { ticks: 150, shots: false });
  const at = (F: number) => steps[F - 1]!;
  expect(at(1).events.map((e) => e.type), 'F1').toContain('shiningStart');
  expect(at(1).sounds, 'F1 の 音').toContain('shiningStart');
  const hit = steps.flatMap((s) => s.events).find((e) => e.type === 'domeHit' && e.yokaiId === yid);
  expect(hit, '最初の domeHit').toBeDefined();
  expect(hit!.damage, '強さ 10 × 2.5').toBe(25);
  expect(at(100).dome, 'F100 は ドームが ある').not.toBeNull();
  expect(at(240).dome, 'F240 に dome null').toBeNull();
  expect(at(259).events.map((e) => e.type)).not.toContain('shiningEnd');
  expect(at(260).events.map((e) => e.type), 'F260').toContain('shiningEnd');
  expect(at(260).sounds, 'F260 の 音').toContain('shiningEnd');
  const after = await page.evaluate(() => (window.__rikkun as any).inventory.durability(0) as { max: number; left: number });
  expect(after.max).toBe(before.max);
  expect(before.left - after.left, 'たいきゅうは 1 へる').toBe(1);
  // 実績: 虹を はじめて 手に 入れた ステップ（やり直して たしかめる）
  const ach = await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.inventory.clear();
    h.achievements.reset();
    h.step(1);
    h.inventory.add('niji', 1, { power: 7 });
    h.step(1);
    const rows = h.achievements.list() as { id: string; unlocked: boolean }[];
    return { a: rows.find((r) => r.id === 'get.niji.1')?.unlocked ?? null, b: rows.find((r) => r.id === 'legend.kinds.3')?.unlocked ?? null };
  });
  expect(ach.a, 'get.niji.1').toBe(true);
  expect(ach.b, 'legend.kinds.3（3 しゅるい目）').toBe(true);
  expect(errors).toEqual([]);
});

test('記録 ②: 休み 600 の あと・一人称（かべで カメラを 近づける）・妖怪なし。F1〜260 を 読む（AC42・43 の 2 回目）', async () => {
  await rest(page);
  await page.evaluate(() => {
    const h = window.__rikkun as any;
    h.yokai.clear();
    h.achievements.mute(true);
  });
  await holdNiji(page, 10);
  await pushCameraIn(page);
  standFirst = await standing(page);
  beforeRgb = await meanRgb(page);
  const r = await runShining(page, { ticks: 150, shots: true, rgbFrom: 41, rgbTo: 200 });
  firstP = r.steps;
  expect(firstP).toHaveLength(260);
});

test('AC41: 最初の 1 回: プログラム数が ため いっぱいの あと・F1・F41・F100・F240・F260 で 同じ。F1〜260 の 読みこみ 0。カメラ 14', async () => {
  expect(camDist, 'shiningCamDistance').toBe(14);
  expect(programsBefore, 'ため いっぱいの あと').toBeGreaterThan(0);
  for (const F of [1, 41, 100, 240, 260]) expect(third[F - 1]!.programs, `F${F} の プログラム数`).toBe(programsBefore);
  expect(reqCount, 'F1〜260 の 間の ファイルの 読みこみ').toBe(0);
});

test('AC42: 数の 上限: 三人称・一人称 とも ふえ 描画 4 以下・三角形 220 以下。とどまる F100 で 三角形 180 以上', async () => {
  const check = (steps: ShiningStep[], base: { calls: number; triangles: number }, who: string) => {
    for (const s of steps) {
      expect(s.calls - base.calls, `${who} F${s.F} 描画回数の ふえ`).toBeLessThanOrEqual(4);
      expect(s.triangles - base.triangles, `${who} F${s.F} 三角形の ふえ`).toBeLessThanOrEqual(220);
    }
    expect(steps[99]!.triangles - base.triangles, `${who} F100 三角形の ふえ`).toBeGreaterThanOrEqual(180);
  };
  check(third, stand, '三人称');
  check(firstP, standFirst, '一人称');
  expect(third.some((s) => s.dollVisible), '三人称では doll が 見える').toBe(true);
  expect(firstP.every((s) => !s.dollVisible), '一人称では doll が 見えない').toBe(true);
});

test('AC43: まぶしすぎない: 上がり 1 回 以下・3 色とも 245 以上は 20% 以下。一人称 F41〜200 は 5% 以下・平均の 色が 前と ±12', async () => {
  for (const [who, steps] of [['三人称', third], ['一人称', firstP]] as const) {
    const L = steps.map((s) => s.mean);
    expect(countRises(L), `${who} 上がり。L = ${L.map((v) => v.toFixed(0)).join(',')}`).toBeLessThanOrEqual(1);
    for (const s of steps) expect(s.white, `${who} F${s.F} 白い 点`).toBeLessThanOrEqual(0.2);
  }
  for (let F = 41; F <= 200; F++) expect(firstP[F - 1]!.white, `一人称 F${F} 白い 点`).toBeLessThanOrEqual(0.05);
  // 平均の 色: 一人称の 前（ためる 前）と とどまる 間（F41〜200）の 色が それぞれ ±12
  for (let F = 41; F <= 200; F++) {
    const c = firstP[F - 1]!.rgb!;
    for (const k of ['r', 'g', 'b'] as const) expect(Math.abs(c[k] - beforeRgb[k]), `一人称 F${F} の ${k}（前 ${beforeRgb[k].toFixed(0)}）`).toBeLessThanOrEqual(12);
  }
  expect(errors).toEqual([]);
});
